import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { loadCategories, newToken } from '@/lib/inspect/server';
import { INSPECT_LIMITS } from '@/lib/inspect/constants';
import { bad, isDate, validateAttributes } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type ImportRow = {
  code: string; name?: string; category_key?: string; template_key?: string; department?: string; building?: string; floor?: string; location?: string;
  attributes?: Record<string, unknown>; mfg_year?: number | null; mfg_month?: number | null; last_service_on?: string | null; note?: string;
};

/**
 * POST { company_id, rows: ImportRow[], mode: 'preview' | 'commit' }
 * Existing codes are updated (fields in the file win, empty cells leave the current value), new codes are created.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as { company_id?: string; rows?: ImportRow[]; mode?: string } | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const rows = Array.isArray(body?.rows) ? body!.rows : [];
    if (!rows.length) throw bad('ไม่มีแถวข้อมูล');
    if (rows.length > INSPECT_LIMITS.maxImportRows) throw bad(`นำเข้าได้ไม่เกิน ${INSPECT_LIMITS.maxImportRows} แถวต่อครั้ง`);
    const commit = body?.mode === 'commit';
    const { categories, templates } = await loadCategories(company, true);
    const client = db();
    const { data: existing, error } = await client.from('insp_assets').select('id, code, category_id, attributes').eq('company_id', company);
    if (error) throw error;
    const byCode = new Map((existing || []).map(a => [String(a.code).toLowerCase(), a as { id: string; code: string; category_id: string; attributes: Record<string, unknown> }]));

    const problems: { row: number; message: string }[] = [];
    const inserts: Record<string, unknown>[] = [];
    const updates: { id: string; patch: Record<string, unknown> }[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const line = i + 2;
      const code = String(r.code || '').trim();
      if (!code) { problems.push({ row: line, message: 'ไม่มีรหัสอุปกรณ์' }); return; }
      if (code.length > 60) { problems.push({ row: line, message: 'รหัสยาวเกิน 60 ตัวอักษร' }); return; }
      if (seen.has(code.toLowerCase())) { problems.push({ row: line, message: `รหัส ${code} ซ้ำในไฟล์` }); return; }
      seen.add(code.toLowerCase());
      const cur = byCode.get(code.toLowerCase());
      const catKey = String(r.category_key || '').trim();
      const category = catKey ? categories.find(c => c.key === catKey || c.name === catKey) : (cur ? categories.find(c => c.id === cur.category_id) : undefined);
      if (!category) { problems.push({ row: line, message: catKey ? `ไม่พบหมวด "${catKey}"` : 'ไม่ระบุหมวดอุปกรณ์' }); return; }
      let template_id: string | null | undefined;
      const tplKey = String(r.template_key || '').trim();
      if (tplKey) {
        const t = templates.find(t => t.category_id === category.id && (t.key === tplKey || t.name === tplKey));
        if (!t) { problems.push({ row: line, message: `ไม่พบรายการตรวจ "${tplKey}" ในหมวด ${category.name}` }); return; }
        template_id = t.id;
      }
      try {
        const patch: Record<string, unknown> = { category_id: category.id };
        if (template_id !== undefined) patch.template_id = template_id;
        const text = (k: keyof ImportRow, max: number) => { const v = r[k]; if (v === undefined || v === null || v === '') return; const s = String(v).trim(); if (s.length > max) throw bad(`${String(k)} ยาวเกิน ${max}`); patch[k] = s; };
        text('name', 120); text('department', 80); text('building', 80); text('floor', 40); text('location', 200); text('note', 1000);
        if (r.mfg_year !== undefined && r.mfg_year !== null && r.mfg_year !== ('' as unknown)) { const y = Number(r.mfg_year); if (!Number.isInteger(y) || y < 1980 || y > 2100) throw bad('ปีผลิตไม่ถูกต้อง'); patch.mfg_year = y > 2300 ? y - 543 : y; }
        if (r.mfg_month !== undefined && r.mfg_month !== null && r.mfg_month !== ('' as unknown)) { const m = Number(r.mfg_month); if (!Number.isInteger(m) || m < 1 || m > 12) throw bad('เดือนผลิตไม่ถูกต้อง'); patch.mfg_month = m; }
        if (r.last_service_on) { if (!isDate(String(r.last_service_on))) throw bad('วันทดสอบล่าสุดไม่ถูกต้อง (YYYY-MM-DD)'); patch.last_service_on = r.last_service_on; }
        if (r.attributes && typeof r.attributes === 'object') {
          const merged = { ...(cur?.attributes || {}), ...r.attributes };
          patch.attributes = validateAttributes(category.attributes, merged);
        }
        if (cur) updates.push({ id: cur.id, patch });
        else inserts.push({ ...patch, company_id: company, code, attributes: patch.attributes || validateAttributes(category.attributes, {}), qr_token: newToken(24), created_by: actor.displayName });
      } catch (e) {
        problems.push({ row: line, message: e instanceof Error ? e.message : String(e) });
      }
    });

    const summary = { rows: rows.length, create: inserts.length, update: updates.length, problems };
    if (!commit) return NextResponse.json({ data: summary });
    if (problems.length) throw bad(`มี ${problems.length} แถวที่มีปัญหา กรุณาแก้ไขก่อนนำเข้า`);
    for (let i = 0; i < inserts.length; i += 200) {
      const { error: iErr } = await client.from('insp_assets').insert(inserts.slice(i, i + 200));
      if (iErr) throw iErr;
    }
    for (const u of updates) {
      const { error: uErr } = await client.from('insp_assets').update(u.patch).eq('id', u.id);
      if (uErr) throw uErr;
    }
    return NextResponse.json({ data: summary });
  } catch (error) { return apiError(error); }
}

import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { UUID, bad, str, validateItems } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** POST → company-specific checklist template for a category (shared or own) */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const company = String(body.company_id || '');
    assertCompany(actor, company, true);
    const categoryId = String(body.category_id || '');
    if (!UUID.test(categoryId)) throw bad('หมวดไม่ถูกต้อง');
    const { data: cat, error: cErr } = await db().from('insp_categories').select('id, company_id').eq('id', categoryId).maybeSingle();
    if (cErr) throw cErr;
    if (!cat || (cat.company_id && cat.company_id !== company)) throw new AccessError('ไม่พบหมวด', 404);
    const name = str(body.name, 80, 'ชื่อรายการตรวจ');
    const key = String(body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `tpl_${Date.now().toString(36)}`;
    const items = validateItems(body.items);
    const is_default = body.is_default === true;
    const client = db();
    if (is_default) await client.from('insp_templates').update({ is_default: false }).eq('category_id', categoryId).eq('company_id', company);
    const { data, error } = await client.from('insp_templates').insert([{ category_id: categoryId, company_id: company, key, name, items, is_default }]).select('*').single();
    if (error) { if (String(error.code) === '23505') throw bad('รหัสรายการตรวจนี้มีอยู่แล้ว'); throw error; }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

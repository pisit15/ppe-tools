import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { UUID, bad, str, validateItems } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** PATCH → edit template. Changing items bumps the version (old inspections keep theirs). Shared templates: admin only. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบรายการตรวจ', 404);
    const client = db();
    const { data: row, error: rErr } = await client.from('insp_templates').select('id, company_id, category_id, version, items').eq('id', id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new AccessError('ไม่พบรายการตรวจ', 404);
    if (row.company_id) assertCompany(actor, row.company_id, true);
    else if (!actor.isAdmin) throw new AccessError('รายการตรวจมาตรฐานกลางแก้ไขได้เฉพาะผู้ดูแลระบบ — สร้างรายการของบริษัทแทน');
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = str(body.name, 80, 'ชื่อรายการตรวจ');
    if (body.items !== undefined) {
      const items = validateItems(body.items);
      if (JSON.stringify(items) !== JSON.stringify(row.items)) { patch.items = items; patch.version = Number(row.version) + 1; }
    }
    if (body.is_active !== undefined) { if (typeof body.is_active !== 'boolean') throw bad('สถานะไม่ถูกต้อง'); patch.is_active = body.is_active; }
    if (body.is_default === true) {
      await client.from('insp_templates').update({ is_default: false }).eq('category_id', row.category_id).is('company_id', row.company_id ?? null);
      patch.is_default = true;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ data: row });
    const { data, error } = await client.from('insp_templates').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

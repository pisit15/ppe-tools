import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { UUID, bad, categoryPatch } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** PATCH → edit a category. Shared categories (company_id null) are admin-only. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบหมวด', 404);
    const { data: row, error: rErr } = await db().from('insp_categories').select('id, company_id').eq('id', id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new AccessError('ไม่พบหมวด', 404);
    if (row.company_id) assertCompany(actor, row.company_id, true);
    else if (!actor.isAdmin) throw new AccessError('หมวดมาตรฐานกลางแก้ไขได้เฉพาะผู้ดูแลระบบ — สร้างหมวดของบริษัทแทน');
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const patch = categoryPatch(body, true);
    if (!Object.keys(patch).length) throw bad('ไม่มีข้อมูลที่ต้องแก้ไข');
    const { data, error } = await db().from('insp_categories').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

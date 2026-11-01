import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { UUID, bad, opt, str } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!UUID.test(id)) throw new AccessError('ไม่พบผู้ตรวจ', 404);
  const { data, error } = await db().from('insp_inspectors').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบผู้ตรวจ', 404);
  return data as { id: string; company_id: string };
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireInspectStaff(request);
    const row = await load((await params).id);
    assertCompany(actor, row.company_id, true);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = str(body.name, 120, 'ชื่อผู้ตรวจ');
    if (body.department !== undefined) patch.department = opt(body.department, 80, 'แผนก');
    if (body.is_active !== undefined) { if (typeof body.is_active !== 'boolean') throw bad('สถานะไม่ถูกต้อง'); patch.is_active = body.is_active; }
    const { data, error } = await db().from('insp_inspectors').update(patch).eq('id', row.id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireInspectStaff(request);
    const row = await load((await params).id);
    assertCompany(actor, row.company_id, true);
    const { error } = await db().from('insp_inspectors').delete().eq('id', row.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

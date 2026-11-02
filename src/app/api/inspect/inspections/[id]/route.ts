import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { UUID, bad, opt } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** PATCH { action: 'resolve' | 'reopen', resolved_note } — close out a failed inspection; { action: 'attach_photo', path } — link an uploaded photo (max 3 live) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบรายการ', 404);
    const client = db();
    const { data: row, error: rErr } = await client.from('insp_inspections').select('id, company_id, overall, asset_id').eq('id', id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new AccessError('ไม่พบรายการ', 404);
    assertCompany(actor, row.company_id, true);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    let patch: Record<string, unknown>;
    if (body.action === 'resolve') {
      if (row.overall !== 'fail') throw bad('รายการนี้ผ่านอยู่แล้ว');
      patch = { resolved_at: new Date().toISOString(), resolved_by: actor.displayName, resolved_note: opt(body.resolved_note, 1000, 'บันทึกการแก้ไข') };
    } else if (body.action === 'reopen') {
      patch = { resolved_at: null, resolved_by: null };
    } else if (body.action === 'attach_photo') {
      const path = String(body.path || '');
      if (!path.startsWith(`${row.company_id}/${row.asset_id}/`)) throw bad('รูปภาพไม่ถูกต้อง');
      const { count } = await client.from('insp_photos').select('id', { count: 'exact', head: true }).eq('inspection_id', id).is('deleted_at', null);
      if ((count || 0) >= 3) throw bad('รายการนี้มีรูปครบ 3 รูปแล้ว');
      const { data: linked, error: lErr } = await client.from('insp_photos').update({ inspection_id: id }).eq('storage_path', path).eq('asset_id', row.asset_id).is('inspection_id', null).select('id');
      if (lErr) throw lErr;
      if (!linked?.length) throw bad('ไม่พบรูปที่อัปโหลด');
      const { data, error } = await client.from('insp_inspections').select('*').eq('id', id).single();
      if (error) throw error;
      return NextResponse.json({ data });
    } else throw bad('คำสั่งไม่ถูกต้อง');
    const { data, error } = await client.from('insp_inspections').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** DELETE — remove a mistaken inspection (photos cascade; objects are left for retention) */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบรายการ', 404);
    const client = db();
    const { data: row, error: rErr } = await client.from('insp_inspections').select('id, company_id').eq('id', id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new AccessError('ไม่พบรายการ', 404);
    assertCompany(actor, row.company_id, true);
    const { error } = await client.from('insp_inspections').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

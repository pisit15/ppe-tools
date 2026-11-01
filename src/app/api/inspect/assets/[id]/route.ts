import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { getAsset, listInspections, loadCategories, newToken, signedPhotoUrl } from '@/lib/inspect/server';
import { UUID, bad, validateAssetInput, validateAttributes } from '@/lib/inspect/validation';
import type { InspServiceEventRow } from '@/lib/inspect/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** GET → asset + status + inspections + service events + signed reference photo */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบอุปกรณ์', 404);
    const asset = await getAsset(id);
    assertCompany(actor, asset.company_id, true);
    const [inspections, { data: events, error }] = await Promise.all([
      listInspections(asset.company_id, { asset_id: id, limit: 120 }),
      db().from('insp_service_events').select('*').eq('asset_id', id).order('done_on', { ascending: false }),
    ]);
    if (error) throw error;
    const reference_photo_url = asset.reference_photo_path ? await signedPhotoUrl(asset.reference_photo_path, 3600, { width: 800, height: 800 }).catch(() => null) : null;
    return NextResponse.json({ data: { asset, inspections, service_events: (events || []) as InspServiceEventRow[], reference_photo_url } });
  } catch (error) { return apiError(error); }
}

/** PATCH → edit fields; { action: 'regenerate_qr' } → new token (old QR stops working); { reference_photo_path } → set/clear reference photo */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบอุปกรณ์', 404);
    const asset = await getAsset(id);
    assertCompany(actor, asset.company_id, true);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const updates: Record<string, unknown> = {};
    if (body.action === 'regenerate_qr') {
      updates.qr_token = newToken(24);
    } else {
      const input = validateAssetInput(body, true);
      const { categories, templates } = await loadCategories(asset.company_id, true);
      const categoryId = input.category_id || asset.category_id;
      const category = categories.find(c => c.id === categoryId);
      if (!category) throw bad('ไม่พบหมวดอุปกรณ์');
      if (input.template_id && !templates.some(t => t.id === input.template_id && t.category_id === category.id)) throw bad('รายการตรวจไม่ตรงกับหมวด');
      if (input.category_id && input.category_id !== asset.category_id && input.template_id === undefined) updates.template_id = null;
      const { attributes_raw, ...fields } = input;
      Object.assign(updates, fields);
      if (attributes_raw !== undefined) updates.attributes = validateAttributes(category.attributes, attributes_raw);
      if (body.reference_photo_path !== undefined) {
        const p = body.reference_photo_path;
        if (p === null || p === '') updates.reference_photo_path = null;
        else if (typeof p === 'string' && p.startsWith(`${asset.company_id}/${asset.id}/`)) updates.reference_photo_path = p;
        else throw bad('รูปอ้างอิงไม่ถูกต้อง');
      }
    }
    if (!Object.keys(updates).length) throw bad('ไม่มีข้อมูลที่ต้องแก้ไข');
    const { error } = await db().from('insp_assets').update(updates).eq('id', id);
    if (error) {
      if (String(error.code) === '23505') throw bad('รหัสอุปกรณ์ซ้ำกับที่มีอยู่');
      throw error;
    }
    return NextResponse.json({ data: await getAsset(id) });
  } catch (error) { return apiError(error); }
}

/** DELETE → only when the asset has no inspections (otherwise set status=disposed) */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบอุปกรณ์', 404);
    const asset = await getAsset(id);
    assertCompany(actor, asset.company_id, true);
    const { count, error: cErr } = await db().from('insp_inspections').select('id', { count: 'exact', head: true }).eq('asset_id', id);
    if (cErr) throw cErr;
    if ((count || 0) > 0) throw bad('อุปกรณ์นี้มีประวัติการตรวจแล้ว ให้เปลี่ยนสถานะเป็น "ปลดระวาง" แทนการลบ');
    const { error } = await db().from('insp_assets').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

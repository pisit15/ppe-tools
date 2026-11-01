import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { removeStorageObject, verifyFloorplanImage } from '@/lib/inspect/server';
import { UUID, bad, opt, str } from '@/lib/inspect/validation';
import type { InspFloorplanRow } from '@/lib/inspect/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function load(request: NextRequest, ctx: Ctx) {
  const actor = await requireInspectStaff(request);
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw bad('แผนผังไม่ถูกต้อง');
  const { data, error } = await db().from('insp_floorplans').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบแผนผัง', 404);
  const plan = data as InspFloorplanRow;
  assertCompany(actor, plan.company_id, true);
  return { actor, plan };
}

/** PATCH { name?, building?, floor?, sort_order?, image?: { path, width, height } } */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const { plan } = await load(request, ctx);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const updates: Partial<InspFloorplanRow> = {};
    if (body.name !== undefined) updates.name = str(body.name, 120, 'ชื่อแผนผัง');
    if (body.building !== undefined) updates.building = opt(body.building, 80, 'อาคาร');
    if (body.floor !== undefined) updates.floor = opt(body.floor, 40, 'ชั้น');
    if (body.sort_order !== undefined) { const n = Number(body.sort_order); if (!Number.isInteger(n) || n < 0 || n > 1000) throw bad('ลำดับไม่ถูกต้อง'); updates.sort_order = n; }
    let oldPath: string | null = null;
    if (body.image && typeof body.image === 'object') {
      const img = body.image as Record<string, unknown>;
      const path = String(img.path || ''); const width = Number(img.width), height = Number(img.height);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000) throw bad('ขนาดรูปไม่ถูกต้อง');
      await verifyFloorplanImage(plan.company_id, path);
      updates.image_path = path; updates.width = width; updates.height = height; oldPath = plan.image_path;
    }
    if (Object.keys(updates).length === 0) throw bad('ไม่มีข้อมูลที่จะแก้ไข');
    const { data, error } = await db().from('insp_floorplans').update(updates).eq('id', plan.id).select('*').single();
    if (error) { if (error.code === '23505') throw bad('มีแผนผังชื่อนี้อยู่แล้ว'); throw error; }
    if (oldPath && oldPath !== updates.image_path) await removeStorageObject(oldPath);
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** DELETE → assets on it lose their position (FK set null); image removed. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { plan } = await load(request, ctx);
    const client = db();
    const { error: aErr } = await client.from('insp_assets').update({ floorplan_id: null, pos_x: null, pos_y: null }).eq('floorplan_id', plan.id);
    if (aErr) throw aErr;
    const { error } = await client.from('insp_floorplans').delete().eq('id', plan.id);
    if (error) throw error;
    await removeStorageObject(plan.image_path);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

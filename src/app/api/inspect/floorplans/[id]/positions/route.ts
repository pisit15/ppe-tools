import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { UUID, bad } from '@/lib/inspect/validation';
import type { InspFloorplanRow } from '@/lib/inspect/types';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT { set: [{ asset_id, x, y }], remove: [asset_id] }
 * x/y are fractions 0..1 of the plan image. An asset can be on one plan only; setting moves it here.
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await ctx.params;
    if (!UUID.test(id)) throw bad('แผนผังไม่ถูกต้อง');
    const client = db();
    const { data: p, error: pErr } = await client.from('insp_floorplans').select('id, company_id').eq('id', id).maybeSingle();
    if (pErr) throw pErr;
    if (!p) throw new AccessError('ไม่พบแผนผัง', 404);
    const plan = p as Pick<InspFloorplanRow, 'id' | 'company_id'>;
    assertCompany(actor, plan.company_id, true);

    const body = await request.json().catch(() => null) as { set?: unknown[]; remove?: unknown[] } | null;
    const set = Array.isArray(body?.set) ? body!.set : [];
    const remove = Array.isArray(body?.remove) ? body!.remove : [];
    if (set.length + remove.length === 0) throw bad('ไม่มีตำแหน่งที่จะบันทึก');
    if (set.length + remove.length > 1000) throw bad('บันทึกได้ครั้งละไม่เกิน 1000 รายการ');
    const sets = set.map(s => {
      const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
      const asset_id = String(o.asset_id || ''); const x = Number(o.x), y = Number(o.y);
      if (!UUID.test(asset_id) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw bad('ตำแหน่งไม่ถูกต้อง');
      return { asset_id, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
    });
    const removes = remove.map(r => { const v = String(r); if (!UUID.test(v)) throw bad('รหัสอุปกรณ์ไม่ถูกต้อง'); return v; });
    const ids = [...new Set([...sets.map(s => s.asset_id), ...removes])];
    const { data: owned, error: oErr } = await client.from('insp_assets').select('id').eq('company_id', plan.company_id).in('id', ids);
    if (oErr) throw oErr;
    const ok = new Set((owned || []).map(r => r.id as string));
    if (ids.some(i => !ok.has(i))) throw bad('มีอุปกรณ์ที่ไม่อยู่ในบริษัทนี้');

    // Small batches: run updates in parallel groups of 20
    let done = 0;
    for (let i = 0; i < sets.length; i += 20) {
      const res = await Promise.all(sets.slice(i, i + 20).map(s => client.from('insp_assets').update({ floorplan_id: plan.id, pos_x: s.x, pos_y: s.y }).eq('id', s.asset_id)));
      for (const r of res) { if (r.error) throw r.error; done++; }
    }
    if (removes.length) {
      const { error } = await client.from('insp_assets').update({ floorplan_id: null, pos_x: null, pos_y: null }).in('id', removes).eq('floorplan_id', plan.id);
      if (error) throw error;
      done += removes.length;
    }
    return NextResponse.json({ ok: true, updated: done });
  } catch (error) { return apiError(error); }
}

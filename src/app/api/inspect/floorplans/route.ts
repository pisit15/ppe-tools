import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { listFloorplans, verifyFloorplanImage } from '@/lib/inspect/server';
import { bad, opt, str } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    return NextResponse.json({ data: await listFloorplans(company) });
  } catch (error) { return apiError(error); }
}

/** POST { company_id, name, building, floor, image: { path, width, height } } — image already uploaded via /floorplans/sign */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const name = str(body?.name, 120, 'ชื่อแผนผัง');
    const building = opt(body?.building, 80, 'อาคาร');
    const floor = opt(body?.floor, 40, 'ชั้น');
    const img = (body?.image && typeof body.image === 'object' ? body.image : {}) as Record<string, unknown>;
    const path = String(img.path || '');
    const width = Number(img.width), height = Number(img.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000) throw bad('ขนาดรูปไม่ถูกต้อง');
    await verifyFloorplanImage(company, path);
    const { count } = await db().from('insp_floorplans').select('id', { count: 'exact', head: true }).eq('company_id', company);
    const { data, error } = await db().from('insp_floorplans').insert([{ company_id: company, name, building, floor, image_path: path, width, height, sort_order: count || 0, created_by: actor.displayName }]).select('*').single();
    if (error) { if (error.code === '23505') throw bad(`มีแผนผังชื่อ "${name}" อยู่แล้ว`); throw error; }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

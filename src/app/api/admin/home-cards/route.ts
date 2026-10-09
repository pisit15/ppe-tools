import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, requireToolsActor } from '@/lib/toolsSession';
import { homeCards, validateHomeCardPatch, type HomeCardRow } from '@/lib/home-cards';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const select = 'id,name,description,is_visible,revision,updated_at';
async function requireAdmin(request: NextRequest) {
  const actor = await requireToolsActor(request);
  if (!actor.isAdmin) throw new AccessError('เฉพาะ Admin เท่านั้นที่จัดการการ์ดได้');
  return actor;
}
function failure(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error('Homepage card request failed', error);
  return NextResponse.json({ error: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }, { status: 500, headers });
}
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await getSupabaseServer().from('tools_home_cards').select(select);
    if (error) throw error;
    return NextResponse.json({ data: homeCards((data || []) as HomeCardRow[]) }, { headers });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdmin(request);
    let patch: ReturnType<typeof validateHomeCardPatch>;
    try { patch = validateHomeCardPatch(await request.json()); }
    catch (error) { throw new AccessError(error instanceof Error ? error.message : 'ข้อมูลไม่ถูกต้อง', 400); }
    const { data, error } = await getSupabaseServer().from('tools_home_cards').update({
      name: patch.name, description: patch.description, is_visible: patch.is_visible,
      revision: patch.revision + 1, updated_at: new Date().toISOString(), updated_by: actor.username,
    }).eq('id', patch.id).eq('revision', patch.revision).select(select).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('การ์ดนี้มีการแก้ไขจากหน้าต่างอื่นแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก', 409);
    return NextResponse.json({ data: homeCards([data as HomeCardRow])[0] }, { headers });
  } catch (error) { return failure(error); }
}

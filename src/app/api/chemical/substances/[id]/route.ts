import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requireToolsActor, assertCompany, apiError, AccessError } from '@/lib/toolsSession';
import { SUBSTANCE_SELECT } from '@/lib/chemical/sanitize';
import { prepareSubstance } from '@/lib/chemical/access';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
async function record(request: NextRequest, ctx: Ctx) {
  const actor = await requireToolsActor(request);
  const { id } = await ctx.params;
  let q = getSupabaseServer().from('chem_substances').select(SUBSTANCE_SELECT).eq('id', id);
  if (!actor.isAdmin) q = q.eq('company_id', actor.companyId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบสารเคมีหรือไม่มีสิทธิ์เข้าถึง', 404);
  assertCompany(actor, data.company_id, request.method !== 'GET');
  return { actor, data };
}
export async function GET(request: NextRequest, ctx: Ctx) {
  try { return NextResponse.json({ data: (await record(request, ctx)).data }); }
  catch (e) { return apiError(e); }
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const { actor, data: existing } = await record(request, ctx);
    const body = await request.json();
    if (body.expected_updated_at !== existing.updated_at) throw new AccessError('ข้อมูลเปลี่ยนไปแล้ว กรุณาเปิดรายการล่าสุดก่อนบันทึก', 409);
    const row = body.demo_action ? (() => {
      if (!actor.isAdmin || !['mark', 'restore'].includes(body.demo_action)) throw new AccessError('เฉพาะผู้ดูแลจึงจัดประเภทข้อมูลสาธิตได้');
      return { is_demo: body.demo_action === 'mark' };
    })() : await prepareSubstance(body, actor, existing);
    const { data, error } = await getSupabaseServer().from('chem_substances').update(row).eq('id', existing.id).eq('company_id', existing.company_id).eq('updated_at', body.expected_updated_at).select(SUBSTANCE_SELECT).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('มีการแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่', 409);
    return NextResponse.json({ data });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const { data: existing } = await record(request, ctx);
    const { error } = await getSupabaseServer().from('chem_substances').update({ is_active: false }).eq('id', existing.id).eq('company_id', existing.company_id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) { return apiError(e); }
}
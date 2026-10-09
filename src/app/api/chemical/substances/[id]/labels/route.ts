import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requireToolsActor, assertCompany, AccessError, apiError } from '@/lib/toolsSession';
import { validateLabelSnapshot } from '@/lib/chemical/label-versions';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const summary = 'id,version,title,created_at,created_by';
const noStore = { 'Cache-Control': 'private, no-store' };
async function scope(request: NextRequest, context: Context) {
  const actor = await requireToolsActor(request);
  const { id } = await context.params;
  if (!uuid.test(id)) throw new AccessError('ไม่พบสารเคมี', 404);
  let query = getSupabaseServer().from('chem_substances').select('id,company_id').eq('id', id).eq('is_active', true);
  if (!actor.isAdmin) query = query.eq('company_id', actor.companyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบสารเคมีหรือไม่มีสิทธิ์เข้าถึง', 404);
  assertCompany(actor, data.company_id, request.method !== 'GET');
  return { actor, substance: data };
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { substance } = await scope(request, context);
    const db = getSupabaseServer();
    const base = () => db.from('chem_label_versions').select(`${summary},snapshot`).eq('substance_id', substance.id).eq('company_id', substance.company_id);
    const version = request.nextUrl.searchParams.get('version');
    const before = request.nextUrl.searchParams.get('before');
    for (const value of [version, before]) if (value !== null && (!/^[1-9]\d{0,8}$/.test(value))) throw new AccessError('เลขเวอร์ชันไม่ถูกต้อง', 400);
    if (version) {
      const { data, error } = await base().eq('version', Number(version)).maybeSingle();
      if (error) throw error;
      if (!data) throw new AccessError('ไม่พบเวอร์ชันฉลาก', 404);
      return NextResponse.json({ data }, { headers: noStore });
    }
    let query = db.from('chem_label_versions').select(summary).eq('substance_id', substance.id).eq('company_id', substance.company_id).order('version', { ascending: false }).limit(51);
    if (before) query = query.lt('version', Number(before));
    const { data, error } = await query;
    if (error) throw error;
    const versions = (data || []).slice(0, 50);
    let latest = null;
    if (!before && versions.length) {
      const result = await base().eq('version', versions[0].version).single();
      if (result.error) throw result.error;
      latest = result.data;
    }
    return NextResponse.json({ versions, latest, hasMore: (data?.length || 0) > 50 }, { headers: noStore });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { actor, substance } = await scope(request, context);
    const raw = await request.text();
    if (raw.length > 50000) throw new AccessError('ข้อมูลฉลากมีขนาดใหญ่เกินไป', 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new AccessError('ข้อมูลฉลากไม่ถูกต้อง', 400); }
    if (!body || typeof body !== 'object' || typeof body.request_id !== 'string' || !uuid.test(body.request_id) || typeof body.title !== 'string' || body.title.length > 120 || body.title.includes('\0')) throw new AccessError('ข้อมูลการบันทึกไม่ถูกต้อง', 400);
    let snapshot;
    try { snapshot = validateLabelSnapshot(body.snapshot); } catch (error) { throw new AccessError(error instanceof Error ? error.message : 'ข้อมูลฉลากไม่ถูกต้อง', 400); }
    const { data, error } = await getSupabaseServer().rpc('chem_save_label_version', {
      p_substance_id: substance.id, p_company_id: substance.company_id, p_request_id: body.request_id,
      p_title: body.title.trim(), p_snapshot: snapshot,
      p_actor: { id: actor.id, accountTable: actor.accountTable, displayName: actor.displayName, username: actor.username },
    }).single();
    if (error?.code === 'P0002') throw new AccessError('สารเคมีนี้ไม่พร้อมให้บันทึกแล้ว กรุณาเปิดทะเบียนใหม่', 409);
    if (error?.code === '23505') throw new AccessError('คำขอบันทึกนี้ถูกใช้แล้ว กรุณาลองใหม่', 409);
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201, headers: noStore });
  } catch (error) { return apiError(error); }
}

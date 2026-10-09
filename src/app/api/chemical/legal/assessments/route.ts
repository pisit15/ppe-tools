import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, apiError, assertCompany, requireToolsActor } from '@/lib/toolsSession';
import { getLegalCatalog } from '@/lib/chemical/legal/catalog';
import { checkLegalCatalog, evaluateObligations, normalizeCas, parseLegalContext } from '@/lib/chemical/legal/engine';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const params = request.nextUrl.searchParams;
    const company = params.get('company_id');
    assertCompany(actor, company, true);
    const cas = normalizeCas(params.get('cas'));
    if (!cas) throw new AccessError('เลข CAS ไม่ถูกต้อง', 400);
    let query = getSupabaseServer().from('chem_legal_assessments').select('*').eq('company_id', company).eq('cas', cas).order('created_at', { ascending: false }).limit(10);
    if (params.get('substance_id')) query = query.eq('substance_id', params.get('substance_id'));
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessError('ข้อมูลไม่ถูกต้อง', 400);
    assertCompany(actor, body.company_id, true);
    const cas = normalizeCas(body.cas);
    if (!cas) throw new AccessError('เลข CAS ไม่ถูกต้อง', 400);
    let context;
    try { context = parseLegalContext(body.context); } catch (error) { throw new AccessError(error instanceof Error ? error.message : 'บริบทไม่ถูกต้อง', 400); }
    if (!['pending', 'reviewed'].includes(body.review_status) || typeof body.review_note !== 'string' || body.review_note.length > 3000 || (body.review_status === 'reviewed' && body.review_note.trim().length < 10)) throw new AccessError('การตรวจทานต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร', 400);
    // A save must see a release switch immediately, even inside the read cache window.
    const catalog = await getLegalCatalog(true);
    if (body.release_id !== catalog.release.id) throw new AccessError('ฐานกฎหมายเปลี่ยนรุ่นแล้ว กรุณาโหลดและตรวจใหม่ก่อนบันทึก', 409);
    const db = getSupabaseServer();
    let substance: { name: string; updated_at: string } | null = null;
    if (body.substance_id) {
      if (typeof body.substance_id !== 'string') throw new AccessError('รายการสารไม่ถูกต้อง', 400);
      const result = await db.from('chem_substances').select('id,name,cas_no,updated_at').eq('id', body.substance_id).eq('company_id', body.company_id).eq('is_active', true).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new AccessError('ไม่พบรายการในบริษัทที่เลือก', 404);
      if (normalizeCas(result.data.cas_no) !== cas || result.data.updated_at !== body.substance_updated_at) throw new AccessError('ทะเบียนสารมีการเปลี่ยนแปลง กรุณาโหลดและตรวจใหม่ก่อนบันทึก', 409);
      substance = result.data;
    }
    const check = checkLegalCatalog(catalog, cas);
    const result = await db.from('chem_legal_assessments').insert({
      company_id: body.company_id, substance_id: body.substance_id || null, cas, release_id: catalog.release.id,
      review_status: body.review_status, review_note: body.review_note.trim(), actor_id: actor.id, actor_name: actor.displayName,
      snapshot: { context, check, sources: catalog.sources, obligations: evaluateObligations(check, context), substance_name: substance?.name || null, substance_updated_at: substance?.updated_at || null },
    }).select('*').single();
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

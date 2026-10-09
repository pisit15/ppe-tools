import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requireToolsActor, assertCompany, apiError } from '@/lib/toolsSession';
import { SUBSTANCE_SELECT } from '@/lib/chemical/sanitize';
import { prepareSubstance } from '@/lib/chemical/access';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const sp = request.nextUrl.searchParams;
    const companyId = sp.get('company_id');
    assertCompany(actor, companyId);
    let q = getSupabaseServer().from('chem_substances').select(SUBSTANCE_SELECT).order('name');
    if (companyId !== 'all') q = q.eq('company_id', companyId);
    if (sp.get('include_inactive') !== '1') q = q.eq('is_active', true);
    q = q.eq('is_demo', sp.get('demo') === '1');
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) { return apiError(e); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const row = await prepareSubstance(await request.json(), actor);
    const { data, error } = await getSupabaseServer().from('chem_substances').insert(row).select(SUBSTANCE_SELECT).single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) { return apiError(e); }
}
import { NextRequest, NextResponse } from 'next/server';
import { assertExistingCompany } from '@/lib/chemical/access';
import { getSupabaseServer } from '@/lib/supabase';

import { requireToolsActor, assertCompany, apiError, AccessError } from '@/lib/toolsSession';

export const dynamic = 'force-dynamic';

function db() {
  return getSupabaseServer();
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const companyId = request.nextUrl.searchParams.get('company_id') || '';
    assertCompany(actor, companyId);
    let q = db().from('chem_storage_areas').select('*').eq('is_active', true).order('name');
    if (companyId !== 'all') q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const body = (await request.json()) as { company_id?: string; name?: string; description?: string };
    if (!body.company_id || !body.name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุบริษัทและชื่อพื้นที่เก็บ' }, { status: 400 });
    }
    assertCompany(actor, body.company_id, true);
    await assertExistingCompany(body.company_id);
    const { data, error } = await db().from('chem_storage_areas')
      .insert([{ company_id: body.company_id, name: body.name.trim(), description: body.description?.trim() || null }])
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const body = (await request.json()) as { id?: string; name?: string; description?: string; is_active?: boolean };
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const { data: current, error: lookupError } = await db().from('chem_storage_areas').select('company_id').eq('id', body.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!current) throw new AccessError('ไม่พบพื้นที่จัดเก็บ', 404);
    assertCompany(actor, current.company_id, true);
    if (body.name !== undefined && !body.name.trim()) throw new AccessError('กรุณาระบุชื่อพื้นที่จัดเก็บ', 400);
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    const { data, error } = await db().from('chem_storage_areas').update(updates).eq('id', body.id).select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] });
  } catch (error: unknown) {
    return apiError(error);
  }
}

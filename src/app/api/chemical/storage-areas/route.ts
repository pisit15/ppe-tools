import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function db() {
  try { return getSupabaseServer(); } catch { return supabase; }
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id') || '';
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 });
    let q = db().from('chem_storage_areas').select('*').eq('is_active', true).order('name');
    if (companyId !== 'all') q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching storage areas:', error);
    return NextResponse.json({ error: 'Failed to fetch storage areas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { company_id?: string; name?: string; description?: string };
    if (!body.company_id || !body.name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุบริษัทและชื่อพื้นที่เก็บ' }, { status: 400 });
    }
    const { data, error } = await db().from('chem_storage_areas')
      .insert([{ company_id: body.company_id, name: body.name.trim(), description: body.description?.trim() || null }])
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; name?: string; description?: string; is_active?: boolean };
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    const { data, error } = await db().from('chem_storage_areas').update(updates).eq('id', body.id).select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

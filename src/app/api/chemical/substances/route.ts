import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { CreateChemSubstanceInput } from '@/lib/types';
import { sanitizeSubstance, SUBSTANCE_SELECT } from '@/lib/chemical/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const companyId = sp.get('company_id') || '';
    const includeInactive = sp.get('include_inactive') === '1';
    if (!companyId) return NextResponse.json({ error: 'Missing company_id' }, { status: 400 });

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    let q = db.from('chem_substances').select(SUBSTANCE_SELECT).order('name');
    // admin เลือก "ทุกบริษัท" ส่ง company_id=all
    if (companyId !== 'all') q = q.eq('company_id', companyId);
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching chem_substances:', error);
    return NextResponse.json({ error: 'Failed to fetch substances' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = sanitizeSubstance((await request.json()) as Partial<CreateChemSubstanceInput>);
    if (!body.company_id || !body.name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุบริษัทและชื่อสารเคมี' }, { status: 400 });
    }
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db.from('chem_substances').insert([body]).select(SUBSTANCE_SELECT);
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

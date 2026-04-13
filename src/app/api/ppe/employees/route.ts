import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { CreateEmployeeInput } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id') || 'default';

    const { data, error } = await supabase
      .from('ppe_employees')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEmployeeInput;
    const { company_id, employee_code, name, position, department, is_active } = body;

    if (!company_id || !employee_code || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db
      .from('ppe_employees')
      .insert([
        {
          company_id,
          employee_code,
          name,
          position,
          department,
          is_active: is_active !== false,
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating employee:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to create employee', detail: msg },
      { status: 500 }
    );
  }
}

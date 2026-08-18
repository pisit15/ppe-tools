import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

// Per-company department list CRUD.
// PATCH renames cascade to ppe_employees.department and
// ppe_transactions.department so old records follow the new name.

function getDb() {
  try {
    return getSupabaseServer();
  } catch {
    return supabase;
  }
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id') || 'default';
    const db = getDb();
    let query = db.from('ppe_departments').select('*').eq('is_active', true);
    if (companyId !== 'all' && companyId !== 'admin') {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { company_id?: string; name?: string };
    const companyId = (body.company_id || '').trim();
    const name = (body.name || '').trim();
    if (!companyId || companyId === 'all' || companyId === 'admin' || !name) {
      return NextResponse.json({ error: 'กรุณาระบุบริษัทและชื่อแผนก' }, { status: 400 });
    }

    const db = getDb();
    const { data: dup } = await db
      .from('ppe_departments')
      .select('id')
      .eq('company_id', companyId)
      .ilike('name', name);
    if ((dup || []).length > 0) {
      return NextResponse.json({ error: `มีแผนก "${name}" อยู่แล้ว` }, { status: 409 });
    }

    const { data, error } = await db
      .from('ppe_departments')
      .insert([{ company_id: companyId, name }])
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating department:', error);
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: number; name?: string };
    const newName = (body.name || '').trim();
    if (!body.id || !newName) {
      return NextResponse.json({ error: 'กรุณาระบุแผนกและชื่อใหม่' }, { status: 400 });
    }

    const db = getDb();
    const { data: current, error: curErr } = await db
      .from('ppe_departments')
      .select('*')
      .eq('id', body.id)
      .single();
    if (curErr || !current) {
      return NextResponse.json({ error: 'ไม่พบแผนกนี้' }, { status: 404 });
    }
    const oldName = current.name as string;
    const companyId = current.company_id as string;
    if (oldName === newName) return NextResponse.json({ data: current });

    const { data: dup } = await db
      .from('ppe_departments')
      .select('id')
      .eq('company_id', companyId)
      .ilike('name', newName)
      .neq('id', body.id);
    if ((dup || []).length > 0) {
      return NextResponse.json({ error: `มีแผนก "${newName}" อยู่แล้ว` }, { status: 409 });
    }

    const { data, error } = await db
      .from('ppe_departments')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select();
    if (error) throw error;

    // Cascade rename to historical data (exact string match within company)
    const { count: empCount } = await db
      .from('ppe_employees')
      .update({ department: newName }, { count: 'exact' })
      .eq('company_id', companyId)
      .eq('department', oldName);
    const { count: txCount } = await db
      .from('ppe_transactions')
      .update({ department: newName }, { count: 'exact' })
      .eq('company_id', companyId)
      .eq('department', oldName);

    return NextResponse.json({
      data: data[0],
      cascaded: { employees: empCount ?? 0, transactions: txCount ?? 0 },
    });
  } catch (error) {
    console.error('Error updating department:', error);
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing department id' }, { status: 400 });

    const db = getDb();
    const { data, error } = await db
      .from('ppe_departments')
      .delete()
      .eq('id', parseInt(id))
      .select('id, name');
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'ไม่พบแผนกนี้' }, { status: 404 });
    }
    // Historical employee/transaction records keep the department string;
    // it simply disappears from the selectable list.
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    console.error('Error deleting department:', error);
    return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 });
  }
}

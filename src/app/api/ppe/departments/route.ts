import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor, ppeDatabaseError } from '@/lib/ppe-access';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';

// Per-company department list CRUD.
// Renames affect current employees, while transactions retain their original department.

function getDb() {
  return getSupabaseServer();
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const selected = request.nextUrl.searchParams.get('company_id') || actor.companyId;
    const companyId = selected === 'admin' && actor.isAdmin ? 'all' : selected;
    assertCompany(actor, companyId);
    const db = getDb();
    let query = db.from('ppe_departments').select('*').eq('is_active', true);
    if (companyId !== 'all' && companyId !== 'admin') {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const body = (await request.json()) as { company_id?: string; name?: string };
    const companyId = (body.company_id || '').trim();
    const name = (body.name || '').trim();
    if (!companyId || companyId === 'all' || companyId === 'admin' || !name) {
      return NextResponse.json({ error: 'กรุณาระบุบริษัทและชื่อแผนก' }, { status: 400 });
    }
    assertCompany(actor, companyId, true);
    if (name.length > 150) throw new AccessError('ชื่อแผนกต้องไม่เกิน 150 ตัวอักษร', 400);

    const db = getDb();
    const { data: dup, error: duplicateError } = await db
      .from('ppe_departments')
      .select('id')
      .eq('company_id', companyId)
      .ilike('name', name);
    if (duplicateError) throw duplicateError;
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
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const body = (await request.json()) as { id?: number; name?: string; expected_name?: string; company_id?: string };
    const newName = (body.name || '').trim();
    if (!Number.isSafeInteger(body.id) || !body.id || body.id < 1 || !newName || newName.length > 150) {
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
    assertCompany(actor, companyId, true);
    if (body.company_id && body.company_id !== companyId) throw new AccessError('ไม่มีสิทธิ์เข้าถึงบริษัทนี้');
    const { data, error } = await db.rpc('ppe_department_rename', {
      p_actor_table: actor.accountTable, p_actor_id: actor.id, p_company: companyId,
      p_department_id: body.id, p_expected_name: body.expected_name ?? oldName, p_name: newName,
    });
    if (error) ppeDatabaseError(error);
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !/^[1-9][0-9]*$/.test(id)) return NextResponse.json({ error: 'Missing department id' }, { status: 400 });

    const db = getDb();
    const current = await db.from('ppe_departments').select('company_id').eq('id', id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw new AccessError('ไม่พบแผนกนี้', 404);
    assertCompany(actor, current.data.company_id, true);
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
    return apiError(error);
  }
}

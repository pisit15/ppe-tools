import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor, ppeDatabaseError } from '@/lib/ppe-access';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import type { PPEEmployee } from '@/lib/types';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const params = request.nextUrl.searchParams;
    const selected = params.get('company_id') || actor.companyId;
    const company = selected === 'admin' && actor.isAdmin ? 'all' : selected;
    assertCompany(actor, company);
    const db = getSupabaseServer();
    const id = params.get('id');
    if (id) {
      if (!UUID.test(id)) throw new AccessError('รหัสพนักงานไม่ถูกต้อง', 400);
      const { data: employee, error } = await db.from('ppe_employees').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!employee) throw new AccessError('ไม่พบพนักงาน', 404);
      assertCompany(actor, employee.company_id);
      if (company !== 'all' && company !== employee.company_id) throw new AccessError('ไม่มีสิทธิ์เข้าถึงบริษัทนี้');
      if (params.get('view') === 'impact') {
        const result = await db.rpc('ppe_employee_impact', { p_actor_table: actor.accountTable, p_actor_id: actor.id, p_company: employee.company_id, p_employee_id: id });
        if (result.error) ppeDatabaseError(result.error);
        return NextResponse.json({ data: result.data }, { headers });
      }
      if (params.get('view') === 'history') {
        const result = await db.from('ppe_employee_changes').select('*').eq('employee_id', id).eq('company_id', employee.company_id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
        if (result.error) throw result.error;
        return NextResponse.json({ data: result.data }, { headers });
      }
      return NextResponse.json({ data: employee }, { headers });
    }
    const status = params.get('status') || 'active';
    if (!['active', 'inactive', 'all'].includes(status)) throw new AccessError('ตัวกรองสถานะไม่ถูกต้อง', 400);
    const data: PPEEmployee[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = db.from('ppe_employees').select('*');
      if (company !== 'all') query = query.eq('company_id', company);
      if (status !== 'all') query = query.eq('is_active', status === 'active');
      const result = await query.order('name').order('id').range(offset, offset + 999);
      if (result.error) throw result.error;
      data.push(...result.data);
      if (result.data.length < 1000) break;
    }
    return NextResponse.json({ data }, { headers });
  } catch (error) { return apiError(error); }
}

async function write(request: NextRequest, creating: boolean) {
  try {
    const actor = await requirePPEActor(request, true);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessError('ข้อมูลพนักงานไม่ถูกต้อง', 400);
    const company = body.company_id || actor.companyId;
    assertCompany(actor, company, true);
    if (!creating && (typeof body.id !== 'string' || !UUID.test(body.id) || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 1)) throw new AccessError('กรุณาโหลดข้อมูลพนักงานใหม่ก่อนบันทึก', 400);
    const changes: Record<string, unknown> = {};
    for (const key of ['employee_code', 'name', 'position', 'department', 'is_active']) if (body[key] !== undefined) changes[key] = body[key];
    const { data, error } = await getSupabaseServer().rpc('ppe_employee_write', {
      p_actor_table: actor.accountTable, p_actor_id: actor.id, p_company: company,
      p_employee_id: creating ? null : body.id,
      p_expected_revision: creating ? null : body.expected_revision, p_changes: changes,
    });
    if (error) ppeDatabaseError(error);
    return NextResponse.json({ data }, { status: creating ? 201 : 200, headers });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) { return write(request, true); }
export async function PATCH(request: NextRequest) { return write(request, false); }

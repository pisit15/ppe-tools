import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor, ppeCompany, ppeDatabaseError } from '@/lib/ppe-access';
import { AccessError, apiError } from '@/lib/toolsSession';

const fields = 'id,company_id,username,display_name,employee_code,department,is_active,created_at';
export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const company = ppeCompany(request, actor);
    const { data, error } = await getSupabaseServer().from('ppe_requesters').select(fields).eq('company_id', company).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) { return apiError(e); }
}
function text(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function password(value: unknown) {
  if (typeof value !== 'string' || value.length < 10 || Buffer.byteLength(value, 'utf8') > 72) throw new AccessError('รหัสผ่านอย่างน้อย 10 ตัวอักษร และไม่เกิน 72 ไบต์', 400);
  return value;
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const company = ppeCompany(request, actor);
    const body = await request.json();
    const name = text(body.display_name, 150), code = text(body.employee_code, 100), username = text(body.username, 40).toLowerCase();
    if (!name || !code || !/^[a-z0-9][a-z0-9.-]{2,39}$/.test(username)) throw new AccessError('กรุณากรอกชื่อ รหัสพนักงาน และชื่อผู้ใช้ภาษาอังกฤษหรือตัวเลขอย่างน้อย 3 ตัว', 400);
    const db = getSupabaseServer();
    const login = `ppe.${company}.${username}`;
    for (const table of ['company_users', 'tools_users', 'admin_accounts']) {
      const { data, error } = await db.from(table).select('id').ilike('username', login).limit(1);
      if (error) throw error;
      if (data?.length) throw new AccessError('ชื่อผู้ใช้นี้ถูกใช้แล้ว', 409);
    }
    const { data, error } = await db.from('ppe_requesters').insert({
      company_id: company, username: login, display_name: name, employee_code: code,
      department: text(body.department, 150), password: await bcrypt.hash(password(body.password), 12),
      created_by: `${actor.accountTable}:${actor.id}`,
    }).select(fields).single();
    if (error) ppeDatabaseError(error);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) { return apiError(e); }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const company = ppeCompany(request, actor);
    const body = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.is_active === 'boolean') update.is_active = body.is_active;
    if (body.password !== undefined) update.password = await bcrypt.hash(password(body.password), 12);
    if (Object.keys(update).length === 1) throw new AccessError('ไม่พบข้อมูลที่จะเปลี่ยน', 400);
    const { data, error } = await getSupabaseServer().from('ppe_requesters').update(update).eq('id', body.id).eq('company_id', company).select(fields).maybeSingle();
    if (error) ppeDatabaseError(error);
    if (!data) throw new AccessError('ไม่พบผู้ใช้งานในบริษัทนี้', 404);
    return NextResponse.json({ data });
  } catch (e) { return apiError(e); }
}

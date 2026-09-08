import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

const COLUMNS = 'id, username, display_name, role, is_active, last_login_at, created_at, updated_at';
const ROLES = ['admin', 'super_admin'];

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function activeSuperAdminCount(excludeId?: number) {
  let query = saDb()
    .from('admin_accounts')
    .select('id')
    .eq('role', 'super_admin')
    .eq('is_active', true);
  if (excludeId !== undefined) query = query.neq('id', excludeId);
  const { data } = await query;
  return (data || []).length;
}

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { data, error } = await saDb().from('admin_accounts').select(COLUMNS).order('id');
    if (error) throw error;
    return NextResponse.json({ data: data || [], currentUser: guard.session.username });
  } catch (err) {
    return saError(err, 'โหลดรายชื่อผู้ดูแลไม่สำเร็จ');
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const role = String(body.role || 'admin');

    if (!username || !password) return badRequest('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    if (password.length < 8) return badRequest('รหัสผ่านผู้ดูแลต้องยาวอย่างน้อย 8 ตัวอักษร');
    if (!ROLES.includes(role)) return badRequest('role ต้องเป็น admin หรือ super_admin');

    const db = saDb();
    const { data: existing } = await db.from('admin_accounts').select('id').ilike('username', username);
    if ((existing || []).length > 0) return badRequest(`ชื่อผู้ใช้ "${username}" มีอยู่แล้ว`, 409);

    const { data, error } = await db
      .from('admin_accounts')
      .insert({
        username,
        password: bcrypt.hashSync(password, 10),
        display_name: String(body.display_name || username).trim(),
        role,
        is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'เพิ่มผู้ดูแลไม่สำเร็จ');
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id)) return badRequest('ไม่พบ id ของผู้ดูแล');

    const db = saDb();
    const { data: current } = await db.from('admin_accounts').select('*').eq('id', id).single();
    if (!current) return badRequest('ไม่พบบัญชีผู้ดูแลนี้', 404);

    const isSelf = String(current.username).toLowerCase() === guard.session.username.toLowerCase();
    const patch: Record<string, unknown> = {};

    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (!username) return badRequest('ชื่อผู้ใช้ว่างไม่ได้');
      const { data: clash } = await db
        .from('admin_accounts')
        .select('id')
        .ilike('username', username)
        .neq('id', id);
      if ((clash || []).length > 0) return badRequest(`ชื่อผู้ใช้ "${username}" มีอยู่แล้ว`, 409);
      patch.username = username;
    }
    if (body.display_name !== undefined) patch.display_name = String(body.display_name).trim();

    if (body.role !== undefined) {
      const role = String(body.role);
      if (!ROLES.includes(role)) return badRequest('role ต้องเป็น admin หรือ super_admin');
      if (isSelf && role !== 'super_admin') return badRequest('ลดสิทธิ์ตัวเองไม่ได้');
      if (current.role === 'super_admin' && role !== 'super_admin') {
        if ((await activeSuperAdminCount(id)) === 0) {
          return badRequest('ต้องเหลือ Super Admin ที่ใช้งานได้อย่างน้อย 1 บัญชี');
        }
      }
      patch.role = role;
    }

    if (body.is_active !== undefined) {
      const isActive = Boolean(body.is_active);
      if (isSelf && !isActive) return badRequest('ปิดใช้งานบัญชีตัวเองไม่ได้');
      if (!isActive && current.role === 'super_admin' && (await activeSuperAdminCount(id)) === 0) {
        return badRequest('ต้องเหลือ Super Admin ที่ใช้งานได้อย่างน้อย 1 บัญชี');
      }
      patch.is_active = isActive;
    }

    if (body.password) {
      const password = String(body.password);
      if (password.length < 8) return badRequest('รหัสผ่านผู้ดูแลต้องยาวอย่างน้อย 8 ตัวอักษร');
      patch.password = bcrypt.hashSync(password, 10);
    }

    if (Object.keys(patch).length === 0) return badRequest('ไม่มีข้อมูลที่จะแก้ไข');
    patch.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('admin_accounts')
      .update(patch)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'แก้ไขผู้ดูแลไม่สำเร็จ');
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id)) return badRequest('ไม่พบ id ของผู้ดูแล');

    const db = saDb();
    const { data: current } = await db.from('admin_accounts').select('*').eq('id', id).single();
    if (!current) return badRequest('ไม่พบบัญชีผู้ดูแลนี้', 404);

    if (String(current.username).toLowerCase() === guard.session.username.toLowerCase()) {
      return badRequest('ลบบัญชีตัวเองไม่ได้');
    }
    if (current.role === 'super_admin' && (await activeSuperAdminCount(id)) === 0) {
      return badRequest('ต้องเหลือ Super Admin ที่ใช้งานได้อย่างน้อย 1 บัญชี');
    }

    const { error } = await db.from('admin_accounts').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return saError(err, 'ลบผู้ดูแลไม่สำเร็จ');
  }
}

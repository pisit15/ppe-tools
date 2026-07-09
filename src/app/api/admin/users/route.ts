import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import { verifyAdminToken, tokenFromRequest } from '@/lib/adminToken';
import bcrypt from 'bcryptjs';

// Admin-only CRUD for company_users.
// Requires a valid admin token (issued at admin login) in the
// Authorization: Bearer header — the user tables are service-role only.

const SAFE_COLUMNS = 'id, company_id, username, display_name, is_active, created_at, updated_at';

function getDb() {
  try {
    return getSupabaseServer();
  } catch {
    return supabase;
  }
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function usernameTaken(
  db: ReturnType<typeof getDb>,
  companyId: string,
  username: string,
  excludeId?: number
): Promise<boolean> {
  let q = db
    .from('company_users')
    .select('id')
    .eq('company_id', companyId)
    .ilike('username', username);
  if (excludeId !== undefined) q = q.neq('id', excludeId);
  const { data } = await q;
  return (data || []).length > 0;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyAdminToken(tokenFromRequest(request.headers))) return unauthorized();
    const companyId = request.nextUrl.searchParams.get('company_id');

    const db = getDb();
    let query = db.from('company_users').select(SAFE_COLUMNS);
    if (companyId && companyId !== 'all') query = query.eq('company_id', companyId);

    const { data, error } = await query.order('company_id').order('username');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyAdminToken(tokenFromRequest(request.headers))) return unauthorized();
    const body = (await request.json()) as {
      company_id?: string;
      username?: string;
      password?: string;
      display_name?: string;
      is_active?: boolean;
    };

    const companyId = (body.company_id || '').trim();
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!companyId || !username || !password) {
      return NextResponse.json(
        { error: 'กรุณากรอกบริษัท ชื่อผู้ใช้ และรหัสผ่าน' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' },
        { status: 400 }
      );
    }

    const db = getDb();
    if (await usernameTaken(db, companyId, username)) {
      return NextResponse.json(
        { error: `ชื่อผู้ใช้ "${username}" มีอยู่แล้วในบริษัทนี้` },
        { status: 409 }
      );
    }

    const { data, error } = await db
      .from('company_users')
      .insert([
        {
          company_id: companyId,
          username,
          password: bcrypt.hashSync(password, 10),
          display_name: (body.display_name || '').trim(),
          is_active: body.is_active !== false,
        },
      ])
      .select(SAFE_COLUMNS);

    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!verifyAdminToken(tokenFromRequest(request.headers))) return unauthorized();
    const body = (await request.json()) as {
      id?: number;
      company_id?: string;
      username?: string;
      password?: string;
      display_name?: string;
      is_active?: boolean;
    };

    if (!body.id) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
    }

    const db = getDb();

    // Load current row for duplicate checks on username/company changes
    const { data: current, error: curErr } = await db
      .from('company_users')
      .select(SAFE_COLUMNS)
      .eq('id', body.id)
      .single();
    if (curErr || !current) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้นี้' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.display_name !== undefined) updates.display_name = body.display_name.trim();
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const newCompany = body.company_id?.trim() || (current.company_id as string);
    const newUsername = body.username?.trim() || (current.username as string);
    if (body.company_id !== undefined) updates.company_id = newCompany;
    if (body.username !== undefined) updates.username = newUsername;

    if (
      (body.username !== undefined || body.company_id !== undefined) &&
      (await usernameTaken(db, newCompany, newUsername, body.id))
    ) {
      return NextResponse.json(
        { error: `ชื่อผู้ใช้ "${newUsername}" มีอยู่แล้วในบริษัทนี้` },
        { status: 409 }
      );
    }

    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' },
          { status: 400 }
        );
      }
      updates.password = bcrypt.hashSync(body.password, 10);
    }

    const { data, error } = await db
      .from('company_users')
      .update(updates)
      .eq('id', body.id)
      .select(SAFE_COLUMNS);

    if (error) throw error;
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!verifyAdminToken(tokenFromRequest(request.headers))) return unauthorized();
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
    }

    const db = getDb();
    const { data, error } = await db
      .from('company_users')
      .delete()
      .eq('id', parseInt(id))
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้นี้' }, { status: 404 });
    }
    return NextResponse.json({ data: { id: data[0].id } });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

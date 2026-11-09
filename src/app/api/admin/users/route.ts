import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import { verifyAdminToken, tokenFromRequest } from '@/lib/adminToken';
import bcrypt from 'bcryptjs';
import { MODULE_IDS } from '@/lib/companies';

// Admin-only CRUD for company_users.
// Requires a valid admin token (issued at admin login) in the
// Authorization: Bearer header — the user tables are service-role only.

const SAFE_COLUMNS = 'id, company_id, username, display_name, is_active, allowed_modules, created_at, updated_at';

const VALID_MODULES: string[] = MODULE_IDS;

// null = ทุกระบบ; array = เฉพาะระบบที่ระบุ (ต้องมีอย่างน้อย 1)
function sanitizeModules(input: unknown): string[] | null | 'invalid' {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) return 'invalid';
  const mods = input.filter((m): m is string => typeof m === 'string' && VALID_MODULES.includes(m));
  if (mods.length === 0) return 'invalid';
  if (VALID_MODULES.every((m) => mods.includes(m))) return null; // ครบทุกระบบ = null
  return mods;
}

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
      company_ids?: string[];
      username?: string;
      password?: string;
      display_name?: string;
      is_active?: boolean;
      allowed_modules?: string[] | null;
    };

    // One person may need several companies: same username + the SAME password hash on every row,
    // which is what lets them switch company inside the app without logging in again.
    const companyIds = [...new Set((Array.isArray(body.company_ids) && body.company_ids.length ? body.company_ids : [body.company_id || '']).map(c => String(c).trim()).filter(Boolean))];
    const companyId = companyIds[0] || '';
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

    const modules = sanitizeModules(body.allowed_modules);
    if (modules === 'invalid') {
      return NextResponse.json(
        { error: 'ต้องเลือกระบบที่เข้าได้อย่างน้อย 1 ระบบ' },
        { status: 400 }
      );
    }

    const db = getDb();
    const taken: string[] = [];
    for (const c of companyIds) if (await usernameTaken(db, c, username)) taken.push(c);
    const toCreate = companyIds.filter(c => !taken.includes(c));
    if (!toCreate.length) {
      return NextResponse.json(
        { error: `ชื่อผู้ใช้ "${username}" มีอยู่แล้วใน${taken.length > 1 ? 'ทุกบริษัทที่เลือก' : 'บริษัทนี้'}` },
        { status: 409 }
      );
    }

    const hash = bcrypt.hashSync(password, 10);
    const { data, error } = await db
      .from('company_users')
      .insert(toCreate.map(c => ({
        company_id: c,
        username,
        password: hash,
        display_name: (body.display_name || '').trim(),
        is_active: body.is_active !== false,
        allowed_modules: modules,
      })))
      .select(SAFE_COLUMNS);

    if (error) throw error;
    return NextResponse.json({ data: data[0], created: data, skipped: taken }, { status: 201 });
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
      allowed_modules?: string[] | null;
      /** Apply display name / modules / active / password to every row with this username (all companies). */
      apply_all?: boolean;
      /** Companies this username should exist in (missing rows are created with the same password hash). */
      company_ids?: string[];
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
    if (body.allowed_modules !== undefined) {
      const modules = sanitizeModules(body.allowed_modules);
      if (modules === 'invalid') {
        return NextResponse.json(
          { error: 'ต้องเลือกระบบที่เข้าได้อย่างน้อย 1 ระบบ' },
          { status: 400 }
        );
      }
      updates.allowed_modules = modules;
    }

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

    let applied = 1;
    if (body.apply_all || (Array.isArray(body.company_ids) && body.company_ids.length)) {
      // Shared fields for every row of this person (never company_id/username — those are per row).
      const shared: Record<string, unknown> = { updated_at: updates.updated_at };
      for (const key of ['display_name', 'is_active', 'allowed_modules', 'password'] as const) if (key in updates) shared[key] = updates[key];
      const { data: siblings, error: sibErr } = await db.from('company_users').select('id, company_id, password').ilike('username', newUsername);
      if (sibErr) throw sibErr;
      const rows = (siblings || []) as { id: number; company_id: string; password: string }[];
      const others = rows.filter(r => r.id !== body.id);
      if (body.apply_all && others.length && Object.keys(shared).length > 1) {
        const { error: upErr } = await db.from('company_users').update(shared).in('id', others.map(r => r.id));
        if (upErr) throw upErr;
      }
      applied = rows.length;
      if (Array.isArray(body.company_ids)) {
        const have = new Set(rows.map(r => r.company_id));
        const missing = body.company_ids.map(c => String(c).trim()).filter(c => c && !have.has(c));
        if (missing.length) {
          // Reuse the row's current hash so all rows stay switchable.
          const { data: me } = await db.from('company_users').select('password, display_name, is_active, allowed_modules').eq('id', body.id).single();
          if (me) {
            const { error: insErr } = await db.from('company_users').insert(missing.map(c => ({ company_id: c, username: newUsername, password: me.password, display_name: me.display_name, is_active: me.is_active, allowed_modules: me.allowed_modules })));
            if (insErr) throw insErr;
            applied += missing.length;
          }
        }
      }
    }
    return NextResponse.json({ data: data[0], applied });
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

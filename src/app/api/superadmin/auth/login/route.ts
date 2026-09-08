import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { saDb } from '@/lib/superAdminGuard';
import { SA_COOKIE, SA_COOKIE_OPTIONS, createSessionToken } from '@/lib/superAdminSession';

export const runtime = 'nodejs';

// Stored password is bcrypt after migration 006; plaintext is still accepted
// for any row that predates it and is upgraded in place on first login.
function passwordMatches(supplied: string, stored: unknown): boolean {
  if (typeof stored !== 'string' || stored.length === 0) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(supplied, stored);
    } catch {
      return false;
    }
  }
  return stored === supplied;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = (await request.json()) as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'กรุณาใส่ชื่อผู้ใช้และรหัสผ่าน' },
        { status: 400 }
      );
    }

    const db = saDb();
    const { data: rows } = await db
      .from('admin_accounts')
      .select('*')
      .ilike('username', username.trim())
      .eq('is_active', true);

    const account = (rows || []).find((r) => passwordMatches(password, r.password));

    // Same message for "no such user", "wrong password" and "not a super admin"
    // so the console never reveals which admin usernames exist.
    if (!account || account.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ไม่ใช่ Super Admin' },
        { status: 401 }
      );
    }

    const token = await createSessionToken(String(account.username), 'super_admin');
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'ระบบยังไม่ได้ตั้งค่า session secret' },
        { status: 500 }
      );
    }

    const stored = String(account.password || '');
    const needsUpgrade = !/^\$2[aby]\$/.test(stored);
    const patch: Record<string, unknown> = { last_login_at: new Date().toISOString() };
    if (needsUpgrade) patch.password = bcrypt.hashSync(password, 10);
    await db.from('admin_accounts').update(patch).eq('id', account.id);

    await db.from('login_events').insert({
      username: account.username,
      display_name: account.display_name || account.username,
      company_id: 'admin',
      role: 'super_admin',
      user_agent: request.headers.get('user-agent') || null,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        username: account.username,
        displayName: account.display_name || account.username,
        role: 'super_admin',
      },
    });
    response.cookies.set(SA_COOKIE, token, SA_COOKIE_OPTIONS);
    return response;
  } catch (err) {
    console.error('Super admin login error:', err);
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' },
      { status: 500 }
    );
  }
}

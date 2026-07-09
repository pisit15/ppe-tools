import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// Login uses the service-role key — user tables are locked down by RLS and
// anon has no access. Anon key remains only as a local-dev fallback.
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('Missing Supabase config');
  }
  return createClient(url, key);
}

type UserRow = Record<string, unknown>;

// Stored password may be a bcrypt hash (post-migration) or legacy plaintext.
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
    const { username, password, company_id: requestedCompanyId } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'กรุณาใส่ชื่อผู้ใช้และรหัสผ่าน' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    // Preserve case to match DB stored usernames; use ilike for case-insensitive lookup.
    const trimmedUsername = username.trim();

    // 1) Check admin_accounts first (case-insensitive).
    // Fetch all matches — .single() throws on duplicate usernames.
    const { data: adminRows } = await supabase
      .from('admin_accounts')
      .select('*')
      .ilike('username', trimmedUsername)
      .eq('is_active', true);

    const adminData = (adminRows || []).find(a => passwordMatches(password, a.password));
    if (adminData) {
      return NextResponse.json({
        success: true,
        user: {
          id: adminData.id,
          username: adminData.username,
          companyId: 'admin',
          companyName: 'EA SHE Admin',
          displayName: adminData.display_name || adminData.username,
          nickname: '',
          position: adminData.role === 'super_admin' ? 'Super Admin' : 'Admin',
          role: 'admin',
        },
      });
    }

    // 2) Check company_users first, then tools_users as fallback.
    // A user may exist in multiple companies with the same username — collect
    // every row whose password matches, then disambiguate by company.
    let matches: UserRow[] = [];

    const { data: cuRows } = await supabase
      .from('company_users')
      .select('*')
      .ilike('username', trimmedUsername)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    matches = (cuRows || []).filter(r => passwordMatches(password, r.password));

    if (matches.length === 0) {
      const { data: tuRows } = await supabase
        .from('tools_users')
        .select('*')
        .ilike('username', trimmedUsername)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      matches = (tuRows || []).filter(r => passwordMatches(password, r.password));
    }

    if (matches.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    const companyIds = [...new Set(matches.map(m => String(m.company_id)))];

    // Multiple companies and no explicit choice yet → ask the client to pick.
    // (Company list is only revealed AFTER the password has been verified.)
    if (companyIds.length > 1 && !requestedCompanyId) {
      const { data: csRows } = await supabase
        .from('company_settings')
        .select('company_id, company_name')
        .in('company_id', companyIds);

      const names: Record<string, string> = {};
      (csRows || []).forEach(c => {
        names[String(c.company_id)] = String(c.company_name);
      });

      return NextResponse.json({
        success: false,
        needCompanySelection: true,
        companies: companyIds.map(id => ({
          companyId: id,
          companyName:
            names[id] ||
            ((matches.find(m => String(m.company_id) === id)?.company_name as string) || id),
        })),
      });
    }

    let userData: UserRow;
    if (requestedCompanyId) {
      const chosen = matches.find(m => String(m.company_id) === String(requestedCompanyId));
      if (!chosen) {
        return NextResponse.json(
          { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
          { status: 401 }
        );
      }
      userData = chosen;
    } else {
      userData = matches[0];
    }

    // 3) Get company_name from company_settings or from user record
    let companyName = (userData.company_name as string) || (userData.display_name as string) || (userData.company_id as string);
    const { data: companyData } = await supabase
      .from('company_settings')
      .select('company_name')
      .eq('company_id', userData.company_id)
      .single();

    if (companyData) {
      companyName = companyData.company_name;
    }

    // Return user info (never return password)
    return NextResponse.json({
      success: true,
      user: {
        id: userData.id,
        username: userData.username,
        companyId: userData.company_id,
        companyName: companyName,
        displayName: (userData.display_name as string) || (userData.username as string),
        nickname: (userData.nickname as string) || '',
        position: (userData.position as string) || '',
        role: (userData.role as string) || 'user',
      },
    });
  } catch (err) {
    console.error('Auth error:', err);
    return NextResponse.json(
      { success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' },
      { status: 500 }
    );
  }
}

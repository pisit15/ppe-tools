import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use anon key — company_users and admin_accounts both allow anon SELECT
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('Missing Supabase config');
  }
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

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
    // NOTE: fetch all matches instead of .single() — .single() throws when the
    // same username exists more than once, which used to break login entirely.
    const { data: adminRows } = await supabase
      .from('admin_accounts')
      .select('*')
      .ilike('username', trimmedUsername)
      .eq('is_active', true);

    const adminData = (adminRows || []).find(a => a.password === password);
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

    // 2) Check company_users table first, then tools_users as fallback.
    // A user may exist in multiple companies with the same username — fetch all
    // matches and pick the row whose password matches (newest record first).
    let userData: Record<string, unknown> | null = null;

    const { data: cuRows } = await supabase
      .from('company_users')
      .select('*')
      .ilike('username', trimmedUsername)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    userData = (cuRows || []).find(r => r.password === password) || null;

    if (!userData) {
      // Fallback: check tools_users table
      const { data: tuRows } = await supabase
        .from('tools_users')
        .select('*')
        .ilike('username', trimmedUsername)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      userData = (tuRows || []).find(r => r.password === password) || null;
    }

    if (!userData) {
      return NextResponse.json(
        { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
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

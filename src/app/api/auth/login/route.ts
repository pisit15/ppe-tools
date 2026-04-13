import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key if available, fallback to anon key
// tools_users RLS is set to allow all access
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

    // Query tools_users table
    const { data, error } = await supabase
      .from('tools_users')
      .select('*')
      .eq('username', username.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    // Simple password check (matching eashe.org's approach)
    if (data.password !== password) {
      return NextResponse.json(
        { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    // Return user info (never return password)
    return NextResponse.json({
      success: true,
      user: {
        id: data.id,
        username: data.username,
        companyId: data.company_id,
        companyName: data.company_name,
        displayName: data.display_name || data.username,
        nickname: data.nickname || '',
        position: data.position || '',
        role: data.role || 'user',
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

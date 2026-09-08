// Server-side authorization for every /api/superadmin/* route.
// Never trust the client: the cookie is verified AND the account is re-checked
// against admin_accounts so a revoked/demoted admin loses access immediately.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer, supabase } from '@/lib/supabase';
import { SA_COOKIE, verifySessionToken, type SuperAdminSession } from '@/lib/superAdminSession';

export function saDb() {
  try {
    return getSupabaseServer();
  } catch {
    return supabase;
  }
}

export type GuardResult =
  | { ok: true; session: SuperAdminSession }
  | { ok: false; response: NextResponse };

export function saUnauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function requireSuperAdmin(request: NextRequest): Promise<GuardResult> {
  const token = request.cookies.get(SA_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return { ok: false, response: saUnauthorized() };

  const { data, error } = await saDb()
    .from('admin_accounts')
    .select('username, role, is_active')
    .ilike('username', session.username)
    .eq('is_active', true);

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }, { status: 500 }),
    };
  }

  const account = (data || []).find((a) => a.role === 'super_admin');
  if (!account) return { ok: false, response: saUnauthorized('ต้องเป็น Super Admin เท่านั้น') };

  return { ok: true, session };
}

export function saError(err: unknown, message: string, status = 500) {
  console.error(message, err);
  return NextResponse.json({ error: message }, { status });
}

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const { data } = await saDb()
    .from('admin_accounts')
    .select('username, display_name, role, last_login_at')
    .ilike('username', guard.session.username)
    .eq('is_active', true);

  const account = (data || [])[0];
  return NextResponse.json({
    user: {
      username: guard.session.username,
      displayName: account?.display_name || guard.session.username,
      role: 'super_admin',
      lastLoginAt: account?.last_login_at || null,
    },
    expiresAt: guard.session.exp * 1000,
  });
}

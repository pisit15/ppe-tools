import { NextRequest, NextResponse } from 'next/server';
import { requireToolsActor, assertSameOrigin, apiError, TOOLS_COOKIE, TOOLS_COOKIE_OPTIONS } from '@/lib/toolsSession';
import { issueAdminToken } from '@/lib/adminToken';

export async function GET(request: NextRequest) {
  try {
    const a = await requireToolsActor(request);
    return NextResponse.json({ user: {
      id: a.id, username: a.username, companyId: a.companyId,
      companyName: a.isAdmin ? 'EA SHE Admin' : String(a.row.company_name || a.companyId.toUpperCase()),
      displayName: a.displayName, nickname: String(a.row.nickname || ''), position: String(a.row.position || ''),
      role: a.isAdmin ? 'admin' : 'user', token: a.isAdmin ? issueAdminToken(a.username) : undefined,
    } });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: NextRequest) {
  try { assertSameOrigin(request); } catch(e) { return apiError(e); }
  const response = NextResponse.json({ success: true });
  response.cookies.set(TOOLS_COOKIE, '', { ...TOOLS_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

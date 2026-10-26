// Host-based routing for admin.eashe.org (Next.js 16 proxy convention;
// the old `middleware.ts` name is deprecated).
//
//   admin.eashe.org/*        -> rewritten to /superadmin/*   (super admin only)
//   tools.eashe.org/superadmin/*  -> 404 (the console lives on its own host)
//   localhost/superadmin/*   -> allowed, for local development
//
// Page requests on the admin host are gated on a valid session cookie here;
// every API route re-verifies the session AND the account server-side.
import { NextResponse, type NextRequest } from 'next/server';
import { SA_COOKIE, verifySessionToken } from '@/lib/superAdminSession';
import { apiError, TOOLS_COOKIE, verifyToolsSession } from '@/lib/toolsSession';
import { requirePPEActor, guardLegacyPPE } from '@/lib/ppe-access';

const ADMIN_HOST_PREFIX = 'admin.';

function isLocalHost(host: string) {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('0.0.0.0');
}

export default async function proxy(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const { pathname, search } = request.nextUrl;
  const isAdminHost = host.startsWith(ADMIN_HOST_PREFIX);
  const local = isLocalHost(host);
  const toolsSession = verifyToolsSession(request.cookies.get(TOOLS_COOKIE)?.value);
  if (toolsSession?.table === 'ppe_requesters') {
    const allowedAPI = ['/api/auth/session', '/api/auth/login', '/api/ppe/catalog', '/api/ppe/requests'];
    if (pathname.startsWith('/api/') && !allowedAPI.includes(pathname)) return NextResponse.json({ error: 'บัญชีนี้ใช้ได้เฉพาะการขอเบิก PPE' }, { status: 403 });
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && !['/ppe/requests'].includes(pathname) && !pathname.includes('.')) {
      const url = request.nextUrl.clone(); url.pathname = '/ppe/requests'; url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // --- The admin console host -------------------------------------------
  if (isAdminHost) {
    // Only the super admin API surface is reachable from this host.
    if (pathname.startsWith('/api/')) {
      if (pathname.startsWith('/api/superadmin/')) return NextResponse.next();
      return new NextResponse('Not Found', { status: 404 });
    }

    const session = await verifySessionToken(request.cookies.get(SA_COOKIE)?.value);
    const isLoginPage = pathname === '/login';

    if (!session && !isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
    if (session && isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }

    const target = request.nextUrl.clone();
    target.pathname = `/superadmin${pathname === '/' ? '' : pathname}`;
    target.search = search;

    const headers = new Headers(request.headers);
    headers.set('x-sa-base', ''); // links are rooted at the host itself
    return NextResponse.rewrite(target, { request: { headers } });
  }

  // --- Every other host --------------------------------------------------
  // The console must not be reachable from tools.eashe.org.
  if (!local && (pathname.startsWith('/superadmin') || pathname.startsWith('/api/superadmin'))) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Legacy PPE handlers use privileged database access. They must require a
  // current staff account; a dedicated Work Permit contractor cookie is not one.
  if (pathname.startsWith('/api/ppe/')) {
    try { const actor = await requirePPEActor(request); await guardLegacyPPE(request, actor); } catch (error) { return apiError(error); }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
};

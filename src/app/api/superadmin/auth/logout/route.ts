import { NextResponse } from 'next/server';
import { SA_COOKIE, SA_COOKIE_OPTIONS } from '@/lib/superAdminSession';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SA_COOKIE, '', { ...SA_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

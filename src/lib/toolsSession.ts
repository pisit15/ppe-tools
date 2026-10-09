import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export const TOOLS_COOKIE = 'ea_tools_session';
export const TOOLS_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 60 * 60 };
export type AccountTable = 'admin_accounts' | 'company_users' | 'tools_users';
type Session = { id: string; table: AccountTable; companyId: string; credential: string; exp: number };
export type ToolsActor = { id: string; username: string; companyId: string; isAdmin: boolean; displayName: string; row: Record<string, unknown> };
export class AccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}
function secret() {
  const key = process.env.TOOLS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Tools session secret is not configured');
  return key;
}
const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');
const credential = (password: unknown) => sign(`credential:${String(password)}`);
export function issueToolsSession(row: Record<string, unknown>, table: AccountTable) {
  const data: Session = { id: String(row.id), table, companyId: table === 'admin_accounts' ? 'admin' : String(row.company_id), credential: credential(row.password), exp: Date.now() + TOOLS_COOKIE_OPTIONS.maxAge * 1000 };
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function verifyToolsSession(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    const expected = Buffer.from(sign(body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (!['admin_accounts', 'company_users', 'tools_users'].includes(data.table) || !data.id || !data.companyId || !data.credential || !Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
    return data;
  } catch { return null; }
}
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  // Next.js normalizes loopback URLs; Host retains the browser-facing hostname.
  const expected = new URL(request.nextUrl.protocol + '//' + (request.headers.get('host') || request.nextUrl.host)).origin;
  if ((origin && origin !== expected) || request.headers.get('sec-fetch-site') === 'cross-site') throw new AccessError('ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
}
export async function requireToolsActor(request: NextRequest): Promise<ToolsActor> {
  const session = verifyToolsSession(request.cookies.get(TOOLS_COOKIE)?.value);
  if (!session) throw new AccessError('กรุณาเข้าสู่ระบบใหม่', 401);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    assertSameOrigin(request);
  }
  const { data, error } = await getSupabaseServer().from(session.table).select('*').eq('id', session.id).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data || credential(data.password) !== session.credential || (session.table !== 'admin_accounts' && data.company_id !== session.companyId)) throw new AccessError('สิทธิ์หรือบัญชีมีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่', 401);
  const isAdmin = session.table === 'admin_accounts';
  return { id: session.id, username: String(data.username), companyId: session.companyId, isAdmin, displayName: String(data.display_name || data.username), row: data };
}
export function assertCompany(actor: ToolsActor, companyId: unknown, write = false): asserts companyId is string {
  if (typeof companyId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(companyId) || companyId === 'admin' || (write && companyId === 'all')) throw new AccessError('กรุณาเลือกบริษัทที่ถูกต้อง', 400);
  if (!actor.isAdmin && (companyId === 'all' || companyId !== actor.companyId)) throw new AccessError('ไม่มีสิทธิ์เข้าถึงบริษัทนี้');
}
export function apiError(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Chemical request failed', error);
  return NextResponse.json({ error: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 });
}

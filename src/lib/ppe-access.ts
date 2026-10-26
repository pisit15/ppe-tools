import { NextRequest } from 'next/server';
import { AccessError, assertCompany, requireToolsActor, type ToolsActor } from './toolsSession';
import { getSupabaseServer } from './supabase';

export async function requirePPEActor(request: NextRequest, manager = false) {
  const actor = await requireToolsActor(request, !manager);
  const modules = actor.row.allowed_modules;
  if (!actor.isAdmin && Array.isArray(modules) && modules.length && !modules.includes('ppe')) throw new AccessError('ไม่มีสิทธิ์ใช้งาน PPE');
  return actor;
}
export function ppeCompany(request: NextRequest, actor: ToolsActor) {
  const company = request.nextUrl.searchParams.get('company_id') || actor.companyId;
  assertCompany(actor, company, true);
  return company;
}
export function ppeDatabaseError(error: { code?: string; message: string }): never {
  if (error.code === 'P0001') throw new AccessError(error.message, 409);
  if (error.code === '23505') throw new AccessError('ชื่อผู้ใช้หรือรายการนี้มีอยู่แล้ว', 409);
  if (['23514', '22P02', '22003'].includes(error.code || '')) throw new AccessError('ข้อมูลหรือจำนวนไม่ถูกต้อง', 400);
  throw error;
}

// Central gate for legacy PPE handlers that predate server sessions. The new
// request handlers also authorize at their own boundary and inside each RPC.
export async function guardLegacyPPE(request: NextRequest, actor: ToolsActor) {
  const path = request.nextUrl.pathname;
  const base = path.split('/')[3];
  if (['requests', 'requesters', 'catalog'].includes(base)) return;
  if (actor.accountTable === 'ppe_requesters') throw new AccessError('ไม่มีสิทธิ์จัดการสต็อก');
  const queryCompany = request.nextUrl.searchParams.get('company_id');
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const body = write && request.method !== 'DELETE' ? await request.clone().json().catch(() => ({})) : {};
  if (queryCompany) assertCompany(actor, queryCompany === 'admin' && actor.isAdmin ? 'all' : queryCompany, write);
  if (body.company_id) assertCompany(actor, body.company_id, true);
  const tables: Record<string, string> = { products: 'ppe_products', employees: 'ppe_employees', departments: 'ppe_departments', transactions: 'ppe_transactions' };
  const resourceId = path.split('/')[4] || body.id || request.nextUrl.searchParams.get('id');
  let company = body.company_id || queryCompany;
  const db = getSupabaseServer();
  if (resourceId && tables[base]) {
    const { data, error } = await db.from(tables[base]).select('company_id').eq('id', resourceId).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('ไม่พบรายการ', 404);
    assertCompany(actor, data.company_id, write);
    if (company && company !== data.company_id) throw new AccessError('ไม่อนุญาตย้ายข้อมูลข้ามบริษัท');
    company = data.company_id;
  }
  if (!company && !actor.isAdmin) assertCompany(actor, 'default', write);
  if (body.product_id) {
    const { data, error } = await db.from('ppe_products').select('company_id').eq('id', body.product_id).maybeSingle();
    if (error) throw error;
    if (!data || data.company_id !== company) throw new AccessError('สินค้าไม่ได้อยู่ในบริษัทนี้');
  }
}

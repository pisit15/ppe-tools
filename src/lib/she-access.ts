import type { NextRequest } from 'next/server';
import { getSupabaseServer } from './supabase';
import { AccessError, requireModuleActor, type ToolsActor } from './toolsSession';

// Central gate for the legacy SHE Workforce handlers (they predate server
// sessions and use the service-role client). Called from src/proxy.ts.
//   - every handler except the PIN viewer needs a staff session with the 'she' module
//   - non-admins are pinned to their own company
//   - cross-company endpoints (overview, viewer access codes) are admin-only
const PUBLIC = ['/api/she-workforce/public-org'];
const ADMIN_ONLY = ['/api/she-workforce/overview', '/api/she-workforce/access-codes'];

type OrgBody = { action?: string; id?: string; parent_id?: string | null; ids?: unknown; data?: Record<string, unknown> };

async function assertPersonnelCompany(ids: string[], company: string) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  const { data, error } = await getSupabaseServer().from('she_personnel').select('id, company_id').in('id', unique);
  if (error) throw error;
  if ((data || []).length !== unique.length || (data || []).some(r => r.company_id !== company)) {
    throw new AccessError('ไม่มีสิทธิ์แก้ไขข้อมูลบุคลากรของบริษัทอื่น');
  }
}

export async function guardSHE(request: NextRequest): Promise<ToolsActor | null> {
  const path = request.nextUrl.pathname.replace(/\/$/, '');
  if (PUBLIC.includes(path)) return null;
  const actor = await requireModuleActor(request, 'she', 'SHE Workforce');
  if (actor.isAdmin) return actor;
  if (ADMIN_ONLY.includes(path)) throw new AccessError('เฉพาะผู้ดูแลระบบเท่านั้น');

  const sp = request.nextUrl.searchParams;
  const requested = sp.get('company_id') ?? sp.get('companyId');
  if (request.method === 'GET') {
    // Without a company filter these handlers return every company → require own company.
    if (requested !== actor.companyId) throw new AccessError('ไม่มีสิทธิ์เข้าถึงบริษัทนี้');
    return actor;
  }

  if (path === '/api/she-workforce/organization') {
    const body = (await request.clone().json().catch(() => ({}))) as OrgBody;
    const ids: string[] = [];
    if (typeof body.id === 'string') ids.push(body.id);
    if (typeof body.parent_id === 'string') ids.push(body.parent_id);
    if (Array.isArray(body.ids)) ids.push(...body.ids.filter((x): x is string => typeof x === 'string'));
    if (body.data) {
      if (typeof body.data.id === 'string') ids.push(body.data.id);
      if (typeof body.data.parent_id === 'string') ids.push(body.data.parent_id);
      if (body.data.company_id !== undefined && body.data.company_id !== actor.companyId) {
        throw new AccessError('ไม่มีสิทธิ์แก้ไขข้อมูลบุคลากรของบริษัทอื่น');
      }
    }
    await assertPersonnelCompany(ids, actor.companyId);
    return actor;
  }
  throw new AccessError('เฉพาะผู้ดูแลระบบเท่านั้น');
}

import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, assertSameOrigin, requireToolsActor, type ToolsActor } from '@/lib/toolsSession';

/**
 * PR / supplier price data is commercially sensitive, so only the SHE team may read it:
 * - Tools admins
 * - personal SHE accounts in tools_users
 * - personal accounts in company_users (shared company logins whose username equals the
 *   company id, e.g. "amt" used at PPE stores, are excluded)
 * - accounts limited by allowed_modules must list 'procurement'
 */
export function isProcurementMember(actor: ToolsActor) {
  if (actor.isAdmin) return true;
  // Per-module access (allowed_modules): null/empty = all modules; a restricted account needs 'procurement'.
  const modules = actor.row.allowed_modules;
  if (Array.isArray(modules) && modules.length > 0 && !modules.includes('procurement')) return false;
  if (actor.accountTable === 'tools_users') return true;
  return actor.accountTable === 'company_users' && actor.username.trim().toLowerCase() !== actor.companyId.trim().toLowerCase();
}

export async function requireProcurementActor(request: NextRequest) {
  const actor = await requireToolsActor(request);
  if (!isProcurementMember(actor)) throw new AccessError('ข้อมูล PR และราคาผู้ขายเปิดให้เฉพาะบัญชีส่วนตัวของทีม SHE');
  return actor;
}

export type ImportActor = { name: string; ticketId: string | null };

/**
 * Import is allowed for a Tools admin session, or for a sync job holding a single-use ticket
 * (header x-import-ticket, max 1 hour, spent at finalize; only its SHA-256 is stored).
 */
export async function requireProcurementImporter(request: NextRequest): Promise<ImportActor> {
  const ticket = request.headers.get('x-import-ticket');
  if (!ticket) {
    const actor = await requireToolsActor(request);
    if (!actor.isAdmin) throw new AccessError('เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้');
    return { name: actor.username, ticketId: null };
  }
  assertSameOrigin(request);
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(ticket)) throw new AccessError('ตั๋วนำเข้าไม่ถูกต้อง', 401);
  const hash = createHash('sha256').update(ticket).digest('hex');
  const { data, error } = await getSupabaseServer().from('proc_import_tickets')
    .select('id,created_by,expires_at,used_at').eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  if (!data || data.used_at || Date.parse(data.expires_at) <= Date.now()) throw new AccessError('ตั๋วนำเข้าหมดอายุหรือถูกใช้แล้ว', 401);
  return { name: `ticket:${data.created_by}`, ticketId: data.id };
}

export async function spendImportTicket(ticketId: string | null) {
  if (!ticketId) return;
  const { error } = await getSupabaseServer().from('proc_import_tickets')
    .update({ used_at: new Date().toISOString() }).eq('id', ticketId).is('used_at', null);
  if (error) throw error;
}

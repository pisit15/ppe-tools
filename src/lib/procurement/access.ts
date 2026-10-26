import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, assertSameOrigin, requireToolsActor } from '@/lib/toolsSession';

/**
 * Procurement is a shared read workspace for every active Tools account.
 * Authentication is still required; only the per-person summary is company-scoped.
 * Import permissions are checked separately below and remain admin/ticket-only.
 */
export async function requireProcurementActor(request: NextRequest) {
  return requireToolsActor(request);
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

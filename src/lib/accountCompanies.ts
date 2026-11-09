import { getSupabaseServer } from '@/lib/supabase';
import type { ToolsActor } from '@/lib/toolsSession';

export type LinkedCompany = { companyId: string; companyName: string };

/**
 * Companies the signed-in person can switch to without logging in again:
 * rows in the SAME account table with the same username AND the same password hash
 * (the admin "หลายบริษัท" flow writes one hash to every row; two unrelated people who happen to
 * share a username have different hashes and are never linked).
 */
export async function linkedCompanies(actor: ToolsActor): Promise<LinkedCompany[]> {
  if (actor.isAdmin || actor.accountTable === 'ppe_requesters') return [];
  const db = getSupabaseServer();
  const { data, error } = await db.from(actor.accountTable).select('id, company_id, password').ilike('username', String(actor.username).replace(/[%_\\]/g, m => `\\${m}`)).eq('is_active', true);
  if (error) throw error;
  const rows = ((data || []) as { id: string | number; company_id: string; password: string }[]).filter(r => r.password && r.password === String(actor.row.password));
  const ids = [...new Set(rows.map(r => String(r.company_id)))];
  if (ids.length <= 1) return [];
  const { data: names } = await db.from('company_settings').select('company_id, company_name').in('company_id', ids);
  const map = new Map((names || []).map(r => [String(r.company_id), String(r.company_name)]));
  return ids.map(id => ({ companyId: id, companyName: map.get(id) || id.toUpperCase() })).sort((a, b) => a.companyName.localeCompare(b.companyName));
}

/** The row for one of those companies, or null. */
export async function linkedRow(actor: ToolsActor, companyId: string): Promise<Record<string, unknown> | null> {
  if (actor.isAdmin || actor.accountTable === 'ppe_requesters') return null;
  const db = getSupabaseServer();
  const { data, error } = await db.from(actor.accountTable).select('*').ilike('username', String(actor.username).replace(/[%_\\]/g, m => `\\${m}`)).eq('company_id', companyId).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!data || String(data.password) !== String(actor.row.password)) return null;
  return data as Record<string, unknown>;
}

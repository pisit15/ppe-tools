import type { NextRequest } from 'next/server';
import { AccessError, requireToolsActor, verifyToolsSession, TOOLS_COOKIE, type ToolsActor } from '@/lib/toolsSession';
import { getSupabaseServer } from '@/lib/supabase';
import { INSPECT_MODULE_ID } from './constants';

/**
 * Equipment inspection SHE pages: same rule as the visitor module —
 * tools admins, personal SHE accounts (tools_users) and personal company_users accounts.
 * Accounts restricted by allowed_modules must list 'inspect'.
 */
export function isInspectStaff(actor: ToolsActor) {
  if (actor.isAdmin) return true;
  const modules = actor.row.allowed_modules;
  if (Array.isArray(modules) && modules.length > 0 && !modules.includes(INSPECT_MODULE_ID)) return false;
  if (actor.accountTable === 'tools_users') return true;
  return actor.accountTable === 'company_users' && actor.username.trim().toLowerCase() !== actor.companyId.trim().toLowerCase();
}

export async function requireInspectStaff(request: NextRequest) {
  const actor = await requireToolsActor(request);
  if (!isInspectStaff(actor)) throw new AccessError('ระบบตรวจอุปกรณ์เปิดให้เฉพาะบัญชีส่วนตัวของทีม SHE');
  return actor;
}

/** Optional actor for public pages: a logged-in SHE user scanning a QR is recognised, anyone else is null. */
export async function optionalInspectStaff(request: NextRequest): Promise<ToolsActor | null> {
  if (!verifyToolsSession(request.cookies.get(TOOLS_COOKIE)?.value)) return null;
  try {
    const actor = await requireToolsActor(request);
    return isInspectStaff(actor) ? actor : null;
  } catch {
    return null;
  }
}

export const db = () => getSupabaseServer();

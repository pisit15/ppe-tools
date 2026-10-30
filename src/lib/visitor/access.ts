import type { NextRequest } from 'next/server';
import { AccessError, requireToolsActor, type ToolsActor } from '@/lib/toolsSession';

/**
 * Screening/approval is for the SHE team only (owner decision 30 Oct 2026):
 * - Tools admins
 * - personal SHE accounts in tools_users
 * - personal company_users accounts (shared company logins whose username equals the company id are excluded)
 * - accounts limited by allowed_modules must list 'visitor'
 */
export function isVisitorApprover(actor: ToolsActor) {
  if (actor.isAdmin) return true;
  const modules = actor.row.allowed_modules;
  if (Array.isArray(modules) && modules.length > 0 && !modules.includes('visitor')) return false;
  if (actor.accountTable === 'tools_users') return true;
  return actor.accountTable === 'company_users' && actor.username.trim().toLowerCase() !== actor.companyId.trim().toLowerCase();
}

export async function requireVisitorApprover(request: NextRequest) {
  const actor = await requireToolsActor(request);
  if (!isVisitorApprover(actor)) throw new AccessError('การคัดกรองผู้มาติดต่อเปิดให้เฉพาะบัญชีส่วนตัวของทีม SHE');
  return actor;
}

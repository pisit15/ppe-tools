import type { NextRequest } from 'next/server';
import { AccessError, requireToolsActor, type ToolsActor } from '@/lib/toolsSession';

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

export async function requireProcurementAdmin(request: NextRequest) {
  const actor = await requireToolsActor(request);
  if (!actor.isAdmin) throw new AccessError('เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้');
  return actor;
}

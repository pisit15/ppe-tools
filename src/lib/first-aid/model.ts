/** Read-only stock rules shared by the pages and the public form; mirrors the database RPCs. */
import { FA_ANON_NAME, type FaItem, type FaLot, type FaState, type FaThreshold } from './types';

export type ItemStatusKey = 'ok' | 'low' | 'out' | 'expired' | 'pending';

export function expiryDays(expiry: string | null | undefined, asOf: string) {
  if (!expiry) return null;
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000);
}
export function usableLots(state: Pick<FaState, 'lots' | 'items' | 'asOf'>, itemId: string, locationId = 'all') {
  const tracked = state.items.find(i => i.id === itemId)?.trackExpiry !== false;
  return state.lots.filter(l => l.itemId === itemId && (locationId === 'all' || l.locationId === locationId) && l.quantity > 0 && (l.expiry ? (expiryDays(l.expiry, state.asOf) ?? -1) >= 0 : !tracked))
    .sort((a, b) => (a.expiry || '9999-12-31').localeCompare(b.expiry || '9999-12-31'));
}
export function pendingLots(state: Pick<FaState, 'lots' | 'items'>, itemId: string, locationId = 'all') {
  const tracked = state.items.find(i => i.id === itemId)?.trackExpiry !== false;
  return tracked ? state.lots.filter(l => l.itemId === itemId && (locationId === 'all' || l.locationId === locationId) && l.quantity > 0 && !l.expiry) : [];
}
export function expiredLots(state: Pick<FaState, 'lots' | 'asOf'>, itemId: string, locationId = 'all') {
  return state.lots.filter(l => l.itemId === itemId && (locationId === 'all' || l.locationId === locationId) && l.quantity > 0 && !!l.expiry && (expiryDays(l.expiry, state.asOf) ?? 0) < 0);
}
export const balance = (state: Pick<FaState, 'lots' | 'items' | 'asOf'>, itemId: string, locationId = 'all') => usableLots(state, itemId, locationId).reduce((s, l) => s + l.quantity, 0);
export function minFor(thresholds: FaThreshold[], item: FaItem, locationId = 'all') {
  const ts = thresholds.filter(t => t.itemId === item.id && (locationId === 'all' || t.locationId === locationId));
  return ts.length ? ts.reduce((s, t) => s + t.min, 0) : item.min || 0;
}
export type ItemStatus = { key: ItemStatusKey; balance: number; min: number; nearest: FaLot | null; expiredQty: number; pendingQty: number };
export function itemStatus(state: Pick<FaState, 'lots' | 'items' | 'asOf' | 'thresholds'>, item: FaItem, locationId = 'all'): ItemStatus {
  const usable = usableLots(state, item.id, locationId);
  const bal = usable.reduce((s, l) => s + l.quantity, 0);
  const min = minFor(state.thresholds, item, locationId);
  const expired = expiredLots(state, item.id, locationId).reduce((s, l) => s + l.quantity, 0);
  const pending = pendingLots(state, item.id, locationId).reduce((s, l) => s + l.quantity, 0);
  const nearest = usable.find(l => l.expiry) || null;
  let key: ItemStatusKey = 'ok';
  if (expired > 0 && bal === 0) key = 'expired';
  else if (bal === 0 && pending > 0) key = 'pending';
  else if (bal === 0) key = 'out';
  else if (bal < min) key = 'low';
  return { key, balance: bal, min, nearest, expiredQty: expired, pendingQty: pending };
}
export const personLabel = (p: { name?: string; department?: string } | null | undefined) => !p || !p.name || p.name === FA_ANON_NAME ? '' : p.department && p.department !== FA_ANON_NAME ? `${p.name} · ${p.department}` : p.name;

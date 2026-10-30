'use client';

import { useEffect, useState } from 'react';
import { VISITOR_STATUS_LABEL } from '@/lib/visitor/constants';
import type { VisitorStatus } from '@/lib/visitor/types';

export const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#EEEEEE',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
};

export const STATUS_COLOR: Record<VisitorStatus, string> = {
  submitted: VIZ.secondary,
  need_info: VIZ.primary,
  approved: VIZ.positive,
  rejected: VIZ.accent,
  cancelled: VIZ.neutral,
};

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/** 2026-11-02 → 2 พ.ย. 2569 */
export function thaiDate(ymd: string | null | undefined, withDay = false) {
  if (!ymd) return '–';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '–';
  const day = withDay ? `${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ` : '';
  return `${day}${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}
/** 08:00:00 → 08:00 */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '–');
export function thaiDateTime(iso: string | null | undefined) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const bk = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${thaiDate(bk.toISOString().slice(0, 10))} ${bk.toISOString().slice(11, 16)}`;
}
export const bangkokTime = (iso: string | null | undefined) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
};

export class FetchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : 'ดำเนินการไม่สำเร็จ';
    throw new FetchError(msg, res.status);
  }
  return data as T;
}
export const postJson = <T,>(url: string, body: unknown, method = 'POST') =>
  getJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export type Toast = { type: 'success' | 'error'; msg: string } | null;
export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);
  return { toast, setToast };
}
export function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium"
      style={{ background: toast.type === 'success' ? VIZ.positive : VIZ.accent }}>
      {toast.msg}
    </div>
  );
}

export function StatusBadge({ status, large = false }: { status: VisitorStatus; large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${large ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-xs'}`}
      style={{ background: `${STATUS_COLOR[status]}1A`, color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}55` }}>
      <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {VISITOR_STATUS_LABEL[status]}
    </span>
  );
}

export const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7] bg-white';
export const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
export const cardClass = 'bg-white rounded-xl border border-gray-100 shadow-sm p-6';

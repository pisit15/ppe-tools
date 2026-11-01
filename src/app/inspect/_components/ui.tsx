'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DUE_STATE_COLOR, DUE_STATE_LABEL, TH_MONTHS_SHORT } from '@/lib/inspect/constants';
import type { InspDueState, InspOverall } from '@/lib/inspect/types';

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

export const PAGE_BG = '#F4F6F9';

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
/** 2026-11-02 → 2 พ.ย. 2569 */
export function thaiDate(ymd: string | null | undefined, opts: { withDay?: boolean; short?: boolean } = {}) {
  if (!ymd) return '–';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '–';
  const day = opts.withDay ? `${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ` : '';
  const year = opts.short ? String(y + 543).slice(2) : String(y + 543);
  return `${day}${d} ${TH_MONTHS_SHORT[m - 1]} ${year}`;
}
/** 2026-11 → พ.ย. 2569 */
export function thaiPeriod(period: string, long = false) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const months = long ? ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'] : TH_MONTHS_SHORT;
  return `${months[m - 1]} ${y + 543}`;
}
export function thaiDateTime(iso: string | null | undefined) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const bk = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${thaiDate(bk.toISOString().slice(0, 10))} ${bk.toISOString().slice(11, 16)}`;
}
export const bangkokToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
export const currentPeriod = () => bangkokToday().slice(0, 7);
export function shiftPeriod(period: string, months: number) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
}
/** Days from today (Bangkok) to a date; negative = past */
export function daysUntil(ymd: string | null | undefined) {
  if (!ymd) return null;
  return Math.round((Date.parse(ymd) - Date.parse(bangkokToday())) / 86400000);
}
export function relativeDays(ymd: string | null | undefined) {
  const n = daysUntil(ymd);
  if (n === null) return '';
  if (n === 0) return 'วันนี้';
  if (n === 1) return 'พรุ่งนี้';
  if (n === -1) return 'เมื่อวาน';
  return n > 0 ? `อีก ${n} วัน` : `${-n} วันที่แล้ว`;
}
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

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
export const errMsg = (e: unknown, fallback = 'ดำเนินการไม่สำเร็จ') => (e instanceof Error ? e.message : fallback);

export type Toast = { type: 'success' | 'error' | 'info'; msg: string } | null;
export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);
  return { toast, setToast };
}
export function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? VIZ.positive : toast.type === 'error' ? VIZ.accent : VIZ.primary;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-[92vw]" style={{ background: bg }}>
      {toast.msg}
    </div>
  );
}

export function DueBadge({ state, large = false }: { state: InspDueState; large?: boolean }) {
  const c = DUE_STATE_COLOR[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${large ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`}
      style={{ background: `${c}1A`, color: state === 'inactive' || state === 'never' ? VIZ.lightText : c, border: `1px solid ${c}66` }}>
      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
      {DUE_STATE_LABEL[state]}
    </span>
  );
}
export function OverallBadge({ overall, large = false }: { overall: InspOverall; large?: boolean }) {
  const c = overall === 'pass' ? VIZ.positive : VIZ.accent;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${large ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`} style={{ background: `${c}1A`, color: c, border: `1px solid ${c}66` }}>
      {overall === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน'}
    </span>
  );
}

export const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7] focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-500';
export const selectClass = inputClass + ' appearance-none';
export const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
export const cardClass = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50';

/** Company scope shared by every SHE page (admins pick, users are pinned). */
export type CompanyOption = { company_id: string; company_name: string };
export const CompanyContext = createContext<{ company: string; companyName: string; companies: CompanyOption[]; setCompany: (id: string) => void; isAdmin: boolean }>({ company: 'amt', companyName: '', companies: [], setCompany: () => {}, isAdmin: false });
export const useCompany = () => useContext(CompanyContext);

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-gray-500">
      <span className="h-6 w-6 rounded-full border-2 border-gray-200 border-t-[#4E79A7] animate-spin" />
      {label}
    </div>
  );
}
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} />;
}
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="mb-3 text-gray-300">{icon}</div>}
      <p className="font-medium text-gray-700">{title}</p>
      {hint && <p className="text-sm text-gray-500 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Right-side drawer */
export function Drawer({ open, onClose, title, subtitle, children, footer, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} h-full flex flex-col bg-white shadow-2xl insp-slide-in`}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div><h2 className="text-lg font-semibold text-gray-900">{title}</h2>{subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="ปิด">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/60">{footer}</div>}
      </aside>
    </div>
  );
}

/** Centered modal */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative w-full ${w} max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4"><h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="ปิด"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/60 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

/** Two-step confirm button (no window.confirm) */
export function ConfirmButton({ label, confirmLabel = 'ยืนยัน?', onConfirm, className = btnSecondary, danger = false, disabled = false }: { label: ReactNode; confirmLabel?: string; onConfirm: () => void; className?: string; danger?: boolean; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button type="button" disabled={disabled} className={className} style={armed ? { background: danger ? VIZ.accent : VIZ.secondary, color: '#fff', borderColor: 'transparent' } : undefined}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : label}
    </button>
  );
}

export function SectionTitle({ title, hint, right }: { title: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div><h2 className="text-base font-semibold text-gray-900">{title}</h2>{hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}</div>
      {right}
    </div>
  );
}

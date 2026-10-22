'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ProcMeta } from '@/lib/procurement/types';

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

export const PAGE_SIZE = 30;
export const DRIVE_ROOT = 'https://drive.google.com/drive/folders/1NnL8ESknHZCgUoKm_lgNH0-wWcnnJkzE';
export const driveLink = (prNo: string, folderId?: string | null) =>
  folderId ? `https://drive.google.com/drive/folders/${folderId}` : `https://drive.google.com/drive/search?q=${encodeURIComponent(prNo)}`;

const nf2 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
export const baht = (v: number | null | undefined) => (v === null || v === undefined ? '–' : nf2.format(v));
export const int = (v: number | null | undefined) => (v === null || v === undefined ? '–' : nf0.format(v));
export const thaiDate = (d: string | null | undefined) => {
  if (!d) return '–';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return '–';
  return `${day}/${m}/${y + 543}`;
};

export class FetchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : 'โหลดข้อมูลไม่สำเร็จ';
    throw new FetchError(msg, res.status);
  }
  return data as T;
}

/** Loads JSON for a URL; null url = idle. */
export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: FetchError | null }>({ url: null, data: null, error: null });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    getJson<T>(url)
      .then(data => { if (!cancelled) setState({ url, data, error: null }); })
      .catch((e: unknown) => { if (!cancelled) setState({ url, data: null, error: e instanceof FetchError ? e : new FetchError('โหลดข้อมูลไม่สำเร็จ', 0) }); });
    return () => { cancelled = true; };
  }, [url]);
  const ready = state.url === url;
  return { data: ready ? state.data : null, error: ready ? state.error : null, loading: !!url && !ready };
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-6 ${className}`}>{children}</div>;
}

export function Kpi({ label, value, sub, color = VIZ.primary }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${color}` }}>
      <p className="text-xs" style={{ color: VIZ.lightText }}>{label}</p>
      <p className="text-xl md:text-2xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: VIZ.lightText }}>{sub}</p>}
    </div>
  );
}

export function SourceBadge({ source }: { source: 'po' | 'quote' }) {
  return source === 'po'
    ? <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: VIZ.primary }}>จ่ายจริง (PO)</span>
    : <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={{ border: `1px solid ${VIZ.secondary}`, color: '#B5600F' }}>ใบเสนอราคา</span>;
}

export const prHref = (no: string, by?: string) => `/procurement/pr?no=${encodeURIComponent(no)}${by ? `&by=${encodeURIComponent(by)}` : ''}`;
export function PrLink({ no, by }: { no: string; by?: string }) {
  return <Link href={prHref(no, by)} className="font-medium hover:underline whitespace-nowrap" style={{ color: VIZ.primary }}>{no}</Link>;
}

export function VendorLink({ name }: { name: string }) {
  if (!name) return <span style={{ color: VIZ.lightText }}>–</span>;
  return <Link href={`/procurement/vendors?name=${encodeURIComponent(name)}`} className="hover:underline" style={{ color: VIZ.primary }}>{name}</Link>;
}

export function Loading({ text = 'กำลังโหลด…' }: { text?: string }) {
  return <p role="status" className="py-10 text-center text-sm" style={{ color: VIZ.lightText }}>{text}</p>;
}

export function ErrorBox({ error }: { error: FetchError }) {
  return (
    <div role="alert" className="rounded-xl border p-4 text-sm" style={{ borderColor: VIZ.accent, color: VIZ.accent, background: '#FDF1F1' }}>
      {error.message}
      {error.status === 401 && <span> — <button className="underline" onClick={() => window.location.reload()}>เข้าสู่ระบบอีกครั้ง</button></span>}
    </div>
  );
}

export function MetaLine({ meta }: { meta?: ProcMeta | null }) {
  if (!meta) return null;
  return (
    <p className="text-xs" style={{ color: VIZ.lightText }}>
      {meta.imported_at
        ? <>ข้อมูลจาก Odoo นำเข้าเมื่อ {new Date(meta.imported_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} · ราคาต่อหน่วยไม่รวม VAT ตามที่ระบุในเอกสาร</>
        : 'ยังไม่มีการนำเข้าข้อมูล'}
    </p>
  );
}

export type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' };
export function SortHeader<K extends string>({ label, k, sort, onSort, align = 'left' }: { label: string; k: K; sort: SortState<K>; onSort: (s: SortState<K>) => void; align?: 'left' | 'right' }) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 font-semibold whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" className={`inline-flex items-center gap-1 hover:underline ${align === 'right' ? 'flex-row-reverse' : ''}`}
        onClick={() => onSort({ key: k, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}>
        {label}<Icon size={14} aria-hidden style={{ color: active ? VIZ.primary : VIZ.neutral }} />
      </button>
    </th>
  );
}

export function sortRows<T, K extends string>(rows: T[], sort: SortState<K>, get: (row: T, key: K) => string | number | null) {
  const m = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a, sort.key), y = get(b, sort.key);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th')) * m;
  });
}

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm" style={{ color: VIZ.lightText }}>
      <span>แสดง {int(page * PAGE_SIZE + 1)}–{int(Math.min(total, (page + 1) * PAGE_SIZE))} จาก {int(total)}</span>
      <div className="flex gap-2">
        <button className="rounded-lg border px-3 py-1 disabled:opacity-40" style={{ borderColor: VIZ.muted }} disabled={page === 0} onClick={() => onPage(page - 1)}>ก่อนหน้า</button>
        <span className="px-2 py-1">{page + 1}/{pages}</span>
        <button className="rounded-lg border px-3 py-1 disabled:opacity-40" style={{ borderColor: VIZ.muted }} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>ถัดไป</button>
      </div>
    </div>
  );
}

export const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300';

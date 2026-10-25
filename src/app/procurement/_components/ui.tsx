'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ProcMeta } from '@/lib/procurement/types';

export const VIZ = {
  primary: '#176448',
  secondary: '#99610D',
  accent: '#B33D36',
  positive: '#24704A',
  neutral: '#687C73',
  muted: '#DCE5E0',
  bg: '#F1F5F2',
  text: '#18332F',
  lightText: '#526762',
  grid: '#E8EEE9',
};

export const PAGE_SIZE = 30;
export const DRIVE_ROOT = 'https://drive.google.com/drive/folders/1NnL8ESknHZCgUoKm_lgNH0-wWcnnJkzE';
export const driveLink = (prNo: string, folderId?: string | null) =>
  folderId ? `https://drive.google.com/drive/folders/${folderId}` : `https://drive.google.com/drive/search?q=${encodeURIComponent(prNo)}`;

const nf2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/** Loads JSON for a URL; null url = idle. keep retains the previous result while refreshing. */
export function useJson<T>(url: string | null, keep = false) {
  const [revision, setRevision] = useState(0);
  // Identity changes even when returning to an earlier URL or retrying the same one.
  const request = useMemo(() => ({ url, revision }), [url, revision]);
  const [state, setState] = useState<{ request: typeof request | null; data: T | null; error: FetchError | null }>({ request: null, data: null, error: null });
  const refetch = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!request.url) return;
    const controller = new AbortController();
    let active = true;
    const finish = (data: T | null, error: FetchError | null) => {
      if (!active) return;
      active = false;
      clearTimeout(timeout);
      setState({ request, data, error });
    };
    const timeout = setTimeout(() => {
      finish(null, new FetchError('ใช้เวลาโหลดนานกว่าปกติ กรุณาลองอีกครั้ง', 408));
      controller.abort();
    }, 30_000);
    getJson<T>(request.url, { signal: controller.signal })
      .then(data => finish(data, null))
      .catch((e: unknown) => finish(null, e instanceof FetchError ? e : new FetchError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', 0)));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [request]);
  const ready = state.request === request;
  return { data: ready || keep ? state.data : null, error: ready ? state.error : null, loading: !!url && !ready, refetch };
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-lg border p-4 md:p-5 ${className}`} style={{ borderColor: VIZ.muted }}>{children}</div>;
}

export function Kpi({ label, value, sub, color = VIZ.primary }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="min-w-0 bg-white rounded-lg border p-4" style={{ borderColor: VIZ.muted }}>
      <p className="flex items-center gap-2 text-xs" style={{ color: VIZ.lightText }}><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />{label}</p>
      <p className="text-xl md:text-2xl font-semibold mt-2 tabular-nums break-words" style={{ color: VIZ.text }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: VIZ.lightText }}>{sub}</p>}
    </div>
  );
}

export function SourceBadge({ source }: { source: 'po' | 'quote' }) {
  return source === 'po'
    ? <span className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium" style={{ background: '#E9F3EC', color: VIZ.primary }}>ราคาตาม PO</span>
    : <span className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium" style={{ background: '#FCF4E7', color: VIZ.secondary }}>ใบเสนอราคา</span>;
}

/** Raw ?y= value of the current page ('' = all years). Links carry it so the period survives navigation. */
export function usePeriodParam() {
  const y = useSearchParams().get('y') ?? '';
  return /^\d{4}$/.test(y) ? y : '';
}

/** Add a period to an internal link. */
export function withPeriod(href: string, y: string) {
  if (!y) return href;
  const [path, query = ''] = href.split('?');
  const sp = new URLSearchParams(query);
  sp.set('y', y);
  return `${path}?${sp}`;
}

export const prHref = (no: string, by?: string, y = '') =>
  withPeriod(`/procurement/pr?no=${encodeURIComponent(no)}${by ? `&by=${encodeURIComponent(by)}` : ''}`, y);
export function PrLink({ no, by }: { no: string; by?: string }) {
  const y = usePeriodParam();
  return <Link href={prHref(no, by, y)} className="font-medium hover:underline whitespace-nowrap" style={{ color: VIZ.primary }}>{no}</Link>;
}

/** "บริษัท เทคนิคสิ่งแวดล้อมไทย จำกัด" -> "เทคนิคสิ่งแวดล้อมไทย" for tight chart labels (full name stays in the tooltip). */
export function shortVendor(name: string) {
  const s = name
    .replace(/\s\d{5}$/, '')
    .trim()
    .replace(/\s*\([A-Za-z][^)]*\)\s*$/, '') // trailing English name in brackets
    .replace(/^(บริษัท|บจก\.?|ห้างหุ้นส่วนจำกัด|หจก\.?)\s*/, '')
    .replace(/\s*จำกัด(\s*\(มหาชน\))?\s*$/, '')
    .replace(/[\s,]*(co\.?,?\s*ltd\.?|company limited|limited|ltd\.?)\s*$/i, '')
    .trim();
  return s || name;
}

export function VendorLink({ name, short = false }: { name: string; short?: boolean }) {
  const y = usePeriodParam();
  if (!name) return <span style={{ color: VIZ.lightText }}>–</span>;
  return (
    <Link href={withPeriod(`/procurement/vendors?name=${encodeURIComponent(name)}`, y)} title={name} className="hover:underline" style={{ color: VIZ.primary }}>
      {short ? shortVendor(name) : name}
    </Link>
  );
}

export function Loading({ text = 'กำลังโหลด…' }: { text?: string }) {
  return <p role="status" className="py-10 text-center text-sm" style={{ color: VIZ.lightText }}>{text}</p>;
}

export function ErrorBox({ error, onRetry }: { error: FetchError; onRetry?: () => void }) {
  const canRetry = error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
  return (
    <div role="alert" className="rounded-xl border p-4 text-sm" style={{ borderColor: VIZ.accent, color: VIZ.accent, background: '#FDF1F1' }}>
      <p>{error.message}</p>
      {(error.status === 401 || canRetry) && <button type="button" className="mt-2 min-h-11 rounded-md border border-current px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={error.status === 401 ? () => window.location.reload() : onRetry ?? (() => window.location.reload())}>
        {error.status === 401 ? 'เข้าสู่ระบบอีกครั้ง' : 'ลองอีกครั้ง'}
      </button>}
    </div>
  );
}

/** Data is synced daily; older than this means the scheduled sync probably did not run. */
const STALE_HOURS = 36;

export function MetaLine({ meta }: { meta?: ProcMeta | null }) {
  // Read the clock after mount (in a timer callback) so render stays pure.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setNow(Date.now()), 0); return () => clearTimeout(t); }, [meta?.imported_at]);
  if (!meta) return null;
  const ageH = meta.imported_at && now ? (now - Date.parse(meta.imported_at)) / 3_600_000 : 0;
  const stale = ageH > STALE_HOURS;
  return (
    <p className="text-xs" style={{ color: stale ? '#B5600F' : VIZ.lightText }}>
      {meta.imported_at
        ? <>ข้อมูล Odoo · อัปเดต {new Date(meta.imported_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })} (เวลาไทย)
            {stale && <b> · ไม่ได้อัปเดตมา {int(Math.floor(ageH / 24))} วัน</b>} · ตรวจหน่วยและฐานภาษีจากเอกสารก่อนเปรียบเทียบ</>
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

export const inputClass = 'w-full min-h-11 rounded-md border border-[#B8C9BF] bg-white px-3 py-2 text-sm text-[#18332F] placeholder:text-[#687C73] focus:outline-none focus:ring-2 focus:ring-[#419B77]';

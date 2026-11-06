'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { VIZ, getJson, postJson } from '@/app/inspect/_components/ui';
import type { FaEvent, FaIcon, FaItem, FaState } from '@/lib/first-aid/types';
import { balance } from '@/lib/first-aid/model';
import { SYMPTOMS, cleanGeneric, itemGroup, matchesSymptom } from '@/lib/first-aid/browse';

export { VIZ, PAGE_BG, thaiDate, thaiPeriod, thaiDateTime, bangkokToday, currentPeriod, shiftPeriod, daysUntil, relativeDays, getJson, postJson, errMsg, useToast, ToastView, inputClass, selectCompact, labelClass, cardClass, btnPrimary, btnSecondary, btnGhost, Spinner, EmptyState, Drawer, Modal, ConfirmButton, SectionTitle } from '@/app/inspect/_components/ui';

export const FA_GREEN = '#246047';
export const STATUS_COLOR = { ok: VIZ.positive, low: VIZ.secondary, out: VIZ.accent, expired: VIZ.accent, pending: VIZ.lightText } as const;
export type { ItemStatusKey } from '@/lib/first-aid/model';
type ItemStatusKey = keyof typeof STATUS_COLOR;
export const STATUS_LABEL: Record<ItemStatusKey, string> = { ok: 'เพียงพอ', low: 'ต้องเติม', out: 'หมด', expired: 'หมดอายุ', pending: 'รอวันหมดอายุ' };

// ---------- state context ----------
type FaCtx = { state: FaState | null; loading: boolean; error: string; refresh: () => Promise<void>; company: string; setCompany: (id: string) => void; companies: { company_id: string; company_name: string }[]; isAdmin: boolean; scope: string; setScope: (id: string) => void };
export const FaContext = createContext<FaCtx>({ state: null, loading: true, error: '', refresh: async () => {}, company: 'amt', setCompany: () => {}, companies: [], isAdmin: false, scope: 'all', setScope: () => {} });
export const useFa = () => useContext(FaContext);

export async function manage<T = { ok: true }>(company: string, body: Record<string, unknown>) {
  return postJson<T>(`/api/first-aid/manage?company_id=${encodeURIComponent(company)}`, body);
}
export async function postTransaction(company: string, body: Record<string, unknown>) {
  return postJson<{ documentId: string; events: FaEvent[] }>(`/api/first-aid/transactions?company_id=${encodeURIComponent(company)}`, body);
}
export async function loadHistory(company: string, from: string, to: string, extra: { item_id?: string; location_id?: string } = {}) {
  const q = new URLSearchParams({ company_id: company, from, to, ...extra });
  return getJson<{ from: string; to: string; events: FaEvent[]; truncated: boolean }>(`/api/first-aid/history?${q}`);
}

export { expiryDays, usableLots, pendingLots, expiredLots, balance, minFor, itemStatus, personLabel, type ItemStatus } from '@/lib/first-aid/model';
export const KIND_LABEL: Record<FaEvent['kind'], string> = { issue: 'จ่าย', receive: 'รับเข้า', transfer: 'โอน', dispose: 'ตัดทิ้ง' };
export const fmtInt = (n: number) => n.toLocaleString('th-TH');
export { cleanGeneric } from '@/lib/first-aid/browse';
export const itemSub = (i: { description: string; generic: string; category: string }) => i.description || cleanGeneric(i.generic) || i.category;

// ---------- pictograms + item image ----------
const ICON_PATHS: Record<Exclude<FaIcon, ''>, (c: string) => ReactNode> = {
  pill: c => <g transform="rotate(-30 24 24)"><rect x="6" y="17" width="36" height="14" rx="7" fill="#fff" stroke={c} strokeWidth="2.5" /><path d="M24 17v14" stroke={c} strokeWidth="2.5" /><rect x="7" y="18" width="16" height="12" rx="6" fill={c} opacity=".25" /></g>,
  bottle: c => <g><rect x="18" y="5" width="12" height="8" rx="2" fill={c} /><path d="M16 13h16v6l4 4v16a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V23l4-4z" fill="#fff" stroke={c} strokeWidth="2.5" /><rect x="16" y="27" width="16" height="8" rx="1" fill={c} opacity=".35" /></g>,
  sachet: c => <g><path d="M12 8h24l2 32H10z" fill="#fff" stroke={c} strokeWidth="2.5" /><path d="M12 8h24" stroke={c} strokeWidth="4" /><path d="M18 22h12M18 28h12" stroke={c} strokeWidth="2" /></g>,
  cream: c => <g><rect x="19" y="5" width="10" height="7" rx="2" fill={c} /><path d="M17 12h14l3 26a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#fff" stroke={c} strokeWidth="2.5" /><path d="M18 24h12" stroke={c} strokeWidth="2" opacity=".6" /></g>,
  plaster: c => <g transform="rotate(-35 24 24)"><rect x="4" y="18" width="40" height="12" rx="6" fill="#fff" stroke={c} strokeWidth="2.5" /><rect x="18" y="20" width="12" height="8" rx="1" fill={c} opacity=".35" /></g>,
  gauze: c => <g><rect x="10" y="10" width="28" height="28" rx="3" fill="#fff" stroke={c} strokeWidth="2.5" /><path d="M10 18h28M10 26h28M10 34h28M18 10v28M26 10v28M34 10v28" stroke={c} strokeWidth="1.5" opacity=".7" /></g>,
  mask: c => <g><path d="M10 18h28v12a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#fff" stroke={c} strokeWidth="2.5" /><path d="M10 22H4v6h6M38 22h6v6h-6M14 24h20M14 29h20" stroke={c} strokeWidth="2" /></g>,
  glove: c => <path d="M16 42V22a3 3 0 0 1 6 0V12a3 3 0 0 1 6 0v10a3 3 0 0 1 6 0v6l4-6a3 3 0 0 1 5 3l-7 14a8 8 0 0 1-7 5H22a6 6 0 0 1-6-6z" fill="#fff" stroke={c} strokeWidth="2.5" />,
  device: c => <g><rect x="20" y="6" width="8" height="26" rx="4" fill="#fff" stroke={c} strokeWidth="2.5" /><circle cx="24" cy="36" r="6" fill={c} /><path d="M24 20v14" stroke={c} strokeWidth="3" /></g>,
  other: c => <g><rect x="8" y="8" width="32" height="32" rx="6" fill="#fff" stroke={c} strokeWidth="2.5" /><path d="M24 15v18M15 24h18" stroke={c} strokeWidth="3" /></g>,
};
const ICON_COLOR: Record<Exclude<FaIcon, ''>, string> = { pill: VIZ.primary, bottle: VIZ.secondary, sachet: VIZ.primary, cream: VIZ.secondary, plaster: VIZ.accent, gauze: VIZ.neutral, mask: VIZ.positive, glove: VIZ.positive, device: VIZ.accent, other: VIZ.neutral };
export function Pictogram({ icon, size = 40 }: { icon: FaIcon; size?: number }) {
  const key = (icon || 'other') as Exclude<FaIcon, ''>;
  return <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">{ICON_PATHS[key](ICON_COLOR[key])}</svg>;
}
/** Item picture if set, else its pictogram in a soft tile. */
export function ItemImage({ item, size = 40, rounded = 10, className = '' }: { item: Pick<FaItem, 'name' | 'icon' | 'imageUrl'>; size?: number | string; rounded?: number; className?: string }) {
  // A string size ("100%") fills the parent's width and stays square; a number is a fixed pixel tile.
  const box = typeof size === 'number' ? { width: size, height: size, borderRadius: rounded } as const : { width: '100%', aspectRatio: '1 / 1', borderRadius: rounded } as const;
  if (item.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.imageUrl} alt={item.name} loading="lazy" className={`object-cover shrink-0 bg-gray-50 ${className}`} style={box} />;
  }
  return <div className={`flex items-center justify-center shrink-0 ${className}`} style={{ ...box, background: '#F0F3F0' }}><Pictogram icon={item.icon} size={typeof size === 'number' ? Math.round(size * 0.7) : 48} /></div>;
}

export function StatusBadge({ status, small = false }: { status: ItemStatusKey; small?: boolean }) {
  const c = STATUS_COLOR[status];
  return <span className={`inline-flex items-center rounded-md font-medium whitespace-nowrap ${small ? 'px-1.5 py-0 text-[11px]' : 'px-2 py-0.5 text-xs'}`} style={{ background: `${c}1F`, color: status === 'pending' ? VIZ.text : c }}>{STATUS_LABEL[status]}</span>;
}

/** Quantity stepper with large touch targets. */
export function Stepper({ value, onChange, min = 1, max = 100000, size = 40 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; size?: number }) {
  const btn = 'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white text-xl font-medium disabled:opacity-40';
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" aria-label="ลด" className={btn} style={{ width: size, height: size, color: FA_GREEN }} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input type="number" inputMode="numeric" aria-label="จำนวน" value={value} min={min} max={max} onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} onFocus={e => e.target.select()} className="text-center font-semibold text-lg rounded-lg border border-gray-300 text-gray-900" style={{ width: 64, height: size }} />
      <button type="button" aria-label="เพิ่ม" className={btn} style={{ width: size, height: size, color: FA_GREEN }} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** Search-as-you-type picker for medicines. With nothing typed it offers symptom / group chips and a picture grid, for people who do not know the name. */
export function ItemPicker({ items, state, locationId, value, onPick, autoFocus = false, placeholder = 'พิมพ์ชื่อยา / ชื่อสามัญ หรือเลือกจากอาการด้านล่าง' }: { items: FaItem[]; state: FaState; locationId: string; value: FaItem | null; onPick: (item: FaItem | null) => void; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [cursor, setCursor] = useState(0); const [tag, setTag] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h); }, []);
  const groups = useMemo(() => { const m = new Map<string, number>(); items.forEach(i => m.set(itemGroup(i), (m.get(itemGroup(i)) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [items]);
  const symptoms = useMemo(() => SYMPTOMS.filter(t => items.some(i => matchesSymptom(t, i))), [items]);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    let list = items;
    if (needle) list = items.filter(i => `${i.name} ${i.generic} ${i.description}`.toLowerCase().includes(needle));
    else if (tag.startsWith('s:')) { const t = SYMPTOMS.find(x => x.id === tag.slice(2)); list = t ? items.filter(i => matchesSymptom(t, i)) : items; }
    else if (tag.startsWith('g:')) list = items.filter(i => itemGroup(i) === tag.slice(2));
    const scored = list.map(i => ({ item: i, bal: balance(state, i.id, locationId) }));
    if (!needle) return scored.sort((a, b) => (b.bal > 0 ? 1 : 0) - (a.bal > 0 ? 1 : 0) || a.item.name.localeCompare(b.item.name, 'th'));
    return scored.sort((a, b) => (b.bal > 0 ? 1 : 0) - (a.bal > 0 ? 1 : 0) || a.item.name.localeCompare(b.item.name, 'th')).slice(0, 30);
  }, [needle, tag, items, state, locationId]);
  const pick = useCallback((item: FaItem) => { onPick(item); setQ(''); setOpen(false); }, [onPick]);
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2">
        <ItemImage item={value} size={36} />
        <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900 truncate">{value.name}</div><div className="text-xs text-gray-500 truncate">{itemSub(value)} · คงเหลือ {fmtInt(balance(state, value.id, locationId))} {value.unit}</div></div>
        <button type="button" className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1" onClick={() => { onPick(null); setOpen(true); }}>เปลี่ยน</button>
      </div>
    );
  }
  const chip = (id: string, label: string, n?: number) => <button key={id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setTag(t => (t === id ? '' : id)); setCursor(0); }} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${tag === id ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{label}{n !== undefined ? ` ${n}` : ''}</button>;
  return (
    <div ref={box} className="relative">
      <input autoFocus={autoFocus} value={q} placeholder={placeholder} aria-label="ค้นหายา" role="combobox" aria-expanded={open} aria-controls="fa-item-hits"
        onChange={e => { setQ(e.target.value); setOpen(true); setCursor(0); }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(hits.length - 1, c + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); } else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); pick(hits[cursor].item); } else if (e.key === 'Escape') setOpen(false); }}
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7] bg-white" />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden" style={{ minWidth: 320 }}>
          {!needle && (
            <div className="px-2.5 pt-2 pb-1.5 border-b border-gray-100 space-y-1.5">
              <div className="flex flex-wrap gap-1">{chip('', 'ทั้งหมด', items.length)}{symptoms.map(t => chip(`s:${t.id}`, t.label))}</div>
              <div className="flex gap-1 overflow-x-auto pb-0.5">{groups.map(([g, n]) => chip(`g:${g}`, g, n))}</div>
            </div>
          )}
          <ul id="fa-item-hits" role="listbox" className="max-h-[50vh] overflow-y-auto">
            {hits.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">{needle ? `ไม่พบ “${q}” — ลองเลือกจากอาการ หรือเพิ่มยาใหม่ที่หน้า รายการยา` : 'ไม่มีรายการในกลุ่มนี้'}</li>}
            {hits.map((h, i) => (
              <li key={h.item.id} role="option" aria-selected={i === cursor}>
                <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => pick(h.item)} className={`w-full flex items-center gap-3 px-3 py-2 text-left ${i === cursor ? 'bg-[#4E79A7]/10' : ''}`}>
                  <ItemImage item={h.item} size={44} rounded={8} />
                  <span className="min-w-0 flex-1"><span className="block font-medium text-gray-900 truncate">{h.item.name}</span><span className="block text-xs text-gray-500 truncate">{itemSub(h.item)}</span></span>
                  <span className={`text-sm whitespace-nowrap ${h.bal === 0 ? 'font-medium' : 'text-gray-500'}`} style={h.bal === 0 ? { color: VIZ.accent } : undefined}>{h.bal === 0 ? 'หมด' : `${fmtInt(h.bal)} ${h.item.unit}`}</span>
                </button>
              </li>
            ))}
          </ul>
          {!needle && <div className="px-3 py-1.5 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">{hits.length} รายการ · พิมพ์ชื่อเพื่อค้นหา หรือกดอาการด้านบน</div>}
        </div>
      )}
    </div>
  );
}

/** Numbers strip used at the top of every tab. */
export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 min-w-0">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold leading-tight mt-0.5" style={{ color: color || VIZ.primary }}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition ${active ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`} style={!active && color ? { color } : undefined}>{children}</button>;
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : value > 0 ? 100 : 0;
  return <span className="block h-1 rounded bg-gray-100 mt-1 overflow-hidden"><span className="block h-full" style={{ width: `${w}%`, background: color }} /></span>;
}

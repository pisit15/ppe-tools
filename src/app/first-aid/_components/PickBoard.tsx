'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { FaItem, TransactionLine } from '@/lib/first-aid/types';
import { isDispensable, type OpenedInfo } from '@/lib/first-aid/model';
import { SYMPTOMS, itemGroup, matchesSymptom } from '@/lib/first-aid/browse';
import { FA_GREEN, ItemImage, VIZ, fmtInt, itemSub, thaiDate } from './fa';

/**
 * Cart key = itemId for a normal line (and for "use" of a shared item — the item's mode decides),
 * `${itemId}|open` for "open a new container". Values are quantities.
 */
export type Cart = Record<string, number>;
const OPEN = '|open';
export const openKey = (itemId: string) => `${itemId}${OPEN}`;
export type CartLine = { key: string; item: FaItem; qty: number; usage: 'stock' | 'use' | 'open' };
export function cartLines(items: FaItem[], cart: Cart): CartLine[] {
  const out: CartLine[] = [];
  for (const [key, qty] of Object.entries(cart)) {
    if (qty <= 0) continue;
    const open = key.endsWith(OPEN); const item = items.find(i => i.id === (open ? key.slice(0, -OPEN.length) : key));
    if (!item) continue;
    out.push({ key, item, qty, usage: open ? 'open' : item.dispenseMode === 'shared' ? 'use' : 'stock' });
  }
  return out;
}
export const toTransactionLines = (lines: CartLine[]): TransactionLine[] => lines.map(l => ({ itemId: l.item.id, quantity: l.qty, ...(l.usage === 'stock' ? {} : { usage: l.usage }) }));
/** Label for a quantity: "2 เม็ด", "1 ครั้ง", "เปิดขวดใหม่ 1 ขวด". */
export const lineQtyLabel = (l: CartLine) => l.usage === 'use' ? `${fmtInt(l.qty)} ครั้ง` : l.usage === 'open' ? `เปิดใหม่ ${fmtInt(l.qty)} ${l.item.unit}` : `${fmtInt(l.qty)} ${l.item.unit}`;

const QTY_KEY = 'fa.lastQty';
/** Last quantity dispensed per item on this device (Paracetamol → 2 …). */
export function lastQty(itemId: string, fallback = 1) {
  try { const m = JSON.parse(window.localStorage.getItem(QTY_KEY) || '{}') as Record<string, number>; return m[itemId] || fallback; } catch { return fallback; }
}
export function rememberQty(cart: Cart) {
  try { const m = JSON.parse(window.localStorage.getItem(QTY_KEY) || '{}') as Record<string, number>; for (const [id, q] of Object.entries(cart)) if (q > 0 && !id.endsWith(OPEN)) m[id] = q; window.localStorage.setItem(QTY_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/**
 * Picture grid with search + symptom / group chips. Tap a card → it goes into the cart (same on the nurse's screen and the QR page).
 * `avail` gives the quantity available at the chosen point; `opened` the shared container in use there; `frequent` puts recently dispensed items first.
 */
export function PickBoard({ items: allItems, avail, opened, cart, onChange, frequent = [], maxLines = 8, columns = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5', compact = false, stickyFilters = false }: {
  items: FaItem[]; avail: (item: FaItem) => number; opened?: (item: FaItem) => OpenedInfo | null; cart: Cart; onChange: (key: string, qty: number) => void; frequent?: string[]; maxLines?: number; columns?: string;
  /** Phone layout: shorter pictures, pill stepper. */ compact?: boolean;
  /** Keep search + chips pinned while the list scrolls (the parent must be the scroll container with 12 px side padding). */ stickyFilters?: boolean;
}) {
  const [q, setQ] = useState(''); const [tag, setTag] = useState('');
  // Equipment kept at the point (scissors, thermometer …) is not something to pick.
  const items = useMemo(() => allItems.filter(isDispensable), [allItems]);
  const symptoms = useMemo(() => SYMPTOMS.filter(t => items.some(i => matchesSymptom(t, i))), [items]);
  const groups = useMemo(() => { const m = new Map<string, number>(); items.forEach(i => m.set(itemGroup(i), (m.get(itemGroup(i)) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [items]);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const usable = (i: FaItem) => avail(i) > 0 || !!(i.dispenseMode === 'shared' && opened?.(i) && !opened(i)!.expired);
    let l = items;
    if (needle) l = items.filter(i => `${i.name} ${i.generic} ${i.description}`.toLowerCase().includes(needle));
    else if (tag.startsWith('s:')) { const t = SYMPTOMS.find(x => x.id === tag.slice(2)); l = t ? items.filter(i => matchesSymptom(t, i)) : items; }
    else if (tag.startsWith('g:')) l = items.filter(i => itemGroup(i) === tag.slice(2));
    const rank = new Map(frequent.map((id, i) => [id, i]));
    return l.slice().sort((a, b) => {
      const fa = rank.has(a.id) ? rank.get(a.id)! : 999, fb = rank.has(b.id) ? rank.get(b.id)! : 999;
      const sa = usable(a) ? 0 : 1, sb = usable(b) ? 0 : 1;
      return sa - sb || fa - fb || (a.category === 'ยา' ? 0 : 1) - (b.category === 'ยา' ? 0 : 1) || a.name.localeCompare(b.name, 'th');
    });
  }, [items, needle, tag, frequent, avail, opened]);
  const lines = cartLines(items, cart).length;
  const chip = (id: string, label: ReactNode, on: boolean, onClick: () => void) => <button key={id} type="button" onClick={onClick} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{label}</button>;
  // Every card has the same anatomy — picture, two-line name, one-line note, action pinned to the bottom — so buttons line up across a row.
  const aspect = compact ? '3 / 2' : '1 / 1';
  const cardClass = (active: boolean, dim: boolean) => `rounded-2xl border bg-white flex flex-col h-full ${compact ? 'p-2' : 'p-2.5'} ${active ? 'border-[#246047] shadow-sm' : 'border-gray-200'} ${dim ? 'opacity-55' : ''}`;
  const badge = (text: string, tone: 'ok' | 'warn' | 'out') => <span className="absolute top-1.5 right-1.5 max-w-[85%] truncate rounded-full border bg-white/95 px-2 py-0.5 text-[11px] font-medium shadow-sm" style={{ color: tone === 'out' ? VIZ.accent : tone === 'warn' ? '#9a5410' : VIZ.text, borderColor: tone === 'out' ? `${VIZ.accent}66` : tone === 'warn' ? `${VIZ.secondary}88` : '#E5E7EB' }}>{text}</span>;
  // Name (up to two lines) with its note directly underneath; the block reserves the two-line height so every row of the grid is equally tall.
  const title = (i: FaItem) => <div className="mt-2 min-h-[3.9rem]"><div className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">{i.name}</div><div className="mt-0.5 text-xs text-gray-500 truncate">{itemSub(i)}</div></div>;
  const primary = 'h-10 w-full rounded-xl text-white font-semibold disabled:opacity-40';
  const soldOut = <div className="h-10 flex items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold" style={{ color: VIZ.accent }}>หมด</div>;
  const quantity = (value: number, set: (n: number) => void, max: number, suffix = '') => <QtyPill value={value} onChange={set} max={max} suffix={suffix} editable={!compact} />;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className={`flex flex-col sm:flex-row gap-2 sm:items-center ${stickyFilters ? 'sticky top-0 z-10 -mx-3 px-3 py-2 bg-[#F4F6F4] shadow-[0_6px_8px_-8px_rgba(0,0,0,0.18)]' : ''}`}>
        <label className="relative sm:w-72 shrink-0"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="search" value={q} onChange={e => { setQ(e.target.value); }} placeholder="พิมพ์ชื่อยา…" aria-label="ค้นหายา" className={`w-full border border-gray-300 bg-white pl-9 pr-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7] ${compact ? 'rounded-xl py-2.5 text-base' : 'rounded-lg py-2 text-sm'}`} /></label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="เลือกตามอาการ">
          {chip('all', `ทั้งหมด ${items.length}`, !tag && !needle, () => { setTag(''); setQ(''); })}
          {symptoms.map(t => chip(`s:${t.id}`, t.label, tag === `s:${t.id}` && !needle, () => { setTag(x => (x === `s:${t.id}` ? '' : `s:${t.id}`)); setQ(''); }))}
          <span className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" aria-hidden="true" />
          {groups.map(([g, n]) => chip(`g:${g}`, `${g} ${n}`, tag === `g:${g}` && !needle, () => { setTag(x => (x === `g:${g}` ? '' : `g:${g}`)); setQ(''); }))}
        </div>
      </div>
      <div className={`grid ${compact ? 'gap-2.5' : 'gap-2'} ${columns}`}>
        {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-gray-500">{needle ? `ไม่พบ “${q}” — ลองเลือกจากอาการ` : 'ไม่มีรายการในกลุ่มนี้'}</p>}
        {list.map(i => { const a = avail(i); const qty = cart[i.id] || 0; const on = qty > 0; const full = !on && lines >= maxLines;
          if (i.dispenseMode === 'shared') {
            const op = opened?.(i) || null; const openQty = cart[openKey(i.id)] || 0; const inUse = !!op && !op.expired; const out = !inUse && a === 0;
            const active = on || openQty > 0;
            return (
              <div key={i.id} className={cardClass(active, out)} style={active ? { background: `${FA_GREEN}0D` } : undefined}>
                <button type="button" disabled={out || full || !inUse} onClick={() => onChange(i.id, qty + 1)} className="flex-1 flex flex-col justify-start text-left disabled:cursor-not-allowed" aria-label={`ใช้ ${i.name} 1 ครั้ง`}>
                  <div className="relative"><ItemImage item={i} size="100%" aspect={aspect} rounded={12} />{badge(out ? 'หมด' : op?.expired ? 'เปิดเกินกำหนด' : inUse ? 'เปิดใช้อยู่' : 'ยังไม่เปิดขวด', out ? 'out' : op?.expired ? 'warn' : 'ok')}</div>
                  {title(i)}
                  <div className="mt-0.5 text-xs leading-snug" style={{ color: op?.expired ? VIZ.accent : VIZ.lightText }}>{[inUse && op!.until ? `ใช้ได้ถึง ${thaiDate(op!.until, { short: true })}` : op?.expired && op.until ? `เกินกำหนด ${thaiDate(op.until, { short: true })}` : '', a > 0 ? `สำรอง ${fmtInt(a)} ${i.unit}` : ''].filter(Boolean).join(' · ')}</div>
                </button>
                <div className="mt-2 flex flex-col gap-1.5">
                  {!out && a > 0 && (openQty > 0
                    ? <button type="button" onClick={() => onChange(openKey(i.id), 0)} className="h-8 w-full rounded-lg border px-1 text-xs font-medium truncate" style={{ borderColor: VIZ.secondary, color: '#9a5410', background: `${VIZ.secondary}14` }}>✓ เปิดขวดใหม่ · ยกเลิก</button>
                    : <button type="button" disabled={lines >= maxLines} onClick={() => onChange(openKey(i.id), 1)} className="h-8 w-full rounded-lg border border-gray-300 bg-white px-1 text-xs font-medium text-gray-700 truncate hover:bg-gray-50 disabled:opacity-40">{inUse ? 'ขวดหมด → เปิดใหม่' : 'เปิดขวดใหม่'}</button>)}
                  {out ? soldOut
                    : on ? quantity(qty, n => onChange(i.id, n), 99, 'ครั้ง')
                    : <button type="button" disabled={full || !inUse} title={inUse ? undefined : 'ยังไม่มีขวดที่เปิดอยู่ — กด “เปิดขวดใหม่” ก่อน'} onClick={() => onChange(i.id, 1)} className={primary} style={{ background: FA_GREEN }}>ใช้ 1 ครั้ง</button>}
                </div>
              </div>);
          }
          const out = a === 0;
          return (
            <div key={i.id} className={cardClass(on, out)} style={on ? { background: `${FA_GREEN}0D` } : undefined}>
              <button type="button" disabled={out || full} onClick={() => onChange(i.id, on ? qty : lastQty(i.id))} className="flex-1 flex flex-col justify-start text-left disabled:cursor-not-allowed" aria-label={`เลือก ${i.name}`}>
                <div className="relative"><ItemImage item={i} size="100%" aspect={aspect} rounded={12} />{badge(out ? 'หมด' : `เหลือ ${fmtInt(a)} ${i.unit}`, out ? 'out' : 'ok')}</div>
                {title(i)}
              </button>
              <div className="mt-2">
                {out ? soldOut
                  : on ? quantity(qty, n => onChange(i.id, n), a)
                  : <button type="button" disabled={full} onClick={() => onChange(i.id, lastQty(i.id))} className={primary} style={{ background: FA_GREEN }}>+ เลือก</button>}
              </div>
            </div>); })}
      </div>
      {lines >= maxLines && <p className="text-xs" style={{ color: VIZ.secondary }}>เลือกได้สูงสุด {maxLines} รายการต่อใบ — บันทึกใบนี้ก่อนแล้วค่อยเลือกเพิ่ม</p>}
    </div>
  );
}

/** Touch-first quantity control for a card: − qty + in one pill as wide as the card. Going below 1 removes the line. */
function QtyPill({ value, onChange, max, suffix = '', narrow = false, editable = false }: { value: number; onChange: (n: number) => void; max: number; suffix?: string; narrow?: boolean; /** Desktop: the number can also be typed (never below 1 — use − to remove). */ editable?: boolean }) {
  const side = narrow ? 'w-9' : 'w-11';
  return (
    <div className={`flex h-10 items-stretch overflow-hidden rounded-xl border bg-white ${narrow ? 'w-[112px] shrink-0' : ''}`} style={{ borderColor: FA_GREEN }}>
      <button type="button" aria-label="ลด" className={`${side} text-xl font-medium`} style={{ color: FA_GREEN }} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span className="flex-1 min-w-0 flex items-center justify-center gap-1 font-semibold text-gray-900 tabular-nums" aria-live="polite">
        {editable ? <input type="number" inputMode="numeric" aria-label="จำนวน" min={1} max={max} value={value} onChange={e => onChange(Math.min(max, Math.max(1, Math.round(Number(e.target.value)) || 1)))} onFocus={e => e.target.select()} className="w-full min-w-0 bg-transparent text-center font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" style={suffix ? { width: '2.5em' } : undefined} /> : value}
        {suffix && <span className="text-xs font-normal text-gray-500">{suffix}</span>}
      </span>
      <button type="button" aria-label="เพิ่ม" disabled={value >= max} className={`${side} text-xl font-medium text-white disabled:opacity-40`} style={{ background: FA_GREEN }} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

const REASONS = ['ปวดหัว / ไข้', 'ปวดท้อง / ท้องเสีย', 'คลื่นไส้', 'แพ้ / คัน', 'ปวดเมื่อย', 'บาดแผล', 'หยิบให้เพื่อน', 'เติมกล่องประจำทีม'];

/** The "ticket": who is collecting + what + why → one save. */
export function TicketPanel({ items, cart, avail, onQty, who, setWho, dept, setDept, departments, reason, setReason, requireName, children, onSubmit, busy, err, submitLabel, hint, compact = false }: {
  items: FaItem[]; cart: Cart; avail: (item: FaItem) => number; onQty: (key: string, qty: number) => void;
  who: string; setWho: (v: string) => void; dept: string; setDept: (v: string) => void; departments: string[]; reason: string; setReason: (v: string) => void;
  requireName: boolean; children?: ReactNode; onSubmit: () => void; busy: boolean; err: string; submitLabel: string; hint?: ReactNode;
  /** Phone (QR page): quantities change by tapping only; on desktop the number can also be typed. */ compact?: boolean;
}) {
  const [deptOther, setDeptOther] = useState(false);
  const lines = cartLines(items, cart);
  const total = lines.filter(l => l.usage !== 'use').reduce((s, l) => s + l.qty, 0);
  const uses = lines.filter(l => l.usage === 'use').reduce((s, l) => s + l.qty, 0);
  const depts = useMemo(() => [...departments.filter(d => d !== 'ผู้รับเหมา').slice(0, 8), 'ผู้รับเหมา'], [departments]);
  const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-700'}`;
  const summary = [total ? `${fmtInt(total)} ชิ้น` : '', uses ? `ใช้ ${fmtInt(uses)} ครั้ง` : ''].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-gray-200 bg-white px-3 divide-y divide-gray-100">
        {lines.length === 0 && <p className="py-6 text-center text-sm text-gray-500">ยังไม่ได้เลือกยา — แตะการ์ดยาด้านซ้าย</p>}
        {lines.map(l => <div key={l.key} className="flex items-center gap-3 py-2"><ItemImage item={l.item} size={40} /><div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 leading-snug line-clamp-2">{l.item.name}{l.usage === 'open' && <span className="ml-1 text-xs font-normal" style={{ color: '#9a5410' }}>เปิดขวดใหม่</span>}</div>
          <div className="text-xs text-gray-500">{l.usage === 'use' ? 'ใช้จากขวดที่เปิดอยู่ · ไม่ตัดสต๊อก' : `${l.item.unit} · เหลือ ${fmtInt(avail(l.item))} → ${fmtInt(avail(l.item) - l.qty)}`}</div></div>
          {l.usage === 'open' ? <button type="button" onClick={() => onQty(l.key, 0)} className="text-xs text-gray-500 underline">ยกเลิก</button> : <QtyPill narrow editable={!compact} value={l.qty} onChange={n => onQty(l.key, n)} max={l.usage === 'use' ? 99 : avail(l.item)} />}</div>)}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-800 mb-1" htmlFor="tk-who">ผู้เบิกยา {requireName ? <span style={{ color: VIZ.accent }}>* จำเป็น</span> : <span className="font-normal text-gray-400">(ไม่บังคับ)</span>}</label>
        <input id="tk-who" value={who} onChange={e => setWho(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900" placeholder="ชื่อ-นามสกุล หรือรหัสพนักงาน" />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {depts.map(d => <button key={d} type="button" onClick={() => { setDeptOther(false); setDept(dept === d ? '' : d); }} className={pill(dept === d && !deptOther)} style={dept === d && !deptOther ? { background: FA_GREEN } : undefined}>{d}</button>)}
          <button type="button" onClick={() => { setDeptOther(o => !o); if (!deptOther) setDept(''); }} className={pill(deptOther)} style={deptOther ? { background: FA_GREEN } : undefined}>อื่น ๆ</button>
        </div>
        {deptOther && <input value={dept} onChange={e => setDept(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900" placeholder="พิมพ์ชื่อแผนก / บริษัท" aria-label="แผนกอื่น" autoFocus />}
      </div>
      <div>
        <div className="text-sm font-medium text-gray-800 mb-1">อาการ / เหตุผล <span className="font-normal text-gray-400">(ไม่บังคับ)</span></div>
        <div className="flex flex-wrap gap-1.5">{REASONS.map(r => <button key={r} type="button" onClick={() => setReason(reason === r ? '' : r)} className={pill(reason === r)} style={reason === r ? { background: FA_GREEN } : undefined}>{r}</button>)}</div>
      </div>
      {children}
      {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      <button type="button" disabled={busy || lines.length === 0} onClick={onSubmit} className="h-12 w-full rounded-xl text-white text-base font-semibold disabled:opacity-50" style={{ background: FA_GREEN }}>{busy ? 'กำลังบันทึก…' : `${submitLabel} (${lines.length} รายการ${summary ? ` · ${summary}` : ''})`}</button>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

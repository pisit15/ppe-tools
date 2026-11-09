'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { FaItem, TransactionLine } from '@/lib/first-aid/types';
import type { OpenedInfo } from '@/lib/first-aid/model';
import { SYMPTOMS, itemGroup, matchesSymptom } from '@/lib/first-aid/browse';
import { FA_GREEN, ItemImage, Stepper, VIZ, fmtInt, itemSub, thaiDate } from './fa';

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
export function PickBoard({ items, avail, opened, cart, onChange, frequent = [], maxLines = 8, columns = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5', compact = false }: {
  items: FaItem[]; avail: (item: FaItem) => number; opened?: (item: FaItem) => OpenedInfo | null; cart: Cart; onChange: (key: string, qty: number) => void; frequent?: string[]; maxLines?: number; columns?: string; compact?: boolean;
}) {
  const [q, setQ] = useState(''); const [tag, setTag] = useState('');
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
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <label className="relative sm:w-72 shrink-0"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="search" value={q} onChange={e => { setQ(e.target.value); }} placeholder="พิมพ์ชื่อยา…" aria-label="ค้นหายา" className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7]" /></label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1 min-w-0" role="tablist" aria-label="เลือกตามอาการ">
          {chip('all', `ทั้งหมด ${items.length}`, !tag && !needle, () => { setTag(''); setQ(''); })}
          {symptoms.map(t => chip(`s:${t.id}`, t.label, tag === `s:${t.id}` && !needle, () => { setTag(x => (x === `s:${t.id}` ? '' : `s:${t.id}`)); setQ(''); }))}
          <span className="w-px bg-gray-300 mx-0.5 self-stretch shrink-0" aria-hidden="true" />
          {groups.map(([g, n]) => chip(`g:${g}`, `${g} ${n}`, tag === `g:${g}` && !needle, () => { setTag(x => (x === `g:${g}` ? '' : `g:${g}`)); setQ(''); }))}
        </div>
      </div>
      <div className={`grid gap-2 ${columns}`}>
        {list.length === 0 && <p className="col-span-full py-10 text-center text-sm text-gray-500">{needle ? `ไม่พบ “${q}” — ลองเลือกจากอาการ` : 'ไม่มีรายการในกลุ่มนี้'}</p>}
        {list.map(i => { const a = avail(i); const qty = cart[i.id] || 0; const on = qty > 0; const full = !on && lines >= maxLines;
          if (i.dispenseMode === 'shared') {
            const op = opened?.(i) || null; const openQty = cart[openKey(i.id)] || 0; const inUse = !!op && !op.expired; const out = !inUse && a === 0;
            const active = on || openQty > 0;
            return (
              <div key={i.id} className={`rounded-xl border bg-white flex flex-col ${compact ? 'p-2 gap-1.5' : 'p-2.5 gap-2'} ${active ? 'border-[#246047] shadow-sm' : 'border-gray-200'} ${out ? 'opacity-50' : ''}`} style={active ? { background: `${FA_GREEN}0D` } : undefined}>
                <button type="button" disabled={out || full} onClick={() => onChange(i.id, qty + 1)} className="text-left disabled:cursor-not-allowed" aria-label={`ใช้ ${i.name} 1 ครั้ง`}>
                  <ItemImage item={i} size="100%" rounded={10} />
                  <div className={`font-semibold text-gray-900 leading-tight mt-1.5 ${compact ? 'text-sm' : 'text-[15px]'}`}>{i.name}</div>
                  <div className="text-xs text-gray-500 truncate">{itemSub(i)}</div>
                  <div className="text-xs" style={{ color: out || op?.expired ? VIZ.accent : VIZ.lightText }}>
                    {op?.expired ? `ขวดที่เปิดเกินกำหนด${op.until ? ` (${thaiDate(op.until, { short: true })})` : ''}` : inUse ? `เปิดใช้อยู่${op!.until ? ` · ถึง ${thaiDate(op!.until, { short: true })}` : ''}` : a > 0 ? 'ยังไม่เปิดขวด' : 'หมด'}
                    {a > 0 && <span className="text-gray-400"> · สำรอง {fmtInt(a)} {i.unit}</span>}
                  </div>
                </button>
                {out ? <div className="h-10 flex items-center justify-center text-sm font-semibold" style={{ color: VIZ.accent }}>หมด</div>
                  : <div className="flex flex-col gap-1">
                    {on ? <div className="flex items-center justify-between gap-1"><span className="text-xs text-gray-600">ใช้ (ครั้ง)</span><Stepper value={qty} onChange={n => onChange(i.id, n)} min={0} max={99} size={36} /></div>
                      : <button type="button" disabled={full || !inUse} title={inUse ? undefined : 'ยังไม่มีขวดที่เปิดอยู่ — กด “เปิดขวดใหม่” ก่อน'} onClick={() => onChange(i.id, 1)} className="h-10 w-full rounded-lg text-white font-semibold disabled:opacity-40" style={{ background: FA_GREEN }}>ใช้ 1 ครั้ง</button>}
                    {a > 0 && (openQty > 0
                      ? <button type="button" onClick={() => onChange(openKey(i.id), 0)} className="h-8 w-full rounded-lg border text-xs font-medium" style={{ borderColor: VIZ.secondary, color: '#9a5410', background: `${VIZ.secondary}14` }}>✓ เปิดขวดใหม่ (ตัดสต๊อก 1) · ยกเลิก</button>
                      : <button type="button" disabled={lines >= maxLines} onClick={() => onChange(openKey(i.id), 1)} className="h-8 w-full rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{inUse ? 'ขวดหมด → เปิดขวดใหม่' : 'เปิดขวดใหม่'}</button>)}
                  </div>}
              </div>);
          }
          const out = a === 0;
          return (
          <div key={i.id} className={`rounded-xl border bg-white flex flex-col ${compact ? 'p-2 gap-1.5' : 'p-2.5 gap-2'} ${on ? 'border-[#246047] shadow-sm' : 'border-gray-200'} ${out ? 'opacity-50' : ''}`} style={on ? { background: `${FA_GREEN}0D` } : undefined}>
            <button type="button" disabled={out || full} onClick={() => onChange(i.id, on ? qty : lastQty(i.id))} className="text-left disabled:cursor-not-allowed" aria-label={`เลือก ${i.name}`}>
              <ItemImage item={i} size="100%" rounded={10} />
              <div className={`font-semibold text-gray-900 leading-tight mt-1.5 ${compact ? 'text-sm' : 'text-[15px]'}`}>{i.name}</div>
              <div className="text-xs text-gray-500 truncate">{itemSub(i)}</div>
              <div className="text-xs" style={{ color: out ? VIZ.accent : VIZ.lightText }}>{out ? 'หมด' : `เหลือ ${fmtInt(a)} ${i.unit}`}</div>
            </button>
            {out ? <div className="h-10 flex items-center justify-center text-sm font-semibold" style={{ color: VIZ.accent }}>หมด</div>
              : on ? <div className="flex items-center justify-between gap-1"><Stepper value={qty} onChange={n => onChange(i.id, n)} min={0} max={a} size={36} /></div>
              : <button type="button" disabled={full} onClick={() => onChange(i.id, lastQty(i.id))} className="h-10 w-full rounded-lg text-white font-semibold disabled:opacity-40" style={{ background: FA_GREEN }}>+ เลือก</button>}
          </div>); })}
      </div>
      {lines >= maxLines && <p className="text-xs" style={{ color: VIZ.secondary }}>เลือกได้สูงสุด {maxLines} รายการต่อใบ — บันทึกใบนี้ก่อนแล้วค่อยเลือกเพิ่ม</p>}
    </div>
  );
}

const REASONS = ['ปวดหัว / ไข้', 'ปวดท้อง / ท้องเสีย', 'คลื่นไส้', 'แพ้ / คัน', 'ปวดเมื่อย', 'บาดแผล', 'หยิบให้เพื่อน', 'เติมกล่องประจำทีม'];

/** The "ticket": who is collecting + what + why → one save. */
export function TicketPanel({ items, cart, avail, onQty, who, setWho, dept, setDept, departments, reason, setReason, requireName, children, onSubmit, busy, err, submitLabel, hint }: {
  items: FaItem[]; cart: Cart; avail: (item: FaItem) => number; onQty: (key: string, qty: number) => void;
  who: string; setWho: (v: string) => void; dept: string; setDept: (v: string) => void; departments: string[]; reason: string; setReason: (v: string) => void;
  requireName: boolean; children?: ReactNode; onSubmit: () => void; busy: boolean; err: string; submitLabel: string; hint?: ReactNode;
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
        {lines.map(l => <div key={l.key} className="flex items-center gap-3 py-2"><ItemImage item={l.item} size={40} /><div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 truncate">{l.item.name}{l.usage === 'open' && <span className="ml-1 text-xs font-normal" style={{ color: '#9a5410' }}>เปิดขวดใหม่</span>}</div>
          <div className="text-xs text-gray-500">{l.usage === 'use' ? 'ใช้จากขวดที่เปิดอยู่ · ไม่ตัดสต๊อก' : `${l.item.unit} · เหลือ ${fmtInt(avail(l.item))} → ${fmtInt(avail(l.item) - l.qty)}`}</div></div>
          {l.usage === 'open' ? <button type="button" onClick={() => onQty(l.key, 0)} className="text-xs text-gray-500 underline">ยกเลิก</button> : <Stepper value={l.qty} onChange={n => onQty(l.key, n)} min={0} max={l.usage === 'use' ? 99 : avail(l.item)} size={36} />}</div>)}
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

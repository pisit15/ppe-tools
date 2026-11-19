'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { FaItem } from '@/lib/first-aid/types';
import { Chip, FA_GREEN, ItemImage, VIZ, balance, bangkokToday, btnPrimary, errMsg, fmtInt, inputClass, itemSub, labelClass, manage, postTransaction, useFa } from './fa';
import { ThaiDateInput } from './ThaiDateInput';

/** `key` is the idempotency key of the row's receipt: stable across a retry, renewed whenever the row is edited. */
type Cell = { qty: string; expiry: string; min: string; key: string };
type Draft = Record<string, Cell>;
const BLANK: Cell = { qty: '', expiry: '', min: '', key: '' };
function readDraft(key: string): Draft {
  if (typeof window === 'undefined') return {};
  try { const v = JSON.parse(window.localStorage.getItem(key) || '{}') as Draft; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
const GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_64px_96px_150px_84px] md:items-center md:gap-x-3';

/**
 * Receive many items in one table — every item of the company is a row: type the quantity, the expiry date off the box
 * and (optionally) the minimum, then save once. Meant for the first stocking of a cabinet and for a large delivery.
 * Each row is posted as its own receipt (one lot, one expiry), in order; rows already saved leave the table, so a
 * save that stops half-way can simply be pressed again. What was typed is kept on this device until saved.
 */
export function BulkReceive({ locationId, onDone }: { locationId: string; onDone: (msg: string) => void }) {
  const { state, company, refresh } = useFa();
  const draftKey = `fa.bulkrx.${company}.${locationId}`;
  const [loaded, setLoaded] = useState({ key: draftKey, draft: readDraft(draftKey) });
  if (loaded.key !== draftKey) setLoaded({ key: draftKey, draft: readDraft(draftKey) });
  const draft = loaded.draft;
  const setDraft = (fn: (d: Draft) => Draft) => setLoaded(s => ({ key: s.key, draft: fn(s.draft) }));
  useEffect(() => { try { window.localStorage.setItem(loaded.key, JSON.stringify(loaded.draft)); } catch { /* storage full or blocked: the table still works */ } }, [loaded]);
  const [date, setDate] = useState(bangkokToday()); const [note, setNote] = useState('');
  const [q, setQ] = useState(''); const [viewChosen, setViewChosen] = useState<'all' | 'here' | 'filled' | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [progress, setProgress] = useState(0); const [tried, setTried] = useState(false);

  const here = useMemo(() => new Set<string>([...(state?.thresholds || []).filter(t => t.locationId === locationId).map(t => t.itemId), ...(state?.lots || []).filter(l => l.locationId === locationId).map(l => l.itemId)]), [state, locationId]);
  const items = useMemo(() => (state?.items || []).slice().sort((a, b) => Number(a.category !== 'ยา') - Number(b.category !== 'ยา') || a.category.localeCompare(b.category, 'th') || a.name.localeCompare(b.name, 'th')), [state]);
  if (!state) return null;
  const point = state.locations.find(l => l.id === locationId);
  const cell = (id: string) => draft[id] || BLANK;
  const qtyOf = (id: string) => { const n = Math.round(Number(cell(id).qty)); return Number.isFinite(n) && n > 0 ? n : 0; };
  const minNow = (i: FaItem) => state.thresholds.find(t => t.itemId === i.id && t.locationId === locationId)?.min;
  const set = (id: string, patch: Partial<Cell>) => setDraft(d => { const prev = d[id] || BLANK; const next = { ...prev, ...patch }; if ('qty' in patch || 'expiry' in patch || !next.key) next.key = crypto.randomUUID(); return { ...d, [id]: next }; });
  const ready = items.filter(i => qtyOf(i.id) > 0);
  const missing = ready.filter(i => i.trackExpiry && !cell(i.id).expiry);
  const minEdits = items.filter(i => cell(i.id).min.trim() !== '' && Number.isFinite(Number(cell(i.id).min)) && Math.max(0, Math.round(Number(cell(i.id).min))) !== minNow(i));
  const view = viewChosen ?? (here.size > 0 ? 'here' : 'all');
  const needle = q.trim().toLowerCase();
  const shown = items.filter(i => needle ? `${i.name} ${i.generic} ${i.description}`.toLowerCase().includes(needle) : view === 'here' ? here.has(i.id) : view === 'filled' ? qtyOf(i.id) > 0 || cell(i.id).min.trim() !== '' : true);

  async function save() {
    setTried(true);
    if (!ready.length && !minEdits.length) { setErr('กรอกจำนวนที่รับอย่างน้อย 1 รายการ'); return; }
    if (!date) { setErr('ระบุวันที่รับ (วัน/เดือน/ปี)'); return; }
    if (missing.length) { setErr(`ระบุวันหมดอายุให้ครบ: ${missing.slice(0, 4).map(i => i.name).join(', ')}${missing.length > 4 ? ` และอีก ${fmtInt(missing.length - 4)} รายการ` : ''}`); setViewChosen('filled'); return; }
    setBusy(true); setErr(''); setProgress(0); let ok = 0;
    try {
      for (const i of ready) {
        const c = cell(i.id);
        await postTransaction(company, { idempotencyKey: c.key, kind: 'receive', locationId, date, lines: [{ itemId: i.id, quantity: qtyOf(i.id) }], expiry: i.trackExpiry ? c.expiry : null, lotCode: '', note: note.trim() });
        ok += 1; setProgress(ok);
        setDraft(d => ({ ...d, [i.id]: { ...BLANK, min: d[i.id]?.min || '' } }));
      }
      for (let at = 0; at < minEdits.length; at += 200) await manage(company, { action: 'thresholds', locationId, thresholds: minEdits.slice(at, at + 200).map(i => ({ itemId: i.id, min: Math.max(0, Math.round(Number(cell(i.id).min))) })) });
      setDraft(() => ({})); setTried(false); setNote('');
      await refresh();
      onDone([ok ? `รับเข้า ${fmtInt(ok)} รายการแล้ว` : '', minEdits.length ? `ตั้งขั้นต่ำ ${fmtInt(minEdits.length)} รายการ` : ''].filter(Boolean).join(' · '));
    } catch (e) {
      await refresh().catch(() => undefined);
      setErr(`${errMsg(e)}${ok ? ` — บันทึกไปแล้ว ${fmtInt(ok)} รายการ รายการที่เหลือยังอยู่ในตาราง กดบันทึกอีกครั้งได้` : ''}`);
    } finally { setBusy(false); }
  }
  const num = 'h-9 rounded-lg border border-gray-300 bg-white px-2 text-right text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4E79A7]';
  const mini = 'mb-0.5 block text-xs text-gray-600 md:hidden';
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1 basis-64"><h2 className="font-semibold text-gray-900">รับเข้าทั้งตาราง · {point?.name}</h2><p className="mt-0.5 text-sm text-gray-600">ใช้ลงของครั้งแรก หรือรับหลายรายการพร้อมกัน · กรอกเฉพาะแถวที่มีของ แถวที่เว้นว่างจะไม่ถูกบันทึก · วันหมดอายุพิมพ์ตามกล่อง เช่น 31/12/2570 หรือ 12/2570</p></div>
        <div><label className={labelClass} htmlFor="brx-date">วันที่รับ</label><ThaiDateInput id="brx-date" value={date} max={bangkokToday()} onChange={setDate} attention widthClass="w-44" /></div>
        <div className="min-w-[200px] flex-1 basis-56"><label className={labelClass} htmlFor="brx-note">หมายเหตุ</label><input id="brx-note" className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ลงของครั้งแรก / ใบส่งของเลขที่…" disabled={busy} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <label className="relative min-w-[180px] flex-1 sm:max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อยา" aria-label="ค้นหายาในตาราง" className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7]" /></label>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <Chip active={!needle && view === 'all'} onClick={() => { setViewChosen('all'); setQ(''); }}>ทุกรายการ {items.length}</Chip>
          {here.size > 0 && <Chip active={!needle && view === 'here'} onClick={() => { setViewChosen('here'); setQ(''); }}>ของจุดนี้ {here.size}</Chip>}
          <Chip active={!needle && view === 'filled'} onClick={() => { setViewChosen('filled'); setQ(''); }}>กรอกแล้ว {ready.length}</Chip>
        </div>
      </div>
      <div className={`hidden border-y border-gray-100 bg-gray-50/80 px-3 py-2 text-xs font-medium text-gray-600 ${GRID}`}><span>รายการ</span><span className="text-right">มีอยู่</span><span>จำนวนที่รับ</span><span>วันหมดอายุ</span><span>ขั้นต่ำ</span></div>
      <ul className="divide-y divide-gray-100 border-t border-gray-100 md:border-t-0">
        {shown.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-600">{needle ? `ไม่พบ “${q}”` : view === 'filled' ? 'ยังไม่ได้กรอกแถวใด' : 'ไม่มีรายการ'}</li>}
        {shown.map(i => { const c = cell(i.id); const have = balance(state, i.id, locationId); const filled = qtyOf(i.id) > 0; const m = minNow(i); return (
          <li key={i.id} className={`px-3 py-2 ${GRID}`} style={filled ? { background: `${FA_GREEN}0A` } : undefined}>
            <div className="flex min-w-0 items-center gap-2.5"><ItemImage item={i} size={36} rounded={8} /><div className="min-w-0"><div className="break-words font-medium leading-snug text-gray-900">{i.name}</div><div className="truncate text-xs text-gray-600">{itemSub(i)} · {i.unit}</div></div></div>
            <div className="hidden text-right tabular-nums text-gray-700 md:block">{have ? fmtInt(have) : '—'}</div>
            <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-2 md:contents">
              <div><span className={mini}>จำนวนที่รับ{have ? ` (มีอยู่ ${fmtInt(have)})` : ''}</span><input type="number" inputMode="numeric" min={0} aria-label={`จำนวนที่รับ ${i.name}`} value={c.qty} disabled={busy} onChange={e => set(i.id, { qty: e.target.value })} onFocus={e => e.target.select()} className={`${num} w-24`} /></div>
              <div><span className={mini}>วันหมดอายุ</span>{i.trackExpiry ? <ThaiDateInput compact monthOnly ariaLabel={`วันหมดอายุ ${i.name}`} value={c.expiry} min={bangkokToday()} disabled={busy} onChange={v => set(i.id, { expiry: v })} attention={tried && filled} /> : <span className="inline-flex h-9 items-center text-xs text-gray-600">ไม่ติดตาม</span>}</div>
              <div><span className={mini}>ขั้นต่ำ</span><input type="number" inputMode="numeric" min={0} aria-label={`ขั้นต่ำ ${i.name}`} value={c.min} placeholder={m !== undefined ? String(m) : '—'} disabled={busy} onChange={e => set(i.id, { min: e.target.value })} onFocus={e => e.target.select()} className={`${num} w-[84px]`} /></div>
            </div>
          </li>); })}
      </ul>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]">
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-gray-700">{busy ? `กำลังบันทึก ${fmtInt(progress)} / ${fmtInt(ready.length)}…` : <>กรอกแล้ว <b>{fmtInt(ready.length)}</b> รายการ{missing.length > 0 && <span style={{ color: VIZ.accent }}> · ยังขาดวันหมดอายุ {fmtInt(missing.length)}</span>}{minEdits.length > 0 && <> · ตั้งขั้นต่ำ {fmtInt(minEdits.length)}</>}</>}</span>
          <button type="button" className={`${btnPrimary} h-11 px-5 text-base`} style={{ background: FA_GREEN }} disabled={busy || (!ready.length && !minEdits.length)} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : `บันทึก ${fmtInt(ready.length)} รายการ`}</button>
        </div>
        {err && <p className="basis-full text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      </div>
    </section>
  );
}

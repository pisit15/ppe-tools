'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Search } from 'lucide-react';
import type { FaEvent, FaItem, FaLot } from '@/lib/first-aid/types';
import { Bar, Chip, Drawer, ItemImage, itemSub, KIND_LABEL, STATUS_COLOR, Spinner, Stat, StatusBadge, ToastView, VIZ, FA_GREEN, balance, btnPrimary, btnSecondary, daysUntil, expiredLots, expiryDays, fmtInt, itemStatus, loadHistory, pendingLots, personLabel, physicalQty, relativeDays, shiftPeriod, statusLabel, thaiDate, type ItemStatusKey, useFa, useToast, usableLots, currentPeriod, thaiPeriod } from '../_components/fa';
import { DispenseModal, LotExpiryModal, WriteOffModal } from '../_components/actions';
import { ItemFormModal } from '../_components/ItemForm';

type Filter = 'all' | ItemStatusKey | 'near';
const PAGE = 40;

export default function ItemsPage() {
  const { state, loading, scope, company } = useFa();
  const { toast, setToast } = useToast();
  const [q, setQ] = useState(''); const [cat, setCat] = useState('all'); const [filter, setFilter] = useState<Filter>('all');
  const filterKey = `${q}|${cat}|${filter}|${scope}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (fn: (p: number) => number) => setPageState({ key: filterKey, page: fn(page) });
  const [selected, setSelected] = useState<string | null>(null);
  const [dispense, setDispense] = useState<FaItem | null>(null);
  const [writeOff, setWriteOff] = useState<FaItem | null>(null);
  const [edit, setEdit] = useState<{ open: boolean; item: FaItem | null }>({ open: false, item: null });
  const [lotEdit, setLotEdit] = useState<{ lot: FaLot; item: FaItem } | null>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); document.getElementById('fa-search')?.focus(); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const rows = useMemo(() => {
    if (!state) return [];
    return state.items.map(item => ({ item, st: itemStatus(state, item, scope), near: usableLots(state, item.id, scope).some(l => l.expiry && (expiryDays(l.expiry, state.asOf) ?? 999) <= 90) }));
  }, [state, scope]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, ok: 0, low: 0, out: 0, expired: 0, pending: 0, open_expired: 0, near: 0 };
    for (const r of rows) { c[r.st.key] += 1; if (r.near) c.near += 1; }
    return c;
  }, [rows]);
  const categories = useMemo(() => { const m = new Map<string, number>(); rows.forEach(r => m.set(r.item.category, (m.get(r.item.category) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [rows]);
  const ORDER: Record<ItemStatusKey, number> = { open_expired: 0, expired: 0, out: 1, low: 2, pending: 3, ok: 4 };
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => (cat === 'all' || r.item.category === cat) && (filter === 'all' || (filter === 'near' ? r.near : r.st.key === filter)) && (!needle || `${r.item.name} ${r.item.generic} ${r.item.description}`.toLowerCase().includes(needle)))
      .sort((a, b) => ORDER[a.st.key] - ORDER[b.st.key] || a.item.name.localeCompare(b.item.name, 'th'));
  }, [rows, q, cat, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE);
  const locations = useMemo(() => (state?.locations || []).filter(l => !l.isRegister && (scope === 'all' || l.id === scope)), [state, scope]);
  const selectedItem = state?.items.find(i => i.id === selected) || null;

  function exportCsv() {
    if (!state) return;
    const header = ['ชื่อยา', 'ชื่อสามัญ', 'หมวด', 'หน่วย', ...locations.map(l => l.name), 'รวม', 'ขั้นต่ำ', 'หมดอายุเร็วสุด', 'สถานะ'];
    const lines = filtered.map(r => [r.item.name, r.item.generic, r.item.category, r.item.unit, ...locations.map(l => balance(state, r.item.id, l.id)), r.st.balance, r.st.min, r.st.nearest?.expiry || '', statusLabel(r.item, r.st.key)]);
    const csv = '﻿' + [header, ...lines].map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); a.download = `first-aid-stock-${company}-${state.asOf}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (loading || !state) return <Spinner />;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3" aria-label="สรุป">
        <Stat label="รายการทั้งหมด" value={fmtInt(counts.all)} sub={categories.slice(0, 3).map(([c, n]) => `${c} ${n}`).join(' · ')} />
        <Stat label="เพียงพอ" value={fmtInt(counts.ok)} color={VIZ.positive} sub="ครบขั้นต่ำทุกจุด" />
        <Stat label="ต้องเติม" value={fmtInt(counts.low)} color={VIZ.secondary} sub="ต่ำกว่าขั้นต่ำ" />
        <Stat label="หมด" value={fmtInt(counts.out)} color={VIZ.accent} sub="คงเหลือ 0" />
        <Stat label="หมดอายุ / ใกล้หมด 90 วัน" value={<>{fmtInt(counts.expired)} <span className="text-base" style={{ color: VIZ.secondary }}>/ {fmtInt(counts.near)}</span></>} color={VIZ.accent} sub="รายการ" />
        <Stat label="รอวันหมดอายุ" value={fmtInt(counts.pending)} color={VIZ.lightText} sub="ยังจ่ายไม่ได้จนกว่าจะยืนยัน" />
      </section>

      <section className="flex flex-wrap items-center gap-2" aria-label="ตัวกรอง">
        <label className="relative flex-1 min-w-[200px] max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input id="fa-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อยา / ชื่อสามัญ  (กด /)" aria-label="ค้นหายา" className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7]" /></label>
        <div className="flex gap-1.5 overflow-x-auto max-w-full pb-0.5">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>ทั้งหมด {counts.all}</Chip>
          {categories.map(([c, n]) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c} {n}</Chip>)}
          <span className="w-px bg-gray-300 mx-1 self-stretch" aria-hidden="true" />
          {(['low', 'out', 'expired', 'open_expired', 'near', 'pending'] as Filter[]).filter(f => f !== 'open_expired' || counts.open_expired > 0 || filter === 'open_expired').map(f => <Chip key={f} active={filter === f} onClick={() => setFilter(filter === f ? 'all' : f)} color={f === 'near' ? VIZ.secondary : STATUS_COLOR[f as ItemStatusKey]}>{{ low: 'ต้องเติม', out: 'หมด', expired: 'หมดอายุ', open_expired: 'ขวดเปิดเกินกำหนด', near: 'ใกล้หมดอายุ', pending: 'รอวันหมดอายุ' }[f as Exclude<Filter, 'all' | 'ok'>]} {counts[f]}</Chip>)}
        </div>
        <div className="flex-1" />
        <button type="button" className={btnSecondary} onClick={exportCsv}><Download size={15} />CSV</button>
        <button type="button" className={btnSecondary} onClick={() => setEdit({ open: true, item: null })}><Plus size={15} />เพิ่มยา</button>
        <Link href="/first-aid/count?mode=receive" className={btnPrimary} style={{ background: FA_GREEN }}>รับเข้า</Link>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[760px]">
          <thead><tr className="text-xs text-gray-500 bg-gray-50/80 border-b border-gray-100">
            <th className="text-left font-medium px-3 py-2 w-[34%]">ชื่อยา</th><th className="text-left font-medium px-2 py-2 hidden lg:table-cell">หมวด</th>
            {locations.length > 1 && locations.map(l => <th key={l.id} className="text-right font-medium px-2 py-2 hidden md:table-cell whitespace-nowrap">{l.name}</th>)}
            <th className="text-right font-medium px-2 py-2">คงเหลือ</th><th className="text-right font-medium px-2 py-2 hidden sm:table-cell">ขั้นต่ำ</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell">หมดอายุเร็วสุด</th><th className="text-left font-medium px-2 py-2">สถานะ</th><th className="px-2 py-2" />
          </tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">ไม่พบรายการ</td></tr>}
            {visible.map(({ item, st }) => {
              const d = st.nearest ? daysUntil(st.nearest.expiry) : null; const expC = d !== null && d < 0 ? VIZ.accent : d !== null && d <= 90 ? VIZ.secondary : VIZ.text;
              return (
                <tr key={item.id} className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${selected === item.id ? 'bg-[#4E79A7]/5' : ''}`} onClick={() => setSelected(item.id)}>
                  <td className="px-3 py-1.5"><div className="flex items-center gap-2.5"><ItemImage item={item} size={34} rounded={8} /><div className="min-w-0"><div className="font-semibold text-gray-900 truncate">{item.name}</div><div className="text-xs text-gray-500 truncate">{itemSub(item)} · {item.unit}{item.dispenseMode === 'fixed' ? ' · ประจำจุด' : item.dispenseMode === 'shared' ? ' · แบ่งใช้' : ''}</div></div></div></td>
                  <td className="px-2 py-2 text-gray-500 hidden lg:table-cell">{item.category}</td>
                  {locations.length > 1 && locations.map(l => { const b = balance(state, item.id, l.id); return <td key={l.id} className="px-2 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: b === 0 ? VIZ.neutral : VIZ.text }}>{b === 0 ? '—' : fmtInt(b)}</td>; })}
                  <td className="px-2 py-2 text-right tabular-nums"><b style={{ color: st.key === 'out' || st.key === 'expired' ? VIZ.accent : st.key === 'low' ? VIZ.secondary : VIZ.text }}>{fmtInt(st.balance)}</b> <span className="text-xs text-gray-500">{item.unit}</span>{st.expiredQty > 0 && <div className="text-[11px]" style={{ color: VIZ.accent }}>+{fmtInt(st.expiredQty)} หมดอายุ</div>}{st.pendingQty > 0 && <div className="text-[11px] text-gray-500">+{fmtInt(st.pendingQty)} {item.dispenseMode === 'fixed' ? 'รอวันครบกำหนด' : 'รอวันหมดอายุ'}</div>}{st.opened && <div className="text-[11px]" style={{ color: st.opened.expired ? VIZ.accent : VIZ.lightText }}>{st.opened.expired ? 'ขวดที่เปิดเกินกำหนด' : 'เปิดใช้อยู่'}{st.opened.until ? ` · ถึง ${thaiDate(st.opened.until, { short: true })}` : ''}</div>}<Bar value={st.balance} max={st.min} color={STATUS_COLOR[st.key === 'pending' ? 'ok' : st.key]} /></td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-500 hidden sm:table-cell">{st.min || '—'}</td>
                  <td className="px-2 py-2 hidden sm:table-cell" style={{ color: expC }}>{!item.trackExpiry ? <span className="text-gray-400">ไม่ติดตาม</span> : st.nearest ? <><span className="whitespace-nowrap">{thaiDate(st.nearest.expiry)}</span>{d !== null && d <= 90 && <div className="text-xs whitespace-nowrap">{relativeDays(st.nearest.expiry)}</div>}</> : st.pendingQty > 0 ? <span className="text-gray-400">ยังไม่ระบุ</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-2 py-2"><StatusBadge status={st.key} item={item} /></td>
                  <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                    {st.key === 'pending' ? <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={() => { const lot = pendingLots(state, item.id, scope)[0]; if (lot) setLotEdit({ lot, item }); }}>ระบุวันที่</button>
                      : item.dispenseMode === 'fixed' && st.key === 'expired' ? <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={() => { const lot = expiredLots(state, item.id, scope)[0]; if (lot) setLotEdit({ lot, item }); }}>ต่อวันครบกำหนด</button>
                      : item.dispenseMode === 'fixed' && physicalQty(state, item.id, scope) > 0 ? <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap" onClick={() => setWriteOff(item)}>ชำรุด / หาย</button>
                      : st.balance > 0 ? <button type="button" className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-gray-50" style={{ color: FA_GREEN, borderColor: '#CFD8D1' }} onClick={() => setDispense(item)}>จ่าย</button>
                      : <Link href={`/first-aid/count?mode=receive&item=${item.id}`} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={e => e.stopPropagation()}>รับเข้า</Link>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500 border-t border-gray-100">
          <span>แสดง {filtered.length ? (page - 1) * PAGE + 1 : 0}–{Math.min(page * PAGE, filtered.length)} จาก {fmtInt(filtered.length)} · เรียงตามสถานะ แล้วชื่อ</span>
          {pages > 1 && <span className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">‹</button>{page} / {pages}<button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40">›</button></span>}
        </div>
      </section>

      <ItemDetail item={selectedItem} onClose={() => setSelected(null)} onDispense={() => setDispense(selectedItem)} onWriteOff={() => setWriteOff(selectedItem)} onEdit={() => setEdit({ open: true, item: selectedItem })} onLot={(lot, item) => setLotEdit({ lot, item })} />
      <DispenseModal item={dispense} onClose={() => setDispense(null)} onDone={msg => setToast({ type: 'success', msg })} />
      <WriteOffModal item={writeOff} onClose={() => setWriteOff(null)} onDone={msg => setToast({ type: 'success', msg })} />
      <ItemFormModal open={edit.open} item={edit.item} onClose={() => setEdit({ open: false, item: null })} onSaved={id => { setEdit({ open: false, item: null }); setSelected(id); setToast({ type: 'success', msg: 'บันทึกรายการแล้ว' }); }} />
      <LotExpiryModal lot={lotEdit?.lot || null} item={lotEdit?.item || null} onClose={() => setLotEdit(null)} onDone={msg => setToast({ type: 'success', msg })} />
      <ToastView toast={toast} />
    </div>
  );
}

function ItemDetail({ item, onClose, onDispense, onWriteOff, onEdit, onLot }: { item: FaItem | null; onClose: () => void; onDispense: () => void; onWriteOff: () => void; onEdit: () => void; onLot: (lot: FaLot, item: FaItem) => void }) {
  const { state, company } = useFa();
  const [loaded, setLoaded] = useState<{ itemId: string; events: FaEvent[] }>({ itemId: '', events: [] });
  useEffect(() => {
    if (!item || !state) return;
    let cancelled = false;
    const from = `${shiftPeriod(currentPeriod(), -5)}-01`;
    loadHistory(company, from, state.asOf, { item_id: item.id }).then(r => { if (!cancelled) setLoaded({ itemId: item.id, events: r.events }); }).catch(() => { if (!cancelled) setLoaded({ itemId: item.id, events: [] }); });
    return () => { cancelled = true; };
  }, [item, state, company]);
  if (!item || !state) return null;
  const events = loaded.itemId === item.id ? loaded.events : null;
  const st = itemStatus(state, item);
  const lots = state.lots.filter(l => l.itemId === item.id && l.quantity > 0).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
  const months = Array.from({ length: 6 }, (_, i) => shiftPeriod(currentPeriod(), i - 5));
  const perMonth = months.map(m => (events || []).filter(e => e.kind === 'issue' && e.date.startsWith(m)).reduce((s, e) => s + e.quantity, 0));
  const max = Math.max(1, ...perMonth);
  const avg = Math.round(perMonth.slice(0, 5).reduce((a, b) => a + b, 0) / 5);
  const fixed = item.dispenseMode === 'fixed';
  const writtenOff = (events || []).filter(e => e.kind === 'dispose').reduce((s, e) => s + e.quantity, 0);
  return (
    <Drawer open={!!item} onClose={onClose} title={<span className="flex items-center gap-3"><ItemImage item={item} size={48} rounded={12} />{item.name}</span>} subtitle={`${itemSub(item)} · หน่วย: ${item.unit}`}
      footer={<div className="flex gap-2">{fixed ? <button type="button" className={`${btnSecondary} flex-1`} disabled={physicalQty(state, item.id) === 0} onClick={onWriteOff}>ชำรุด / หาย</button> : <button type="button" className={`${btnPrimary} flex-1`} style={{ background: FA_GREEN }} disabled={st.balance === 0} onClick={onDispense}>จ่าย</button>}<Link href={`/first-aid/count?mode=receive&item=${item.id}`} className={`${btnSecondary} flex-1`}>รับเข้า</Link><button type="button" className={btnSecondary} onClick={onEdit}><Pencil size={15} />แก้ไข</button></div>}>
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">คงเหลือ</div><div className="text-2xl font-semibold" style={{ color: STATUS_COLOR[st.key] }}>{fmtInt(st.balance)}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">{fixed ? 'ต้องมีประจำจุด' : 'ขั้นต่ำ'}</div><div className="text-2xl font-semibold text-gray-900">{fmtInt(st.min)}</div></div>
        <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">{fixed ? 'ชำรุด / หาย 6 เดือน' : 'จ่ายเฉลี่ย/เดือน'}</div><div className="text-2xl font-semibold text-gray-900">{events ? fmtInt(fixed ? writtenOff : avg) : '…'}</div></div>
      </div>
      <h3 className="text-sm font-semibold mb-2">ล็อตตามจุด</h3>
      {lots.length === 0 ? <p className="text-sm text-gray-500 mb-5">ไม่มีสต็อก</p> : (
        <table className="w-full text-sm mb-5"><thead><tr className="text-xs text-gray-500"><th className="text-left font-medium py-1">จุด · ล็อต</th><th className="text-left font-medium py-1">{fixed ? 'ครบกำหนด' : 'หมดอายุ'}</th><th className="text-right font-medium py-1">จำนวน</th></tr></thead><tbody>
          {lots.map(l => { const d = expiryDays(l.expiry, state.asOf); const loc = state.locations.find(x => x.id === l.locationId); return (
            <tr key={l.id} className="border-t border-gray-100"><td className="py-1.5">{loc?.name}<div className="text-xs text-gray-400">{l.code}</div></td>
              <td className="py-1.5" style={{ color: d !== null && d < 0 ? VIZ.accent : d !== null && d <= 90 ? VIZ.secondary : VIZ.text }}>{l.expiry ? <>{thaiDate(l.expiry)}{d !== null && d < 0 && <span className="text-xs"> · {fixed ? 'เกินกำหนด' : 'หมดอายุแล้ว'}</span>}{fixed && <button type="button" className="ml-2 text-xs underline text-gray-500" onClick={() => onLot(l, item)}>แก้วันที่</button>}</> : item.trackExpiry ? <button type="button" className="text-xs underline" style={{ color: VIZ.secondary }} onClick={() => onLot(l, item)}>{fixed ? 'ระบุวันครบกำหนด' : 'ระบุวันหมดอายุ'}</button> : <span className="text-gray-400">ไม่ติดตาม</span>}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtInt(l.quantity)}</td></tr>); })}
        </tbody></table>)}
      {!fixed && <><h3 className="text-sm font-semibold mb-2">จ่าย 6 เดือนล่าสุด</h3>
      <div className="flex items-end gap-1.5 h-16 mb-1" role="img" aria-label={months.map((m, i) => `${thaiPeriod(m)} ${perMonth[i]}`).join(', ')}>
        {perMonth.map((v, i) => <div key={months[i]} className="flex-1 flex flex-col justify-end items-center"><span className="text-[11px] text-gray-600">{v || ''}</span><div className="w-full rounded-t" style={{ height: `${Math.max(2, (v / max) * 48)}px`, background: i === 5 ? VIZ.neutral : VIZ.primary }} /></div>)}
      </div>
      <div className="flex gap-1.5 text-[11px] text-gray-500 mb-5">{months.map(m => <span key={m} className="flex-1 text-center">{thaiPeriod(m).split(' ')[0]}</span>)}</div></>}
      <h3 className="text-sm font-semibold mb-2">รายการล่าสุด</h3>
      {events === null ? <p className="text-sm text-gray-400">กำลังโหลด…</p> : events.length === 0 ? <p className="text-sm text-gray-500">ไม่มีรายการใน 6 เดือน</p> : (
        <ul className="text-sm divide-y divide-gray-100">{events.slice(0, 15).map(e => <li key={e.id} className="py-1.5 flex justify-between gap-2"><span>{thaiDate(e.date)} · <b style={{ color: e.kind === 'issue' ? VIZ.text : e.kind === 'receive' ? VIZ.positive : VIZ.accent }}>{KIND_LABEL[e.kind]} {fmtInt(e.quantity)}</b> {personLabel(e.requester) && <span className="text-gray-500">· {personLabel(e.requester)}</span>}{e.note && <span className="text-gray-400"> · {e.note.slice(0, 40)}</span>}</span><span className="text-xs text-gray-400 whitespace-nowrap">{state.locations.find(l => l.id === e.locationId)?.name?.slice(0, 14)}</span></li>)}</ul>)}
      {expiredLots(state, item.id).length > 0 && <p className="mt-4 text-xs" style={{ color: VIZ.accent }}>{fixed ? `เกินวันครบกำหนด ${fmtInt(st.expiredQty)} ${item.unit} — ตรวจหรือเปลี่ยนแล้วกด “แก้วันที่” เพื่อใส่รอบใหม่` : `มีของหมดอายุ ${fmtInt(st.expiredQty)} ${item.unit} — ตัดทิ้งได้ที่หน้า ตรวจนับ`}</p>}
    </Drawer>
  );
}

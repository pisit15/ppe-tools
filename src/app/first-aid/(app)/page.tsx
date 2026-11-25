'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Search } from 'lucide-react';
import type { FaEvent, FaItem, FaLot } from '@/lib/first-aid/types';
import { Bar, Chip, ConfirmButton, Drawer, ItemImage, itemSub, KIND_LABEL, STATUS_COLOR, Spinner, Stat, StatusBadge, ToastView, VIZ, FA_GREEN, balance, btnPrimary, btnSecondary, daysUntil, expiredLots, expiryDays, fmtInt, itemStatus, loadHistory, manage, pendingLots, personLabel, physicalQty, relativeDays, shiftPeriod, statusLabel, thaiDate, type ItemStatus, type ItemStatusKey, useFa, useToast, usableLots, currentPeriod, thaiPeriod, addDays, errMsg, minFor } from '../_components/fa';
import { DispenseModal, LotExpiryModal, WriteOffModal } from '../_components/actions';
import { ItemFormModal } from '../_components/ItemForm';
import { SetupChecklist, TodoBox } from '../_components/HomePanels';
import { BulkExpiryModal } from '../_components/BulkExpiry';
import { IssueReportsModal } from '../_components/IssueReports';

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
  const [bulkExpiry, setBulkExpiry] = useState(false); const [reorderBusy, setReorderBusy] = useState(false); const [reportsOpen, setReportsOpen] = useState(false);
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

  /** Order list for purchasing: everything that needs refilling, with the last 90 days of use, as an Excel file. */
  async function exportReorder() {
    if (!state) return;
    setReorderBusy(true);
    try {
      const inScope = (id: string) => scope === 'all' || id === scope;
      const ever = new Set(state.lots.filter(l => inScope(l.locationId)).map(l => l.itemId));
      const need = rows.filter(r => (r.st.key === 'low' || r.st.key === 'out') && (r.st.min > 0 || ever.has(r.item.id)));
      const history = await loadHistory(company, addDays(state.asOf, -90), state.asOf);
      const used = new Map<string, number>();
      for (const e of history.events) if (e.kind === 'issue' && e.usage !== 'use' && inScope(e.locationId)) used.set(e.itemId, (used.get(e.itemId) || 0) + e.quantity);
      const { reorderWorkbook, reorderQuantity } = await import('@/lib/first-aid/report-export');
      const data = need.sort((a, b) => a.item.category.localeCompare(b.item.category, 'th') || a.item.name.localeCompare(b.item.name, 'th')).map(r => {
        const perMonth = (used.get(r.item.id) || 0) / 3;
        return { name: r.item.name, generic: r.item.generic, category: r.item.category, unit: r.item.unit, balance: r.st.balance, min: minFor(state.thresholds, r.item, scope), perMonth, suggest: reorderQuantity(r.st.balance, r.st.min, perMonth), status: statusLabel(r.item, r.st.key), points: locations.map(l => balance(state, r.item.id, l.id)) };
      });
      const buf = await reorderWorkbook(state.company.short, data, locations.map(l => l.name), state.asOf, history.truncated);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = `first-aid-reorder-${company}-${state.asOf}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setToast({ type: 'success', msg: `สร้างรายการสั่งซื้อ ${fmtInt(data.length)} รายการแล้ว` });
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setReorderBusy(false); }
  }

  if (loading || !state) return <Spinner />;
  const tableBtn = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap';
  const cardBtn = 'inline-flex h-10 shrink-0 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 whitespace-nowrap';
  /** The one next step for a row: fix its date, write it off, dispense it, or receive more. Same on the table and on the phone cards. */
  const action = (item: FaItem, st: ItemStatus, cls: string) =>
    st.key === 'pending' ? <button type="button" className={cls} onClick={() => { const lot = pendingLots(state, item.id, scope)[0]; if (lot) setLotEdit({ lot, item }); }}>ระบุวันที่</button>
      : item.dispenseMode === 'fixed' && st.key === 'expired' ? <button type="button" className={cls} onClick={() => { const lot = expiredLots(state, item.id, scope)[0]; if (lot) setLotEdit({ lot, item }); }}>ต่อวันครบกำหนด</button>
      : item.dispenseMode === 'fixed' && physicalQty(state, item.id, scope) > 0 ? <button type="button" className={cls} onClick={() => setWriteOff(item)}>ชำรุด / หาย</button>
      : st.balance > 0 ? <button type="button" className={cls} style={{ color: FA_GREEN, borderColor: '#CFD8D1' }} onClick={() => setDispense(item)}>จ่าย</button>
      : <Link href={`/first-aid/count?mode=receive&item=${item.id}`} className={cls} onClick={e => e.stopPropagation()}>รับเข้า</Link>;
  const pager = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-600">
      <span>แสดง {filtered.length ? (page - 1) * PAGE + 1 : 0}–{Math.min(page * PAGE, filtered.length)} จาก {fmtInt(filtered.length)} · เรียงตามสถานะ แล้วชื่อ</span>
      {pages > 1 && <span className="flex items-center gap-1.5"><button type="button" aria-label="หน้าก่อน" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-base disabled:opacity-40">‹</button>{page} / {pages}<button type="button" aria-label="หน้าถัดไป" disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="h-9 w-9 rounded-lg border border-gray-300 bg-white text-base disabled:opacity-40">›</button></span>}
    </div>);
  const phoneTiles: [Filter, string, number, string][] = [['low', 'ต้องเติม', counts.low, VIZ.secondary], ['out', 'หมด', counts.out, VIZ.accent], ['expired', 'หมดอายุ', counts.expired, VIZ.accent], ['near', 'ใกล้หมดอายุ', counts.near, VIZ.secondary]];
  return (
    <div className="space-y-4">
      <SetupChecklist state={state} onAddItem={() => setEdit({ open: true, item: null })} />
      {(state.lots.length > 0 || state.issueReports.some(r => r.status === 'open')) && <TodoBox state={state} scope={scope} rows={state.lots.length > 0 ? rows : []} onReports={() => setReportsOpen(true)} onFilter={f => { setFilter(f); setCat('all'); setQ(''); document.getElementById('fa-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} onBulkExpiry={() => setBulkExpiry(true)} onReorder={() => void exportReorder()} reorderBusy={reorderBusy} />}
      {/* Phone: the four numbers that call for action, each one a filter. The full six-card strip needs a wider screen. */}
      <section className="grid grid-cols-4 gap-1.5 sm:hidden" aria-label="สรุป">
        {phoneTiles.map(([f, label, n, color]) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(filter === f ? 'all' : f)} className={`min-h-[3.75rem] rounded-xl border bg-white px-1 py-2 text-center shadow-sm ${filter === f ? 'border-gray-800' : 'border-gray-100'}`}><span className="block text-xl font-semibold leading-tight tabular-nums" style={{ color: n ? color : VIZ.neutral }}>{fmtInt(n)}</span><span className="block text-xs leading-tight text-gray-600">{label}</span></button>)}
      </section>
      <section className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3" aria-label="สรุป">
        <Stat label="รายการทั้งหมด" value={fmtInt(counts.all)} sub={categories.slice(0, 3).map(([c, n]) => `${c} ${n}`).join(' · ')} />
        <Stat label="เพียงพอ" value={fmtInt(counts.ok)} color={VIZ.positive} sub="ครบขั้นต่ำทุกจุด" />
        <Stat label="ต้องเติม" value={fmtInt(counts.low)} color={VIZ.secondary} sub="ต่ำกว่าขั้นต่ำ" />
        <Stat label="หมด" value={fmtInt(counts.out)} color={VIZ.accent} sub="คงเหลือ 0" />
        <Stat label="หมดอายุ / ใกล้หมด 90 วัน" value={<>{fmtInt(counts.expired)} <span className="text-base" style={{ color: VIZ.secondary }}>/ {fmtInt(counts.near)}</span></>} color={VIZ.accent} sub="รายการ" />
        <Stat label="รอวันหมดอายุ" value={fmtInt(counts.pending)} color={VIZ.lightText} sub="ยังจ่ายไม่ได้จนกว่าจะยืนยัน" />
      </section>

      <section id="fa-list" className="flex flex-wrap items-center gap-2 scroll-mt-28" aria-label="ตัวกรอง">
        <label className="relative flex-1 min-w-[200px] max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
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

      {/* Phone: one card per item — name in full, balance and status always on screen, no sideways scrolling. */}
      <section className="space-y-2 md:hidden" aria-label="รายการยา">
        {visible.length === 0 && <p className="rounded-xl border border-gray-100 bg-white px-4 py-10 text-center text-gray-600">{state.items.length === 0 ? 'ยังไม่มีรายการยา — กด “เพิ่มยา” เพื่อเริ่ม' : 'ไม่พบรายการ'}</p>}
        {visible.map(({ item, st }) => {
          const d = st.nearest ? daysUntil(st.nearest.expiry) : null; const expC = d !== null && d < 0 ? VIZ.accent : d !== null && d <= 90 ? '#9a5410' : VIZ.lightText;
          const notes = [
            !item.trackExpiry ? '' : st.nearest ? <span key="e" style={{ color: expC }}>หมดอายุเร็วสุด {thaiDate(st.nearest.expiry, { short: true })}{d !== null && d <= 90 ? ` (${relativeDays(st.nearest.expiry)})` : ''}</span> : st.pendingQty > 0 ? <span key="e">ยังไม่ระบุวันหมดอายุ</span> : '',
            st.expiredQty > 0 ? <span key="x" style={{ color: VIZ.accent }}>หมดอายุค้าง {fmtInt(st.expiredQty)}</span> : '',
            st.min > 0 ? <span key="m">ขั้นต่ำ {fmtInt(st.min)}</span> : '',
            locations.length > 1 ? <span key="p">{locations.map(l => `${l.name} ${fmtInt(balance(state, item.id, l.id))}`).join(' · ')}</span> : '',
          ].filter(Boolean);
          return (
            <article key={item.id} className="rounded-xl border border-gray-100 bg-white shadow-sm">
              <button type="button" onClick={() => setSelected(item.id)} className="flex w-full items-start gap-3 px-3 pt-3 text-left" aria-label={`ดูรายละเอียด ${item.name}`}>
                <ItemImage item={item} size={48} rounded={10} />
                <span className="min-w-0 flex-1"><span className="block break-words font-semibold leading-snug text-gray-900">{item.name}</span><span className="mt-0.5 block truncate text-xs text-gray-600">{itemSub(item)}{item.dispenseMode === 'fixed' ? ' · ประจำจุด' : item.dispenseMode === 'shared' ? ' · แบ่งใช้' : ''}</span></span>
                <span className="shrink-0 text-right"><span className="block whitespace-nowrap text-xl font-semibold leading-tight tabular-nums" style={{ color: st.key === 'out' || st.key === 'expired' ? VIZ.accent : st.key === 'low' ? '#9a5410' : VIZ.text }}>{fmtInt(st.balance)} <span className="text-xs font-normal text-gray-600">{item.unit}</span></span><span className="mt-1 block"><StatusBadge status={st.key} item={item} /></span></span>
              </button>
              <div className="flex items-end gap-2 px-3 pb-3 pt-2">
                <span className="min-w-0 flex-1 text-xs leading-relaxed text-gray-600">{notes.map((n, i) => <span key={i}>{i > 0 && ' · '}{n}</span>)}</span>
                {action(item, st, cardBtn)}
              </div>
            </article>);
        })}
        <div className="rounded-xl border border-gray-100 bg-white">{pager}</div>
      </section>

      <section className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {/* Fixed layout: every column except the point columns has its own width, so long names and dates stay inside their column;
            each extra point adds room instead of squeezing the others. */}
        <table className="w-full text-sm table-fixed" style={{ minWidth: 760 + Math.max(0, locations.length - 2) * 90 }}>
          <thead><tr className="text-xs text-gray-500 bg-gray-50/80 border-b border-gray-100 [&>th]:align-bottom">
            <th className={`text-left font-medium px-3 py-2 ${locations.length > 2 ? 'w-[28%]' : 'w-[34%]'}`}>ชื่อยา</th><th className="text-left font-medium px-2 py-2 hidden lg:table-cell w-[88px]">หมวด</th>
            {/* Point names can be long: they wrap inside their own column (two lines, full name on hover) instead of running over the next one. */}
            {locations.length > 1 && locations.map(l => <th key={l.id} title={l.name} className="text-right font-medium px-2 py-2 hidden md:table-cell align-bottom leading-tight"><span className="line-clamp-2 break-words">{l.name}</span></th>)}
            <th className="text-right font-medium pl-2 pr-14 py-2 w-[116px] whitespace-nowrap">คงเหลือ</th><th className="text-right font-medium px-2 py-2 hidden sm:table-cell w-[60px]">ขั้นต่ำ</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell w-[118px] whitespace-nowrap">หมดอายุเร็วสุด</th><th className="text-left font-medium px-2 py-2 w-[124px]">สถานะ</th><th className="px-2 py-2 w-[124px]" />
          </tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">{state.items.length === 0 ? 'ยังไม่มีรายการยา — กด “เพิ่มยา” เพื่อเริ่ม' : 'ไม่พบรายการ'}</td></tr>}
            {visible.map(({ item, st }) => {
              const d = st.nearest ? daysUntil(st.nearest.expiry) : null; const expC = d !== null && d < 0 ? VIZ.accent : d !== null && d <= 90 ? VIZ.secondary : VIZ.text;
              return (
                <tr key={item.id} className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${selected === item.id ? 'bg-[#4E79A7]/5' : ''}`} onClick={() => setSelected(item.id)}>
                  <td className="px-3 py-1.5"><div className="flex items-center gap-2.5"><ItemImage item={item} size={34} rounded={8} /><div className="min-w-0"><div className="font-semibold text-gray-900 truncate">{item.name}</div><div className="text-xs text-gray-500 truncate">{itemSub(item)} · {item.unit}{item.dispenseMode === 'fixed' ? ' · ประจำจุด' : item.dispenseMode === 'shared' ? ' · แบ่งใช้' : ''}</div></div></div></td>
                  <td className="px-2 py-2 text-gray-500 hidden lg:table-cell">{item.category}</td>
                  {locations.length > 1 && locations.map(l => { const b = balance(state, item.id, l.id); return <td key={l.id} className="px-2 py-2 text-right tabular-nums hidden md:table-cell" style={{ color: b === 0 ? VIZ.neutral : VIZ.text }}>{b === 0 ? '—' : fmtInt(b)}</td>; })}
                  <td className="px-2 py-2 text-right tabular-nums">{/* number and unit sit in two fixed slots so the numbers line up down the column whatever the unit */}<div className="flex items-baseline justify-end gap-1.5"><b style={{ color: st.key === 'out' || st.key === 'expired' ? VIZ.accent : st.key === 'low' ? VIZ.secondary : VIZ.text }}>{fmtInt(st.balance)}</b><span className="w-[2.625rem] shrink-0 truncate text-left text-xs text-gray-500" title={item.unit}>{item.unit}</span></div>{st.expiredQty > 0 && <div className="text-xs" style={{ color: VIZ.accent }}>+{fmtInt(st.expiredQty)} หมดอายุ</div>}{st.pendingQty > 0 && <div className="text-xs text-gray-500">+{fmtInt(st.pendingQty)} {item.dispenseMode === 'fixed' ? 'รอวันครบกำหนด' : 'รอวันหมดอายุ'}</div>}{st.opened && <div className="text-xs" style={{ color: st.opened.expired ? VIZ.accent : VIZ.lightText }}>{st.opened.expired ? 'ขวดที่เปิดเกินกำหนด' : 'เปิดใช้อยู่'}{st.opened.until ? ` · ถึง ${thaiDate(st.opened.until, { short: true })}` : ''}</div>}<Bar value={st.balance} max={st.min} color={STATUS_COLOR[st.key === 'pending' ? 'ok' : st.key]} /></td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-500 hidden sm:table-cell">{st.min || '—'}</td>
                  <td className="px-2 py-2 hidden sm:table-cell" style={{ color: expC }}>{!item.trackExpiry ? <span className="text-gray-500">ไม่ติดตาม</span> : st.nearest ? <><span className="whitespace-nowrap">{thaiDate(st.nearest.expiry)}</span>{d !== null && d <= 90 && <div className="text-xs whitespace-nowrap">{relativeDays(st.nearest.expiry)}</div>}</> : st.pendingQty > 0 ? <span className="text-gray-500">ยังไม่ระบุ</span> : <span className="text-gray-500">—</span>}</td>
                  <td className="px-2 py-2"><StatusBadge status={st.key} item={item} /></td>
                  <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>{action(item, st, tableBtn)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-gray-100">{pager}</div>
      </section>

      <ItemDetail item={selectedItem} onClose={() => setSelected(null)} onDispense={() => setDispense(selectedItem)} onWriteOff={() => setWriteOff(selectedItem)} onEdit={() => setEdit({ open: true, item: selectedItem })} onLot={(lot, item) => setLotEdit({ lot, item })} onArchived={msg => { setSelected(null); setToast({ type: 'success', msg }); }} />
      <DispenseModal item={dispense} onClose={() => setDispense(null)} onDone={msg => setToast({ type: 'success', msg })} />
      <WriteOffModal item={writeOff} onClose={() => setWriteOff(null)} onDone={msg => setToast({ type: 'success', msg })} />
      <ItemFormModal open={edit.open} item={edit.item} onClose={() => setEdit({ open: false, item: null })} onSaved={id => { setEdit({ open: false, item: null }); setSelected(id); setToast({ type: 'success', msg: 'บันทึกรายการแล้ว' }); }} />
      <LotExpiryModal lot={lotEdit?.lot || null} item={lotEdit?.item || null} onClose={() => setLotEdit(null)} onDone={msg => setToast({ type: 'success', msg })} />
      <IssueReportsModal open={reportsOpen} onClose={() => setReportsOpen(false)} onDone={msg => setToast({ type: 'success', msg })} />
      <BulkExpiryModal open={bulkExpiry} onClose={() => setBulkExpiry(false)} onDone={msg => setToast({ type: 'success', msg })} />
      <ToastView toast={toast} />
    </div>
  );
}

function ItemDetail({ item, onClose, onDispense, onWriteOff, onEdit, onLot, onArchived }: { item: FaItem | null; onClose: () => void; onDispense: () => void; onWriteOff: () => void; onEdit: () => void; onLot: (lot: FaLot, item: FaItem) => void; onArchived: (msg: string) => void }) {
  const { state, company, refresh } = useFa();
  const [archive, setArchive] = useState<{ itemId: string; busy: boolean; error: string }>({ itemId: '', busy: false, error: '' });
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
  // Switching an item off hides it from every working page, so it is only offered once nothing of it is left on the books (expired stock included).
  const onBooks = physicalQty(state, item.id);
  const arch = archive.itemId === item.id ? archive : { itemId: item.id, busy: false, error: '' };
  async function archiveItem(target: FaItem) {
    setArchive({ itemId: target.id, busy: true, error: '' });
    try {
      await manage(company, { action: 'archive-item', id: target.id, active: false });
      await refresh().catch(() => undefined);
      setArchive({ itemId: '', busy: false, error: '' });
      onArchived(`ปิดใช้งาน ${target.name} แล้ว · เปิดใช้ใหม่ได้ที่ ตั้งค่า → ทะเบียนยา`);
    } catch (e) { setArchive({ itemId: target.id, busy: false, error: errMsg(e) }); }
  }
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
            <tr key={l.id} className="border-t border-gray-100"><td className="py-1.5">{loc?.name}<div className="text-xs text-gray-500">{l.code}</div></td>
              <td className="py-1.5" style={{ color: d !== null && d < 0 ? VIZ.accent : d !== null && d <= 90 ? VIZ.secondary : VIZ.text }}>{l.expiry ? <>{thaiDate(l.expiry)}{d !== null && d < 0 && <span className="text-xs"> · {fixed ? 'เกินกำหนด' : 'หมดอายุแล้ว'}</span>}{fixed && <button type="button" className="ml-2 text-xs underline text-gray-500" onClick={() => onLot(l, item)}>แก้วันที่</button>}</> : item.trackExpiry ? <button type="button" className="text-xs underline" style={{ color: VIZ.secondary }} onClick={() => onLot(l, item)}>{fixed ? 'ระบุวันครบกำหนด' : 'ระบุวันหมดอายุ'}</button> : <span className="text-gray-500">ไม่ติดตาม</span>}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtInt(l.quantity)}</td></tr>); })}
        </tbody></table>)}
      {!fixed && <><h3 className="text-sm font-semibold mb-2">จ่าย 6 เดือนล่าสุด</h3>
      <div className="flex items-end gap-1.5 h-16 mb-1" role="img" aria-label={months.map((m, i) => `${thaiPeriod(m)} ${perMonth[i]}`).join(', ')}>
        {perMonth.map((v, i) => <div key={months[i]} className="flex-1 flex flex-col justify-end items-center"><span className="text-xs text-gray-600">{v || ''}</span><div className="w-full rounded-t" style={{ height: `${Math.max(2, (v / max) * 48)}px`, background: i === 5 ? VIZ.neutral : VIZ.primary }} /></div>)}
      </div>
      <div className="flex gap-1.5 text-xs text-gray-500 mb-5">{months.map(m => <span key={m} className="flex-1 text-center">{thaiPeriod(m).split(' ')[0]}</span>)}</div></>}
      <h3 className="text-sm font-semibold mb-2">รายการล่าสุด</h3>
      {events === null ? <p className="text-sm text-gray-500">กำลังโหลด…</p> : events.length === 0 ? <p className="text-sm text-gray-500">ไม่มีรายการใน 6 เดือน</p> : (
        <ul className="text-sm divide-y divide-gray-100">{events.slice(0, 15).map(e => <li key={e.id} className="py-1.5 flex justify-between gap-2"><span>{thaiDate(e.date)} · <b style={{ color: e.kind === 'issue' ? VIZ.text : e.kind === 'receive' ? VIZ.positive : VIZ.accent }}>{KIND_LABEL[e.kind]} {fmtInt(e.quantity)}</b> {personLabel(e.requester) && <span className="text-gray-500">· {personLabel(e.requester)}</span>}{e.note && <span className="text-gray-500"> · {e.note.slice(0, 40)}</span>}</span><span className="text-xs text-gray-500 whitespace-nowrap">{state.locations.find(l => l.id === e.locationId)?.name?.slice(0, 14)}</span></li>)}</ul>)}
      {expiredLots(state, item.id).length > 0 && <p className="mt-4 text-xs" style={{ color: VIZ.accent }}>{fixed ? `เกินวันครบกำหนด ${fmtInt(st.expiredQty)} ${item.unit} — ตรวจหรือเปลี่ยนแล้วกด “แก้วันที่” เพื่อใส่รอบใหม่` : `มีของหมดอายุ ${fmtInt(st.expiredQty)} ${item.unit} — ตัดทิ้งได้ที่หน้า ตรวจนับ`}</p>}
      <section className="mt-6 border-t border-gray-100 pt-4" aria-label="ปิดใช้งานรายการนี้">
        <h3 className="text-sm font-semibold mb-1">ไม่ใช้รายการนี้แล้ว</h3>
        <p className="text-xs text-gray-500 mb-3">ปิดใช้งานแล้วรายการนี้จะไม่แสดงในหน้ารายการยา จ่ายยา และตรวจนับ · ประวัติเดิมยังอยู่ครบ · เปิดใช้ใหม่ได้ที่ ตั้งค่า → ทะเบียนยา</p>
        <ConfirmButton label="ปิดใช้งาน" confirmLabel="ยืนยันปิดใช้งาน?" danger disabled={onBooks > 0 || arch.busy} onConfirm={() => void archiveItem(item)} />
        {onBooks > 0 && <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>ยังปิดไม่ได้ — มีของในระบบ {fmtInt(onBooks)} {item.unit}{st.expiredQty > 0 ? ` (หมดอายุ ${fmtInt(st.expiredQty)})` : ''} · {fixed ? 'กด “ชำรุด / หาย” ด้านล่างเพื่อตัดออกให้เหลือ 0 ก่อน' : <>จ่ายออก หรือปรับยอดให้เหลือ 0 ที่หน้า <Link href="/first-aid/count" className="underline">ตรวจนับ</Link> ก่อน</>}</p>}
        {arch.error && <p className="mt-2 text-xs" role="alert" style={{ color: VIZ.accent }}>{arch.error}</p>}
      </section>
    </Drawer>
  );
}

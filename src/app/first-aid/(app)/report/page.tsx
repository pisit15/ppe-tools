'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { FaEvent } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, KIND_LABEL, Spinner, Stat, ToastView, VIZ, bangkokToday, btnSecondary, currentPeriod, daysUntil, errMsg, expiryDays, fmtInt, loadHistory, personLabel, shiftPeriod, thaiDate, thaiPeriod, useFa, useToast } from '../../_components/fa';

type Tab = 'tally' | 'months' | 'expiry' | 'history';
const daysIn = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const isWeekend = (period: string, d: number) => { const [y, m] = period.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 || w === 6; };

export default function ReportPage() {
  const { state, loading, scope, company } = useFa();
  const { toast, setToast } = useToast();
  const [tab, setTab] = useState<Tab>('tally');
  const [period, setPeriod] = useState(currentPeriod());
  const [events, setEvents] = useState<FaEvent[] | null>(null);
  const [year, setYear] = useState<FaEvent[] | null>(null);
  const [dayPick, setDayPick] = useState<{ itemId: string; day: number } | null>(null);
  useEffect(() => {
    if (!state) return; let cancelled = false; setEvents(null);
    const to = period === currentPeriod() ? bangkokToday() : `${period}-${String(daysIn(period)).padStart(2, '0')}`;
    loadHistory(company, `${period}-01`, to).then(r => { if (!cancelled) setEvents(r.events); }).catch(e => { if (!cancelled) { setEvents([]); setToast({ type: 'error', msg: errMsg(e) }); } });
    return () => { cancelled = true; };
  }, [state, period, company, setToast]);
  useEffect(() => {
    if (!state || tab !== 'months' || year) return; let cancelled = false;
    loadHistory(company, `${shiftPeriod(currentPeriod(), -11)}-01`, bangkokToday()).then(r => { if (!cancelled) setYear(r.events); }).catch(() => { if (!cancelled) setYear([]); });
    return () => { cancelled = true; };
  }, [state, tab, year, company]);
  const scoped = useMemo(() => (events || []).filter(e => scope === 'all' || e.locationId === scope), [events, scope]);
  const locName = state?.locations.find(l => l.id === scope)?.name || '';

  const tally = useMemo(() => {
    if (!state) return [];
    const n = daysIn(period); const map = new Map<string, number[]>();
    for (const e of scoped) { if (e.kind !== 'issue') continue; const d = Number(e.date.slice(8, 10)); const arr = map.get(e.itemId) || Array(n).fill(0); arr[d - 1] += e.quantity; map.set(e.itemId, arr); }
    return [...map.entries()].map(([id, days]) => ({ item: state.items.find(i => i.id === id) || state.archivedItems.find(i => i.id === id), id, days, total: days.reduce((a, b) => a + b, 0) })).filter(r => r.item).sort((a, b) => b.total - a.total);
  }, [scoped, period, state]);
  const issues = scoped.filter(e => e.kind === 'issue');
  const workdays = Array.from({ length: daysIn(period) }, (_, i) => i + 1).filter(d => !isWeekend(period, d) && `${period}-${String(d).padStart(2, '0')}` <= bangkokToday()).length;

  async function exportExcel() {
    if (!state) return;
    try {
      const { tallyWorkbook } = await import('@/lib/first-aid/report-export');
      const buf = await tallyWorkbook(company, period, daysIn(period), tally.map(r => ({ name: r.item!.name, unit: r.item!.unit, days: r.days, total: r.total })), locName);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = `First aid report_${company.toUpperCase()}_${period}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }

  if (loading || !state) return <Spinner />;
  const seg = (t: Tab, label: string) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap ${tab === t ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>;
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden max-w-full overflow-x-auto" role="tablist">{seg('tally', 'ตารางจ่ายยารายวัน')}{seg('months', 'สรุป 12 เดือน')}{seg('expiry', 'หมดอายุ 12 เดือนข้างหน้า')}{seg('history', 'ประวัติทุกรายการ')}</div>
        {(tab === 'tally' || tab === 'history') && <div className="flex items-center gap-1.5"><button type="button" className={btnSecondary} onClick={() => setPeriod(p => shiftPeriod(p, -1))}>‹</button><b className="text-sm min-w-[110px] text-center">{thaiPeriod(period, true)}</b><button type="button" className={btnSecondary} disabled={period >= currentPeriod()} onClick={() => setPeriod(p => shiftPeriod(p, 1))}>›</button></div>}
        <div className="flex-1" />
        {tab === 'tally' && <><button type="button" className={btnSecondary} onClick={() => void exportExcel()}><Download size={15} />Excel (รูปแบบเดิม)</button><button type="button" className={btnSecondary} onClick={() => window.print()}><Printer size={15} />พิมพ์</button></>}
      </section>

      {tab === 'tally' && (<>
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 print:hidden">
          <Stat label="จ่ายทั้งเดือน" value={events ? fmtInt(issues.length) : '…'} color={FA_GREEN} sub={`รายการ · ${workdays} วันทำงาน`} />
          <Stat label="เฉลี่ย/วันทำงาน" value={events ? (workdays ? (issues.length / workdays).toFixed(1) : '0') : '…'} sub="รายการ" />
          <Stat label="จ่ายมากสุด" value={<span className="text-base">{tally[0]?.item?.name || '—'}</span>} sub={tally.length > 1 ? `${tally[1].item?.name} · ${tally.length} รายการที่มีการจ่าย` : undefined} />
          <Stat label="รับเข้า" value={events ? fmtInt(scoped.filter(e => e.kind === 'receive').length) : '…'} color={VIZ.positive} sub="รายการ" />
          <Stat label="ตัดทิ้ง / โอน" value={events ? `${fmtInt(scoped.filter(e => e.kind === 'dispose').length)} / ${fmtInt(scoped.filter(e => e.kind === 'transfer').length)}` : '…'} color={VIZ.accent} sub="รายการ" />
        </section>
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-auto max-h-[70vh] print:max-h-none print:overflow-visible">
          {events === null ? <Spinner /> : tally.length === 0 ? <p className="px-4 py-10 text-center text-sm text-gray-500">ไม่มีการจ่ายยาใน{thaiPeriod(period, true)}</p> : (
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10"><tr className="bg-gray-50 text-gray-500">
                <th className="sticky left-0 bg-gray-50 text-left font-medium px-2 py-1.5 min-w-[180px] border-b border-r border-gray-200">ยา · {thaiPeriod(period)}</th>
                {Array.from({ length: daysIn(period) }, (_, i) => i + 1).map(d => <th key={d} className={`font-medium px-1 py-1.5 text-right min-w-[26px] border-b border-gray-200 ${isWeekend(period, d) ? 'bg-gray-100' : ''}`}>{d}</th>)}
                <th className="font-medium px-2 py-1.5 text-right border-b border-l border-gray-200" style={{ background: `${FA_GREEN}14` }}>รวม</th>
              </tr></thead>
              <tbody>{tally.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="sticky left-0 bg-white px-2 py-1 border-r border-gray-200 whitespace-nowrap"><div className="flex items-center gap-2"><ItemImage item={r.item!} size={24} rounded={6} /><b className="text-gray-900">{r.item!.name}</b><span className="text-gray-400">{r.item!.unit}</span></div></td>
                  {r.days.map((v, i) => <td key={i} className={`px-1 py-1 text-right tabular-nums ${isWeekend(period, i + 1) ? 'bg-gray-50' : ''}`}>{v ? <button type="button" className="underline decoration-dotted hover:text-[#4E79A7]" onClick={() => setDayPick({ itemId: r.id, day: i + 1 })}>{fmtInt(v)}</button> : <span className="text-gray-300">·</span>}</td>)}
                  <td className="px-2 py-1 text-right tabular-nums font-semibold border-l border-gray-200" style={{ background: `${FA_GREEN}0F` }}>{fmtInt(r.total)}</td>
                </tr>))}
                <tr className="font-semibold bg-gray-50"><td className="sticky left-0 bg-gray-50 px-2 py-1 border-r border-gray-200">รวม</td>{Array.from({ length: daysIn(period) }, (_, i) => tally.reduce((s, r) => s + r.days[i], 0)).map((v, i) => <td key={i} className="px-1 py-1 text-right tabular-nums">{v || ''}</td>)}<td className="px-2 py-1 text-right tabular-nums border-l border-gray-200">{fmtInt(tally.reduce((s, r) => s + r.total, 0))}</td></tr>
              </tbody>
            </table>)}
        </section>
        <p className="text-xs text-gray-500 print:hidden">แถว = ยา · คอลัมน์ = วันที่ (เสาร์–อาทิตย์เทา) · ช่องเดียวกับ Excel “First aid report” เดิม · คลิกตัวเลข = รายการวันนั้น · แสดงเฉพาะยาที่มีการจ่าย ({tally.length} จาก {state.items.length})</p>
        {dayPick && (() => { const list = issues.filter(e => e.itemId === dayPick.itemId && Number(e.date.slice(8, 10)) === dayPick.day); const it = state.items.find(i => i.id === dayPick.itemId); return (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 print:hidden">
            <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-gray-900">{it?.name} · {thaiDate(`${period}-${String(dayPick.day).padStart(2, '0')}`, { withDay: true })}</h3><button type="button" className="text-sm text-gray-500" onClick={() => setDayPick(null)}>ปิด</button></div>
            <ul className="text-sm divide-y divide-gray-100">{list.map(e => <li key={e.id} className="py-1.5 flex flex-wrap justify-between gap-2"><span>{fmtInt(e.quantity)} {it?.unit} {personLabel(e.requester) && <span className="text-gray-500">· {personLabel(e.requester)}</span>}{e.note && <span className="text-gray-400"> · {e.note}</span>}</span><span className="text-xs text-gray-400">{e.recordingMode === 'legacy' ? 'นำเข้าจาก Excel' : e.recordingMode === 'self_service' ? 'หยิบเอง (QR)' : e.recordedBy.name} · {state.locations.find(l => l.id === e.locationId)?.name}</span></li>)}</ul>
          </section>); })()}
      </>)}

      {tab === 'months' && <MonthsTab events={year} />}
      {tab === 'expiry' && <ExpiryTab />}
      {tab === 'history' && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          {events === null ? <Spinner /> : scoped.length === 0 ? <p className="px-4 py-10 text-center text-sm text-gray-500">ไม่มีรายการ</p> : (
            <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2">วันที่</th><th className="text-left font-medium px-2 py-2">ประเภท</th><th className="text-left font-medium px-2 py-2">ยา</th><th className="text-right font-medium px-2 py-2">จำนวน</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">จุด</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell">ผู้เบิกยา</th><th className="text-left font-medium px-2 py-2 hidden lg:table-cell">ล็อต</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">หมายเหตุ</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">ผู้บันทึก</th></tr></thead>
              <tbody>{scoped.map(e => { const it = state.items.find(i => i.id === e.itemId) || state.archivedItems.find(i => i.id === e.itemId); const c = e.kind === 'issue' ? VIZ.text : e.kind === 'receive' ? VIZ.positive : e.kind === 'transfer' ? VIZ.primary : VIZ.accent; return (
                <tr key={e.id} className="border-t border-gray-50"><td className="px-3 py-1.5 whitespace-nowrap">{e.datePrecision === 'month' ? thaiPeriod(e.date.slice(0, 7)) : thaiDate(e.date)}</td><td className="px-2 py-1.5 font-medium" style={{ color: c }}>{KIND_LABEL[e.kind]}</td><td className="px-2 py-1.5">{it?.name || '?'}</td><td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{e.kind === 'issue' || e.kind === 'dispose' ? '−' : '+'}{fmtInt(e.quantity)} {it?.unit}</td><td className="px-2 py-1.5 text-gray-500 hidden md:table-cell">{state.locations.find(l => l.id === e.locationId)?.name}{e.destinationId ? ` → ${state.locations.find(l => l.id === e.destinationId)?.name}` : ''}</td><td className="px-2 py-1.5 hidden sm:table-cell">{personLabel(e.requester) || <span className="text-gray-300">—</span>}</td><td className="px-2 py-1.5 text-xs text-gray-500 hidden lg:table-cell">{e.allocations.map(a => `${a.code}${a.expiry ? ` / ${thaiDate(a.expiry, { short: true })}` : ''} ×${a.quantity}`).join('; ')}</td><td className="px-2 py-1.5 text-gray-500 hidden md:table-cell max-w-[260px] truncate">{e.note}</td><td className="px-2 py-1.5 text-gray-500 hidden md:table-cell">{e.recordingMode === 'legacy' ? 'Excel' : e.recordingMode === 'self_service' ? 'QR' : e.recordedBy.name}</td></tr>); })}</tbody></table>)}
          {events && <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">{fmtInt(scoped.length)} รายการใน{thaiPeriod(period, true)}</p>}
        </section>)}
      <ToastView toast={toast} />
    </div>
  );
}

function MonthsTab({ events }: { events: FaEvent[] | null }) {
  const { state, scope } = useFa();
  if (!state) return null;
  if (events === null) return <Spinner />;
  const months = Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), i - 11));
  const scoped = events.filter(e => scope === 'all' || e.locationId === scope);
  const perMonth = months.map(m => ({ m, issues: scoped.filter(e => e.kind === 'issue' && e.date.startsWith(m)).length, receives: scoped.filter(e => e.kind === 'receive' && e.date.startsWith(m)).length, disposes: scoped.filter(e => e.kind === 'dispose' && e.date.startsWith(m)).length }));
  const max = Math.max(1, ...perMonth.map(p => p.issues));
  const byItem = new Map<string, number[]>();
  for (const e of scoped) { if (e.kind !== 'issue') continue; const idx = months.indexOf(e.date.slice(0, 7)); if (idx < 0) continue; const arr = byItem.get(e.itemId) || Array(12).fill(0); arr[idx] += e.quantity; byItem.set(e.itemId, arr); }
  const rows = [...byItem.entries()].map(([id, arr]) => ({ item: state.items.find(i => i.id === id) || state.archivedItems.find(i => i.id === id), arr, total: arr.reduce((a, b) => a + b, 0) })).filter(r => r.item).sort((a, b) => b.total - a.total).slice(0, 40);
  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="font-semibold text-gray-900 mb-3">จำนวนรายการจ่ายต่อเดือน</h3>
        <div className="flex items-end gap-1.5 h-32" role="img" aria-label={perMonth.map(p => `${thaiPeriod(p.m)} ${p.issues}`).join(', ')}>{perMonth.map((p, i) => <div key={p.m} className="flex-1 flex flex-col justify-end items-center"><span className="text-[11px] text-gray-600">{p.issues || ''}</span><div className="w-full rounded-t" style={{ height: `${Math.max(2, (p.issues / max) * 100)}px`, background: i === 11 ? VIZ.neutral : VIZ.primary }} /></div>)}</div>
        <div className="flex gap-1.5 text-[11px] text-gray-500 mt-1">{months.map(m => <span key={m} className="flex-1 text-center">{thaiPeriod(m).split(' ')[0]}</span>)}</div>
      </section>
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs"><thead><tr className="text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2 min-w-[180px]">ยา (40 อันดับ · จำนวนหน่วยที่จ่าย)</th>{months.map(m => <th key={m} className="text-right font-medium px-1.5 py-2">{thaiPeriod(m).split(' ')[0]}</th>)}<th className="text-right font-medium px-2 py-2" style={{ background: `${FA_GREEN}14` }}>รวม</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.item!.id} className="border-t border-gray-50"><td className="px-3 py-1 whitespace-nowrap"><div className="flex items-center gap-2"><ItemImage item={r.item!} size={22} rounded={5} /><b className="text-gray-900">{r.item!.name}</b><span className="text-gray-400">{r.item!.unit}</span></div></td>{r.arr.map((v, i) => <td key={i} className="px-1.5 py-1 text-right tabular-nums">{v ? fmtInt(v) : <span className="text-gray-300">·</span>}</td>)}<td className="px-2 py-1 text-right tabular-nums font-semibold" style={{ background: `${FA_GREEN}0F` }}>{fmtInt(r.total)}</td></tr>)}</tbody></table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-gray-500">ไม่มีการจ่ายใน 12 เดือน</p>}
      </section>
    </div>
  );
}

function ExpiryTab() {
  const { state, scope } = useFa();
  if (!state) return null;
  const lots = state.lots.filter(l => l.quantity > 0 && l.expiry && (scope === 'all' || l.locationId === scope) && (expiryDays(l.expiry, state.asOf) ?? 999) <= 365).sort((a, b) => a.expiry!.localeCompare(b.expiry!));
  const groups = [{ label: 'หมดอายุแล้ว', test: (d: number) => d < 0, color: VIZ.accent }, { label: 'ภายใน 30 วัน', test: (d: number) => d >= 0 && d <= 30, color: VIZ.accent }, { label: '31–90 วัน', test: (d: number) => d > 30 && d <= 90, color: VIZ.secondary }, { label: '91–365 วัน', test: (d: number) => d > 90, color: VIZ.text }];
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">{groups.map(g => <Stat key={g.label} label={g.label} value={fmtInt(lots.filter(l => g.test(daysUntil(l.expiry) ?? 0)).length)} color={g.color} sub="ล็อต" />)}</section>
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {lots.length === 0 ? <p className="px-4 py-10 text-center text-sm text-gray-500">ไม่มีล็อตที่จะหมดอายุใน 12 เดือน</p> : (
          <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2">หมดอายุ</th><th className="text-left font-medium px-2 py-2">ยา</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell">จุด · ล็อต</th><th className="text-right font-medium px-2 py-2">จำนวน</th><th className="text-left font-medium px-2 py-2">สถานะ</th></tr></thead>
            <tbody>{lots.map(l => { const it = state.items.find(i => i.id === l.itemId); const d = daysUntil(l.expiry) ?? 0; const c = d < 30 ? VIZ.accent : d <= 90 ? VIZ.secondary : VIZ.text; return (
              <tr key={l.id} className="border-t border-gray-50"><td className="px-3 py-1.5 whitespace-nowrap" style={{ color: c }}>{thaiDate(l.expiry)}<span className="text-xs"> · {d < 0 ? `หมดอายุแล้ว ${-d} วัน` : `อีก ${d} วัน`}</span></td><td className="px-2 py-1.5"><div className="flex items-center gap-2">{it && <ItemImage item={it} size={26} rounded={6} />}<span className="font-medium text-gray-900">{it?.name}</span></div></td><td className="px-2 py-1.5 text-gray-500 hidden sm:table-cell">{state.locations.find(x => x.id === l.locationId)?.name} · {l.code}</td><td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(l.quantity)} {it?.unit}</td><td className="px-2 py-1.5 text-xs" style={{ color: c }}>{d < 0 ? 'ตัดทิ้งที่หน้าตรวจนับ' : d <= 30 ? 'ใช้ให้หมดก่อน / เตรียมสั่ง' : d <= 90 ? 'ใกล้หมดอายุ' : 'ปกติ'}</td></tr>); })}</tbody></table>)}
      </section>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import type { FaEvent, FaState } from '@/lib/first-aid/types';
import { healthLabel, healthRows, HEALTH_GROUPS } from '@/lib/first-aid/health';
import { VIZ, expiryDays, fmtInt, itemStatus, thaiDate, thaiPeriod } from '../../_components/fa';

const NO_DEPT = 'ไม่ระบุ';
function top<T>(rows: T[], key: (row: T) => string, limit: number) {
  const m = new Map<string, number>(); for (const r of rows) { const k = key(r); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th')).slice(0, limit);
}

/**
 * One page for the month, made to be printed or saved as PDF and handed to management: what was dispensed and for
 * which complaints, by which departments, and where the stock stands. Use and complaints are the chosen month's;
 * the stock position is always today's (the system keeps no month-end snapshot), and the page says so.
 * No personal names anywhere: department is the finest detail.
 */
export function MonthlySummary({ state, scope, period, events, locName }: { state: FaState; scope: string; period: string; events: FaEvent[]; locName: string }) {
  const points = state.locations.filter(l => !l.isRegister && (scope === 'all' || l.id === scope));
  const data = useMemo(() => {
    const allItems = [...state.items, ...state.archivedItems];
    const rows = healthRows(events, allItems, state.locations);
    const illness = rows.filter(r => HEALTH_GROUPS.find(g => g.id === r.group)?.illness);
    const issues = events.filter(e => e.kind === 'issue');
    const tickets = new Set(issues.map(e => e.documentId)).size;
    const selfTickets = new Set(issues.filter(e => e.recordingMode === 'self_service').map(e => e.documentId)).size;
    const days = new Set(issues.filter(e => e.datePrecision === 'day').map(e => e.date)).size;
    const qty = new Map<string, { name: string; unit: string; lines: number; total: number }>();
    for (const r of rows) { const q = qty.get(r.itemId) || { name: r.item, unit: r.unit, lines: 0, total: 0 }; q.lines += 1; q.total += r.quantity; qty.set(r.itemId, q); }
    const stock = state.items.map(item => ({ item, st: itemStatus(state, item, scope) }));
    const ever = new Set(state.lots.filter(l => scope === 'all' || l.locationId === scope).map(l => l.itemId));
    const refill = stock.filter(r => (r.st.key === 'low' || r.st.key === 'out') && (r.st.min > 0 || ever.has(r.item.id))).sort((a, b) => (a.st.balance - a.st.min) - (b.st.balance - b.st.min));
    const lots = state.lots.filter(l => l.quantity > 0 && (scope === 'all' || l.locationId === scope));
    const itemById = new Map(state.items.map(i => [i.id, i]));
    const expired = lots.filter(l => l.expiry && (expiryDays(l.expiry, state.asOf) ?? 0) < 0);
    const near = lots.filter(l => { const d = expiryDays(l.expiry, state.asOf); return d !== null && d >= 0 && d <= 90; }).sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
    const pending = lots.filter(l => !l.expiry && itemById.get(l.itemId)?.trackExpiry);
    return {
      tickets, selfTickets, lines: issues.filter(e => e.usage !== 'open').length, days, illness: illness.length,
      receives: events.filter(e => e.kind === 'receive').length, disposals: events.filter(e => e.kind === 'dispose').length,
      groups: top(illness, r => healthLabel(r.group), 6), depts: top(illness.filter(r => r.department && r.department !== NO_DEPT), r => r.department, 6),
      deptKnown: illness.filter(r => r.department && r.department !== NO_DEPT).length,
      meds: [...qty.values()].sort((a, b) => b.lines - a.lines || b.total - a.total).slice(0, 8),
      refill, expired, near, pending, itemById,
    };
  }, [state, events, scope]);
  const counted = (locationId: string) => state.inspections.filter(i => i.locationId === locationId && i.date.startsWith(period)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const card = 'rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid print:rounded-none print:border-gray-300 print:p-3';
  const h = 'text-sm font-semibold text-gray-900';
  const bars = (list: [string, number][], color: string, empty: string) => list.length === 0 ? <p className="mt-2 text-sm text-gray-600">{empty}</p> : (
    <ul className="mt-2 space-y-1.5">{list.map(([label, n]) => (
      <li key={label} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 text-sm">
        <span className="min-w-0"><span className="block truncate text-gray-800">{label}</span><span className="mt-0.5 block h-1.5 rounded" style={{ width: `${Math.max(4, Math.round((n / list[0][1]) * 100))}%`, background: color, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} /></span>
        <b className="text-right tabular-nums text-gray-900">{fmtInt(n)}</b>
      </li>))}</ul>);
  const num = (label: string, value: number, note?: string, color?: string) => <div className="rounded-lg border border-gray-200 px-3 py-2 print:rounded-none"><div className="text-xs text-gray-600">{label}</div><div className="text-2xl font-semibold leading-tight tabular-nums" style={{ color: color && value ? color : VIZ.text }}>{fmtInt(value)}</div>{note && <div className="text-xs text-gray-600">{note}</div>}</div>;
  return (
    <article className="mx-auto max-w-4xl space-y-3 text-gray-800 print:max-w-none print:space-y-2" aria-label="สรุปรายเดือน">
      <header className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold text-gray-900">First Aid · สรุปประจำเดือน {thaiPeriod(period, true)}</h2><span className="text-sm text-gray-600">{state.company.name} · {locName || `ทุกจุด (${points.length})`}</span></div>
        <p className="mt-0.5 text-xs text-gray-600">ออกรายงาน {thaiDate(state.asOf)} · การจ่ายยาและอาการเป็นของเดือนที่เลือก · สถานะสต๊อกและวันหมดอายุเป็นของวันที่ออกรายงาน · ไม่มีชื่อบุคคลในรายงานนี้</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {num('ใบจ่ายยา', data.tickets, data.selfTickets ? `หยิบเองผ่าน QR ${fmtInt(data.selfTickets)} ใบ` : `ใน ${fmtInt(data.days)} วัน`)}
          {num('รายการที่จ่าย', data.lines, `เกี่ยวกับอาการเจ็บป่วย ${fmtInt(data.illness)}`)}
          {num('รับเข้า', data.receives, 'รายการ')}
          {num('ตัดทิ้ง / ชำรุด / สูญหาย', data.disposals, 'รายการ', VIZ.accent)}
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2 print:gap-2">
        <section className={card}><h3 className={h}>อาการที่พบบ่อย</h3><p className="text-xs text-gray-600">นับเป็นรายการเบิก ไม่ใช่จำนวนคน · จากอาการที่ระบุ หรืออนุมานจากยา</p>{bars(data.groups, VIZ.primary, 'เดือนนี้ไม่มีรายการเบิกที่เกี่ยวกับอาการเจ็บป่วย')}</section>
        <section className={card}><h3 className={h}>แผนกที่เบิกมาก</h3><p className="text-xs text-gray-600">ระบุแผนก {fmtInt(data.deptKnown)} จาก {fmtInt(data.illness)} รายการ</p>{bars(data.depts, VIZ.secondary, 'ยังไม่มีรายการที่ระบุแผนก — เลือกแผนกตอนจ่ายยาเพื่อให้ส่วนนี้มีข้อมูล')}</section>
      </div>
      <section className={card}>
        <h3 className={h}>ยาและเวชภัณฑ์ที่จ่ายมากที่สุด</h3>
        {data.meds.length === 0 ? <p className="mt-2 text-sm text-gray-600">เดือนนี้ยังไม่มีการจ่าย</p> : (
          <table className="mt-2 w-full text-sm"><thead><tr className="text-xs text-gray-600"><th className="py-1 text-left font-medium">รายการ</th><th className="py-1 text-right font-medium">จำนวนครั้ง</th><th className="py-1 text-right font-medium">จำนวนรวม</th></tr></thead>
            <tbody>{data.meds.map(m => <tr key={m.name} className="border-t border-gray-100"><td className="py-1 pr-2">{m.name}</td><td className="py-1 text-right tabular-nums">{fmtInt(m.lines)}</td><td className="py-1 text-right tabular-nums">{fmtInt(m.total)} {m.unit}</td></tr>)}</tbody></table>)}
      </section>
      <section className={card}>
        <h3 className={h}>สถานะสต๊อก ณ {thaiDate(state.asOf)}</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {num('ต้องเติม', data.refill.length, `หมดแล้ว ${fmtInt(data.refill.filter(r => r.st.key === 'out').length)}`, '#9a5410')}
          {num('หมดอายุค้างในตู้', data.expired.length, 'ล็อต', VIZ.accent)}
          {num('หมดอายุใน 90 วัน', data.near.length, 'ล็อต', '#9a5410')}
          {num('ยังไม่มีวันหมดอายุ', data.pending.length, 'ล็อต · ยังจ่ายไม่ได้')}
        </div>
        <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2 print:grid-cols-2">
          <div><div className="text-xs font-medium text-gray-700">ต้องเติม (คงเหลือ / ขั้นต่ำ)</div>{data.refill.length === 0 ? <p className="mt-1 text-sm text-gray-600">ไม่มี</p> : <ul className="mt-1 text-sm">{data.refill.slice(0, 10).map(r => <li key={r.item.id} className="flex justify-between gap-2 border-t border-gray-100 py-0.5"><span className="min-w-0 truncate">{r.item.name}</span><span className="shrink-0 tabular-nums">{fmtInt(r.st.balance)} / {r.st.min ? fmtInt(r.st.min) : '—'} {r.item.unit}</span></li>)}{data.refill.length > 10 && <li className="border-t border-gray-100 py-0.5 text-xs text-gray-600">และอีก {fmtInt(data.refill.length - 10)} รายการ</li>}</ul>}</div>
          <div><div className="text-xs font-medium text-gray-700">หมดอายุแล้ว / จะหมดใน 90 วัน</div>{data.expired.length + data.near.length === 0 ? <p className="mt-1 text-sm text-gray-600">ไม่มี</p> : <ul className="mt-1 text-sm">{[...data.expired, ...data.near].slice(0, 10).map(l => <li key={l.id} className="flex justify-between gap-2 border-t border-gray-100 py-0.5"><span className="min-w-0 truncate">{data.itemById.get(l.itemId)?.name || '—'}</span><span className="shrink-0 tabular-nums" style={{ color: (expiryDays(l.expiry, state.asOf) ?? 0) < 0 ? VIZ.accent : VIZ.text }}>{thaiDate(l.expiry, { short: true })} · {fmtInt(l.quantity)}</span></li>)}{data.expired.length + data.near.length > 10 && <li className="border-t border-gray-100 py-0.5 text-xs text-gray-600">และอีก {fmtInt(data.expired.length + data.near.length - 10)} ล็อต</li>}</ul>}</div>
        </div>
      </section>
      <section className={card}>
        <h3 className={h}>การตรวจนับประจำเดือน</h3>
        {points.length === 0 ? <p className="mt-2 text-sm text-gray-600">ยังไม่มีจุดปฐมพยาบาล</p> : (
          <table className="mt-2 w-full text-sm"><thead><tr className="text-xs text-gray-600"><th className="py-1 text-left font-medium">จุด</th><th className="py-1 text-left font-medium">ตรวจนับในเดือนนี้</th><th className="py-1 text-left font-medium">ตรวจล่าสุด</th></tr></thead>
            <tbody>{points.map(p => { const c = counted(p.id); return <tr key={p.id} className="border-t border-gray-100"><td className="py-1 pr-2">{p.name}</td><td className="py-1 pr-2" style={{ color: c ? VIZ.positive : VIZ.accent }}>{c ? `ตรวจแล้ว ${thaiDate(c.date, { short: true })}${c.hasIssue ? ' · พบปัญหา' : ''}` : 'ยังไม่ได้ตรวจ'}</td><td className="py-1">{p.lastChecked ? thaiDate(p.lastChecked) : 'ยังไม่เคยตรวจ'}</td></tr>; })}</tbody></table>)}
      </section>
      <footer className="hidden grid-cols-2 gap-10 px-2 pt-10 text-sm print:grid"><div className="border-t border-gray-500 pt-1 text-center">ผู้จัดทำ / วันที่</div><div className="border-t border-gray-500 pt-1 text-center">ผู้ตรวจสอบ / วันที่</div></footer>
    </article>
  );
}

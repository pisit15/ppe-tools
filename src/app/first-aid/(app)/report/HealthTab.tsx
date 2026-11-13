'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { FaEvent } from '@/lib/first-aid/types';
import { CHANNEL_LABEL, HEALTH_GROUPS, SOURCE_LABEL, healthLabel, healthRows, itemHealthGroup, type HealthGroupId } from '@/lib/first-aid/health';
import { FA_GREEN, Spinner, Stat, VIZ, bangkokToday, btnSecondary, currentPeriod, errMsg, fmtInt, shiftPeriod, thaiPeriod, useFa } from '../../_components/fa';

const NO_DEPT = 'ไม่ระบุ';
const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(n / of < 0.1 ? 1 : 0)}%` : '—');

/** Dispenses of the last 12 months grouped by what people came for (see lib/first-aid/health.ts for the rules). */
export function HealthTab({ events, onError }: { events: FaEvent[] | null; onError: (msg: string) => void }) {
  const { state, scope, company } = useFa();
  const [sel, setSel] = useState<HealthGroupId | null>(null);
  const [busy, setBusy] = useState(false);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftPeriod(currentPeriod(), i - 11)), []);
  const rows = useMemo(() => {
    if (!state || !events) return [];
    return healthRows(events, [...state.items, ...state.archivedItems], [...state.locations, ...state.archivedLocations])
      .filter(r => (scope === 'all' || r.locationId === scope) && months.includes(r.month));
  }, [events, state, scope, months]);
  const stats = useMemo(() => {
    const illnessIds = new Set(HEALTH_GROUPS.filter(g => g.illness).map(g => g.id));
    const ill = rows.filter(r => illnessIds.has(r.group));
    const groups = HEALTH_GROUPS.map(g => { const mine = rows.filter(r => r.group === g.id); return { ...g, perMonth: months.map(m => mine.filter(r => r.month === m).length), total: mine.length }; })
      .filter(g => g.total > 0).sort((a, b) => Number(b.illness) - Number(a.illness) || b.total - a.total);
    const stated = ill.filter(r => r.source !== 'medicine').length;
    const emptyMonths = months.filter(m => !rows.some(r => r.month === m));
    return { ill, groups, stated, emptyMonths, other: rows.length - ill.length, maxCell: Math.max(1, ...groups.filter(g => g.illness).flatMap(g => g.perMonth)), maxTotal: Math.max(1, ...groups.filter(g => g.illness).map(g => g.total)) };
  }, [rows, months]);

  if (!state) return null;
  if (events === null) return <Spinner />;
  const locName = state.locations.find(l => l.id === scope)?.name || '';
  const focus = sel ? rows.filter(r => r.group === sel) : stats.ill;
  const focusLabel = sel ? healthLabel(sel) : 'ทุกอาการ';
  const tally = (key: (r: (typeof rows)[number]) => string) => { const m = new Map<string, number>(); for (const r of focus) m.set(key(r), (m.get(key(r)) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const byDept = tally(r => r.department || NO_DEPT); const namedDept = byDept.filter(([d]) => d !== NO_DEPT);
  const byItem = tally(r => r.item); const byLocation = tally(r => r.location || '—');
  const top = stats.groups.filter(g => g.illness && g.id !== 'other');
  const monthHead = (m: string, i: number) => { const [name, year] = thaiPeriod(m).split(' '); return i === 0 || m.endsWith('-01') ? `${name} ${String(year).slice(-2)}` : name; };

  async function exportExcel() {
    if (!state) return; setBusy(true);
    try {
      const { healthWorkbook } = await import('@/lib/first-aid/report-export');
      const counts = new Map<string, number>(); for (const r of rows) counts.set(r.itemId, (counts.get(r.itemId) || 0) + 1);
      const itemGroups = [...state.items.filter(i => i.dispenseMode !== 'fixed' || counts.has(i.id)), ...state.archivedItems.filter(i => counts.has(i.id))]
        .map(i => ({ item: i.name, category: i.category, group: healthLabel(itemHealthGroup(i)), lines: counts.get(i.id) || 0 })).sort((a, b) => b.lines - a.lines || a.item.localeCompare(b.item, 'th'));
      const illness = new Map(HEALTH_GROUPS.map(g => [g.id, g.illness]));
      const data = [...rows].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ date: r.date, month: r.month, datePrecision: r.datePrecision, location: r.location, department: r.department, group: healthLabel(r.group), illness: !!illness.get(r.group), source: SOURCE_LABEL[r.source], reason: r.reason, item: r.item, category: r.category, quantity: r.quantity, unit: r.unit, channel: CHANNEL_LABEL[r.channel], documentId: r.documentId }));
      const buf = await healthWorkbook(company, months, data, HEALTH_GROUPS.map(g => ({ label: g.label, illness: g.illness })), itemGroups, locName, bangkokToday());
      const href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = href; a.download = `First aid illness_${company.toUpperCase()}_${months[0]}_${months[11]}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch (e) { onError(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold text-gray-900">อาการเจ็บป่วย · 12 เดือนล่าสุด{locName ? ` · ${locName}` : ''}</h3><p className="text-xs text-gray-500">นับเป็น “รายการเบิก” = ยา 1 ชนิดในการเบิก 1 ครั้ง · ใช้อาการที่ผู้เบิกระบุก่อน ถ้าไม่ได้ระบุจึงอนุมานจากยาที่เบิก</p></div>
        <button type="button" className={btnSecondary} disabled={busy || rows.length === 0} onClick={() => void exportExcel()}><Download size={15} />Excel สำหรับวิเคราะห์ต่อ</button>
      </section>

      {stats.ill.length === 0 ? <section className="bg-white rounded-xl border border-gray-100 shadow-sm"><p className="px-4 py-10 text-center text-sm text-gray-500">ยังไม่มีการเบิกยาใน 12 เดือนนี้</p></section> : (<>
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Stat label="รายการเบิกจากการเจ็บป่วย" value={fmtInt(stats.ill.length)} color={FA_GREEN} sub={stats.other ? `ไม่นับเติมกล่อง / หน้ากาก / วัสดุ ${fmtInt(stats.other)} รายการ` : '12 เดือน'} />
          <Stat label="พบมากที่สุด" value={<span className="text-base leading-tight block">{top[0]?.label || '—'}</span>} color={VIZ.accent} sub={top[0] ? `${pct(top[0].total, stats.ill.length)} · ${fmtInt(top[0].total)} รายการ` : undefined} />
          <Stat label="รองลงมา" value={<span className="text-base leading-tight block">{top[1]?.label || '—'}</span>} sub={top[1] ? `${pct(top[1].total, stats.ill.length)} · ${fmtInt(top[1].total)} รายการ` : undefined} />
          <Stat label="ผู้เบิกระบุอาการเอง" value={pct(stats.stated, stats.ill.length)} color={VIZ.primary} sub={`อีก ${fmtInt(stats.ill.length - stats.stated)} รายการอนุมานจากยา`} />
        </section>

        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="text-gray-500 bg-gray-50/80">
              <th className="sticky left-0 z-10 bg-gray-50 text-left font-medium px-3 py-2 min-w-[150px] sm:min-w-[210px]">กลุ่มอาการ (คลิกเพื่อดูแผนกและยา)</th>
              {months.map((m, i) => <th key={m} className="text-right font-medium px-1.5 py-2 whitespace-nowrap">{monthHead(m, i)}</th>)}
              <th className="text-right font-medium px-2 py-2" style={{ background: `${FA_GREEN}14` }}>รวม</th><th className="text-left font-medium px-2 py-2 min-w-[120px]">สัดส่วน</th>
            </tr></thead>
            <tbody>
              {stats.groups.map(g => { const on = sel === g.id; return (
                <tr key={g.id} className={`border-t border-gray-50 ${on ? 'bg-[#EDF2F7]' : ''} ${g.illness ? '' : 'text-gray-400'}`}>
                  <td className={`sticky left-0 z-10 px-3 py-1.5 ${on ? 'bg-[#EDF2F7]' : 'bg-white'}`}><button type="button" aria-pressed={on} onClick={() => setSel(on ? null : g.id)} className={`text-left hover:underline ${g.illness ? 'font-semibold text-gray-900' : 'italic'}`}>{g.label}</button></td>
                  {g.perMonth.map((v, i) => <td key={i} className="px-1.5 py-1.5 text-right tabular-nums" style={v && g.illness ? { background: `rgba(78,121,167,${(0.08 + 0.5 * (v / stats.maxCell)).toFixed(2)})` } : undefined}>{v ? fmtInt(v) : <span className="text-gray-300">·</span>}</td>)}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ background: `${FA_GREEN}0F` }}>{fmtInt(g.total)}</td>
                  <td className="px-2 py-1.5">{g.illness && <div className="flex items-center gap-2"><div className="h-2 rounded-sm" style={{ width: `${Math.max(2, (g.total / stats.maxTotal) * 70)}px`, background: g.id === top[0]?.id ? VIZ.accent : VIZ.primary }} /><span className="tabular-nums text-gray-600">{pct(g.total, stats.ill.length)}</span></div>}</td>
                </tr>); })}
              <tr className="border-t border-gray-200 font-semibold bg-gray-50"><td className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5">รวมการเจ็บป่วย</td>{months.map(m => { const n = stats.ill.filter(r => r.month === m).length; return <td key={m} className="px-1.5 py-1.5 text-right tabular-nums">{n ? fmtInt(n) : ''}</td>; })}<td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(stats.ill.length)}</td><td /></tr>
            </tbody>
          </table>
          {stats.emptyMonths.length > 0 && <p className="px-3 py-2 text-xs border-t border-gray-100" style={{ color: VIZ.secondary }}>ไม่มีการบันทึกใน {stats.emptyMonths.map(m => thaiPeriod(m)).join(', ')} — ช่องว่างไม่ได้แปลว่าไม่มีผู้เจ็บป่วย</p>}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2 mb-2"><h3 className="font-semibold text-gray-900">แผนก · {focusLabel}</h3>{sel && <button type="button" className="text-xs text-gray-500 underline" onClick={() => setSel(null)}>ดูทุกอาการ</button>}</div>
            {namedDept.length === 0 ? <p className="text-sm text-gray-500">ยังไม่มีรายการที่ระบุแผนก ({fmtInt(focus.length)} รายการไม่ระบุ) — ข้อมูลที่นำเข้าจาก Excel เดิมไม่มีแผนก</p> : (<>
              <BarList rows={namedDept.slice(0, 10)} color={VIZ.primary} />
              <p className="mt-2 text-xs text-gray-500">ระบุแผนก {fmtInt(focus.length - (byDept.find(([d]) => d === NO_DEPT)?.[1] || 0))} จาก {fmtInt(focus.length)} รายการ{namedDept.length > 10 ? ` · แสดง 10 จาก ${namedDept.length} แผนก (ครบใน Excel)` : ''}</p>
            </>)}
          </section>
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-2">ยาที่เบิก · {focusLabel}</h3>
            <BarList rows={byItem.slice(0, 10)} color={FA_GREEN} />
            {byItem.length > 10 && <p className="mt-2 text-xs text-gray-500">แสดง 10 จาก {byItem.length} รายการ (ครบใน Excel)</p>}
          </section>
        </div>
        {scope === 'all' && byLocation.length > 1 && (
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-2">จุดปฐมพยาบาล · {focusLabel}</h3>
            <BarList rows={byLocation.slice(0, 10)} color={VIZ.neutral} />
          </section>)}
        <p className="text-xs text-gray-500">การอนุมานจากยาเป็นการประมาณ ไม่ใช่การวินิจฉัยโรค — Paracetamol แยกปวดหัวกับไข้ไม่ได้ ยาแก้แพ้ใช้ได้ทั้งหวัดและภูมิแพ้ · ไฟล์ Excel มีข้อมูลแถวละ 1 รายการเบิก (วันที่ จุด แผนก กลุ่มอาการ ยา จำนวน) ไม่มีชื่อบุคคล พร้อมตารางยา → กลุ่มอาการที่ใช้</p>
      </>)}
    </div>
  );
}

function BarList({ rows, color }: { rows: [string, number][]; color: string }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <ul className="space-y-1.5">{rows.map(([label, n]) => (
      // Phones: the name gets its own line and wraps (never cut off); wider screens: name · bar · count on one row.
      <li key={label} className="text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center sm:gap-2">
        <span className="block text-gray-800 sm:truncate" title={label}>{label}</span>
        <span className="flex items-center gap-2 sm:contents">
          <span className="flex-1 h-2.5 rounded-sm bg-gray-100 overflow-hidden"><span className="block h-full rounded-sm" style={{ width: `${(n / max) * 100}%`, background: color }} /></span>
          <span className="tabular-nums text-gray-700 w-10 text-right">{fmtInt(n)}</span>
        </span>
      </li>))}</ul>
  );
}

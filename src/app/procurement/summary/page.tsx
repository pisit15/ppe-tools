'use client';
export const dynamic = 'force-dynamic';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PR_STATE_LABEL, type PrState, type ProcMeta, type ProcPrSummary } from '@/lib/procurement/types';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PrLink, SortHeader, VIZ, baht, int, sortRows, thaiDate, useJson, type SortState,
} from '../_components/ui';
import {
  ChartTitle, Legend, MONTHS_TH, MonthlyBars, STATUS_COLOR, StackBar, type MonthPoint,
} from '../_components/charts';
import { PeriodBar, usePeriod, validPeriod } from '../_components/period';
import { inRange, periodInfo, thaiDay } from '@/lib/procurement/period';
import styles from './summary-table.module.css';

type Row = ProcPrSummary & { sites: string[] };
type Site = { id: string; name: string };
type Resp = { prs: Row[]; meta: ProcMeta; scope: 'all' | 'company'; sites: Site[] };
type Key = 'requester' | 'total' | 'approved' | 'rejected' | 'reject_rate' | 'pending';
type Stat = {
  requester: string; prs: Row[]; total: number; approved: number; rejected: number; pending: number; reject_rate: number;
};

// Approved = approved in Odoo (waiting for PO) or done (PO issued); cancelled = rejected/cancelled in Odoo.
const isApproved = (s: PrState) => s === 'approved' || s === 'done';
const isPending = (s: PrState) => s === 'draft' || s === 'to_approve';
const yearOf = (p: Row) => (p.request_date ? Number(p.request_date.slice(0, 4)) : null);
const be = (y: number) => `${y + 543}`;
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const signed = (n: number, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${int(Math.abs(n))}${unit}`;

function summarize(rows: Row[], key: (p: Row) => string) {
  const by = new Map<string, Stat>();
  for (const p of rows) {
    const k = key(p);
    const s = by.get(k) ?? { requester: k, prs: [], total: 0, approved: 0, rejected: 0, pending: 0, reject_rate: 0 };
    s.prs.push(p); s.total++;
    if (isApproved(p.state)) s.approved++;
    else if (p.state === 'rejected') s.rejected++;
    else if (isPending(p.state)) s.pending++;
    by.set(k, s);
  }
  for (const s of by.values()) s.reject_rate = s.total ? s.rejected / s.total : 0;
  return [...by.values()];
}
const total = (rows: Row[]) => summarize(rows, () => 'all')[0] ?? null;
const statusParts = (s: Stat) => [
  { value: s.approved, color: STATUS_COLOR.approved, label: 'อนุมัติ' },
  { value: s.pending, color: STATUS_COLOR.pending, label: 'ร่าง / รออนุมัติ' },
  { value: s.rejected, color: STATUS_COLOR.rejected, label: 'ไม่อนุมัติ / ยกเลิก' },
];

export default function SummaryPage() {
  const { data, error, loading } = useJson<Resp>('/api/procurement/summary');
  const [site, setSite] = useState<string>('all');
  const allPrs = useMemo(() => data?.prs ?? [], [data]);
  const prs = useMemo(() => allPrs.filter(p => site === 'all' || p.sites.includes(site)), [allPrs, site]);
  const { sel: requested, setSel } = usePeriod();
  const activeYear = validPeriod(requested, data?.meta);
  const setYear = (y: number | 'all') => setSel(y);
  const [sort, setSort] = useState<SortState<Key>>({ key: 'total', dir: 'desc' });
  const [open, setOpen] = useState<string | null>(null);
  const [queue, setQueue] = useState<'all' | 'draft' | 'to_approve' | 'approved'>('all');
  const limited = data?.scope === 'company';

  // Same rules as every other page: the running year is cut at the import day and compared with the same span last year.
  const meta = data?.meta;
  const view = useMemo(() => {
    if (activeYear === 'all' || !meta) return null;
    const y = activeYear;
    const info = periodInfo(y, meta, 'pr');
    const isCurrent = info.partial;
    const cur = prs.filter(p => inRange(p.request_date, info.range));
    const hasPrev = !!info.prev;
    const prev = info.prev ? prs.filter(p => inRange(p.request_date, info.prev)) : [];
    const lastMonth = Number(info.range!.to.slice(5, 7)) - 1;
    const months: MonthPoint[] = MONTHS_TH.map((_, m) => {
      const mm = String(m + 1).padStart(2, '0');
      const inM = (rows: Row[], yy: number) => rows.filter(p => p.request_date?.startsWith(`${yy}-${mm}`)).length;
      return {
        cur: inM(cur, y), prev: hasPrev ? inM(prs.filter(p => yearOf(p) === y - 1), y - 1) : null,
        partial: isCurrent && m === lastMonth, future: m > lastMonth,
      };
    });
    return {
      y, isCurrent, cur, prevSame: prev, hasPrev, months, lastMonth,
    };
  }, [activeYear, prs, meta]);

  const inYear = useMemo(() => prs.filter(p => activeYear === 'all' || yearOf(p) === activeYear), [prs, activeYear]);
  const people = useMemo(() => sortRows(summarize(inYear, p => p.requester), sort, (s, k) => s[k]), [inYear, sort]);
  const queued = useMemo(() => inYear.filter(p => queue === 'all' || p.state === queue), [inYear, queue]);
  const tablePeople = useMemo(() => sortRows(summarize(queued, p => p.requester), sort, (s, k) => s[k]), [queued, sort]);
  const t = useMemo(() => total(inYear), [inYear]);
  const tp = useMemo(() => (view?.hasPrev ? total(view.prevSame) : null), [view]);
  const maxTotal = Math.max(1, ...tablePeople.map(p => p.total));
  const byYear = useMemo(() => summarize(prs, p => String(yearOf(p) ?? '–')).sort((a, b) => b.requester.localeCompare(a.requester)), [prs]);

  // Action title — the conclusion, not the topic.
  let headline = '';
  let headSub = '';
  if (t && view) {
    const period = view.isCurrent && meta ? `ปี ${be(view.y)} (ถึง ${thaiDay(meta.as_of, false)})` : `ปี ${be(view.y)}`;
    headline = `${period} เปิด PR ${int(t.total)} ฉบับ อนุมัติแล้ว ${pctOf(t.approved, t.total)}%`;
    if (tp) headline += ` · ${t.total >= tp.total ? 'มากกว่า' : 'น้อยกว่า'}ช่วงเดียวกันปีก่อน ${int(Math.abs(t.total - tp.total))} ฉบับ`;
    headSub = `ร่าง / รออนุมัติ ${int(t.pending)} ฉบับ · ไม่อนุมัติ / ยกเลิก ${int(t.rejected)} ฉบับ · สถานะตามข้อมูลที่นำเข้าล่าสุด`;
  } else if (t) {
    headline = `ทุกปีรวม ${int(t.total)} ฉบับ อนุมัติแล้ว ${pctOf(t.approved, t.total)}%`;
    headSub = `ร่าง / รออนุมัติ ${int(t.pending)} ฉบับ · ไม่อนุมัติ / ยกเลิก ${int(t.rejected)} ฉบับ`;
  }
  const busiest = view ? view.months.reduce((b, m, i) => (m.cur > view.months[b].cur ? i : b), 0) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">ติดตามงานและสรุปรายคน</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>ตรวจงานที่ต้องดำเนินการต่อและสถานะ PR รายคน</p>
        <div className="mt-1"><MetaLine meta={data?.meta} /></div>
      </div>
      {error && <ErrorBox error={error} />}
      {loading && <Loading />}
      {data && limited && (
        <p className="text-sm" style={{ color: VIZ.lightText }}>สรุปเฉพาะบริษัทที่คุณรับผิดชอบ: <b style={{ color: VIZ.text }}>{data.sites.map(s => s.name).join(', ') || 'ยังไม่ได้ระบุบริษัท'}</b> · ดู PR ของทุกบริษัทได้ที่เมนูรายการ PR</p>
      )}
      {data && limited && !allPrs.length && (
        <Card><p className="text-sm">ยังไม่มี PR ของบริษัทที่คุณรับผิดชอบในข้อมูลที่นำเข้า</p></Card>
      )}
      {data && allPrs.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            <PeriodBar meta={data.meta} sel={activeYear} onChange={y => { setYear(y); setOpen(null); }} measure="pr" />
            {data.sites.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกบริษัท">
                {[{ id: 'all', name: limited ? 'ทุกบริษัทที่รับผิดชอบ' : 'ทุกบริษัท' }, ...data.sites].map(s => (
                  <button key={s.id} aria-pressed={site === s.id} onClick={() => { setSite(s.id); setOpen(null); }} className="rounded-lg px-3 py-1 text-sm"
                    style={site === s.id ? { background: VIZ.text, color: 'white' } : { border: `1px solid ${VIZ.muted}`, background: 'white' }}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {t && (
            <Card>
              <p className="text-lg font-bold leading-snug" style={{ color: VIZ.text }}>{headline}</p>
              {headSub && <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>{headSub}</p>}
            </Card>
          )}

          {t && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Kpi label="PR ที่เปิด" value={int(t.total)}
                sub={tp ? `${signed(t.total - tp.total, ' ฉบับ')} เทียบช่วงเดียวกันปีก่อน (${int(tp.total)})` : `${int(people.length)} คน`} />
              <Kpi label="อนุมัติแล้ว" value={`${pctOf(t.approved, t.total)}%`} color={VIZ.primary}
                sub={`${int(t.approved)} ฉบับ${tp ? ` · ปีก่อน ${pctOf(tp.approved, tp.total)}%` : ''}`} />
              <Kpi label="ไม่อนุมัติ / ยกเลิก" value={int(t.rejected)} color={VIZ.accent}
                sub={`${pctOf(t.rejected, t.total)}% ของที่เปิด · ต้นทางรวมสองสถานะนี้ไว้ด้วยกัน`} />
            </div>
          )}

          <Card><p className="font-medium">ยอดงบรวมและกราฟงบยังไม่พร้อมแสดง</p><p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>ข้อมูลประมาณการ PR และยอด PO ใน PR ไม่ได้ระบุสกุลเงิน จึงไม่รวมตัวเลขข้ามเอกสาร กรุณาเปิด PR เพื่อตรวจจำนวนและสกุลเงินจากเอกสารต้นทาง</p></Card>

          <section aria-label="งานที่ต้องดำเนินการต่อ" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">งานที่ต้องดำเนินการต่อ</h3>
              <button type="button" onClick={() => { setQueue('all'); setOpen(null); }} className="text-sm font-medium hover:underline" style={{ color: VIZ.primary }}>ดูทุกสถานะ ({int(inYear.length)})</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['draft', 'to_approve', 'approved'] as const).map(state => (
                <button key={state} type="button" aria-pressed={queue === state} onClick={() => { setQueue(queue === state ? 'all' : state); setOpen(null); }}
                  className="rounded-xl border bg-white px-4 py-4 text-left transition-colors hover:bg-slate-50"
                  style={{ borderColor: queue === state ? VIZ.primary : VIZ.muted }}>
                  <span className="block text-sm" style={{ color: VIZ.lightText }}>{PR_STATE_LABEL[state]}</span>
                  <span className="mt-2 block text-2xl font-semibold tabular-nums" style={{ color: VIZ.text }}>{int(inYear.filter(p => p.state === state).length)} <span className="text-xs font-normal">ฉบับ</span></span>
                </button>
              ))}
            </div>
          </section>
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 pt-4 md:px-6">
              <ChartTitle title={`รายละเอียดรายคน · ${queue === 'all' ? 'ทุกสถานะ' : PR_STATE_LABEL[queue]}`} sub={`แสดง ${int(queued.length)} PR จาก ${int(tablePeople.length)} คน · กดชื่อเพื่อดูรายการ PR · ตัวเลขในตารางคำนวณตามสถานะที่เลือก`} />
              <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>ข้อมูลต้นทางรวม “ไม่อนุมัติ” กับ “ยกเลิก” ไว้ด้วยกัน สัดส่วนนี้ใช้ติดตามสถานะ ไม่ใช่คะแนนประเมินผลงาน</p>
              <p className="mt-2 text-xs md:hidden" style={{ color: VIZ.lightText }}>เลื่อนตารางไปด้านข้างเพื่อดูตัวเลขเพิ่มเติม · ชื่อผู้เปิด PR จะอยู่ทางซ้าย</p>
            </div>
            <div className={`overflow-x-auto ${styles.scrollTable}`} role="region" aria-label="ตารางรายละเอียดรายคน เลื่อนซ้ายขวาเพื่อดูข้อมูลเพิ่มเติม" tabIndex={0}>
              <table className="w-full text-sm">
                <thead style={{ background: VIZ.bg }}>
                  <tr>
                    <SortHeader label="ผู้เปิด PR" k="requester" sort={sort} onSort={setSort} />
                    <SortHeader label="PR ทั้งหมด" k="total" sort={sort} onSort={setSort} />
                    <SortHeader label="อนุมัติ" k="approved" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="ไม่อนุมัติ / ยกเลิก" k="rejected" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="สัดส่วน" k="reject_rate" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="ร่าง / รออนุมัติ" k="pending" sort={sort} onSort={setSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {tablePeople.map(s => {
                    const expanded = open === s.requester;
                    return (
                      <Fragment key={s.requester}>
                        <tr className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.requester)} className="inline-flex items-center gap-1 text-left" style={{ color: VIZ.primary }}>
                              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{s.requester}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex min-w-[9rem] items-center gap-2">
                              <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{int(s.total)}</span>
                              <div className="flex-1"><StackBar parts={statusParts(s)} max={maxTotal} /></div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{int(s.approved)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.rejected ? VIZ.accent : undefined, fontWeight: s.rejected ? 600 : 400 }}>{int(s.rejected)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: VIZ.lightText }}>{Math.round(s.reject_rate * 100)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.pending ? '#B5600F' : undefined }}>{int(s.pending)}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-t border-gray-100" style={{ background: '#FAFAFA' }}>
                            <td colSpan={6} className="px-3 py-3">
                              <ul className="divide-y divide-gray-100">
                                {[...s.prs].sort((a, b) => (b.request_date || '').localeCompare(a.request_date || '')).map(p => (
                                  <li key={p.odoo_id} className="grid grid-cols-1 gap-x-3 py-2 md:grid-cols-[9rem_6rem_1fr_9rem_8rem]">
                                    <span><PrLink no={p.pr_no} by={p.requester} /></span>
                                    <span style={{ color: VIZ.lightText }}>{thaiDate(p.request_date)}</span>
                                    <span className="min-w-0">{p.title}{p.vendors && <span className="block text-xs" style={{ color: VIZ.lightText }}>{p.vendors}</span>}</span>
                                    <span className="text-xs font-medium" style={{ color: isApproved(p.state) ? VIZ.primary : p.state === 'rejected' ? VIZ.accent : '#B5600F' }}>{PR_STATE_LABEL[p.state]}</span>
                                    <span className="tabular-nums md:text-right">{baht(p.estimated_cost)}<span className="block text-xs" style={{ color: VIZ.lightText }}>สกุลเงินไม่ระบุ · ตรวจเอกสารต้นทาง</span></span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {tablePeople.length === 0 && <p className="px-6 py-10 text-center text-sm" style={{ color: VIZ.lightText }}>ไม่มี PR ในสถานะและช่วงเวลาที่เลือก</p>}
            </div>
            <div className="flex flex-wrap items-center gap-4 px-4 py-3">
              <Legend items={[{ color: STATUS_COLOR.approved, label: 'อนุมัติ (รวมที่ออก PO แล้ว)' }, { color: STATUS_COLOR.pending, label: 'รออนุมัติ / ร่าง' }, { color: STATUS_COLOR.rejected, label: 'ไม่อนุมัติ / ยกเลิก' }]} />
              <span className="text-xs" style={{ color: VIZ.lightText }}>สัดส่วน = ไม่อนุมัติ / ยกเลิก ต่อ PR ทั้งหมด · ข้อมูลต้นทางยังแยกสองสถานะนี้ไม่ได้</span>
            </div>
          </Card>

          {view && t && (
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <ChartTitle
                  title={`เปิด PR มากที่สุดเดือน ${MONTHS_TH[busiest]} (${int(view.months[busiest].cur)} ฉบับ)`}
                  sub={`จำนวน PR ที่เปิดรายเดือน ปี ${be(view.y)}${view.isCurrent ? ` · เดือน ${MONTHS_TH[view.lastMonth]} ยังไม่ครบเดือน (สีจาง)` : ''}`} />
                <MonthlyBars data={view.months} ariaLabel={`จำนวน PR รายเดือน ปี ${be(view.y)}`} />
                <div className="mt-2">
                  <Legend items={[{ color: VIZ.primary, label: `ปี ${be(view.y)}` }, ...(view.hasPrev ? [{ color: '#555', label: `ปี ${be(view.y - 1)} (เดือนเดียวกัน)`, kind: 'tick' as const }] : [])]} />
                </div>
              </Card>
            </div>
          )}

          {!view && byYear.length > 0 && (
            <Card>
              <ChartTitle title="จำนวน PR และสถานะรายปี" sub={`ความยาวแท่ง = จำนวน PR · สีแยกสถานะ · กดปีเพื่อดูรายเดือนและเทียบปีก่อน${meta ? ` · ปี ${be(Number(meta.as_of.slice(0, 4)))} ถึง ${thaiDay(meta.as_of, false)}` : ''}`} />
              <ul className="space-y-1">
                {byYear.map(s => (
                  <li key={s.requester}>
                    <button type="button" disabled={s.requester === '–'} onClick={() => { setYear(Number(s.requester)); setOpen(null); }}
                      className="grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50">
                      <span className="font-medium hover:underline" style={{ color: VIZ.primary }}>ปี {s.requester === '–' ? '–' : be(Number(s.requester))}</span>
                      <StackBar parts={statusParts(s)} max={Math.max(...byYear.map(b => b.total))} />
                      <span className="tabular-nums">{int(s.total)} ฉบับ · ไม่อนุมัติ / ยกเลิก {pctOf(s.rejected, s.total)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><Legend items={[{ color: STATUS_COLOR.approved, label: 'อนุมัติ' }, { color: STATUS_COLOR.pending, label: 'รออนุมัติ / ร่าง' }, { color: STATUS_COLOR.rejected, label: 'ไม่อนุมัติ / ยกเลิก' }]} /></div>
            </Card>
          )}


        </>
      )}
    </div>
  );
}

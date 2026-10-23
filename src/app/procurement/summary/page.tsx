'use client';
export const dynamic = 'force-dynamic';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PR_STATE_LABEL, type PrState, type ProcMeta, type ProcPrSummary } from '@/lib/procurement/types';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PrLink, SortHeader, VIZ, baht, int, sortRows, thaiDate, useJson, type SortState,
} from '../_components/ui';
import {
  ChartTitle, CumulativeLines, HBarList, Legend, MONTHS_TH, MonthlyBars, STATUS_COLOR, StackBar, shortBaht, type MonthPoint,
} from '../_components/charts';
import { PeriodBar, usePeriod, validPeriod } from '../_components/period';
import { inRange, periodInfo, thaiDay } from '@/lib/procurement/period';

type Row = ProcPrSummary & { sites: string[] };
type Site = { id: string; name: string };
type Resp = { prs: Row[]; meta: ProcMeta; scope: 'all' | 'company'; sites: Site[] };
type Key = 'requester' | 'total' | 'approved' | 'rejected' | 'reject_rate' | 'pending' | 'est_all' | 'est_approved' | 'po_amount';
type Stat = {
  requester: string; prs: Row[]; total: number; approved: number; rejected: number; pending: number; reject_rate: number;
  est_all: number; est_approved: number; po_amount: number;
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
    const s = by.get(k) ?? { requester: k, prs: [], total: 0, approved: 0, rejected: 0, pending: 0, reject_rate: 0, est_all: 0, est_approved: 0, po_amount: 0 };
    s.prs.push(p); s.total++;
    const est = Number(p.estimated_cost) || 0;
    s.est_all += est;
    if (isApproved(p.state)) { s.approved++; s.est_approved += est; }
    else if (p.state === 'rejected') s.rejected++;
    else if (isPending(p.state)) s.pending++;
    s.po_amount += Number(p.po_amount) || 0;
    by.set(k, s);
  }
  for (const s of by.values()) s.reject_rate = s.total ? s.rejected / s.total : 0;
  return [...by.values()];
}
const total = (rows: Row[]) => summarize(rows, () => 'all')[0] ?? null;
const statusParts = (s: Stat) => [
  { value: s.approved, color: STATUS_COLOR.approved, label: 'อนุมัติ' },
  { value: s.pending, color: STATUS_COLOR.pending, label: 'รออนุมัติ' },
  { value: s.rejected, color: STATUS_COLOR.rejected, label: 'ยกเลิก' },
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
    const cum = (rows: Row[], yy: number) => {
      const out: number[] = [];
      let acc = 0;
      for (let m = 0; m < 12; m++) {
        const mm = String(m + 1).padStart(2, '0');
        acc += rows.filter(p => p.request_date?.startsWith(`${yy}-${mm}`) && isApproved(p.state)).reduce((s, p) => s + (Number(p.estimated_cost) || 0), 0);
        out.push(acc);
      }
      return out;
    };
    const approvedEst = (rows: Row[]) => rows.filter(p => isApproved(p.state)).reduce((s, p) => s + (Number(p.estimated_cost) || 0), 0);
    return {
      y, isCurrent, cur, prevSame: prev, hasPrev, months, lastMonth,
      cumCur: cum(cur, y), cumPrev: hasPrev ? cum(prs.filter(p => yearOf(p) === y - 1), y - 1) : null, cumPrevSame: hasPrev ? approvedEst(prev) : null,
    };
  }, [activeYear, prs, meta]);

  const inYear = useMemo(() => prs.filter(p => activeYear === 'all' || yearOf(p) === activeYear), [prs, activeYear]);
  const people = useMemo(() => sortRows(summarize(inYear, p => p.requester), sort, (s, k) => s[k]), [inYear, sort]);
  const t = useMemo(() => total(inYear), [inYear]);
  const tp = useMemo(() => (view?.hasPrev ? total(view.prevSame) : null), [view]);
  const maxTotal = Math.max(1, ...people.map(p => p.total));
  const topReject = [...people].sort((a, b) => b.rejected - a.rejected || b.reject_rate - a.reject_rate)[0];
  const byYear = useMemo(() => summarize(prs, p => String(yearOf(p) ?? '–')).sort((a, b) => b.requester.localeCompare(a.requester)), [prs]);

  // Action title — the conclusion, not the topic.
  let headline = '';
  let headSub = '';
  if (t && view) {
    const period = view.isCurrent && meta ? `ปี ${be(view.y)} (ถึง ${thaiDay(meta.as_of, false)})` : `ปี ${be(view.y)}`;
    headline = `${period} เปิด PR ${int(t.total)} ฉบับ อนุมัติแล้ว ${pctOf(t.approved, t.total)}%`;
    if (tp) headline += ` · ${t.total >= tp.total ? 'มากกว่า' : 'น้อยกว่า'}ช่วงเดียวกันปีก่อน ${int(Math.abs(t.total - tp.total))} ฉบับ`;
    headSub = topReject && topReject.rejected ? `ยกเลิก/ไม่อนุมัติมากที่สุด: ${topReject.requester} ${int(topReject.rejected)} ฉบับ (${Math.round(topReject.reject_rate * 100)}% ของที่เปิด)` : 'ไม่มี PR ที่ถูกยกเลิกในช่วงนี้';
  } else if (t) {
    headline = `ทุกปีรวม ${int(t.total)} ฉบับ อนุมัติแล้ว ${pctOf(t.approved, t.total)}% · ยกเลิก ${int(t.rejected)} ฉบับ`;
  }
  const busiest = view ? view.months.reduce((b, m, i) => (m.cur > view.months[b].cur ? i : b), 0) : 0;
  const cumNow = view ? view.cumCur[view.lastMonth] : 0;
  const cumPrevSame = view?.cumPrevSame ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">สรุป PR รายคน รายปี</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>ใช้ติดตามว่าแต่ละคนเปิด PR เท่าไร ผ่านอนุมัติหรือถูกยกเลิกเท่าไร และใช้งบไปแล้วเท่าไรเทียบช่วงเดียวกันปีก่อน</p>
        <div className="mt-1"><MetaLine meta={data?.meta} /></div>
      </div>
      {error && <ErrorBox error={error} />}
      {loading && <Loading />}
      {data && limited && (
        <p className="text-sm" style={{ color: VIZ.lightText }}>แสดงเฉพาะ PR ของบริษัทที่บัญชีคุณมีสิทธิ์: <b style={{ color: VIZ.text }}>{data.sites.map(s => s.name).join(', ') || '–'}</b> และ PR ที่คุณเป็นผู้เปิดเอง</p>
      )}
      {data && limited && !allPrs.length && (
        <Card><p className="text-sm">ยังไม่มี PR ของบริษัทที่คุณมีสิทธิ์ในข้อมูลที่นำเข้า</p></Card>
      )}
      {data && allPrs.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            <PeriodBar meta={data.meta} sel={activeYear} onChange={y => { setYear(y); setOpen(null); }} measure="pr" />
            {data.sites.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกบริษัท">
                {[{ id: 'all', name: 'ทุกบริษัท' }, ...data.sites].map(s => (
                  <button key={s.id} onClick={() => { setSite(s.id); setOpen(null); }} className="rounded-lg px-3 py-1 text-sm"
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="PR ที่เปิด" value={int(t.total)}
                sub={tp ? `${signed(t.total - tp.total, ' ฉบับ')} เทียบช่วงเดียวกันปีก่อน (${int(tp.total)})` : `${int(people.length)} คน`} />
              <Kpi label="อนุมัติแล้ว" value={`${pctOf(t.approved, t.total)}%`} color={VIZ.primary}
                sub={`${int(t.approved)} ฉบับ${tp ? ` · ปีก่อน ${pctOf(tp.approved, tp.total)}%` : ''}`} />
              <Kpi label="ไม่อนุมัติ / ยกเลิก" value={int(t.rejected)} color={VIZ.accent}
                sub={`${pctOf(t.rejected, t.total)}% ของที่เปิด${t.pending ? ` · รออนุมัติอีก ${int(t.pending)}` : ''}`} />
              <Kpi label="งบที่อนุมัติ (บาท)" value={shortBaht(t.est_approved)} color={VIZ.text}
                sub={`ขอทั้งหมด ${shortBaht(t.est_all)} · PO จริง ${shortBaht(t.po_amount)}`} />
            </div>
          )}

          {view && t && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <ChartTitle
                  title={`เปิด PR มากที่สุดเดือน ${MONTHS_TH[busiest]} (${int(view.months[busiest].cur)} ฉบับ)`}
                  sub={`จำนวน PR ที่เปิดรายเดือน ปี ${be(view.y)}${view.isCurrent ? ` · เดือน ${MONTHS_TH[view.lastMonth]} ยังไม่ครบเดือน (สีจาง)` : ''}`} />
                <MonthlyBars data={view.months} ariaLabel={`จำนวน PR รายเดือน ปี ${be(view.y)}`} />
                <div className="mt-2">
                  <Legend items={[{ color: VIZ.primary, label: `ปี ${be(view.y)}` }, ...(view.hasPrev ? [{ color: '#555', label: `ปี ${be(view.y - 1)} (เดือนเดียวกัน)`, kind: 'tick' as const }] : [])]} />
                </div>
              </Card>
              <Card>
                <ChartTitle
                  title={cumPrevSame !== null && cumPrevSame > 0
                    ? `งบที่อนุมัติสะสม ${shortBaht(cumNow)} บาท — ${cumNow >= cumPrevSame ? 'สูงกว่า' : 'ต่ำกว่า'}ช่วงเดียวกันปีก่อน ${Math.abs(Math.round(((cumNow - cumPrevSame) / cumPrevSame) * 100))}%`
                    : `งบที่อนุมัติสะสม ${shortBaht(cumNow)} บาท`}
                  sub="ยอดประมาณการใน PR ที่อนุมัติแล้ว สะสมตามเดือนที่เปิด PR · ขั้นบันไดที่สูงชัน = PR สัญญาใหญ่รายปี" />
                <CumulativeLines cur={view.cumCur} prev={view.cumPrev} prevSame={view.cumPrevSame} curLabel={be(view.y)} prevLabel={be(view.y - 1)} lastMonth={view.lastMonth} />
                <div className="mt-2">
                  <Legend items={[{ color: VIZ.primary, label: `ปี ${be(view.y)}`, kind: 'line' }, ...(view.cumPrev ? [{ color: VIZ.neutral, label: `ปี ${be(view.y - 1)}`, kind: 'line' as const }] : [])]} />
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
                      <span className="tabular-nums">{int(s.total)} ฉบับ · ยกเลิก {pctOf(s.rejected, s.total)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><Legend items={[{ color: STATUS_COLOR.approved, label: 'อนุมัติ' }, { color: STATUS_COLOR.pending, label: 'รออนุมัติ / ร่าง' }, { color: STATUS_COLOR.rejected, label: 'ไม่อนุมัติ / ยกเลิก' }]} /></div>
            </Card>
          )}

          {view && people.length > 1 && (
            <Card>
              <ChartTitle title={`งบที่อนุมัติรายคน ปี ${be(view.y)}`} sub="เรียงจากมากไปน้อย · ใช้ดูว่าภาระงบกระจุกที่ใคร" />
              <HBarList ariaLabel="งบที่อนุมัติรายคน"
                rows={[...people].sort((a, b) => b.est_approved - a.est_approved).slice(0, 10).map((s, i) => ({
                  key: s.requester, label: s.requester, value: s.est_approved, display: `${shortBaht(s.est_approved)} บาท`, highlight: i === 0,
                }))} />
            </Card>
          )}

          <Card className="!p-0 overflow-hidden">
            <div className="px-4 pt-4 md:px-6">
              <ChartTitle title="รายละเอียดรายคน" sub="แท่งใช้สเกลเดียวกันทุกแถว (ความยาว = จำนวน PR) · กดชื่อเพื่อดูรายการ PR" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: VIZ.bg }}>
                  <tr>
                    <SortHeader label="ผู้เปิด PR" k="requester" sort={sort} onSort={setSort} />
                    <SortHeader label="PR ทั้งหมด" k="total" sort={sort} onSort={setSort} />
                    <SortHeader label="อนุมัติ" k="approved" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="ยกเลิก" k="rejected" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="% ยกเลิก" k="reject_rate" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="รออนุมัติ" k="pending" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="งบที่ขอ" k="est_all" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="งบที่อนุมัติ" k="est_approved" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="ยอด PO" k="po_amount" sort={sort} onSort={setSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {people.map(s => {
                    const expanded = open === s.requester;
                    return (
                      <Fragment key={s.requester}>
                        <tr className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setOpen(expanded ? null : s.requester)} aria-expanded={expanded}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1" style={{ color: VIZ.primary }}>
                              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{s.requester}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex min-w-[9rem] items-center gap-2">
                              <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{int(s.total)}</span>
                              <div className="flex-1"><StackBar parts={statusParts(s)} max={maxTotal} /></div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{int(s.approved)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.rejected ? VIZ.accent : undefined, fontWeight: s.rejected ? 600 : 400 }}>{int(s.rejected)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.reject_rate >= 0.2 ? VIZ.accent : VIZ.lightText }}>{Math.round(s.reject_rate * 100)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.pending ? '#B5600F' : undefined }}>{int(s.pending)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{baht(s.est_all)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{baht(s.est_approved)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{baht(s.po_amount)}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-t border-gray-100" style={{ background: '#FAFAFA' }}>
                            <td colSpan={9} className="px-3 py-3">
                              <ul className="divide-y divide-gray-100">
                                {[...s.prs].sort((a, b) => (b.request_date || '').localeCompare(a.request_date || '')).map(p => (
                                  <li key={p.odoo_id} className="grid grid-cols-1 gap-x-3 py-2 md:grid-cols-[9rem_6rem_1fr_9rem_8rem]">
                                    <span><PrLink no={p.pr_no} by={p.requester} /></span>
                                    <span style={{ color: VIZ.lightText }}>{thaiDate(p.request_date)}</span>
                                    <span className="min-w-0">{p.title}{p.vendors && <span className="block text-xs" style={{ color: VIZ.lightText }}>{p.vendors}</span>}</span>
                                    <span className="text-xs font-medium" style={{ color: isApproved(p.state) ? VIZ.primary : p.state === 'rejected' ? VIZ.accent : '#B5600F' }}>{PR_STATE_LABEL[p.state]}</span>
                                    <span className="tabular-nums md:text-right">{baht(p.estimated_cost)} บาท</span>
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
            </div>
            <div className="flex flex-wrap items-center gap-4 px-4 py-3">
              <Legend items={[{ color: STATUS_COLOR.approved, label: 'อนุมัติ (รวมที่ออก PO แล้ว)' }, { color: STATUS_COLOR.pending, label: 'รออนุมัติ / ร่าง' }, { color: STATUS_COLOR.rejected, label: 'ไม่อนุมัติ / ยกเลิก' }]} />
              <span className="text-xs" style={{ color: VIZ.lightText }}>· % ยกเลิก ตั้งแต่ 20% ขึ้นไปแสดงเป็นสีแดง</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

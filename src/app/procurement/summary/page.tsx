'use client';
export const dynamic = 'force-dynamic';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PR_STATE_LABEL, type PrState, type ProcMeta, type ProcPrSummary } from '@/lib/procurement/types';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PrLink, SortHeader, VIZ, baht, int, sortRows, thaiDate, useJson, type SortState,
} from '../_components/ui';

type Row = ProcPrSummary & { sites: string[] };
type Site = { id: string; name: string };
type Resp = { prs: Row[]; meta: ProcMeta; scope: 'all' | 'company'; sites: Site[] };
type Key = 'requester' | 'total' | 'approved' | 'rejected' | 'pending' | 'est_all' | 'est_approved' | 'po_amount';
type PersonStat = {
  requester: string; prs: Row[]; total: number; approved: number; rejected: number; pending: number;
  est_all: number; est_approved: number; po_amount: number;
};

// Approved = approved in Odoo (waiting for PO) or done (PO issued); cancelled = rejected/cancelled in Odoo.
const isApproved = (s: PrState) => s === 'approved' || s === 'done';
const isPending = (s: PrState) => s === 'draft' || s === 'to_approve';
const yearOf = (p: Row) => (p.request_date ? Number(p.request_date.slice(0, 4)) : null);
const beYear = (y: number) => `${y + 543}`;

function summarize(rows: Row[]) {
  const by = new Map<string, PersonStat>();
  for (const p of rows) {
    const s = by.get(p.requester) ?? { requester: p.requester, prs: [], total: 0, approved: 0, rejected: 0, pending: 0, est_all: 0, est_approved: 0, po_amount: 0 };
    s.prs.push(p); s.total++;
    const est = Number(p.estimated_cost) || 0;
    s.est_all += est;
    if (isApproved(p.state)) { s.approved++; s.est_approved += est; }
    else if (p.state === 'rejected') s.rejected++;
    else if (isPending(p.state)) s.pending++;
    s.po_amount += Number(p.po_amount) || 0;
    by.set(p.requester, s);
  }
  return [...by.values()];
}

function StatusBar({ s }: { s: PersonStat }) {
  const w = (n: number) => `${(n / Math.max(1, s.total)) * 100}%`;
  return (
    <div className="flex h-2 w-24 overflow-hidden rounded-full" style={{ background: VIZ.bg }} aria-hidden>
      <div style={{ width: w(s.approved), background: VIZ.positive }} />
      <div style={{ width: w(s.pending), background: VIZ.secondary }} />
      <div style={{ width: w(s.rejected), background: VIZ.accent }} />
    </div>
  );
}

export default function SummaryPage() {
  const { data, error, loading } = useJson<Resp>('/api/procurement/summary');
  const [site, setSite] = useState<string>('all');
  const allPrs = useMemo(() => data?.prs ?? [], [data]);
  const prs = useMemo(() => allPrs.filter(p => site === 'all' || p.sites.includes(site)), [allPrs, site]);
  const years = useMemo(() => [...new Set(prs.map(yearOf).filter((y): y is number => y !== null))].sort((a, b) => b - a), [prs]);
  const [year, setYear] = useState<number | 'all' | null>(null);
  const activeYear = year ?? years[0] ?? 'all';
  const [sort, setSort] = useState<SortState<Key>>({ key: 'total', dir: 'desc' });
  const [open, setOpen] = useState<string | null>(null);
  const limited = data?.scope === 'company';

  const inYear = useMemo(() => prs.filter(p => activeYear === 'all' || yearOf(p) === activeYear), [prs, activeYear]);
  const people = useMemo(() => sortRows(summarize(inYear), sort, (s, k) => s[k]), [inYear, sort]);
  const t = useMemo(() => summarize(inYear.map(p => ({ ...p, requester: 'all' })))[0], [inYear]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">สรุป PR รายคน รายปี</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>นับตามวันที่เปิด PR · งบประมาณ = ยอดประมาณการที่ขอใน PR (ไม่รวม VAT ตามที่กรอกใน Odoo)</p>
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
          <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกปี">
            {[...years, 'all' as const].map(y => (
              <button key={y} onClick={() => { setYear(y); setOpen(null); }} className="rounded-full px-4 py-1.5 text-sm font-medium"
                style={activeYear === y ? { background: VIZ.primary, color: 'white' } : { border: `1px solid ${VIZ.muted}`, background: 'white' }}>
                {y === 'all' ? 'ทุกปี' : `ปี ${beYear(y)}`}
              </button>
            ))}
          </div>
          {t && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="PR ที่เปิด" value={int(t.total)} sub={`${int(people.length)} คน`} />
              <Kpi label="อนุมัติแล้ว" value={int(t.approved)} sub={`${Math.round((t.approved / Math.max(1, t.total)) * 100)}% ของ PR ทั้งหมด`} color={VIZ.positive} />
              <Kpi label="ไม่อนุมัติ / ยกเลิก" value={int(t.rejected)} sub={t.pending ? `รออนุมัติอีก ${int(t.pending)} ฉบับ` : undefined} color={VIZ.accent} />
              <Kpi label="งบที่ขอทั้งหมด" value={baht(t.est_all)} sub="บาท (ทุกสถานะ)" color={VIZ.secondary} />
              <Kpi label="งบที่อนุมัติ" value={baht(t.est_approved)} sub={`ยอด PO จริง ${baht(t.po_amount)} บาท`} color={VIZ.positive} />
            </div>
          )}
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: VIZ.bg }}>
                  <tr>
                    <SortHeader label="ผู้เปิด PR" k="requester" sort={sort} onSort={setSort} />
                    <SortHeader label="PR ทั้งหมด" k="total" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="อนุมัติ" k="approved" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="ยกเลิก" k="rejected" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="รออนุมัติ" k="pending" sort={sort} onSort={setSort} align="right" />
                    <th className="px-3 py-2 text-left font-semibold">สัดส่วน</th>
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
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{int(s.total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: VIZ.positive }}>{int(s.approved)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.rejected ? VIZ.accent : undefined }}>{int(s.rejected)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: s.pending ? VIZ.secondary : undefined }}>{int(s.pending)}</td>
                          <td className="px-3 py-2"><StatusBar s={s} /></td>
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
                                    <span className="text-xs font-medium" style={{ color: isApproved(p.state) ? VIZ.positive : p.state === 'rejected' ? VIZ.accent : VIZ.secondary }}>{PR_STATE_LABEL[p.state]}</span>
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
            <div className="flex flex-wrap gap-4 px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded" style={{ background: VIZ.positive }} />อนุมัติ (รวมที่ออก PO แล้ว)</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded" style={{ background: VIZ.secondary }} />รออนุมัติ / ร่าง</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded" style={{ background: VIZ.accent }} />ไม่อนุมัติ / ยกเลิก</span>
              <span>· กดชื่อเพื่อดูรายการ PR</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

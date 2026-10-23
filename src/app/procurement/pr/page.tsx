'use client';
export const dynamic = 'force-dynamic';

import { PrDetail } from './detail';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  OPEN_PR_STATES, PR_STATE_LABEL, type PrState, type ProcMeta, type ProcPrSummary,
} from '@/lib/procurement/types';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, VIZ,
  baht, inputClass, int, sortRows, thaiDate, useJson, type SortState,
} from '../_components/ui';
import { inRange, periodInfo } from '@/lib/procurement/period';
import { PeriodBar, usePeriod, validPeriod } from '../_components/period';

type Row = ProcPrSummary & { quote_count: number };
type ListResp = { prs: Row[]; meta: ProcMeta };
type Key = 'pr_no' | 'request_date' | 'requester' | 'title' | 'estimated_cost' | 'po_amount' | 'quote_count' | 'state';
type Group = 'all' | 'open' | 'done' | 'rejected';

const GROUPS: { id: Group; label: string; states: PrState[] }[] = [
  { id: 'all', label: 'ทั้งหมด', states: ['draft', 'to_approve', 'approved', 'rejected', 'done'] },
  { id: 'open', label: 'ยังเปิดอยู่', states: OPEN_PR_STATES },
  { id: 'done', label: 'ออก PO แล้ว', states: ['done'] },
  { id: 'rejected', label: 'ไม่อนุมัติ / ยกเลิก', states: ['rejected'] },
];
const STATE_COLOR: Record<PrState, string> = { draft: VIZ.neutral, to_approve: VIZ.secondary, approved: VIZ.primary, rejected: VIZ.accent, done: VIZ.positive };

function StateBadge({ state }: { state: PrState }) {
  return <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: STATE_COLOR[state] }}>{PR_STATE_LABEL[state]}</span>;
}

export default function PrPage() {
  const sp = useSearchParams();
  const no = sp.get('no');
  const by = sp.get('by') || '';
  return no ? <PrDetail key={`${no}|${by}`} no={no} by={by} /> : <PrList />;
}

function PrList() {
  const { data, error, loading } = useJson<ListResp>('/api/procurement/prs');
  const { sel: requested, setSel } = usePeriod();
  const sel = validPeriod(requested, data?.meta);
  const range = useMemo(() => (data?.meta ? periodInfo(sel, data.meta, 'pr').range : null), [data, sel]);
  const [group, setGroup] = useState<Group>('all');
  const [person, setPerson] = useState('');
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortState<Key>>({ key: 'request_date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const prs = useMemo(() => (data?.prs ?? []).filter(p => inRange(p.request_date, range)), [data, range]);
  const people = useMemo(() => [...new Set(prs.map(p => p.requester))].sort(), [prs]);
  const types = useMemo(() => [...new Set(prs.map(p => p.request_type || '(ไม่ระบุ)'))].sort(), [prs]);
  const rows = useMemo(() => {
    const states = GROUPS.find(g => g.id === group)!.states;
    const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = prs.filter(p => states.includes(p.state) && (!person || p.requester === person) && (!type || (p.request_type || '(ไม่ระบุ)') === type)
      && terms.every(t => `${p.pr_no} ${p.title} ${p.vendors} ${p.company} ${p.po_list}`.toLowerCase().includes(t)));
    return sortRows(list, sort, (p, k) => p[k]);
  }, [prs, group, person, type, text, sort]);
  const view = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const reset = () => setPage(0);
  const onSort = (s: SortState<Key>) => { setSort(s); reset(); };
  const counts = useMemo(() => Object.fromEntries(GROUPS.map(g => [g.id, prs.filter(p => g.states.includes(p.state)).length])), [prs]);
  const sumEst = rows.reduce((s, p) => s + Number(p.estimated_cost || 0), 0);
  const sumPo = rows.reduce((s, p) => s + Number(p.po_amount || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">รายการ PR</h2>
        <p className="mt-2 text-sm" style={{ color: VIZ.lightText }}>ติดตามคำขอซื้อ ผู้ขาย และหลักฐานประกอบในที่เดียว</p>
        <div className="mt-1"><MetaLine meta={data?.meta} /></div>
      </div>
      <PeriodBar meta={data?.meta} sel={sel} onChange={s => { setSel(s); setPage(0); }} measure="pr" compare={false} />
      <div className="flex flex-wrap gap-2">
        {GROUPS.map(g => (
          <button key={g.id} onClick={() => { setGroup(g.id); reset(); }} className="rounded-full px-3 py-1 text-sm"
            style={group === g.id ? { background: VIZ.primary, color: 'white' } : { border: `1px solid ${VIZ.muted}`, background: 'white' }}>
            {g.label} <span className="opacity-70">({int(counts[g.id] ?? 0)})</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <input type="search" value={text} onChange={e => { setText(e.target.value); reset(); }} placeholder="ค้นหาเลข PR, ชื่อเรื่อง, ผู้ขาย, บริษัท" aria-label="ค้นหา PR" className={`${inputClass} md:col-span-2`} />
        <select value={person} onChange={e => { setPerson(e.target.value); reset(); }} aria-label="ผู้ขอซื้อ" className={inputClass}>
          <option value="">ผู้ขอซื้อทั้งหมด</option>{people.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={type} onChange={e => { setType(e.target.value); reset(); }} aria-label="ประเภท" className={inputClass}>
          <option value="">ทุกประเภท</option>{types.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      {error && <ErrorBox error={error} />}
      {loading && <Loading />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi label="PR ที่ตรงเงื่อนไข" value={int(rows.length)} />
            <Kpi label="ประมาณการรวม" value={baht(sumEst)} color={VIZ.secondary} />
            <Kpi label="มูลค่าตาม PO (ไม่รวม VAT)" value={baht(sumPo)} color={VIZ.primary} />
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: VIZ.bg }}><tr>
                  <SortHeader label="PR" k="pr_no" sort={sort} onSort={onSort} />
                  <SortHeader label="วันที่" k="request_date" sort={sort} onSort={onSort} />
                  <SortHeader label="เรื่อง" k="title" sort={sort} onSort={onSort} />
                  <SortHeader label="ผู้ขอ" k="requester" sort={sort} onSort={onSort} />
                  <SortHeader label="สถานะ" k="state" sort={sort} onSort={onSort} />
                  <SortHeader label="ประมาณการ" k="estimated_cost" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="ยอด PO" k="po_amount" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="ใบเสนอราคา" k="quote_count" sort={sort} onSort={onSort} align="right" />
                </tr></thead>
                <tbody>
                  {!view.length && <tr><td colSpan={8} className="px-4 py-12 text-center" style={{ color: VIZ.lightText }}>ไม่พบ PR ตามเงื่อนไข ลองปรับคำค้น ผู้ขอซื้อ หรือช่วงเวลา</td></tr>}
                  {view.map(p => (
                    <tr key={p.odoo_id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2"><PrLink no={p.pr_no} by={p.requester} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{thaiDate(p.request_date)}</td>
                      <td className="px-3 py-2 min-w-[18rem]">
                        <p className="line-clamp-2">{p.title}</p>
                        {p.vendors && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.vendors}</p>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{p.requester}</td>
                      <td className="px-3 py-2"><StateBadge state={p.state} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{baht(p.estimated_cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.po_count ? baht(p.po_amount) : '–'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.quote_count || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4"><Pager page={page} total={rows.length} onPage={setPage} /></div>
          </Card>
        </>
      )}
    </div>
  );
}

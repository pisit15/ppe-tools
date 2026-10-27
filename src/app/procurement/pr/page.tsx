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
type Key = 'pr_no' | 'request_date' | 'requester' | 'title' | 'quote_count' | 'state';
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
  const [company, setCompany] = useState('');
  const [sort, setSort] = useState<SortState<Key>>({ key: 'request_date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const prs = useMemo(() => (data?.prs ?? []).filter(p => inRange(p.request_date, range)), [data, range]);
  const people = useMemo(() => [...new Set(prs.map(p => p.requester))].sort(), [prs]);
  const types = useMemo(() => [...new Set(prs.map(p => p.request_type || '(ไม่ระบุ)'))].sort(), [prs]);
  // Status counts share the other active filters; they differ only by status.
  const filtered = useMemo(() => {
    const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const companyTerms = company.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return prs.filter(p => (!person || p.requester === person) && (!type || (p.request_type || '(ไม่ระบุ)') === type)
      && terms.every(t => `${p.pr_no} ${p.title} ${p.vendors} ${p.company} ${p.operating_unit} ${p.po_list}`.toLowerCase().includes(t))
      && companyTerms.every(t => `${p.company} ${p.operating_unit}`.toLowerCase().includes(t)));
  }, [prs, person, type, text, company]);
  const rows = useMemo(() => {
    const states = GROUPS.find(g => g.id === group)!.states;
    return sortRows(filtered.filter(p => states.includes(p.state)), sort, (p, k) => p[k]);
  }, [filtered, group, sort]);
  const view = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const reset = () => setPage(0);
  const onSort = (s: SortState<Key>) => { setSort(s); reset(); };
  const counts = useMemo(() => Object.fromEntries(GROUPS.map(g => [g.id, filtered.filter(p => g.states.includes(p.state)).length])), [filtered]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">รายการ PR</h2>
        <p className="mt-2 text-sm" style={{ color: VIZ.lightText }}>ดู PR ของทุกคน ทุกบริษัท พร้อมผู้ขายและหลักฐานประกอบ</p>
        <div className="mt-1"><MetaLine meta={data?.meta} /></div>
      </div>
      <PeriodBar meta={data?.meta} sel={sel} onChange={s => { setSel(s); setPage(0); }} measure="pr" compare={false} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="กรองสถานะ PR">
        {GROUPS.map(g => (
          <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => { setGroup(g.id); reset(); }} className="rounded-full px-3 py-1 text-sm"
            style={group === g.id ? { background: VIZ.primary, color: 'white' } : { border: `1px solid ${VIZ.muted}`, background: 'white' }}>
            {g.label} <span className="opacity-70">({int(counts[g.id] ?? 0)})</span>
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: VIZ.lightText }}>จำนวนสถานะนับตามช่วงเวลาและตัวกรองที่เลือก</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <input type="search" value={text} onChange={e => { setText(e.target.value); reset(); }} placeholder="ค้นหาเลข PR, ชื่อเรื่อง หรือผู้ขาย" aria-label="ค้นหา PR" className={inputClass} />
        <input type="search" value={company} onChange={e => { setCompany(e.target.value); reset(); }} placeholder="ค้นหาบริษัทหรือหน่วยปฏิบัติงาน" aria-label="ค้นหาบริษัทหรือหน่วยปฏิบัติงาน" className={inputClass} />
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(12rem,1fr)_2fr]">
            <Kpi label="PR ที่ตรงเงื่อนไข" value={int(rows.length)} />
            <Card><p className="font-medium">ยอดเงินรวมยังไม่พร้อมแสดง</p><p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>ข้อมูล PR และยอด PO รวมไม่ได้ระบุสกุลเงิน จึงไม่รวมตัวเลขข้ามเอกสาร ยอด PO ที่แสดงในแต่ละ PR อาจรวมหลายสกุล กรุณาตรวจรายการ PO ในเอกสารต้นทาง</p></Card>
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="space-y-3 p-4 md:hidden" aria-label="รายการ PR สำหรับหน้าจอขนาดเล็ก">
              {!view.length && <p className="py-8 text-center text-sm" style={{ color: VIZ.lightText }}>ไม่พบ PR ตามเงื่อนไข ลองปรับคำค้น บริษัท ผู้ขอซื้อ หรือช่วงเวลา</p>}
              {view.map(p => (
                <article key={p.odoo_id} className="rounded-lg border p-3 text-sm" style={{ borderColor: VIZ.muted }}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><PrLink no={p.pr_no} by={p.requester} /><StateBadge state={p.state} /></div>
                  <p className="mt-2 font-medium">{p.title || 'ไม่ระบุเรื่อง'}</p>
                  <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>{thaiDate(p.request_date)} · {p.requester || 'ไม่ระบุผู้ขอ'}</p>
                  <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>บริษัท: {p.company || 'ไม่ระบุบริษัท'}{p.operating_unit ? ` · ${p.operating_unit}` : ''}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><p>ประมาณการใน PR <span className="block font-medium tabular-nums">{baht(p.estimated_cost)}</span></p><p>ยอด PO ตาม PR <span className="block font-medium tabular-nums">{p.po_count ? baht(p.po_amount) : '–'}</span></p></div><p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>สกุลเงินไม่ระบุ · ตรวจเอกสารต้นทาง</p>
                  <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>ใบเสนอราคา {int(p.quote_count)} ฉบับ</p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block" role="region" aria-label="ตารางรายการ PR เลื่อนซ้ายขวาเพื่อดูข้อมูลเพิ่มเติม" tabIndex={0}>
              <table className="w-full text-sm">
                <thead style={{ background: VIZ.bg }}><tr>
                  <SortHeader label="PR" k="pr_no" sort={sort} onSort={onSort} />
                  <SortHeader label="วันที่" k="request_date" sort={sort} onSort={onSort} />
                  <SortHeader label="เรื่อง" k="title" sort={sort} onSort={onSort} />
                  <th scope="col" className="px-3 py-2 text-left font-medium">บริษัท / หน่วยปฏิบัติงาน</th>
                  <SortHeader label="ผู้ขอ" k="requester" sort={sort} onSort={onSort} />
                  <SortHeader label="สถานะ" k="state" sort={sort} onSort={onSort} />
                  <th scope="col" className="px-3 py-2 text-right font-medium">ประมาณการใน PR<br /><span className="text-xs font-normal">สกุลเงินไม่ระบุ</span></th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">ยอด PO ตาม PR<br /><span className="text-xs font-normal">สกุลเงินไม่ระบุ</span></th>
                  <SortHeader label="ใบเสนอราคา" k="quote_count" sort={sort} onSort={onSort} align="right" />
                </tr></thead>
                <tbody>
                  {!view.length && <tr><td colSpan={9} className="px-4 py-12 text-center" style={{ color: VIZ.lightText }}>ไม่พบ PR ตามเงื่อนไข ลองปรับคำค้น บริษัท ผู้ขอซื้อ หรือช่วงเวลา</td></tr>}
                  {view.map(p => (
                    <tr key={p.odoo_id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2"><PrLink no={p.pr_no} by={p.requester} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{thaiDate(p.request_date)}</td>
                      <td className="px-3 py-2 min-w-[18rem]">
                        <p className="line-clamp-2">{p.title}</p>
                        {p.vendors && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.vendors}</p>}
                      </td>
                      <td className="px-3 py-2 min-w-[12rem] max-w-[18rem]"><span>{p.company || 'ไม่ระบุบริษัท'}</span>{p.operating_unit && <span className="mt-1 block text-xs" style={{ color: VIZ.lightText }}>{p.operating_unit}</span>}</td>
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

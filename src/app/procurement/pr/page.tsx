'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  OPEN_PR_STATES, PR_STATE_LABEL, type PrState, type ProcMeta, type ProcPoLine, type ProcPr, type ProcPrLine,
  type ProcPrSummary, type ProcQuote, type ProcQuoteItem,
} from '@/lib/procurement/types';
import {
  Card, DRIVE_ROOT, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, VIZ, VendorLink,
  baht, driveLink, inputClass, int, sortRows, thaiDate, useJson, type SortState,
} from '../_components/ui';
import { ChartTitle, HBarList } from '../_components/charts';
import { vendorKey } from '@/lib/procurement/analysis';
import { inRange, periodInfo } from '@/lib/procurement/period';
import { PeriodBar, usePeriod, usePeriodParam, validPeriod, withPeriod } from '../_components/period';

type Row = ProcPrSummary & { quote_count: number };
type ListResp = { prs: Row[]; meta: ProcMeta };
type Choice = Pick<ProcPr, 'pr_no' | 'requester' | 'company' | 'title' | 'request_date'>;
type DetailResp = { choices?: Choice[]; pr: ProcPr; lines: ProcPrLine[]; po: ProcPoLine[]; quotes: (ProcQuote & { selected: boolean })[]; items: ProcQuoteItem[] };
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
        <h2 className="text-xl font-bold">รายการ PR ทีม SHE</h2>
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
            <Kpi label="ยอด PO รวม (ไม่รวม VAT)" value={baht(sumPo)} color={VIZ.positive} />
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

function PrDetail({ no, by }: { no: string; by: string }) {
  const { data, error, loading } = useJson<DetailResp>(`/api/procurement/pr?no=${encodeURIComponent(no)}${by ? `&by=${encodeURIComponent(by)}` : ''}`);
  const [showDesc, setShowDesc] = useState(false);
  const y = usePeriodParam();
  const back = <Link href={withPeriod('/procurement/pr', y)} className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: VIZ.primary }}><ArrowLeft size={16} />รายการ PR</Link>;
  if (error) return <div className="space-y-3">{back}<ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="space-y-3">{back}<Loading /></div>;
  if (data.choices) return (
    <div className="space-y-3">{back}
      <Card>
        <p className="text-sm">เลข {no} มีในหลายบริษัท (Odoo ออกเลขแยกตามบริษัท) — เลือก PR ที่ต้องการ</p>
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {data.choices.map(c => <li key={c.requester} className="py-2"><PrLink no={c.pr_no} by={c.requester} /> · {c.requester} · {c.company} · {thaiDate(c.request_date)}<p>{c.title}</p></li>)}
        </ul>
      </Card>
    </div>
  );
  const { pr, lines, po, quotes, items } = data;
  const itemsByQuote = new Map<number, ProcQuoteItem[]>();
  for (const it of items) itemsByQuote.set(it.quote_id, [...(itemsByQuote.get(it.quote_id) ?? []), it]);
  const totals = quotes.map(q => q.total ?? q.subtotal).filter((t): t is number => t !== null && t > 0);
  const lowest = totals.length ? Math.min(...totals) : null;
  // One bar per vendor (lowest offer), before-VAT where the document shows it.
  const offers = (() => {
    const by = new Map<string, { name: string; value: number; selected: boolean; vatIncl: boolean }>();
    for (const q of quotes) {
      const value = q.subtotal ?? q.total;
      if (value === null || !(value > 0)) continue;
      const k = vendorKey(q.vendor_group || q.vendor) || q.vendor;
      const cur = by.get(k);
      if (!cur || value < cur.value) by.set(k, { name: q.vendor_group || q.vendor, value, selected: q.selected || !!cur?.selected, vatIncl: q.subtotal === null });
      else if (q.selected) cur.selected = true;
    }
    return [...by.values()].sort((a, b) => a.value - b.value);
  })();
  const chosen = offers.find(o => o.selected);
  const cheapest = offers[0];
  const offerTitle = !cheapest ? '' : chosen
    ? (chosen === cheapest
      ? `เลือกผู้เสนอราคาต่ำสุด: ${chosen.name}`
      : `เลือก ${chosen.name} — แพงกว่าราคาต่ำสุด ${baht(chosen.value - cheapest.value)} บาท (${Math.round(((chosen.value - cheapest.value) / cheapest.value) * 100)}%)`)
    : `ยังไม่มี PO — ราคาต่ำสุดคือ ${cheapest.name} ${baht(cheapest.value)} บาท`;
  const poVsEst = pr.po_count && pr.estimated_cost > 0 ? Math.round(((pr.po_amount - pr.estimated_cost) / pr.estimated_cost) * 100) : null;

  return (
    <div className="space-y-4">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{pr.pr_no}</h2><StateBadge state={pr.state} /></div>
          <p className="mt-1">{pr.title}</p>
          <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>{thaiDate(pr.request_date)} · {pr.requester} · {pr.company}{pr.operating_unit && ` · ${pr.operating_unit}`}{pr.request_type && ` · ${pr.request_type}`}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <a href={driveLink(pr.pr_no, pr.drive_folder_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-white" style={{ borderColor: VIZ.primary, color: VIZ.primary }}>
            <ExternalLink size={15} />ไฟล์แนบ {pr.n_attachments ? `(${pr.n_attachments})` : ''} ใน Google Drive
          </a>
          <a href={DRIVE_ROOT} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: VIZ.lightText }}>เปิดโฟลเดอร์รวม Odoo PR</a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ประมาณการใน PR" value={baht(pr.estimated_cost)} color={VIZ.secondary} />
        <Kpi label="ยอด PO (ไม่รวม VAT)" value={pr.po_count ? baht(pr.po_amount) : '–'} color={VIZ.positive}
          sub={pr.po_count ? `${poVsEst === null ? '' : poVsEst === 0 ? 'เท่ากับประมาณการ · ' : `${poVsEst > 0 ? 'สูง' : 'ต่ำ'}กว่าประมาณการ ${Math.abs(poVsEst)}% · `}${pr.po_list}` : 'ยังไม่มี PO'} />
        <Kpi label="ใบเสนอราคาที่อ่านได้" value={int(quotes.length)} sub={lowest !== null ? `ต่ำสุด ${baht(lowest)} บาท` : undefined} />
        <Kpi label="ผู้ขายที่ได้ PO" value={<span className="text-base">{pr.vendors || '–'}</span>} color={VIZ.text} />
      </div>
      {pr.description && (
        <Card>
          <button className="text-sm font-semibold hover:underline" style={{ color: VIZ.primary }} onClick={() => setShowDesc(v => !v)}>{showDesc ? 'ซ่อนรายละเอียด/เหตุผลการขอซื้อ' : 'แสดงรายละเอียด/เหตุผลการขอซื้อ'}</button>
          {showDesc && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{pr.description}</p>}
        </Card>
      )}
      {quotes.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 pt-4 md:px-6">
            <ChartTitle title={offerTitle || 'เทียบใบเสนอราคา'} sub="1 แท่ง = ราคาต่ำสุดที่ผู้ขายแต่ละรายเสนอใน PR นี้ (ก่อน VAT ถ้าเอกสารระบุ) · แท่งน้ำเงิน = ผู้ขายที่ได้ PO" />
            {offers.length > 1 && (
              <HBarList ariaLabel="เทียบยอดใบเสนอราคา"
                rows={offers.map((o, i) => ({
                  key: o.name, label: <VendorLink name={o.name} />, value: o.value, display: `${baht(o.value)} บาท`,
                  highlight: o.selected, color: o.selected ? VIZ.primary : '#B9C2CC',
                  note: [i === 0 ? 'ต่ำสุด' : `+${Math.round(((o.value - cheapest.value) / cheapest.value) * 100)}% จากต่ำสุด`, o.selected ? 'ได้ PO' : '', o.vatIncl ? 'ยอดรวม VAT' : ''].filter(Boolean).join(' · '),
                }))} />
            )}
            <h4 className="mt-4 text-sm font-semibold" style={{ color: VIZ.lightText }}>รายละเอียดใบเสนอราคา</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead style={{ background: VIZ.bg }}><tr>
                <th className="px-3 py-2 text-left font-semibold">ผู้ขาย</th><th className="px-3 py-2 text-left font-semibold">เลขที่ / วันที่</th>
                <th className="px-3 py-2 text-right font-semibold">ก่อน VAT</th><th className="px-3 py-2 text-right font-semibold">รวม</th>
                <th className="px-3 py-2 text-left font-semibold">รายการ</th>
              </tr></thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} className="border-t border-gray-100 align-top" style={q.selected ? { background: '#F1F8EF' } : undefined}>
                    <td className="px-3 py-2 min-w-[12rem]">
                      <VendorLink name={q.vendor_group || q.vendor} />
                      {q.selected && <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: VIZ.positive }}>ได้ PO</span>}
                      {q.doc_type === 'comparison_table' && <p className="text-xs" style={{ color: VIZ.lightText }}>จากตารางเทียบราคา</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{q.quote_no || '–'}<p className="text-xs" style={{ color: VIZ.lightText }}>{thaiDate(q.quote_date)}</p></td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(q.subtotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium" style={q.total !== null && q.total === lowest ? { color: VIZ.positive } : undefined}>{baht(q.total)}</td>
                    <td className="px-3 py-2 min-w-[18rem] text-xs">
                      <ul className="space-y-1">
                        {(itemsByQuote.get(q.id) ?? []).slice(0, 6).map(it => (
                          <li key={it.id}>{it.name} — {it.qty === null ? '' : `${int(it.qty)} ${it.unit || ''} × `}{baht(it.unit_price)}</li>
                        ))}
                        {(itemsByQuote.get(q.id)?.length ?? 0) > 6 && <li style={{ color: VIZ.lightText }}>และอีก {(itemsByQuote.get(q.id)?.length ?? 0) - 6} รายการ</li>}
                      </ul>
                      {q.notes && <p className="mt-1" style={{ color: VIZ.lightText }}>{q.notes}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-4 pt-2 text-xs md:px-6" style={{ color: VIZ.lightText }}>อ่านจาก PDF ที่แนบใน PR · สีเขียว = ยอดรวมต่ำสุด · เปิดไฟล์ต้นฉบับใน Google Drive เพื่อยืนยันก่อนใช้อ้างอิง</p>
        </Card>
      )}
      <Card className="!p-0 overflow-hidden">
        <h3 className="px-4 pt-4 font-semibold md:px-6">รายการใน PR ({int(lines.length)})</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead style={{ background: VIZ.bg }}><tr>
              <th className="px-3 py-2 text-left font-semibold">รายการ</th><th className="px-3 py-2 text-right font-semibold">จำนวน</th>
              <th className="px-3 py-2 text-right font-semibold">ราคาประมาณ/หน่วย</th><th className="px-3 py-2 text-right font-semibold">รวม</th>
            </tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.odoo_id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 min-w-[18rem]">{l.name}<p className="text-xs" style={{ color: VIZ.lightText }}>{l.product}{l.specifications && ` · ${l.specifications}`}</p></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{int(l.qty)} {l.uom}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(l.est_unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(l.qty * l.est_unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {po.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <h3 className="px-4 pt-4 font-semibold md:px-6">รายการใน PO ({int(po.length)})</h3>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead style={{ background: VIZ.bg }}><tr>
                <th className="px-3 py-2 text-left font-semibold">PO</th><th className="px-3 py-2 text-left font-semibold">ผู้ขาย</th>
                <th className="px-3 py-2 text-left font-semibold">รายการ</th><th className="px-3 py-2 text-right font-semibold">จำนวน</th>
                <th className="px-3 py-2 text-right font-semibold">ราคา/หน่วย</th><th className="px-3 py-2 text-right font-semibold">รวม</th>
              </tr></thead>
              <tbody>
                {po.map(l => (
                  <tr key={l.odoo_id} className="border-t border-gray-100 align-top" style={l.po_state === 'cancel' ? { color: VIZ.neutral } : undefined}>
                    <td className="px-3 py-2 whitespace-nowrap">{l.po_no}<p className="text-xs" style={{ color: VIZ.lightText }}>{thaiDate(l.order_date)}{l.po_state === 'cancel' && ' · ยกเลิก'}</p></td>
                    <td className="px-3 py-2 min-w-[10rem]"><VendorLink name={l.vendor} /></td>
                    <td className="px-3 py-2 min-w-[16rem] whitespace-pre-line">{l.item}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{int(l.qty)} {l.uom}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(l.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

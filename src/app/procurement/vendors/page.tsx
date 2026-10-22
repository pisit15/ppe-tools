'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PR_STATE_LABEL, type PricePoint, type ProcMeta, type ProcPrSummary, type VendorSummary } from '@/lib/procurement/types';
import { PriceChart } from '../_components/PriceChart';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, SourceBadge, VIZ, VendorLink,
  baht, inputClass, int, sortRows, thaiDate, useJson, type SortState,
} from '../_components/ui';

type ListResp = { vendors: VendorSummary[]; meta: ProcMeta };
type DetailResp = { summary: VendorSummary; names: string[]; points: PricePoint[]; prs: ProcPrSummary[]; meta: ProcMeta };
type Key = 'vendor' | 'po_amount' | 'po_count' | 'pr_count' | 'quote_count' | 'win' | 'last_date';

const winRate = (v: VendorSummary) => (v.quoted_prs ? v.won_prs / v.quoted_prs : null);

export default function VendorsPage() {
  const name = useSearchParams().get('name');
  return name ? <VendorDetail key={name} name={name} /> : <VendorList />;
}

function VendorList() {
  const { data, error, loading } = useJson<ListResp>('/api/procurement/vendors');
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortState<Key>>({ key: 'po_amount', dir: 'desc' });
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    const list = (data?.vendors ?? []).filter(v => !t || v.vendor.toLowerCase().includes(t) || v.top_items.some(i => i.toLowerCase().includes(t)));
    return sortRows(list, sort, (v, k) => k === 'win' ? winRate(v) : v[k]);
  }, [data, text, sort]);
  const view = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const onSort = (s: SortState<Key>) => { setSort(s); setPage(0); };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">ผู้ขาย</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>ทุกรายที่เคยได้ PO หรือเคยส่งใบเสนอราคาให้ทีม SHE</p>
        <div className="mt-1"><MetaLine meta={data?.meta} /></div>
      </div>
      <input type="search" value={text} onChange={e => { setText(e.target.value); setPage(0); }} placeholder="ค้นหาชื่อผู้ขาย หรือสินค้าที่ขายบ่อย" aria-label="ค้นหาผู้ขาย" className={inputClass} />
      {error && <ErrorBox error={error} />}
      {loading && <Loading />}
      {data && (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: VIZ.bg }}>
                <tr>
                  <SortHeader label="ผู้ขาย" k="vendor" sort={sort} onSort={onSort} />
                  <SortHeader label="ยอด PO (ไม่รวม VAT)" k="po_amount" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="จำนวน PO" k="po_count" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="PR" k="pr_count" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="ใบเสนอราคา" k="quote_count" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="เสนอแล้วได้งาน" k="win" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="ล่าสุด" k="last_date" sort={sort} onSort={onSort} align="right" />
                  <th className="px-3 py-2 text-left font-semibold">ซื้อบ่อย</th>
                </tr>
              </thead>
              <tbody>
                {view.map(v => (
                  <tr key={v.vendor} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 min-w-[12rem]"><VendorLink name={v.vendor} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(v.po_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(v.po_count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(v.pr_count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(v.quote_count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{v.quoted_prs ? `${v.won_prs}/${v.quoted_prs} PR` : '–'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{thaiDate(v.last_date)}</td>
                    <td className="px-3 py-2 min-w-[14rem] max-w-[24rem] text-xs" style={{ color: VIZ.lightText }}>
                      <p className="line-clamp-3" title={v.top_items.join('\n')}>{v.top_items.map(i => (i.length > 70 ? `${i.slice(0, 70)}…` : i)).join(' · ') || '–'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4"><Pager page={page} total={rows.length} onPage={setPage} /></div>
        </Card>
      )}
    </div>
  );
}

function VendorDetail({ name }: { name: string }) {
  const { data, error, loading } = useJson<DetailResp>(`/api/procurement/vendors?name=${encodeURIComponent(name)}`);
  const [page, setPage] = useState(0);
  const back = <Link href="/procurement/vendors" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: VIZ.primary }}><ArrowLeft size={16} />ผู้ขายทั้งหมด</Link>;
  if (error) return <div className="space-y-3">{back}<ErrorBox error={error} /></div>;
  if (loading || !data) return <div className="space-y-3">{back}<Loading /></div>;
  const { summary: v, points, prs } = data;
  const view = points.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <div className="space-y-4">
      {back}
      <div>
        <h2 className="text-xl font-bold">{v.vendor}</h2>
        {data.names.length > 1 && <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>ชื่อที่พบในเอกสาร: {data.names.join(' · ')}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ยอด PO รวม (ไม่รวม VAT)" value={baht(v.po_amount)} sub={`${int(v.po_count)} PO · ${int(v.pr_count)} PR`} />
        <Kpi label="ใบเสนอราคา" value={int(v.quote_count)} sub={`ใน ${int(v.quoted_prs)} PR`} color={VIZ.secondary} />
        <Kpi label="เสนอแล้วได้งาน" value={v.quoted_prs ? `${Math.round((v.won_prs / v.quoted_prs) * 100)}%` : '–'} sub={v.quoted_prs ? `${v.won_prs} จาก ${v.quoted_prs} PR` : 'ยังไม่มีใบเสนอราคา'} color={VIZ.positive} />
        <Kpi label="ช่วงเวลา" value={<span className="text-base">{thaiDate(v.first_date)} – {thaiDate(v.last_date)}</span>} color={VIZ.text} />
      </div>
      {points.length > 0 && <Card><h3 className="mb-2 font-semibold">ราคาต่อหน่วยที่เคยซื้อ/เสนอ (ทุกรายการ)</h3><PriceChart points={points} /></Card>}
      <Card className="!p-0 overflow-hidden">
        <h3 className="px-4 pt-4 font-semibold md:px-6">รายการราคา</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-sm">
            <thead style={{ background: VIZ.bg }}><tr>
              <th className="px-3 py-2 text-left font-semibold">วันที่</th><th className="px-3 py-2 text-left font-semibold">ประเภท</th>
              <th className="px-3 py-2 text-left font-semibold">รายการ</th><th className="px-3 py-2 text-right font-semibold">จำนวน</th>
              <th className="px-3 py-2 text-right font-semibold">ราคา/หน่วย</th><th className="px-3 py-2 text-left font-semibold">PR</th>
            </tr></thead>
            <tbody>
              {view.map(p => (
                <tr key={`${p.source}${p.id}`} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{thaiDate(p.date)}</td>
                  <td className="px-3 py-2"><SourceBadge source={p.source} /></td>
                  <td className="px-3 py-2 min-w-[16rem]"><p className="line-clamp-3" title={p.item}>{p.item}</p>{p.detail && p.detail !== p.item && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.detail}</p>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{p.qty === null ? '–' : int(p.qty)} {p.unit}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{baht(p.unit_price)}</td>
                  <td className="px-3 py-2"><PrLink no={p.pr_no} by={p.requester} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pager page={page} total={points.length} onPage={setPage} /></div>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">PR ที่เกี่ยวข้อง ({int(prs.length)})</h3>
        <ul className="divide-y divide-gray-100 text-sm">
          {prs.slice(0, 50).map(p => (
            <li key={p.odoo_id} className="flex flex-wrap gap-x-3 py-2">
              <PrLink no={p.pr_no} by={p.requester} />
              <span className="whitespace-nowrap" style={{ color: VIZ.lightText }}>{thaiDate(p.request_date)} · {p.requester} · {PR_STATE_LABEL[p.state]}</span>
              <span className="min-w-0 flex-1">{p.title}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

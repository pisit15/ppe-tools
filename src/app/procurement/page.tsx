'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import type { PricePoint, ProcMeta, SearchResult } from '@/lib/procurement/types';
import { canonicalCurrency, canonicalUnit, taxLabel, unitPriceBasisLabel } from '@/lib/procurement/comparability';
import { PriceChart } from './_components/PriceChart';
import { Card, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, SourceBadge, VIZ, VendorLink, baht, inputClass, int, sortRows, thaiDate, type SortState, useJson } from './_components/ui';
import { ChartTitle, Legend, VendorStrip, type StripRow } from './_components/charts';
import { vendorKey } from '@/lib/procurement/analysis';
import { PeriodBar, usePeriod, validPeriod } from './_components/period';
import { be, type PeriodSel } from '@/lib/procurement/period';

type Resp = SearchResult & { meta: ProcMeta; outside: number };
type PKey = 'date' | 'vendor' | 'unit_price' | 'qty' | 'item';
const EXAMPLES = ['อบรม รถยก', 'กำจัด ขยะ', 'ถังดับเพลิง', 'ถุงมือ'];
type Idle = { meta: ProcMeta; top?: { label: string; prs: number }[] };

export default function PriceSearchPage() {
  const params = useSearchParams();
  const q = (params.get('q') || '').trim().slice(0, 200);
  const unit = params.get('unit') || '';
  const dup = params.get('dup') === '1';
  const { sel: requested } = usePeriod();
  const yq: Record<string, string> = requested !== 'all' ? { y: String(requested) } : {};
  const setParams = (next: Record<string, string>) => {
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) { if (v) sp.set(k, v); else sp.delete(k); }
    // This page loads results through its API; query changes need no server navigation.
    window.history.pushState(null, '', `/procurement${sp.size ? `?${sp}` : ''}`);
  };
  const search = (value: string) => setParams({ q: value.trim(), unit: '', group: '' });
  const setPeriod = (value: PeriodSel) => setParams({ y: value === 'all' ? '' : String(value), group: '' });
  const url = q ? `/api/procurement/search?${new URLSearchParams({ q, ...(unit ? { unit } : {}), ...(dup ? { dup: '1' } : {}), ...yq })}` : null;
  const { data, error, loading } = useJson<Resp>(url);
  const { data: idle, error: idleError, loading: idleLoading } = useJson<Idle>(q ? null : `/api/procurement/search?${new URLSearchParams({ q: '', ...yq })}`);
  const meta = data?.meta ?? idle?.meta;
  const sel = validPeriod(requested, meta);
  return <div className="space-y-6">
    <section>
      {!q && <p className="text-xs font-semibold tracking-widest" style={{ color: VIZ.primary }}>PRICE INTELLIGENCE</p>}
      <h2 className="text-2xl font-semibold tracking-tight" style={{ color: VIZ.text }}>ค้นหาราคาเพื่อวางแผนจัดซื้อ</h2>
      {!q && <p className="mt-2 text-sm leading-relaxed" style={{ color: VIZ.lightText }}>ค้นหารายการ ดูกราฟราคาและผู้ขาย แล้วตรวจเอกสารก่อนเปิด PR</p>}
      <SearchForm key={q} initial={q} onSearch={search} />
      {!q && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span style={{ color: VIZ.lightText }}>ลองค้นหา</span>{EXAMPLES.map(value => <button type="button" key={value} onClick={() => search(value)} className="rounded-md border px-3 py-1.5 hover:bg-white" style={{ borderColor: VIZ.muted }}>{value}</button>)}</div>}
      <div className="mt-4"><PeriodBar meta={meta} sel={sel} onChange={setPeriod} measure="po" compare={false} /></div>
      <div className="mt-3"><MetaLine meta={meta} /></div>
    </section>
    {!q && idle?.top && idle.top.length > 0 && <Card>
      <ChartTitle title={`รายการที่ทีม SHE ซื้อบ่อย${sel === 'all' ? '' : ` ปี ${be(sel)}`}`} sub="เริ่มจากรายการที่เคยออก PO เพื่อค้นหาแหล่งข้อมูลราคา" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{idle.top.map(t => <button type="button" key={t.label} onClick={() => search(t.label)} className="rounded-lg border px-4 py-3 text-left text-sm hover:bg-gray-50" style={{ borderColor: VIZ.muted }}>{t.label}<span className="mt-1 block text-xs tabular-nums" style={{ color: VIZ.lightText }}>{int(t.prs)} PR</span></button>)}</div>
    </Card>}
    {(error || idleError) && <ErrorBox error={(error || idleError)!} />}
    {(loading || idleLoading) && <Loading text={q ? 'กำลังค้นหาราคา…' : 'กำลังโหลดรายการ…'} />}
    {data && <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" style={{ color: VIZ.lightText }}>พบ {int(data.match_total)} รายการ</p>
        <label className="inline-flex items-center gap-2" style={{ color: VIZ.lightText }}><input type="checkbox" checked={dup} onChange={e => setParams({ dup: e.target.checked ? '1' : '', group: '' })} />รวมใบเสนอราคาที่แนบซ้ำ</label>
      </div>
      {data.outside > 0 && <p className="text-sm" style={{ color: VIZ.lightText }}>มีรายการในปีอื่นอีก {int(data.outside)} รายการ · <button type="button" className="underline underline-offset-4" style={{ color: VIZ.primary }} onClick={() => setPeriod('all')}>ดูทุกปี</button></p>}
      {!data.match_total && <Card><p className="text-sm" style={{ color: VIZ.lightText }}>ไม่พบ “{q}” ในตัวกรองนี้ ลองเปลี่ยนช่วงเวลา ใช้คำที่สั้นลง หรือแยกคำด้วยเว้นวรรค{unit && <> · <button type="button" className="underline" onClick={() => setParams({ unit: '', group: '' })}>ล้างตัวกรองหน่วย</button></>}</p></Card>}
      {data.match_total > 0 && <Results key={`${q}|${unit}|${dup}|${sel}`} data={data} unit={unit} onUnit={value => setParams({ unit: value, group: '' })} />}
    </>}
  </div>;
}

/** URL-keyed form: back/forward restores the input; no stale debounce can overwrite navigation. */
function SearchForm({ initial, onSearch }: { initial: string; onSearch: (value: string) => void }) {
  const [text, setText] = useState(initial);
  return <form className="mt-5 flex gap-2" role="search" onSubmit={event => { event.preventDefault(); onSearch(text); }}>
    <div className="relative flex-1"><Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: VIZ.lightText }} aria-hidden /><input type="search" value={text} onChange={event => setText(event.target.value)} maxLength={200} aria-label="ค้นหารายการ ผู้ขาย หรือเลข PR" placeholder="ชื่อสินค้า บริการ ผู้ขาย หรือเลข PR" className={`${inputClass} min-h-12 py-3 pl-11 text-base`} /></div>
    <button type="submit" className="min-h-12 rounded-lg px-5 text-sm font-semibold text-white" style={{ background: VIZ.primary }}>ค้นหา</button>
  </form>;
}

function Results({ data, unit, onUnit }: { data: Resp; unit: string; onUnit: (u: string) => void }) {
  const charts = useMemo(() => {
    const series = new Map<string, { currency: string; points: PricePoint[] }>();
    for (const point of data.points) {
      const currency = canonicalCurrency(point.currency) || 'ไม่ระบุสกุลเงิน';
      const key = currency;
      const entry = series.get(key) ?? { currency, points: [] };
      entry.points.push(point);
      series.set(key, entry);
    }
    return [...series.values()].sort((a, b) => b.points.length - a.points.length);
  }, [data.points]);
  const [currency, setCurrency] = useState('');
  const chart = charts.find(item => item.currency === currency) ?? charts[0];
  return <>
    {data.relaxed && <p className="text-sm" style={{ color: VIZ.secondary }}>ไม่พบคำตรงตัว จึงแสดงรายการที่มีคำย่อยครบ</p>}
    {(data.units.length > 1 || unit) && <div className="flex items-center gap-2 text-sm"><label htmlFor="price-unit">หน่วย</label><select id="price-unit" value={canonicalUnit(unit)} onChange={event => onUnit(event.target.value)} className={`${inputClass} !w-auto`}><option value="">ทุกหน่วย</option>{data.units.map(u => <option key={u.unit} value={u.unit}>{u.unit} ({int(u.count)})</option>)}</select></div>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi label="รายการที่พบ" value={int(data.match_total)} />
      <Kpi label="รายการ PO ที่แสดง" value={int(data.points.filter(p => p.source === 'po').length)} />
      <Kpi label="ผู้ขายที่แสดง" value={int(new Set(data.points.map(p => p.vendor_key || p.vendor)).size)} />
    </div>
    <p className="text-xs leading-relaxed" style={{ color: VIZ.lightText }}>ภาพรวมราคาตามเอกสารที่ค้นพบ · หน่วย สเปก และฐานภาษีอาจต่างกัน ดูรายละเอียดแต่ละจุดหรือตารางก่อนเปรียบเทียบ{data.truncated && ' · แสดงเฉพาะ 600 รายการล่าสุด'}</p>
    {charts.length > 1 && <label className="flex items-center gap-2 text-sm">สกุลเงินในกราฟ<select value={chart.currency} onChange={event => setCurrency(event.target.value)} className={`${inputClass} !w-auto`}>{charts.map(item => <option key={item.currency} value={item.currency}>{item.currency} ({int(item.points.length)} รายการ)</option>)}</select></label>}
    {chart && <SearchCharts key={chart.currency} {...chart} />}
    {!!data.points.length && <PointTable points={data.points} truncated={data.truncated} />}
  </>;
}

function SearchCharts({ points, currency }: { points: PricePoint[]; currency: string }) {
  const units = [...new Set(points.map(point => canonicalUnit(point.unit) || 'ไม่ระบุหน่วย'))];
  const unit = units.length === 1 ? units[0] : 'หน่วยตามเอกสาร';
  const vendors = new Map<string, { name: string; po: number[]; quotes: number[] }>();
  for (const point of points) {
    const key = point.vendor_key || vendorKey(point.vendor) || point.vendor || '–';
    const row = vendors.get(key) ?? { name: point.vendor || '–', po: [], quotes: [] };
    (point.source === 'po' ? row.po : row.quotes).push(point.unit_price);
    vendors.set(key, row);
  }
  const rows: StripRow[] = [...vendors].map(([key, row]) => ({ key, label: <VendorLink name={row.name} short />,
    po: row.po, quotes: row.quotes, sub: `PO ${int(row.po.length)} · ใบเสนอราคา ${int(row.quotes.length)}`,
  }));
  const basis = `${currency} · ${int(points.length)} รายการ · ${units.length === 1 ? unit : 'หลายหน่วยตามเอกสาร'}`;
  return <>
    <Card><ChartTitle title="ราคาตามผู้ขาย" sub={`${basis} · 1 จุด = 1 ราคาตามเอกสาร`} />
      <VendorStrip rows={rows} unit={unit} currency={currency} />
      <div className="mt-3"><Legend items={[{ color: VIZ.primary, label: 'ราคาตาม PO', kind: 'dot' }, { color: VIZ.secondary, label: 'ใบเสนอราคา', kind: 'ring' }]} /></div>
    </Card>
    <Card><ChartTitle title="ประวัติราคาตามเวลา" sub={`${basis} · กดจุดเพื่อเปิด PR`} /><PriceChart points={points} poMedian={null} /></Card>
  </>;
}


function PointTable({ points, truncated }: { points: PricePoint[]; truncated: boolean }) {
  const [sort, setSort] = useState<SortState<PKey>>({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const rows = useMemo(() => sortRows(points, sort, (p, k) => p[k]), [points, sort]);
  const view = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <Card className="!p-0 overflow-hidden">
      <h3 className="px-4 pt-4 font-semibold md:px-6">รายการและเอกสารอ้างอิง</h3>
      <p className="px-4 pt-1 text-xs md:px-6" style={{ color: VIZ.lightText }}>แสดงหน่วยตามต้นฉบับเพื่อให้ตรวจสอบย้อนกลับได้</p>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-sm">
          <thead style={{ background: VIZ.bg }}>
            <tr>
              <SortHeader label="วันที่" k="date" sort={sort} onSort={s => { setSort(s); setPage(0); }} />
              <th className="px-3 py-2 text-left font-semibold">ประเภท</th>
              <SortHeader label="รายการ" k="item" sort={sort} onSort={s => { setSort(s); setPage(0); }} />
              <SortHeader label="ผู้ขาย" k="vendor" sort={sort} onSort={s => { setSort(s); setPage(0); }} />
              <SortHeader label="จำนวน" k="qty" sort={sort} onSort={s => { setSort(s); setPage(0); }} align="right" />
              <SortHeader label="ราคา/หน่วย" k="unit_price" sort={sort} onSort={s => { setSort(s); setPage(0); }} align="right" />
              <th className="px-3 py-2 text-left font-semibold">อ้างอิง</th>
            </tr>
          </thead>
          <tbody>
            {view.map(p => (
              <tr key={`${p.source}${p.id}`} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{thaiDate(p.date)}</td>
                <td className="px-3 py-2"><SourceBadge source={p.source} /></td>
                <td className="px-3 py-2 min-w-[16rem]">
                  <p className="line-clamp-3" title={p.item}>{p.item}</p>
                  {p.detail && p.detail !== p.item && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.detail}</p>}
                </td>
                <td className="px-3 py-2 min-w-[10rem]"><VendorLink name={p.vendor} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{p.qty === null ? '–' : baht(p.qty)} {p.unit || 'ไม่ระบุหน่วย'}{canonicalUnit(p.unit) && canonicalUnit(p.unit) !== p.unit && <p className="text-xs" style={{ color: VIZ.lightText }}>หน่วยมาตรฐาน: {canonicalUnit(p.unit)}</p>}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{baht(p.unit_price)}<p className="mt-1 whitespace-nowrap text-xs font-normal" style={{ color: VIZ.lightText }}>{p.currency || 'ไม่ระบุสกุลเงิน'} · {taxLabel(p.tax_basis || 'unknown')}</p><p className="mt-1 whitespace-nowrap text-xs font-normal" style={{ color: VIZ.lightText }}>{unitPriceBasisLabel(p.price_basis || 'unknown')}</p></td>
                <td className="px-3 py-2 whitespace-nowrap"><PrLink no={p.pr_no} by={p.requester} />{p.ref && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.ref}</p>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-4 md:px-6">
        <Pager page={page} total={rows.length} onPage={setPage} />
        {truncated && <p className="pt-2 text-xs" style={{ color: VIZ.secondary }}>แสดง 600 รายการล่าสุด — พิมพ์คำค้นให้เจาะจงขึ้นเพื่อดูครบ</p>}
      </div>
    </Card>
  );
}

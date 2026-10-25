'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, ArrowDown, Info } from 'lucide-react';
import type { PricePoint, ProcMeta, SearchResult } from '@/lib/procurement/types';
import { canonicalCurrency, canonicalUnit, taxLabel, unitPriceBasisLabel } from '@/lib/procurement/comparability';
import { SearchPriceCharts } from './_components/SearchPriceCharts';
import { Card, ErrorBox, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, SourceBadge, VIZ, VendorLink, baht, inputClass, int, sortRows, thaiDate, type SortState, useJson } from './_components/ui';
import { ChartTitle } from './_components/charts';
import { vendorKey } from '@/lib/procurement/analysis';
import { PeriodBar, usePeriod, validPeriod } from './_components/period';
import { be, type PeriodSel } from '@/lib/procurement/period';
import styles from './search.module.css';

type Resp = SearchResult & { meta: ProcMeta; outside: number };
type PKey = 'date' | 'vendor' | 'unit_price' | 'qty' | 'item';
const EXAMPLES = ['อบรม รถยก', 'กำจัด ขยะ', 'ถังดับเพลิง', 'ถุงมือ'];
const QUANTITY = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 6 });
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
    sp.delete('group');
    for (const [k, v] of Object.entries(next)) { if (v) sp.set(k, v); else sp.delete(k); }
    // This page loads results through its API; query changes need no server navigation.
    window.history.pushState(null, '', `/procurement${sp.size ? `?${sp}` : ''}`);
  };
  const setPeriod = (value: PeriodSel) => setParams({ y: value === 'all' ? '' : String(value), group: '' });
  const url = q ? `/api/procurement/search?${new URLSearchParams({ q, ...(unit ? { unit } : {}), ...(dup ? { dup: '1' } : {}), ...yq })}` : null;
  const { data, error, loading, refetch } = useJson<Resp>(url);
  const { data: idle, error: idleError, loading: idleLoading, refetch: refetchIdle } = useJson<Idle>(q ? null : `/api/procurement/search?${new URLSearchParams({ q: '', ...yq })}`);
  const search = (value: string) => {
    const next = value.trim().slice(0, 200);
    if (next === q) { (q ? refetch : refetchIdle)(); return; }
    setParams({ q: next, unit: '' });
  };
  const meta = data?.meta ?? idle?.meta;
  const sel = validPeriod(requested, meta);
  return <div className={styles.page}>
    <section className={styles.searchHeader} aria-label="ค้นหาและเลือกช่วงเวลา">
      {!q && <p className="text-xs font-semibold tracking-widest" style={{ color: VIZ.primary }}>PRICE INTELLIGENCE</p>}
      <h2 className="text-2xl font-semibold tracking-tight" style={{ color: VIZ.text }}>ค้นหาราคาจัดซื้อ</h2>
      {!q && <p className="mt-2 text-sm leading-relaxed" style={{ color: VIZ.lightText }}>ค้นหารายการ ดูกราฟราคาและผู้ขาย แล้วตรวจเอกสารก่อนเปิด PR</p>}
      <SearchForm key={q} initial={q} onSearch={search} />
      {!q && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span style={{ color: VIZ.lightText }}>ลองค้นหา</span>{EXAMPLES.map(value => <button type="button" key={value} onClick={() => search(value)} className="rounded-md border px-3 py-1.5 hover:bg-white" style={{ borderColor: VIZ.muted }}>{value}</button>)}</div>}
      <div className={styles.periodRow}>
        <PeriodBar meta={meta} sel={sel} onChange={setPeriod} measure="po" compare={false} />
        {meta && <details className={styles.dataInfo}><summary><Info size={15} aria-hidden />แหล่งข้อมูลและวันที่อัปเดต</summary><div><MetaLine meta={meta} /></div></details>}
      </div>
    </section>
    {!q && idle?.top && idle.top.length > 0 && <Card>
      <ChartTitle title={`รายการที่ทีม SHE ซื้อบ่อย${sel === 'all' ? '' : ` ปี ${be(sel)}`}`} sub="เริ่มจากรายการที่เคยออก PO เพื่อค้นหาแหล่งข้อมูลราคา" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{idle.top.map(t => <button type="button" key={t.label} onClick={() => search(t.label)} className="rounded-lg border px-4 py-3 text-left text-sm hover:bg-gray-50" style={{ borderColor: VIZ.muted }}>{t.label}<span className="mt-1 block text-xs tabular-nums" style={{ color: VIZ.lightText }}>{int(t.prs)} PR</span></button>)}</div>
    </Card>}
    {(error || idleError) && <ErrorBox error={(error || idleError)!} onRetry={q ? refetch : refetchIdle} />}
    {(loading || idleLoading) && <Loading text={q ? 'กำลังค้นหาราคา…' : 'กำลังโหลดรายการ…'} />}
    {data && <>
      {!data.match_total && <Card>
        <h3 className="font-semibold">ไม่พบรายการสำหรับ “{q}”</h3>
        <p className="mt-2 text-sm" style={{ color: VIZ.lightText }}>ลองใช้คำที่สั้นลง แยกคำด้วยเว้นวรรค หรือเปลี่ยนตัวกรอง</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {unit && <button type="button" className="underline underline-offset-4" onClick={() => setParams({ unit: '' })}>ล้างตัวกรองหน่วย</button>}
          {sel !== 'all' && <button type="button" className="underline underline-offset-4" onClick={() => setPeriod('all')}>ค้นหาทุกปี{data.outside > 0 ? ` (${int(data.outside)} รายการ)` : ''}</button>}
          <DuplicateFilter value={dup} onChange={value => setParams({ dup: value ? '1' : '' })} />
        </div>
      </Card>}
      {data.match_total > 0 && <Results key={`${q}|${unit}|${dup}|${sel}`} data={data} unit={unit} onUnit={value => setParams({ unit: value })} dup={dup} onDup={value => setParams({ dup: value ? '1' : '' })} onAllYears={() => setPeriod('all')} />}
    </>}
  </div>;
}

/** URL-keyed form: back/forward restores the input; no stale debounce can overwrite navigation. */
function SearchForm({ initial, onSearch }: { initial: string; onSearch: (value: string) => void }) {
  const [text, setText] = useState(initial);
  return <form className="mt-4 flex gap-2" role="search" onSubmit={event => { event.preventDefault(); onSearch(text); }}>
    <div className="relative flex-1"><Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: VIZ.lightText }} aria-hidden /><input type="search" value={text} onChange={event => setText(event.target.value)} maxLength={200} aria-label="ค้นหารายการ ผู้ขาย หรือเลข PR" placeholder="ชื่อสินค้า บริการ ผู้ขาย หรือเลข PR" className={`${inputClass} min-h-12 py-3 pl-11 text-base`} /></div>
    <button type="submit" className="min-h-12 rounded-lg px-5 text-sm font-semibold text-white" style={{ background: VIZ.primary }}>ค้นหา</button>
  </form>;
}

function DuplicateFilter({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <details className={styles.moreFilters} open={value || undefined}><summary>ตัวเลือกเพิ่มเติม{value && ' · รวมรายการซ้ำ'}</summary><label><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />รวมใบเสนอราคาที่แนบซ้ำ</label></details>;
}

function Results({ data, unit, onUnit, dup, onDup, onAllYears }: { data: Resp; unit: string; onUnit: (u: string) => void; dup: boolean; onDup: (value: boolean) => void; onAllYears: () => void }) {
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
  const poCount = data.points.filter(point => point.source === 'po').length;
  const quoteCount = data.points.filter(point => point.source === 'quote').length;
  const vendorCount = new Set(data.points.map(point => point.vendor_key || vendorKey(point.vendor)).filter(Boolean)).size;
  return <>
    {data.relaxed && <p className="text-sm" style={{ color: VIZ.secondary }}>ไม่พบคำตรงตัว จึงแสดงรายการที่มีคำย่อยครบ</p>}
    <section className={styles.resultsBar} aria-label="สรุปและตัวกรองผลค้นหา">
      <div className={styles.resultHeading}><p role="status"><strong>{int(data.match_total)}</strong> รายการที่พบ</p><a href="#price-records" className={styles.tableJump}>ดูตารางรายการ <ArrowDown size={15} aria-hidden /></a></div>
      <p className={styles.counts}>{data.truncated ? 'ในรายการล่าสุดที่แสดง: ' : ''}PO {int(poCount)} · ใบเสนอราคา {int(quoteCount)} · ผู้ขาย {int(vendorCount)} ราย{data.truncated && ` · แสดง ${int(data.points.length)} จาก ${int(data.match_total)} รายการ`}</p>
      <div className={styles.filterRow}>
        {(data.units.length > 1 || unit) && <label className={styles.filter} htmlFor="price-unit">หน่วย<select id="price-unit" value={canonicalUnit(unit)} onChange={event => onUnit(event.target.value)} className={`${inputClass} !w-auto`}><option value="">ทุกหน่วย</option>{data.units.map(u => <option key={u.unit} value={u.unit}>{u.unit || 'ไม่ระบุหน่วย'} ({int(u.count)})</option>)}</select></label>}
        {charts.length > 1 && <label className={styles.filter}>สกุลเงินในกราฟ<select value={chart.currency} onChange={event => setCurrency(event.target.value)} className={`${inputClass} !w-auto`}>{charts.map(item => <option key={item.currency} value={item.currency}>{item.currency} ({int(item.points.length)} รายการ)</option>)}</select></label>}
        <DuplicateFilter value={dup} onChange={onDup} />
      </div>
      {data.outside > 0 && <p className={styles.outside}>มีรายการในปีอื่นอีก {int(data.outside)} รายการ · <button type="button" onClick={onAllYears}>ดูทุกปี</button></p>}
      {data.truncated && <p className={styles.outside}>แสดงเฉพาะรายการล่าสุด พิมพ์คำค้นให้เจาะจงขึ้นเพื่อดูครบ</p>}
    </section>
    {chart && <SearchPriceCharts key={chart.currency} {...chart} />}
    <div id="price-records" className={styles.records} tabIndex={-1}>
      {!!data.points.length && <PointTable points={data.points} truncated={data.truncated} />}
    </div>
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
      <p className="px-4 pt-1 text-xs md:px-6" style={{ color: VIZ.lightText }}>แสดง {int(points.length)} รายการ · หน่วยตามต้นฉบับ · กดชื่อรายการเพื่ออ่านรายละเอียด</p>
      <div className="overflow-x-auto" role="region" aria-label="ตารางราคา เลื่อนแนวนอนเพื่อดูทุกคอลัมน์" tabIndex={0}>
        <table className="mt-2 w-full text-sm" aria-label="รายการราคาและเอกสารอ้างอิงทั้งหมด">
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
                  <details className={styles.itemDetails}><summary><span className="line-clamp-2">{p.item}</span><span className={styles.expandHint}>ดูรายละเอียด</span></summary><div><p>{p.item}</p>{p.detail && p.detail !== p.item && <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{p.detail}</p>}</div></details>
                </td>
                <td className="px-3 py-2 min-w-[10rem]"><VendorLink name={p.vendor} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{p.qty === null ? '–' : QUANTITY.format(p.qty)} {p.unit || 'ไม่ระบุหน่วย'}{canonicalUnit(p.unit) && canonicalUnit(p.unit) !== p.unit && <p className="text-xs" style={{ color: VIZ.lightText }}>หน่วยมาตรฐาน: {canonicalUnit(p.unit)}</p>}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums"><span className="whitespace-nowrap">{baht(p.unit_price)}</span><p className="mt-1 text-xs font-normal" style={{ color: VIZ.lightText }}>{p.currency || 'ไม่ระบุสกุลเงิน'} / {p.unit || 'ไม่ระบุหน่วย'}</p><p className="mt-1 whitespace-nowrap text-xs font-normal" style={{ color: VIZ.lightText }}>{taxLabel(p.tax_basis || 'unknown')} · {unitPriceBasisLabel(p.price_basis || 'unknown')}</p></td>
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

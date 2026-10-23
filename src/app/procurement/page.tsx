'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Search } from 'lucide-react';
import type { PriceGroup, PricePoint, ProcMeta, SearchResult, VendorPriceStat } from '@/lib/procurement/types';
import { canonicalUnit, taxLabel, unitPriceBasisLabel } from '@/lib/procurement/comparability';
import { PriceChart } from './_components/PriceChart';
import { Card, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, SourceBadge, VIZ, VendorLink, baht, inputClass, int, sortRows, thaiDate, type SortState, useJson } from './_components/ui';
import { ChartTitle, Legend, VendorStrip, type StripRow } from './_components/charts';
import { median, vendorKey } from '@/lib/procurement/analysis';
import { PeriodBar, usePeriod, validPeriod } from './_components/period';
import { be, type PeriodSel } from '@/lib/procurement/period';

type Resp = SearchResult & { meta: ProcMeta; outside: number };
type VKey = 'vendor' | 'po_count' | 'quote_count' | 'last_po_price' | 'min_price' | 'median_price' | 'last_quote_price' | 'last';
type PKey = 'date' | 'vendor' | 'unit_price' | 'qty' | 'item';
const EXAMPLES = ['อบรม รถยก', 'กำจัด ขยะ', 'ถังดับเพลิง', 'ถุงมือ'];
type Idle = { meta: ProcMeta; top?: { label: string; prs: number }[] };

export default function PriceSearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get('q') || '').trim().slice(0, 200);
  const unit = params.get('unit') || '';
  const group = params.get('group') || '';
  const dup = params.get('dup') === '1';
  const { sel: requested } = usePeriod();
  const yq: Record<string, string> = requested !== 'all' ? { y: String(requested) } : {};
  const setParams = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v) sp.set(k, v); else sp.delete(k); }
    router.push(`/procurement${sp.size ? `?${sp}` : ''}`, { scroll: false });
  };
  const search = (value: string) => setParams({ q: value.trim(), unit: '', group: '' });
  const setPeriod = (value: PeriodSel) => setParams({ y: value === 'all' ? '' : String(value), group: '' });
  const url = q ? `/api/procurement/search?${new URLSearchParams({ q, ...(unit ? { unit } : {}), ...(group ? { group } : {}), ...(dup ? { dup: '1' } : {}), ...yq })}` : null;
  const { data, error, loading } = useJson<Resp>(url);
  const { data: idle, error: idleError, loading: idleLoading } = useJson<Idle>(q ? null : `/api/procurement/search?${new URLSearchParams({ q: '', ...yq })}`);
  const meta = data?.meta ?? idle?.meta;
  const sel = validPeriod(requested, meta);
  return <div className="space-y-6">
    <section>
      {!q && <p className="text-xs font-semibold tracking-widest" style={{ color: VIZ.primary }}>PRICE INTELLIGENCE</p>}
      <h2 className="text-2xl font-semibold tracking-tight" style={{ color: VIZ.text }}>ค้นหาราคาเพื่อวางแผนจัดซื้อ</h2>
      {!q && <p className="mt-2 text-sm leading-relaxed" style={{ color: VIZ.lightText }}>ค้นหารายการ เลือกกลุ่มสินค้า แล้วตรวจราคาและเอกสารก่อนเปิด PR</p>}
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
        <p role="status" style={{ color: VIZ.lightText }}>พบ {int(data.match_total)} รายการ · {int(data.groups.length)} กลุ่มตามข้อมูลที่บันทึก</p>
        <label className="inline-flex items-center gap-2" style={{ color: VIZ.lightText }}><input type="checkbox" checked={dup} onChange={e => setParams({ dup: e.target.checked ? '1' : '', group: '' })} />รวมใบเสนอราคาที่แนบซ้ำ</label>
      </div>
      {data.outside > 0 && <p className="text-sm" style={{ color: VIZ.lightText }}>มีรายการในปีอื่นอีก {int(data.outside)} รายการ · <button type="button" className="underline underline-offset-4" style={{ color: VIZ.primary }} onClick={() => setPeriod('all')}>ดูทุกปี</button></p>}
      {!data.match_total && <Card><p className="text-sm" style={{ color: VIZ.lightText }}>ไม่พบ “{q}” ในตัวกรองนี้ ลองเปลี่ยนช่วงเวลา ใช้คำที่สั้นลง หรือแยกคำด้วยเว้นวรรค{unit && <> · <button type="button" className="underline" onClick={() => setParams({ unit: '', group: '' })}>ล้างตัวกรองหน่วย</button></>}</p></Card>}
      {data.match_total > 0 && <Results key={`${q}|${unit}|${group}|${dup}|${sel}`} data={data} unit={unit} onUnit={value => setParams({ unit: value, group: '' })} onGroup={value => setParams({ group: value })} />}
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

function GroupPicker({ groups, selected, onSelect }: { groups: PriceGroup[]; selected: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState(8);
  const [expanded, setExpanded] = useState(!selected);
  const chosen = groups.find(g => g.id === selected);
  const showChoices = !chosen || expanded;
  const filtered = groups.filter(g => `${g.item} ${g.detail} ${g.unit} ${g.currency}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())).sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || Number(b.ready) - Number(a.ready));
  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">{chosen ? 'กลุ่มรายการที่เลือก' : 'เลือกกลุ่มรายการเพื่อดูราคา'}</h3>{!chosen && <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>แยกตามชื่อ รายละเอียด หน่วย สกุลเงิน และฐานราคา โดยไม่แปลงจำนวนต่อบรรจุภัณฑ์</p>}</div>
      {chosen && <div className="flex flex-wrap items-center gap-4 text-sm">
        <button type="button" aria-expanded={showChoices} aria-controls="price-group-options" onClick={() => setExpanded(value => !value)} className="font-medium" style={{ color: VIZ.primary }}>{showChoices ? 'ปิดตัวเลือกกลุ่ม' : 'เปลี่ยนกลุ่มรายการ'}</button>
        <button type="button" onClick={() => onSelect('')} className="underline underline-offset-4" style={{ color: VIZ.lightText }}>ดูทุกรายการ</button>
      </div>}
    </div>
    {chosen && <div className="mt-3">
      <p className="text-sm font-medium">{chosen.item || 'ไม่ระบุชื่อรายการ'}</p>
      {chosen.detail && chosen.detail !== chosen.item && <p className="mt-1 line-clamp-2 text-xs leading-relaxed" title={chosen.detail} style={{ color: VIZ.lightText }}>{chosen.detail}</p>}
      <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>{chosen.unit || 'ไม่ระบุหน่วย'} · {chosen.currency || 'ไม่ระบุสกุลเงิน'} · {taxLabel(chosen.tax_basis)} · {unitPriceBasisLabel(chosen.price_basis)} · {int(chosen.count)} รายการ · {int(chosen.vendors)} ผู้ขาย</p>
    </div>}
    <div id="price-group-options" hidden={!showChoices}>
    {groups.length > 8 && <input type="search" aria-label="กรองกลุ่มรายการ" value={filter} onChange={event => { setFilter(event.target.value); setShow(8); }} placeholder="กรองกลุ่มด้วยชื่อ รายละเอียด หรือหน่วย" className={`${inputClass} mt-4`} />}
    <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="กลุ่มรายการราคา">{filtered.slice(0, show).map(g => {
      const active = selected === g.id;
      return <button type="button" key={g.id} aria-pressed={active} onClick={() => { setExpanded(false); onSelect(g.id); }} className="rounded-lg border p-4 text-left transition-colors hover:bg-gray-50" style={{ borderColor: active ? VIZ.primary : VIZ.muted, background: active ? '#F0F7F4' : undefined }}>
        <div className="flex items-start justify-between gap-3"><span className="line-clamp-2 text-sm font-medium" title={g.item}>{g.item || 'ไม่ระบุชื่อรายการ'}</span>{active && <Check size={17} className="shrink-0" style={{ color: VIZ.primary }} aria-hidden />}</div>
        {g.detail && g.detail !== g.item && <p className="mt-1 line-clamp-2 text-xs leading-relaxed" title={g.detail} style={{ color: VIZ.lightText }}>{g.detail}</p>}
        <p className="mt-3 text-xs font-medium">{g.unit || 'ไม่ระบุหน่วย'} · {g.currency || 'ไม่ระบุสกุลเงิน'} · {taxLabel(g.tax_basis)}</p>
        <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{unitPriceBasisLabel(g.price_basis)} · {int(g.count)} รายการ · {int(g.vendors)} ผู้ขาย</p>
        {!g.ready && <p className="mt-2 text-xs" style={{ color: VIZ.secondary }}>ดูเอกสารเพื่อยืนยันข้อมูลก่อนเปรียบเทียบ</p>}
      </button>;
    })}</div>
    {!filtered.length && <p className="mt-4 text-sm" style={{ color: VIZ.lightText }}>ไม่พบกลุ่มตามคำกรองนี้</p>}
    {filtered.length > show && <button type="button" onClick={() => setShow(show + 16)} className="mt-4 text-sm font-medium" style={{ color: VIZ.primary }}>แสดงกลุ่มเพิ่มเติม ({int(filtered.length - show)})</button>}
    </div>
  </Card>;
}

function Results({ data, unit, onUnit, onGroup }: { data: Resp; unit: string; onUnit: (u: string) => void; onGroup: (id: string) => void }) {
  const selected = data.groups.find(g => g.id === data.selected_group);
  const summary = data.comparison_ready ? data.summary : null;
  const strip: StripRow[] = useMemo(() => {
    if (!data.comparison_ready) return [];
    const vendors = new Map<string, { name: string; po: number[]; quotes: number[] }>();
    for (const point of data.points) {
      const key = point.vendor_key || vendorKey(point.vendor) || point.vendor || '–';
      const row = vendors.get(key) ?? { name: point.vendor || '–', po: [], quotes: [] };
      (point.source === 'po' ? row.po : row.quotes).push(point.unit_price);
      vendors.set(key, row);
    }
    return [...vendors].map(([key, row]) => ({ key, label: <VendorLink name={row.name} short />,
      po: row.po, quotes: row.quotes, median: median([...row.po, ...row.quotes]),
      sub: `PO ${int(row.po.length)} · ใบเสนอราคา ${int(row.quotes.length)}`,
    })).sort((a, b) => a.median - b.median);
  }, [data.points, data.comparison_ready]);
  const basis = selected ? `${selected.currency || 'ไม่ระบุสกุลเงิน'} / ${selected.unit || 'ไม่ระบุหน่วย'} · ${taxLabel(selected.tax_basis)} · ${unitPriceBasisLabel(selected.price_basis)}` : '';
  return <>
    {data.relaxed && <p className="text-sm" style={{ color: VIZ.secondary }}>ไม่พบคำนี้ตรงตัว จึงแสดงรายการที่มีคำย่อยครบ ลองเว้นวรรคระหว่างคำเพื่อผลที่แม่นขึ้น</p>}
    {(data.units.length > 1 || unit) && <div className="flex flex-wrap items-center gap-2 text-sm"><label htmlFor="price-unit" style={{ color: VIZ.lightText }}>หน่วย</label><select id="price-unit" value={canonicalUnit(unit)} onChange={event => onUnit(event.target.value)} className={`${inputClass} !w-auto max-w-full`}><option value="">ทุกหน่วย</option>{data.units.map(u => <option key={u.unit} value={u.unit}>{u.unit} ({int(u.count)})</option>)}</select><span className="text-xs" style={{ color: VIZ.lightText }}>รวมชื่อหน่วยที่มีความหมายเดียวกัน และเก็บหน่วยต้นฉบับในรายการ</span></div>}
    <GroupPicker groups={data.groups} selected={data.selected_group} onSelect={onGroup} />
    {data.comparison_ready ? <p className="text-xs leading-relaxed" style={{ color: VIZ.lightText }} role="status">{data.comparison_message}</p> : <div className="rounded-lg border-l-2 px-4 py-3 text-sm leading-relaxed" style={{ background: VIZ.bg, borderColor: VIZ.secondary }} role="status">{data.comparison_message}{selected && <p className="mt-1 font-medium">{basis}</p>}</div>}
    {summary && selected && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="ราคาตาม PO ล่าสุด" value={baht(summary.last_po?.unit_price)} sub={summary.last_po ? `${thaiDate(summary.last_po.date)} · ${summary.last_po.vendor}` : 'ไม่มี PO ในกลุ่มและช่วงเวลานี้'} />
        <Kpi label="มัธยฐานราคาตาม PO" value={baht(summary.po_median)} sub={`${int(summary.po_count)} รายการ · ${basis}`} />
        <Kpi label="ผู้ขายในกลุ่มนี้" value={int(summary.vendor_count)} sub={`PO ${int(summary.po_count)} รายการ · เสนอราคา ${int(summary.quote_count)} รายการ`} color={VIZ.text} />
      </div>
      {strip.length > 0 && <Card>
        <ChartTitle title="เทียบราคาต่อหน่วยรายผู้ขาย" sub={`${basis} · 1 จุด = 1 ราคา · เรียงตามมัธยฐานของรายการที่แสดง${data.truncated ? ' · ใช้เฉพาะ 600 รายการล่าสุด' : ''}`} />
        <VendorStrip rows={strip} unit={selected.unit} currency={selected.currency} />
        <div className="mt-3"><Legend items={[{ color: VIZ.primary, label: 'ราคาตาม PO', kind: 'dot' }, { color: VIZ.secondary, label: 'ใบเสนอราคา', kind: 'ring' }, { color: VIZ.text, label: 'มัธยฐาน', kind: 'tick' }]} /></div>
      </Card>}
      <Card><ChartTitle title="ประวัติราคาของกลุ่มที่เลือก" sub={`${basis}${data.truncated ? ` · กราฟแสดงเฉพาะ ${int(data.points.length)} รายการล่าสุด` : ''}`} /><PriceChart points={data.points} poMedian={summary.po_median} /><p className="mt-3 text-xs leading-relaxed" style={{ color: VIZ.lightText }}>แต่ละจุดอ้างอิงเอกสารหนึ่งรายการ ตรวจจำนวนที่สั่งซื้อ ขนาดบรรจุ และเงื่อนไขก่อนใช้ตั้งงบ{data.truncated && ' · สถิติและเส้นมัธยฐานคำนวณจากทุกรายการในกลุ่ม'}</p></Card>
      <VendorTable vendors={data.vendors} basis={basis} />
    </>}
    {!!data.points.length && <PointTable points={data.points} truncated={data.truncated} />}
  </>;
}
function VendorTable({ vendors, basis }: { vendors: VendorPriceStat[]; basis: string }) {
  const [sort, setSort] = useState<SortState<VKey>>({ key: 'po_count', dir: 'desc' });
  const rows = useMemo(() => sortRows(vendors, sort, (v, k) => k === 'last' ? (v.last_po_date || v.last_quote_date) : v[k]), [vendors, sort]);
  return (
    <Card className="!p-0 overflow-hidden">
      <h3 className="px-4 pt-4 font-semibold md:px-6">ราคาที่บันทึกรายผู้ขาย</h3>
      <p className="px-4 pt-1 text-xs md:px-6" style={{ color: VIZ.lightText }}>{basis}</p>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-sm">
          <thead style={{ background: VIZ.bg }}>
            <tr>
              <SortHeader label="ผู้ขาย" k="vendor" sort={sort} onSort={setSort} />
              <SortHeader label="รายการ PO" k="po_count" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ราคา PO ล่าสุด" k="last_po_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="รายการเสนอราคา" k="quote_count" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ราคาเสนอล่าสุด" k="last_quote_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ต่ำสุด" k="min_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="มัธยฐาน" k="median_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ล่าสุด" k="last" sort={sort} onSort={setSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.vendor} className="border-t border-gray-100">
                <td className="min-w-56 px-3 py-2"><VendorLink name={v.vendor} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.po_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(v.last_po_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.quote_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(v.last_quote_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(v.min_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(v.median_price)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{thaiDate(v.last_po_date && v.last_quote_date ? (v.last_po_date > v.last_quote_date ? v.last_po_date : v.last_quote_date) : v.last_po_date || v.last_quote_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-4 pt-2 text-xs md:px-6" style={{ color: VIZ.lightText }}>สถิติคำนวณจากทุกรายการในกลุ่มที่เลือก · ราคายังขึ้นกับจำนวน ขอบเขตงาน และเงื่อนไขในเอกสาร</p>
    </Card>
  );
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

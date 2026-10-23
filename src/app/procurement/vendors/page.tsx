'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PR_STATE_LABEL, type CatStat, type VendorDetailResp, type VendorRow, type VendorsResp } from '@/lib/procurement/types';
import { SPEND_CATS, SPEND_CAT_LABEL, isSpendCat, type SpendCat } from '@/lib/procurement/categories';
import { be, pctChange, periodInfo, thaiDay, type PeriodSel } from '@/lib/procurement/period';
import { PriceChart } from '../_components/PriceChart';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, SourceBadge, VIZ, VendorLink,
  baht, inputClass, int, shortVendor, sortRows, thaiDate, useJson, withPeriod, type SortState,
} from '../_components/ui';
import {
  ChartTitle, CumulativeLines, Delta, Legend, RankBars, RankMove, YearMatrix, YearSpark, changeWord, shortBaht, type RankRow,
} from '../_components/charts';
import { FilterPill, PeriodBar, usePeriod, usePeriodParam, useUrlParams, validPeriod } from '../_components/period';

type Key = 'vendor' | 'po_amount' | 'delta' | 'po_count' | 'pr_count' | 'quote_count' | 'win' | 'last_date';

const winRate = (v: VendorRow) => (v.quoted_prs ? v.won_prs / v.quoted_prs : null);
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
/** share as text: "<1" instead of a misleading "0" for small but real amounts */
const shareText = (part: number, whole: number) => (part > 0 && share(part, whole) === 0 ? '<1' : String(share(part, whole)));
const periodName = (sel: PeriodSel, partial: boolean, asOf: string) => (sel === 'all' ? 'ทุกปี' : `ปี ${be(sel)}${partial ? ` (ถึง ${thaiDay(asOf, false)})` : ''}`);

export default function VendorsPage() {
  const name = useSearchParams().get('name');
  return name ? <VendorDetail key={name} name={name} /> : <VendorOverview />;
}

/* ============================== Overview ============================== */

function VendorOverview() {
  const { params, set } = useUrlParams();
  const rawCat = params.get('cat');
  const cat: SpendCat | null = isSpendCat(rawCat) ? rawCat : null;
  const { sel: requested, setSel } = usePeriod();
  const qs = new URLSearchParams({ ...(requested !== 'all' ? { y: String(requested) } : {}), ...(cat ? { cat } : {}) }).toString();
  // keep = the previous period stays on screen (dimmed) while the next one loads
  const { data, error, loading } = useJson<VendorsResp>(`/api/procurement/vendors${qs ? `?${qs}` : ''}`, true);
  const sel = validPeriod(requested, data?.meta);
  const setCat = (c: string | null) => set({ cat: c && c !== cat ? c : null });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">ผู้ขายและยอดใช้จ่าย</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>เงินไปที่ผู้ขายรายไหน หมวดไหน เปลี่ยนไปอย่างไรจากปีก่อน — ใช้วางแผนต่อรองราคา ทำสัญญาระยะยาว หรือหาผู้ขายสำรอง</p>
        <div className="mt-1"><MetaLine meta={data?.meta} /></div>
      </div>
      <PeriodBar meta={data?.meta} sel={sel} onChange={setSel} measure="po">
        {cat && <FilterPill label={`หมวด: ${SPEND_CAT_LABEL[cat]}`} onClear={() => setCat(null)} />}
        {loading && data && <span className="text-xs" style={{ color: VIZ.lightText }} role="status">กำลังโหลด…</span>}
      </PeriodBar>
      {error && <ErrorBox error={error} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-4 transition-opacity" style={{ opacity: loading ? 0.5 : 1 }} aria-busy={loading}>
          <Overview data={data} sel={data.sel} cat={data.cat} onYear={setSel} onCat={setCat} />
        </div>
      )}
    </div>
  );
}

function Overview({ data, sel, cat, onYear, onCat }: {
  data: VendorsResp; sel: PeriodSel; cat: SpendCat | null; onYear: (s: PeriodSel) => void; onCat: (c: string | null) => void;
}) {
  const { meta, totals: t, cats, vendors, years, matrix, monthly } = data;
  const info = periodInfo(sel, meta, 'po');
  const name = periodName(sel, info.partial, meta.as_of);
  const withPo = useMemo(() => vendors.filter(v => v.po_amount > 0).sort((a, b) => b.po_amount - a.po_amount), [vendors]);
  const topCat = cats[0];
  const catTotal = cats.reduce((s, c) => s + c.amount, 0);
  const top = withPo[0];
  const hasPrev = t.prev !== null;

  // Action title: the conclusion first, then what drives it.
  let headline: string, sub = '';
  const change = hasPrev ? changeWord(t.amount, t.prev) : null;
  if (cat) {
    headline = `${SPEND_CAT_LABEL[cat]} ${name}: ยอด PO ${shortBaht(t.amount)} บาท${change ? ` — ${change}` : ''}`;
    sub = top ? `ผู้ขาย ${int(t.vendors)} ราย · รายใหญ่สุด ${shortVendor(top.vendor)} ${share(top.po_amount, t.amount)}%` : 'ไม่มี PO ในหมวดนี้ช่วงนี้';
  } else if (sel === 'all') {
    headline = `${years.length} ปี (${be(years[0])}–${be(years[years.length - 1])}) ยอด PO รวม ${shortBaht(t.amount)} บาท จากผู้ขาย ${int(t.vendors)} ราย`;
    if (topCat && share(topCat.amount, catTotal) >= 40) sub = `${topCat.cat === 'other' ? 'หมวดอื่น ๆ' : SPEND_CAT_LABEL[topCat.cat]} คิดเป็น ${share(topCat.amount, catTotal)}% ของทั้งหมด — กดชื่อหมวดในตารางเพื่อดูผู้ขายของหมวดนั้น`;
  } else {
    headline = `${name} ยอด PO ${shortBaht(t.amount)} บาท${change ? ` — ${change}` : ''}`;
    if (topCat && share(topCat.amount, catTotal) >= 40) {
      const rest = catTotal - topCat.amount;
      const restPrev = topCat.prev !== null ? cats.reduce((s, c) => s + (c.prev ?? 0), 0) - topCat.prev : null;
      const restChange = changeWord(rest, restPrev);
      sub = `${SPEND_CAT_LABEL[topCat.cat]} ${share(topCat.amount, catTotal)}% ของยอด · หมวดอื่นรวม ${shortBaht(rest)} บาท${restChange ? ` (${restChange})` : ''}`;
    }
  }

  const prevLabel = info.prev ? `ปี ${be(info.prev.year)}` : '';
  const quoteOnly = vendors.filter(v => !v.po_amount && v.quote_count).length;
  return (
    <>
      <Card>
        <p className="text-lg font-bold leading-snug" style={{ color: VIZ.text }}>{headline}</p>
        {sub && <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>{sub}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`ยอด PO ${sel === 'all' ? 'รวม' : 'ช่วงนี้'} (บาท ไม่รวม VAT)`} value={shortBaht(t.amount)}
          sub={hasPrev ? <><Delta cur={t.amount} prev={t.prev} /> · {prevLabel} ช่วงเดียวกัน {shortBaht(t.prev ?? 0)}</> : `PO ${int(vendors.reduce((s, v) => s + v.po_count, 0))} ฉบับ`} />
        <Kpi label="ผู้ขายที่ได้ PO" value={int(t.vendors)} color={VIZ.text}
          sub={t.new_vendors !== null ? `รายใหม่ ${int(t.new_vendors)} ราย${t.prev_vendors !== null ? ` · ${prevLabel} ${int(t.prev_vendors)} ราย` : ''}` : quoteOnly ? `เสนอราคาแต่ยังไม่ได้ PO อีก ${int(quoteOnly)} ราย` : undefined} />
        {t.vendors > 10
          ? <Kpi label="10 รายแรกครองยอด" value={t.top10_share !== null ? `${Math.round(t.top10_share * 100)}%` : '–'} color={VIZ.secondary}
              sub={top ? `รายใหญ่สุด ${shortVendor(top.vendor)} ${share(top.po_amount, t.amount)}%` : undefined} />
          : <Kpi label="รายใหญ่สุดครองยอด" value={top ? `${share(top.po_amount, t.amount)}%` : '–'} color={VIZ.secondary}
              sub={top ? `${shortVendor(top.vendor)} · ผู้ขายทั้งหมด ${int(t.vendors)} ราย` : undefined} />}
        <Kpi label="ใบเสนอราคาที่ได้รับ" value={int(t.quotes)} color={VIZ.positive}
          sub={`ใน ${int(t.quoted_prs)} PR${cat ? ' (PR ที่ซื้อในหมวดนี้)' : ''}`} />
      </div>

      {sel === 'all'
        ? <MatrixCard data={data} cat={cat} onYear={onYear} onCat={onCat} />
        : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryCard cats={cats} cat={cat} onCat={onCat} prevLabel={prevLabel} />
            {monthly && (
              <Card>
                <ChartTitle
                  title={`ยอด PO สะสม ${shortBaht(monthly.cur[monthly.lastMonth])} บาท${change ? ` — ${change}` : ''}`}
                  sub={`${cat ? `${SPEND_CAT_LABEL[cat]} · ` : ''}สะสมตามวันที่ออก PO · ขั้นบันไดชัน = PO ก้อนใหญ่ เช่น สัญญารายปี`} />
                <CumulativeLines cur={monthly.cur} prev={monthly.prev} prevSame={monthly.prevSame} lastMonth={monthly.lastMonth}
                  curLabel={be(sel as number).toString()} prevLabel={info.prev ? String(be(info.prev.year)) : ''} ariaLabel={`ยอด PO สะสม ${name}`} />
                <div className="mt-2">
                  <Legend items={[{ color: VIZ.primary, label: `ปี ${be(sel as number)}`, kind: 'line' }, ...(monthly.prev ? [{ color: VIZ.neutral, label: `${prevLabel} (ทั้งปี) · วงกลม = ช่วงเดียวกัน`, kind: 'line' as const }] : [])]} />
                </div>
              </Card>
            )}
          </div>
        )}

      <TopVendors rows={withPo} total={t.amount} sel={sel} cat={cat} hasPrev={hasPrev} prevLabel={prevLabel} />
      <VendorTable vendors={vendors} years={years} sel={sel} hasPrev={hasPrev} />
      <p className="text-xs" style={{ color: VIZ.lightText }}>
        หมวดอ่านจากรหัสสินค้าในบรรทัด PO ของ Odoo ({SPEND_CATS.map(c => `${c.label} = ${c.codes}`).join(' · ')}) · ใบเสนอราคาไม่มีรหัสสินค้า จึงนับเข้าหมวดตาม PR ที่ซื้อจริง ·
        ใบเสนอราคาที่ไม่มีวันที่ นับตามวันที่เปิด PR · ยอด PO ไม่รวม PO ที่ยกเลิก
      </p>
      {matrix.length === 0 && <Card><p className="text-sm">ยังไม่มีข้อมูล PO</p></Card>}
    </>
  );
}

function MatrixCard({ data, cat, onYear, onCat }: { data: VendorsResp; cat: SpendCat | null; onYear: (s: PeriodSel) => void; onCat: (c: string | null) => void }) {
  const { matrix, meta } = data;
  const years = matrix.map(m => m.year);
  const rows = SPEND_CATS.map(c => ({ key: c.id, label: c.label, values: matrix.map(m => m.byCat[c.id] ?? 0) }))
    .filter(r => r.values.some(v => v !== 0))
    .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
  const yearNotes: Record<number, string | undefined> = {};
  for (const y of years) {
    const info = periodInfo(y, meta, 'po');
    if (info.partial) yearNotes[y] = `ถึง ${thaiDay(meta.as_of, false)}`;
    else if (meta.coverage.po && meta.coverage.po.startsWith(`${y}-`) && meta.coverage.po > `${y}-02-15`) yearNotes[y] = `เริ่ม ${thaiDay(meta.coverage.po, false)}`;
  }
  const best = matrix.reduce((b, m) => (m.total > b.total ? m : b), matrix[0]);
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 pt-4 md:px-6">
        <ChartTitle
          title={best ? `ยอด PO รายปีแยกหมวด — สูงสุดปี ${be(best.year)} (${shortBaht(best.total)} บาท)` : 'ยอด PO รายปีแยกหมวด'}
          sub="กดปีที่หัวตารางเพื่อดูเฉพาะปีนั้น · กดชื่อหมวดเพื่อกรองผู้ขาย · แท่งในแต่ละแถวใช้สเกลของแถวนั้น (ดูแนวโน้มของหมวด) · * = ข้อมูลไม่ครบปี" />
      </div>
      <YearMatrix years={years} rows={rows} total={{ key: 'total', label: 'รวมทุกหมวด', values: matrix.map(m => m.total) }}
        yearNotes={yearNotes} onYear={y => onYear(y)} onRow={k => onCat(k)} selectedRow={cat} />
    </Card>
  );
}

function CategoryCard({ cats, cat, onCat, prevLabel }: { cats: CatStat[]; cat: SpendCat | null; onCat: (c: string | null) => void; prevLabel: string }) {
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const top = cats[0];
  const rows: RankRow[] = cats.map(c => ({
    key: c.cat, label: SPEND_CAT_LABEL[c.cat], title: `${SPEND_CAT_LABEL[c.cat]} · รหัส ${SPEND_CATS.find(x => x.id === c.cat)?.codes ?? ''}`,
    note: `${shareText(c.amount, total)}% ของยอด · ผู้ขาย ${int(c.vendors)} ราย`,
    value: c.amount, prev: c.prev, display: shortBaht(c.amount), delta: <Delta cur={c.amount} prev={c.prev} />,
  }));
  return (
    <Card>
      <ChartTitle
        title={top ? `เงินส่วนใหญ่ไปที่${SPEND_CAT_LABEL[top.cat]} (${share(top.amount, total)}%)` : 'ยอด PO ตามหมวด'}
        sub={`แท่ง = ช่วงนี้${prevLabel ? ` · ขีดดำ = ${prevLabel} ช่วงเดียวกัน` : ''} · กดหมวดเพื่อดูผู้ขายของหมวดนั้น`} />
      <RankBars rows={rows} ariaLabel="ยอด PO ตามหมวด" onSelect={k => onCat(k)} selected={cat} />
    </Card>
  );
}

function TopVendors({ rows, total, sel, cat, hasPrev, prevLabel }: { rows: VendorRow[]; total: number; sel: PeriodSel; cat: SpendCat | null; hasPrev: boolean; prevLabel: string }) {
  if (rows.length < 2) return null;
  const top10 = rows.slice(0, 10);
  const cum = top10.reduce((s, v) => s + v.po_amount, 0);
  const lead = top10[0];
  return (
    <Card>
      <ChartTitle
        title={`${shortVendor(lead.vendor)} ได้ยอดสูงสุด ${share(lead.po_amount, total)}% · 10 รายแรกรวม ${share(cum, total)}%`}
        sub={`ผู้ขาย 10 อันดับแรก${cat ? ` หมวด${SPEND_CAT_LABEL[cat]}` : ''} ${sel === 'all' ? 'ทุกปี' : `ปี ${be(sel)}`} · แท่ง = ยอด PO${hasPrev ? ` · ขีดดำ = ${prevLabel} ช่วงเดียวกัน` : ''} · ผู้ขายที่ยอดสูงคือจุดที่การต่อรองหรือทำสัญญาระยะยาวคุ้มที่สุด`} />
      <RankBars ariaLabel="ยอด PO รายผู้ขาย 10 อันดับแรก"
        rows={top10.map((v, i) => ({
          key: v.vendor, rank: i + 1, label: <VendorLink name={v.vendor} short />, title: v.vendor,
          note: <>{int(v.po_count)} PO · {int(v.pr_count)} PR{hasPrev && v.prev_rank ? <> · <RankMove rank={v.rank} prev={v.prev_rank} /></> : null}{v.top_items[0] ? ` · ${v.top_items[0]}` : ''}</>,
          value: v.po_amount, prev: v.prev_amount, display: shortBaht(v.po_amount), highlight: i === 0,
          delta: hasPrev ? <Delta cur={v.po_amount} prev={v.prev_amount} isNew={v.is_new} /> : undefined,
        }))} />
      {hasPrev && <div className="mt-2"><Legend items={[{ color: VIZ.primary, label: 'ช่วงนี้' }, { color: '#444', label: `${prevLabel} ช่วงเดียวกัน`, kind: 'tick' }]} /></div>}
    </Card>
  );
}

function VendorTable({ vendors, years, sel, hasPrev }: { vendors: VendorRow[]; years: number[]; sel: PeriodSel; hasPrev: boolean }) {
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortState<Key>>({ key: 'po_amount', dir: 'desc' });
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const t = text.trim().toLowerCase();
    const list = vendors.filter(v => !t || v.vendor.toLowerCase().includes(t) || v.top_items.some(i => i.toLowerCase().includes(t)));
    return sortRows(list, sort, (v, k) => k === 'win' ? winRate(v) : k === 'delta' ? pctChange(v.po_amount, v.prev_amount) : v[k]);
  }, [vendors, text, sort]);
  const view = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const onSort = (s: SortState<Key>) => { setSort(s); setPage(0); };
  const span = years.length ? `${be(years[0])}–${be(years[years.length - 1])}` : '';
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="space-y-2 px-4 pt-4 md:px-6">
        <ChartTitle title={`ผู้ขายทั้งหมด ${int(vendors.length)} ราย`} sub="รวมผู้ขายที่ส่งใบเสนอราคาแต่ยังไม่ได้ PO · กดชื่อเพื่อดูประวัติราคาและ PR" />
        <input type="search" value={text} onChange={e => { setText(e.target.value); setPage(0); }} placeholder="ค้นหาชื่อผู้ขาย หรือสินค้าที่ขายบ่อย" aria-label="ค้นหาผู้ขาย" className={inputClass} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: VIZ.bg }}>
            <tr>
              <SortHeader label="ผู้ขาย" k="vendor" sort={sort} onSort={onSort} />
              <SortHeader label={sel === 'all' ? 'ยอด PO รวม' : `ยอด PO ปี ${be(sel)}`} k="po_amount" sort={sort} onSort={onSort} align="right" />
              {hasPrev && <SortHeader label="เทียบปีก่อน" k="delta" sort={sort} onSort={onSort} align="right" />}
              <th scope="col" className="px-3 py-2 text-left font-semibold whitespace-nowrap">รายปี {span}</th>
              <SortHeader label="PO" k="po_count" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="PR" k="pr_count" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="ใบเสนอราคา" k="quote_count" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="เสนอแล้วได้งาน" k="win" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="ล่าสุด" k="last_date" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {view.map(v => (
              <tr key={v.vendor} className="border-t border-gray-100 align-top">
                <td className="max-w-[22rem] px-3 py-2">
                  <VendorLink name={v.vendor} />
                  {v.top_items.length > 0 && <p className="truncate text-xs" style={{ color: VIZ.lightText }} title={v.top_items.join('\n')}>{v.top_items.join(' · ')}</p>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{v.po_amount ? baht(v.po_amount) : '–'}</td>
                {hasPrev && <td className="px-3 py-2 text-right text-xs"><Delta cur={v.po_amount} prev={v.prev_amount} isNew={v.is_new} /></td>}
                <td className="px-3 py-2"><YearSpark years={years} values={v.yearly} selected={sel} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.po_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.pr_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.quote_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{v.quoted_prs ? `${v.won_prs}/${v.quoted_prs} PR` : '–'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{thaiDate(v.last_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-4"><Pager page={page} total={rows.length} onPage={setPage} /></div>
    </Card>
  );
}

/* ============================== One vendor ============================== */

function VendorDetail({ name }: { name: string }) {
  const { sel: requested, setSel } = usePeriod();
  const y = usePeriodParam();
  const { data, error, loading } = useJson<VendorDetailResp>(`/api/procurement/vendors?name=${encodeURIComponent(name)}${requested !== 'all' ? `&y=${requested}` : ''}`, true);
  const [page, setPage] = useState(0);
  const back = <Link href={withPeriod('/procurement/vendors', y)} className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: VIZ.primary }}><ArrowLeft size={16} />ผู้ขายทั้งหมด</Link>;
  if (error) return <div className="space-y-3">{back}<ErrorBox error={error} /></div>;
  if (!data) return <div className="space-y-3">{back}<Loading /></div>;
  const { summary: v, overall, points, prs, meta, years, cats, sel } = data;
  const barSel = validPeriod(requested, meta);
  const info = periodInfo(sel, meta, 'po');
  const pname = periodName(sel, info.partial, meta.as_of);
  const hasPrev = !!v && v.prev_amount !== null;
  const prevLabel = info.prev ? `ปี ${be(info.prev.year)}` : '';
  const view = points.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const peak = overall.yearly.reduce((b, val, i) => (val > overall.yearly[b] ? i : b), 0);
  return (
    <div className="space-y-4">
      {back}
      <div>
        <h2 className="text-xl font-bold">{overall.vendor}</h2>
        {data.names.length > 1 && <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>ชื่อที่พบในเอกสาร: {data.names.join(' · ')}</p>}
        <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>ได้ PO ครั้งแรก {thaiDate(overall.first_po)} · รวมทุกปี {shortBaht(overall.po_amount)} บาท จาก {int(overall.po_count)} PO</p>
      </div>
      <PeriodBar meta={meta} sel={barSel} onChange={s => { setSel(s); setPage(0); }} measure="po">
        {loading && <span className="text-xs" style={{ color: VIZ.lightText }} role="status">กำลังโหลด…</span>}
      </PeriodBar>
      <div className="space-y-4 transition-opacity" style={{ opacity: loading ? 0.5 : 1 }} aria-busy={loading}>

      {!v ? (
        <Card><p className="text-sm">ไม่มี PO หรือใบเสนอราคาของผู้ขายรายนี้ใน{pname} — <button className="underline" style={{ color: VIZ.primary }} onClick={() => setSel('all')}>ดูทุกปี</button></p></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={`ยอด PO ${sel === 'all' ? 'รวม' : pname} (ไม่รวม VAT)`} value={shortBaht(v.po_amount)}
            sub={hasPrev ? <><Delta cur={v.po_amount} prev={v.prev_amount} isNew={v.is_new} /> · {prevLabel} ช่วงเดียวกัน {shortBaht(v.prev_amount ?? 0)}</> : `${int(v.po_count)} PO · ${int(v.pr_count)} PR`} />
          <Kpi label="อันดับตามยอด PO" value={v.rank ? `#${v.rank}` : '–'} color={VIZ.text}
            sub={hasPrev && v.prev_rank ? <RankMove rank={v.rank} prev={v.prev_rank} /> : `${int(v.po_count)} PO · ${int(v.pr_count)} PR`} />
          <Kpi label="ใบเสนอราคา" value={int(v.quote_count)} sub={`ใน ${int(v.quoted_prs)} PR`} color={VIZ.secondary} />
          <Kpi label="เสนอแล้วได้งาน" value={v.quoted_prs ? `${Math.round((v.won_prs / v.quoted_prs) * 100)}%` : '–'} sub={v.quoted_prs ? `${v.won_prs} จาก ${v.quoted_prs} PR` : 'ไม่มีใบเสนอราคาในช่วงนี้'} color={VIZ.positive} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <ChartTitle title={overall.yearly[peak] > 0 ? `ยอด PO สูงสุดปี ${be(years[peak])} (${shortBaht(overall.yearly[peak])} บาท)` : 'ยอด PO รายปี'}
            sub={`กดปีเพื่อดูเฉพาะปีนั้น${meta.years.includes(Number(meta.as_of.slice(0, 4))) ? ` · ปี ${be(Number(meta.as_of.slice(0, 4)))} ถึง ${thaiDay(meta.as_of, false)}` : ''}`} />
          <RankBars ariaLabel="ยอด PO รายปี" selected={sel === 'all' ? null : String(sel)} onSelect={k => setSel(Number(k) === sel ? 'all' : Number(k))}
            rows={[...years].reverse().map(yr => {
              const val = overall.yearly[years.indexOf(yr)] ?? 0;
              return { key: String(yr), label: `ปี ${be(yr)}`, value: val, display: shortBaht(val) };
            })} />
        </Card>
        {cats.length > 0 && (
          <Card>
            <ChartTitle title={`ขายให้เราใน ${int(cats.length)} หมวด`} sub={`ยอด PO ${pname}${hasPrev ? ` · ขีดดำ = ${prevLabel} ช่วงเดียวกัน` : ''}`} />
            <RankBars ariaLabel="ยอด PO ของผู้ขายตามหมวด"
              rows={cats.map(c => ({ key: c.cat, label: SPEND_CAT_LABEL[c.cat], value: c.amount, prev: c.prev, display: shortBaht(c.amount), delta: <Delta cur={c.amount} prev={c.prev} /> }))} />
          </Card>
        )}
      </div>

      {points.length > 0 && <Card><ChartTitle title="ราคาต่อหน่วยที่เคยซื้อ/เสนอ" sub={`${pname} · คลิกจุดเพื่อเปิด PR`} /><PriceChart points={points} /></Card>}
      {points.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <h3 className="px-4 pt-4 font-semibold md:px-6">รายการราคา ({int(points.length)})</h3>
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
      )}
      {prs.length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">PR ที่เกี่ยวข้อง ({int(prs.length)}){prs.length > 50 ? ' — แสดง 50 ฉบับล่าสุด' : ''}</h3>
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
      )}
      </div>
    </div>
  );
}

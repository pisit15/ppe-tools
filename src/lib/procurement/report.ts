// Vendor spend reports for a period and spend category. Pure (no I/O): the API routes pass in the cached dataset.
import { prKey, vendorId, vendorSummaries } from './analysis';
import { SPEND_CATS, type SpendCat } from './categories';
import { inRange, periodInfo, yearRange, type PeriodSel, type Range } from './period';
import type { CatStat, ProcMeta, ProcPoLine, ProcPrSummary, ProcQuote, VendorRow, VendorSummary, VendorsResp, YearCats } from './types';

export type ReportInput = {
  prs: ProcPrSummary[]; po: ProcPoLine[]; quotes: ProcQuote[]; meta: ProcMeta;
  prDate: Map<string, string | null>; poCat: Map<number, SpendCat>; prCats: Map<string, Set<SpendCat>>;
};

const vk = (name: string) => vendorId(name);
const round2 = (v: number) => Math.round(v * 100) / 100;

function slicer(d: ReportInput, cat: SpendCat | null) {
  const live = d.po.filter(l => l.po_state !== 'cancel');
  const catOk = (l: ProcPoLine) => !cat || d.poCat.get(l.odoo_id) === cat;
  const quoteDate = (q: ProcQuote) => q.quote_date ?? d.prDate.get(prKey(q.pr_no, q.requester)) ?? null;
  // A quotation has no product code: it belongs to a category when its PR bought something in that category.
  const quoteCatOk = (q: ProcQuote) => !cat || !!d.prCats.get(prKey(q.pr_no, q.requester))?.has(cat);
  return {
    live,
    po: (r: Range | null) => live.filter(l => catOk(l) && inRange(l.order_date, r)),
    quotes: (r: Range | null) => d.quotes.filter(q => !q.duplicate_file && quoteCatOk(q) && inRange(quoteDate(q), r)),
  };
}

function ranks(list: VendorSummary[]) {
  const m = new Map<string, number>();
  [...list].filter(v => v.po_amount > 0).sort((a, b) => b.po_amount - a.po_amount).forEach((v, i) => m.set(vk(v.vendor), i + 1));
  return m;
}

/** PO value per vendor key per year (oldest year first), for trend sparklines. */
function yearlyByVendor(lines: ProcPoLine[], years: number[]) {
  const idx = new Map(years.map((y, i) => [y, i]));
  const out = new Map<string, number[]>();
  for (const l of lines) {
    const i = l.order_date ? idx.get(Number(l.order_date.slice(0, 4))) : undefined;
    if (i === undefined) continue;
    const k = vk(l.vendor);
    const arr = out.get(k) ?? years.map(() => 0);
    arr[i] += Number(l.subtotal) || 0;
    out.set(k, arr);
  }
  return out;
}

function firstPoByVendor(live: ProcPoLine[]) {
  const m = new Map<string, string>();
  for (const l of live) {
    if (!l.order_date) continue;
    const k = vk(l.vendor), d = l.order_date.slice(0, 10);
    if (!m.has(k) || d < m.get(k)!) m.set(k, d);
  }
  return m;
}

function catStats(lines: ProcPoLine[], prevLines: ProcPoLine[] | null, poCat: Map<number, SpendCat>): CatStat[] {
  const sum = (ls: ProcPoLine[]) => {
    const amt = new Map<SpendCat, number>(), vendors = new Map<SpendCat, Set<string>>();
    for (const l of ls) {
      const c = poCat.get(l.odoo_id) ?? 'other';
      amt.set(c, (amt.get(c) || 0) + (Number(l.subtotal) || 0));
      if (Number(l.subtotal) > 0) vendors.set(c, (vendors.get(c) ?? new Set<string>()).add(vk(l.vendor)));
    }
    return { amt, vendors };
  };
  const cur = sum(lines), prev = prevLines ? sum(prevLines) : null;
  return SPEND_CATS.map(({ id }) => ({
    cat: id, amount: round2(cur.amt.get(id) || 0), prev: prev ? round2(prev.amt.get(id) || 0) : null, vendors: cur.vendors.get(id)?.size ?? 0,
  })).filter(c => c.amount !== 0 || (c.prev ?? 0) !== 0).sort((a, b) => b.amount - a.amount || (b.prev ?? 0) - (a.prev ?? 0));
}

function cumulativeByMonth(lines: ProcPoLine[], year: number) {
  const m = Array<number>(12).fill(0);
  for (const l of lines) if (l.order_date?.startsWith(`${year}-`)) m[Number(l.order_date.slice(5, 7)) - 1] += Number(l.subtotal) || 0;
  for (let i = 1; i < 12; i++) m[i] += m[i - 1];
  return m.map(round2);
}

/** Vendors with PO value or quotations in the period, compared with the same span last year. */
export function vendorReport(d: ReportInput, sel: PeriodSel, cat: SpendCat | null): Omit<VendorsResp, 'meta'> {
  const info = periodInfo(sel, d.meta, 'po');
  const years = [...d.meta.years].sort((a, b) => a - b);
  const s = slicer(d, cat);
  const curPo = s.po(info.range);
  const prevPo = info.prev ? s.po(info.prev) : null;
  const cur = vendorSummaries(d.prs, curPo, s.quotes(info.range), s.live);
  const prev = info.prev && prevPo ? vendorSummaries(d.prs, prevPo, s.quotes(info.prev), s.live) : null;
  const rank = ranks(cur), prevRank = prev ? ranks(prev) : null;
  const prevAmt = new Map((prev ?? []).map(v => [vk(v.vendor), v.po_amount]));
  const yearly = yearlyByVendor(s.po(null), years);
  const firstPo = firstPoByVendor(s.live);
  // "new vendor" only means something when the data covers time before the period
  const canBeNew = !!info.range && !!d.meta.coverage.po && d.meta.coverage.po < info.range.from;
  const vendors: VendorRow[] = cur.map(v => {
    const k = vk(v.vendor);
    const first = firstPo.get(k) ?? null;
    return {
      ...v, rank: rank.get(k) ?? null, prev_amount: prev ? prevAmt.get(k) ?? 0 : null, prev_rank: prevRank?.get(k) ?? null,
      first_po: first, is_new: canBeNew && v.po_amount > 0 && !!first && first >= info.range!.from, yearly: (yearly.get(k) ?? years.map(() => 0)).map(round2),
    };
  });

  const amount = round2(curPo.reduce((t, l) => t + (Number(l.subtotal) || 0), 0));
  const withPo = vendors.filter(v => v.po_amount > 0).sort((a, b) => b.po_amount - a.po_amount);
  const curQuotes = s.quotes(info.range);
  const totals = {
    amount, prev: prevPo ? round2(prevPo.reduce((t, l) => t + (Number(l.subtotal) || 0), 0)) : null,
    vendors: withPo.length, prev_vendors: prev ? prev.filter(v => v.po_amount > 0).length : null,
    new_vendors: canBeNew ? vendors.filter(v => v.is_new).length : null,
    quotes: curQuotes.length, quoted_prs: new Set(curQuotes.map(q => prKey(q.pr_no, q.requester))).size,
    top10_share: amount > 0 ? withPo.slice(0, 10).reduce((t, v) => t + v.po_amount, 0) / amount : null,
  };

  // Overview across years (all categories, so the matrix can be used to pick one).
  const allPo = slicer(d, null);
  const matrix: YearCats[] = years.map(y => {
    const byCat: Partial<Record<SpendCat, number>> = {};
    let total = 0;
    for (const l of allPo.po(yearRange(y, d.meta.as_of))) {
      const c = d.poCat.get(l.odoo_id) ?? 'other';
      byCat[c] = round2((byCat[c] || 0) + (Number(l.subtotal) || 0));
      total += Number(l.subtotal) || 0;
    }
    return { year: y, total: round2(total), byCat };
  });
  const cats = catStats(allPo.po(info.range), info.prev ? allPo.po(info.prev) : null, d.poCat);

  let monthly: VendorsResp['monthly'] = null;
  if (sel !== 'all' && info.range) {
    const lastMonth = Number(info.range.to.slice(5, 7)) - 1;
    const prevYearPo = info.prev ? s.po(yearRange(info.prev.year, d.meta.as_of)) : null;
    monthly = {
      cur: cumulativeByMonth(curPo, sel), prev: prevYearPo ? cumulativeByMonth(prevYearPo, info.prev!.year) : null,
      prevSame: totals.prev, lastMonth,
    };
  }
  return { sel, cat, years, totals, vendors, cats, matrix, monthly };
}

/** One vendor: its row in the period (null when inactive), its all-time row (with the yearly trend) and its spend by category. */
export function vendorDetail(d: ReportInput, sel: PeriodSel, key: string) {
  const report = vendorReport(d, sel, null);
  const summary = report.vendors.find(v => vk(v.vendor) === key) ?? null;
  const overall = sel === 'all' ? summary : vendorReport(d, 'all', null).vendors.find(v => vk(v.vendor) === key) ?? null;
  const info = periodInfo(sel, d.meta, 'po');
  const s = slicer(d, null);
  const mine = (r: Range | null) => s.po(r).filter(l => vk(l.vendor) === key);
  const cats = catStats(mine(info.range), info.prev ? mine(info.prev) : null, d.poCat);
  return { summary, overall, years: report.years, cats };
}

// Pure analysis helpers (no I/O) — shared by API routes and tests.
import type { PricePoint, ProcPoLine, ProcPr, ProcQuote, ProcQuoteItem, SearchResult, VendorPriceStat, VendorSummary } from './types';

/** Vendor names differ between Odoo partners and quotation headers; compare on a stripped key. */
export function vendorKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\s\d{5}$/, '') // Odoo branch code suffix, e.g. "... จำกัด 00001"
    .replace(/\([^)]*\)/g, '') // (สำนักงานใหญ่), (ประเทศไทย), (SAFESIRI) …
    .replace(/บริษัท|บจก\.?|หจก\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วน|จำกัด|\(มหาชน\)|มหาชน|สำนักงานใหญ่|\(สาขา[^)]*\)/g, '')
    .replace(/\b(company|co|ltd|limited|public|plc|inc|corp|corporation|thailand)\b/g, '')
    .replace(/[\s.,()\-_'"&/]+/g, '');
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');
export function queryTerms(q: string) {
  return q.toLowerCase().split(/\s+/).map(t => t.trim()).filter(Boolean).slice(0, 8);
}
export function matches(haystack: string, terms: string[]) {
  const h = squash(haystack);
  return terms.every(t => h.includes(t));
}

/** Thai is often typed without spaces ("อบรมรถยก"); when nothing matches, accept any 2-part split of a long term. */
export function relaxedMatcher(terms: string[]) {
  const options = terms.map(t => {
    if (t.length < 6) return [[t]];
    const splits: string[][] = [];
    for (let i = 2; i <= t.length - 2; i++) splits.push([t.slice(0, i), t.slice(i)]);
    return splits;
  });
  return (haystack: string) => {
    const h = squash(haystack);
    return options.every(parts => parts.some(p => p.every(x => h.includes(x))));
  };
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const cmpDate = (a: string | null, b: string | null) => (a || '').localeCompare(b || '');

export function pricePoints(po: ProcPoLine[], items: ProcQuoteItem[], quotes: Map<number, ProcQuote>): PricePoint[] {
  const out: PricePoint[] = [];
  for (const l of po) {
    if (!(l.unit_price > 0) || l.po_state === 'cancel') continue;
    out.push({ source: 'po', id: l.odoo_id, pr_no: l.pr_no, requester: l.requester, vendor: l.vendor, date: l.order_date, item: l.item || l.product,
      detail: l.product, qty: l.qty, unit: l.uom || '', unit_price: Number(l.unit_price), ref: l.po_no, duplicate: false });
  }
  for (const it of items) {
    if (it.unit_price === null || !(it.unit_price > 0)) continue;
    const q = quotes.get(it.quote_id);
    out.push({ source: 'quote', id: it.id, pr_no: it.pr_no, requester: q?.requester ?? '', vendor: it.vendor_group || q?.vendor || '', date: it.quote_date ?? q?.quote_date ?? null,
      item: it.name, detail: it.spec || '', qty: it.qty, unit: it.unit || '', unit_price: Number(it.unit_price),
      ref: q?.quote_no || (q?.doc_type === 'comparison_table' ? 'ตารางเทียบราคา' : ''), duplicate: it.duplicate_file });
  }
  return out;
}

export function searchPrices(all: PricePoint[], q: string, opts: { unit?: string; includeDuplicates?: boolean; limit?: number }): SearchResult {
  const terms = queryTerms(q);
  const limit = opts.limit ?? 600;
  const text = (p: PricePoint) => `${p.item} ${p.detail} ${p.vendor} ${p.ref} ${p.pr_no}`;
  let hits: PricePoint[] = terms.length ? all.filter(p => matches(text(p), terms)) : [];
  let relaxed = false;
  if (terms.length && !hits.length) {
    const m = relaxedMatcher(terms);
    hits = all.filter(p => m(text(p)));
    relaxed = hits.length > 0;
  }
  if (!opts.includeDuplicates) hits = hits.filter(p => !p.duplicate);
  const unitCount = new Map<string, number>();
  for (const p of hits) unitCount.set(p.unit || '(ไม่ระบุ)', (unitCount.get(p.unit || '(ไม่ระบุ)') || 0) + 1);
  if (opts.unit) hits = hits.filter(p => (p.unit || '(ไม่ระบุ)') === opts.unit);
  hits.sort((a, b) => cmpDate(b.date, a.date));

  const groups = new Map<string, { names: Map<string, number>; points: PricePoint[] }>();
  for (const p of hits) {
    const k = vendorKey(p.vendor) || p.vendor;
    const g = groups.get(k) ?? { names: new Map<string, number>(), points: [] as PricePoint[] };
    g.names.set(p.vendor, (g.names.get(p.vendor) || 0) + 1);
    g.points.push(p);
    groups.set(k, g);
  }
  const vendors: VendorPriceStat[] = [...groups.values()].map(g => {
    const pos = g.points.filter(p => p.source === 'po');
    const qs = g.points.filter(p => p.source === 'quote');
    const prices = g.points.map(p => p.unit_price);
    return {
      vendor: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      po_count: pos.length, quote_count: qs.length,
      last_po_price: pos[0]?.unit_price ?? null, last_po_date: pos[0]?.date ?? null,
      min_price: Math.min(...prices), median_price: median(prices),
      last_quote_price: qs[0]?.unit_price ?? null, last_quote_date: qs[0]?.date ?? null,
    };
  }).sort((a, b) => b.po_count - a.po_count || a.median_price - b.median_price);

  return {
    query: q,
    relaxed,
    units: [...unitCount.entries()].map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count),
    points: hits.slice(0, limit),
    vendors,
    truncated: hits.length > limit,
  };
}

export const prKey = (prNo: string, requester: string) => `${prNo}|${requester}`;

export function vendorSummaries(prs: Pick<ProcPr, 'pr_no' | 'requester'>[], po: ProcPoLine[], quotes: ProcQuote[]): VendorSummary[] {
  const prVendorKeys = new Map<string, Set<string>>();
  for (const l of po) {
    if (l.po_state === 'cancel') continue;
    const pk = prKey(l.pr_no, l.requester);
    const s = prVendorKeys.get(pk) ?? new Set();
    s.add(vendorKey(l.vendor));
    prVendorKeys.set(pk, s);
  }
  type Acc = { names: Map<string, number>; lines: number; pos: Set<string>; amount: number; prs: Set<string>; quotes: number; quotedPrs: Set<string>; dates: string[]; items: Map<string, number> };
  const acc = new Map<string, Acc>();
  const get = (name: string) => {
    const k = vendorKey(name) || name;
    let a = acc.get(k);
    if (!a) { a = { names: new Map(), lines: 0, pos: new Set(), amount: 0, prs: new Set(), quotes: 0, quotedPrs: new Set(), dates: [], items: new Map() }; acc.set(k, a); }
    a.names.set(name, (a.names.get(name) || 0) + 1);
    return { k, a };
  };
  for (const l of po) {
    if (l.po_state === 'cancel' || !l.vendor) continue;
    const { a } = get(l.vendor);
    a.lines++; a.pos.add(l.po_no); a.amount += Number(l.subtotal) || 0; a.prs.add(prKey(l.pr_no, l.requester));
    if (l.order_date) a.dates.push(l.order_date);
    const label = l.item || l.product;
    if (label) a.items.set(label, (a.items.get(label) || 0) + 1);
  }
  for (const q of quotes) {
    const name = q.vendor_group || q.vendor;
    if (!name || q.duplicate_file) continue;
    const { a } = get(name);
    a.quotes++; a.quotedPrs.add(prKey(q.pr_no, q.requester));
    if (q.quote_date) a.dates.push(q.quote_date);
  }
  const known = new Set(prs.map(p => prKey(p.pr_no, p.requester)));
  return [...acc.entries()].map(([k, a]) => {
    const dates = a.dates.sort();
    const won = [...a.quotedPrs].filter(pr => known.has(pr) && prVendorKeys.get(pr)?.has(k)).length;
    return {
      vendor: [...a.names.entries()].sort((x, y) => y[1] - x[1])[0][0],
      po_lines: a.lines, po_count: a.pos.size, po_amount: Math.round(a.amount * 100) / 100, pr_count: a.prs.size,
      quote_count: a.quotes, quoted_prs: a.quotedPrs.size, won_prs: won,
      first_date: dates[0] ?? null, last_date: dates[dates.length - 1] ?? null,
      top_items: [...a.items.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n]) => n),
    };
  }).sort((x, y) => y.po_amount - x.po_amount || y.quote_count - x.quote_count);
}

/** Odoo product names without the code prefix: "[OT06-Site] ค่าบริการจัดการของเสีย - Site" -> "ค่าบริการจัดการของเสีย" */
export function productLabel(product: string) {
  return product.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*-\s*Site$/i, '').trim();
}

/** Most frequently bought products (by number of PRs with a PO line), for the search start page. */
export function topProducts(po: ProcPoLine[], limit = 12) {
  const prs = new Map<string, Set<string>>();
  for (const l of po) {
    if (l.po_state === 'cancel') continue;
    const label = productLabel(l.product);
    if (!label || label.length < 3) continue;
    const set = prs.get(label) ?? new Set<string>();
    set.add(`${l.pr_no}|${l.requester}`);
    prs.set(label, set);
  }
  return [...prs.entries()].map(([label, set]) => ({ label, prs: set.size }))
    .sort((a, b) => b.prs - a.prs).slice(0, limit);
}

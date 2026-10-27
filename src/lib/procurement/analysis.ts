// Pure analysis helpers (no I/O) — shared by API routes and tests.
import type { PricePoint, ProcPoLine, ProcPr, ProcQuote, ProcQuoteItem, SearchResult, VendorPriceStat, VendorSummary } from './types';
import { canonicalCurrency, canonicalUnit, priceGroups } from './comparability';

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

// Bracketed parts that say where/what kind of company, not which company.
// Also notes that name a different company ("ในเครือของ …", "ออกในนาม …") or an option ("option 1").
const NOT_A_NAME = /^(ประเทศไทย|สำนักงานใหญ่|มหาชน|thailand|head ?office|hq|สาขา.*|branch.*|[\d\s.-]+)$|^(ในเครือ|ผ่าน|ผู้รับประกัน|บริษัทประกันภัย|ใบเสนอราคา|ออกในนาม|option|ตัวเลือก|ทางเลือก|rev\b|ราคา)/i;
const MIN_ALIAS = 4;

/** Other names a vendor string carries: each bracketed part and each side of " / ", plus the Latin and Thai halves
 * of a mixed name ("Thai lab บริษัท ห้องปฏิบัติการไทย จำกัด"). Short or generic parts are ignored. */
export function vendorAliases(name: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (!t || NOT_A_NAME.test(t)) return;
    const k = vendorKey(t);
    if (k.length < MIN_ALIAS) return;
    out.add(k);
    // mixed script: "thailabห้องปฏิบัติการไทย" -> "thailab", "ห้องปฏิบัติการไทย"
    if (/[a-z]/.test(k) && /[฀-๿]/.test(k)) {
      for (const part of k.split(/(?<=[a-z0-9])(?=[฀-๿])|(?<=[฀-๿])(?=[a-z])/)) if (part.length >= MIN_ALIAS) out.add(part);
    }
  };
  add(name);
  for (const m of name.matchAll(/\(([^()]*)\)/g)) add(m[1]);
  for (const part of name.replace(/\([^()]*\)/g, ' ').split(/\s\/\s/)) add(part);
  return [...out];
}

/**
 * Resolver from any vendor name to one key per company, built from every name in the data: names that share a
 * stripped name or an alias (Thai/English name in brackets) are the same vendor. Falls back to vendorKey.
 */
export function vendorKeyer(names: Iterable<string>) {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (c !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); // smallest key becomes the root: stable across loads
  };
  for (const n of new Set(names)) {
    const main = vendorKey(n);
    if (!main) continue;
    union(main, main);
    for (const a of vendorAliases(n)) union(main, a);
  }
  return (name: string) => {
    const k = vendorKey(name);
    return (k && parent.has(k) ? find(k) : k) || name;
  };
}

let keyer: (name: string) => string = name => vendorKey(name) || name;
/** The server's dataset loader installs the keyer built from all loaded names (see data.ts). */
export function setVendorKeyer(fn: (name: string) => string) {
  keyer = fn;
}
/** One key per company for grouping: vendorKey, merged with the aliases known to the loaded data. */
export const vendorId = (name: string) => keyer(name);

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

/** PR numbers repeat across companies; pr_no + requester identifies a PR. */
export const prKey = (prNo: string, requester: string) => `${prNo}|${requester}`;

const cmpDate = (a: string | null, b: string | null) => (a || '').localeCompare(b || '');

/** prDate: prKey -> PR request date, used to place undated quotations in a period. */
export function pricePoints(po: ProcPoLine[], items: ProcQuoteItem[], quotes: Map<number, ProcQuote>, prDate: Map<string, string | null> = new Map()): PricePoint[] {
  const out: PricePoint[] = [];
  for (const l of po) {
    if (!(l.unit_price > 0) || l.po_state === 'cancel') continue;
    out.push({ source: 'po', id: l.odoo_id, pr_no: l.pr_no, requester: l.requester, vendor: l.vendor, vendor_key: vendorId(l.vendor), date: l.order_date, period_date: l.order_date, item: l.item || l.product,
      detail: l.product, qty: l.qty, unit: l.uom || '', unit_price: Number(l.unit_price), ref: l.po_no, duplicate: false,
      currency: canonicalCurrency(l.currency), price_basis: 'unit',
      // Odoo price_subtotal is untaxed. Do not assume price_unit has that basis when tax/discount changes it.
      tax_basis: l.qty > 0 && Number.isFinite(l.subtotal) && Math.abs(l.qty * l.unit_price - l.subtotal) < 0.011 ? 'ex_vat' : 'unknown' });
  }
  for (const it of items) {
    if (it.unit_price === null || !(it.unit_price > 0)) continue;
    const q = quotes.get(it.quote_id);
    const date = it.quote_date ?? q?.quote_date ?? null;
    const vendor = it.vendor_group || q?.vendor || '';
    out.push({ source: 'quote', id: it.id, pr_no: it.pr_no, requester: q?.requester ?? '', vendor, vendor_key: vendorId(vendor), date,
      period_date: date ?? prDate.get(prKey(it.pr_no, q?.requester ?? '')) ?? null,
      item: it.name, detail: it.spec || '', qty: it.qty, unit: it.unit || '', unit_price: Number(it.unit_price),
      ref: q?.quote_no || (q?.doc_type === 'comparison_table' ? 'ตารางเทียบราคา' : ''), duplicate: it.duplicate_file,
      currency: canonicalCurrency(q?.currency), price_basis: q?.price_basis || 'unknown', tax_basis: 'unknown' });
  }
  return out;
}

export function searchPrices(all: PricePoint[], q: string, opts: { unit?: string; group?: string; includeDuplicates?: boolean; limit?: number; offset?: number; tax?: string; basis?: string }): SearchResult {
  const terms = queryTerms(q);
  const limit = Math.max(0, opts.limit ?? 600);
  const text = (p: PricePoint) => `${p.item} ${p.detail} ${p.vendor} ${p.ref} ${p.pr_no}`;
  let hits: PricePoint[] = terms.length ? all.filter(p => matches(text(p), terms)) : [];
  let relaxed = false;
  if (terms.length && !hits.length) {
    const m = relaxedMatcher(terms);
    hits = all.filter(p => m(text(p)));
    relaxed = hits.length > 0;
  }
  if (!opts.includeDuplicates) hits = hits.filter(p => !p.duplicate);
  if (opts.tax) hits = hits.filter(p => (p.tax_basis && ['ex_vat', 'inc_vat'].includes(p.tax_basis) ? p.tax_basis : 'unknown') === opts.tax);
  if (opts.basis) hits = hits.filter(p => (p.price_basis && ['unit', 'month', 'year', 'once'].includes(p.price_basis) ? p.price_basis : 'unknown') === opts.basis);
  const unitCount = new Map<string, number>();
  for (const p of hits) {
    const unit = canonicalUnit(p.unit) || '(ไม่ระบุ)';
    unitCount.set(unit, (unitCount.get(unit) || 0) + 1);
  }
  const selectedUnit = canonicalUnit(opts.unit || '');
  if (selectedUnit) hits = hits.filter(p => (canonicalUnit(p.unit) || '(ไม่ระบุ)') === selectedUnit);
  hits.sort((a, b) => cmpDate(b.date, a.date));

  const match_total = hits.length;
  const comparisonGroups = priceGroups(hits);
  // Guard even an improbable hash collision: an ambiguous key can never select/merge groups.
  const selected = comparisonGroups.filter(g => g.group.id === opts.group);
  const chosen = selected.length === 1 ? selected[0] : null;
  const comparison_ready = !!chosen?.group.ready;
  if (opts.group) hits = chosen?.points ?? [];

  const groups = new Map<string, { names: Map<string, number>; points: PricePoint[] }>();
  for (const p of comparison_ready ? hits : []) {
    const k = p.vendor_key || vendorId(p.vendor);
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

  const po = hits.filter(p => p.source === 'po');
  const poPrices = po.map(p => p.unit_price);
  return {
    query: q,
    relaxed,
    units: [...unitCount.entries()].map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count),
    points: hits.slice(Math.max(0, opts.offset || 0), Math.max(0, opts.offset || 0) + limit),
    total: hits.length,
    match_total,
    groups: comparisonGroups.map(g => g.group),
    selected_group: chosen?.group.id ?? null,
    comparison_ready,
    comparison_message: opts.group && !chosen
      ? 'กลุ่มที่เลือกไม่อยู่ในผลค้นหาหรือช่วงเวลานี้ กรุณาเลือกกลุ่มใหม่'
      : chosen && !comparison_ready
        ? `แสดงเอกสารได้ แต่ยังสรุปเปรียบเทียบราคาไม่ได้: ${chosen.group.issues.join(' · ')}`
        : chosen
          ? 'จัดกลุ่มตามชื่อและรายละเอียดที่บันทึกตรงกัน โปรดตรวจสเปก ขนาดบรรจุ และเงื่อนไขในเอกสารก่อนตัดสินใจ'
          : 'เลือกกลุ่มรายการก่อนดูสถิติราคาและผู้ขาย โดยตรวจชื่อ รายละเอียด หน่วย สกุลเงิน และฐานราคา',
    summary: comparison_ready ? {
      po_count: po.length, quote_count: hits.length - po.length, vendor_count: vendors.length,
      last_po: po[0] || null, po_min: poPrices.length ? Math.min(...poPrices) : null,
      po_max: poPrices.length ? Math.max(...poPrices) : null, po_median: poPrices.length ? median(poPrices) : null,
    } : null,
    vendors,
    truncated: hits.length > limit,
  };
}


/** wonPo: PO lines used to decide whether a quoting vendor won the PR (defaults to po; pass all periods when po is filtered). */
export function vendorSummaries(prs: Pick<ProcPr, 'pr_no' | 'requester'>[], po: ProcPoLine[], quotes: ProcQuote[], wonPo: ProcPoLine[] = po): VendorSummary[] {
  const prVendorKeys = new Map<string, Set<string>>();
  for (const l of wonPo) {
    if (l.po_state === 'cancel') continue;
    const pk = prKey(l.pr_no, l.requester);
    const s = prVendorKeys.get(pk) ?? new Set();
    s.add(vendorId(l.vendor));
    prVendorKeys.set(pk, s);
  }
  type Acc = { names: Map<string, number>; lines: number; pos: Set<string>; amount: number; prs: Set<string>; quotes: number; quotedPrs: Set<string>; dates: string[]; items: Map<string, number> };
  const acc = new Map<string, Acc>();
  const get = (name: string) => {
    const k = vendorId(name);
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

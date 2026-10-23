// Quotation evidence for one PR. Unknown values never inherit a known comparison basis.
import type { PriceBasis, ProcQuote } from './types';

export type OfferQuote = Pick<ProcQuote, 'vendor' | 'vendor_group' | 'subtotal' | 'total' | 'price_basis'> &
  Partial<Pick<ProcQuote, 'currency' | 'vat' | 'duplicate_file'>> & { vendor_key: string; selected: boolean };
export type OfferTaxBasis = 'excluding_vat' | 'including_vat' | 'unknown';
export type Offer = { key: string; name: string; value: number; selected: boolean; vatIncl: boolean };
export type OfferGroup = {
  key: string; basis: PriceBasis | null; currency: string | null; taxBasis: OfferTaxBasis;
  offers: Offer[]; comparable: boolean;
};
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

/** Normalize explicit labels only. Missing currency must not become THB. */
export function offerCurrency(value: string | null | undefined): string | null {
  const code = (value || '').trim().toUpperCase();
  const aliases: Record<string, string> = { 'บาท': 'THB', '฿': 'THB', 'BAHT': 'THB', 'US$': 'USD', '€': 'EUR', '£': 'GBP', 'RMB': 'CNY' };
  if (aliases[code]) return aliases[code];
  return CURRENCIES.has(code) ? code : null;
}

const positive = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Separate amount bases even when only one known basis exists. Never rank an incomplete group. */
export function offerGroups(quotes: OfferQuote[]): { groups: OfferGroup[]; mixed: boolean } {
  const groups = new Map<string, { basis: PriceBasis | null; currency: string | null; taxBasis: OfferTaxBasis; by: Map<string, Offer> }>();
  for (const q of quotes) {
    if (q.duplicate_file) continue;
    const subtotal = positive(q.subtotal);
    const value = subtotal ? q.subtotal : q.total;
    if (!positive(value)) continue;
    const basis = q.price_basis && ['month', 'year', 'once'].includes(q.price_basis) ? q.price_basis : null;
    const currency = offerCurrency(q.currency);
    const taxBasis: OfferTaxBasis = subtotal ? 'excluding_vat'
      : typeof q.vat === 'number' && Number.isFinite(q.vat) && q.vat >= 0 ? 'including_vat' : 'unknown';
    const key = `${basis ?? 'unknown'}|${currency ?? 'unknown'}|${taxBasis}`;
    const group = groups.get(key) ?? { basis, currency, taxBasis, by: new Map<string, Offer>() };
    groups.set(key, group);
    const name = (q.vendor_group || q.vendor || '').trim();
    const vendorKey = (q.vendor_key || name).trim();
    const current = group.by.get(vendorKey);
    if (!current || value < current.value) {
      group.by.set(vendorKey, { key: vendorKey, name, value, selected: q.selected || !!current?.selected, vatIncl: taxBasis === 'including_vat' });
    } else if (q.selected) current.selected = true;
  }
  const list: OfferGroup[] = [...groups.entries()].map(([key, { basis, currency, taxBasis, by }]) => {
    const offers = [...by.values()];
    const comparable = !!basis && !!currency && taxBasis !== 'unknown' && offers.length >= 2 && offers.every(o => !!o.name && !!o.key);
    offers.sort(comparable ? (a, b) => a.value - b.value : (a, b) => a.name.localeCompare(b.name, 'th'));
    return { key, basis, currency, taxBasis, offers, comparable };
  });
  list.sort((a, b) => Number(b.comparable) - Number(a.comparable)
    || Number(b.offers.some(o => o.selected)) - Number(a.offers.some(o => o.selected)) || b.offers.length - a.offers.length);
  return { groups: list, mixed: list.length > 1 };
}

/** Vendor presence on a PO is not proof a particular quotation was accepted. */
export function offerComparison(group: OfferGroup): { lowest: Offer[]; vendorCount: number } | null {
  if (!group.comparable) return null;
  const value = Math.min(...group.offers.map(o => o.value));
  return { lowest: group.offers.filter(o => o.value === value), vendorCount: group.offers.length };
}

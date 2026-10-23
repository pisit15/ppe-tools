// Offers on one PR: the lowest price per vendor, grouped by what the price covers (month / year / one-off),
// so a monthly price is never ranked against a yearly total. Pure; used by the PR page and tests.
import type { PriceBasis, ProcQuote } from './types';

export type OfferQuote = Pick<ProcQuote, 'vendor' | 'vendor_group' | 'subtotal' | 'total' | 'price_basis'> & { vendor_key: string; selected: boolean };
export type Offer = { key: string; name: string; value: number; selected: boolean; vatIncl: boolean };
export type OfferGroup = { basis: PriceBasis | null; offers: Offer[] };

/** groups[0] holds the vendor that got the PO (or the most offers); mixed = quotes use more than one price basis. */
export function offerGroups(quotes: OfferQuote[]): { groups: OfferGroup[]; mixed: boolean } {
  const priced = quotes.flatMap(q => {
    const value = q.subtotal ?? q.total; // before VAT when the document shows it
    return value !== null && value > 0 ? [{ q, value }] : [];
  });
  const bases = new Set(priced.map(p => p.q.price_basis).filter((b): b is PriceBasis => !!b));
  const mixed = bases.size > 1;
  // One basis (or none recorded): quotes without a basis are compared with the rest as before.
  const groupOf = (b: PriceBasis | null): PriceBasis | null => (mixed ? b : [...bases][0] ?? null);
  const groups = new Map<PriceBasis | null, Map<string, Offer>>();
  for (const { q, value } of priced) {
    const g = groupOf(q.price_basis);
    const by = groups.get(g) ?? new Map<string, Offer>();
    groups.set(g, by);
    const k = q.vendor_key || q.vendor_group || q.vendor;
    const cur = by.get(k);
    if (!cur || value < cur.value) by.set(k, { key: k, name: q.vendor_group || q.vendor, value, selected: q.selected || !!cur?.selected, vatIncl: q.subtotal === null });
    else if (q.selected) cur.selected = true;
  }
  const list = [...groups.entries()].map(([basis, by]) => ({ basis, offers: [...by.values()].sort((a, b) => a.value - b.value) }));
  list.sort((a, b) => Number(b.offers.some(o => o.selected)) - Number(a.offers.some(o => o.selected)) || b.offers.length - a.offers.length);
  return { groups: list, mixed };
}

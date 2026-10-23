import type { PriceGroup, PricePoint, TaxBasis, UnitPriceBasis } from './types';
import { offerCurrency } from './offers';

/** Whitespace/case aliases only. Never strip numbers, product codes, packaging or punctuation. */
const normalizeText = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const UNIT_ALIASES: Record<string, string> = {
  pair: 'คู่', pairs: 'คู่', prs: 'คู่', 'คู่': 'คู่',
  box: 'กล่อง', boxes: 'กล่อง', 'กล่อง': 'กล่อง',
  pc: 'ชิ้น', pcs: 'ชิ้น', piece: 'ชิ้น', pieces: 'ชิ้น', 'ชิ้น': 'ชิ้น',
  set: 'ชุด', sets: 'ชุด', 'ชุด': 'ชุด',
  kg: 'กิโลกรัม', kilogram: 'กิโลกรัม', kilograms: 'กิโลกรัม', 'กก.': 'กิโลกรัม', 'กก': 'กิโลกรัม', 'กิโลกรัม': 'กิโลกรัม',
};

/** No quantity conversions: a box of 50 and a box of 100 remain different strings. */
export const canonicalUnit = (unit: string) => {
  const key = normalizeText(unit || '');
  return UNIT_ALIASES[key] || key;
};
/** Shared ISO validation and unambiguous aliases; an unknown code is never comparison evidence. */
export const canonicalCurrency = (currency?: string) => offerCurrency(currency) || '';
export const taxLabel = (basis: TaxBasis) => ({ ex_vat: 'ไม่รวม VAT', inc_vat: 'รวม VAT', unknown: 'ยังไม่ยืนยันฐาน VAT' })[basis];
export const unitPriceBasisLabel = (basis: UnitPriceBasis) => ({ unit: 'ราคาต่อหน่วยตาม PO', month: 'ต่อเดือน', year: 'ต่อปี', once: 'ครั้งเดียว', unknown: 'ยังไม่ระบุฐานราคา' })[basis];

function signature(point: PricePoint) {
  const currency = canonicalCurrency(point.currency);
  const price_basis: UnitPriceBasis = point.price_basis && ['unit', 'month', 'year', 'once'].includes(point.price_basis) ? point.price_basis : 'unknown';
  const tax_basis: TaxBasis = point.tax_basis && ['ex_vat', 'inc_vat'].includes(point.tax_basis) ? point.tax_basis : 'unknown';
  const unit = canonicalUnit(point.unit);
  // Unknown metadata across different source systems must never be treated as equivalent.
  const source = !currency || price_basis === 'unknown' || tax_basis === 'unknown' ? point.source : '';
  return { currency, price_basis, tax_basis, unit, key: JSON.stringify([
    normalizeText(point.item), normalizeText(point.detail), unit, currency, price_basis, tax_basis, source,
  ]) };
}

/** Compact stable URL key. Full signatures (not hashes) are used to build groups. */
function groupId(value: string) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return `g-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

export function priceGroups(points: PricePoint[]) {
  const records = new Map<string, { group: PriceGroup; points: PricePoint[]; vendors: Set<string> }>();
  for (const point of points) {
    const { key, unit, currency, price_basis, tax_basis } = signature(point);
    let record = records.get(key);
    if (!record) {
      const issues: string[] = [];
      if (!normalizeText(point.item)) issues.push('ไม่ระบุรายการ');
      if (!unit) issues.push('ไม่ระบุหน่วย');
      if (!currency) issues.push('ไม่ระบุสกุลเงิน');
      if (price_basis === 'unknown') issues.push('ยังไม่ระบุฐานราคา');
      if (tax_basis === 'unknown') issues.push('ยังไม่ยืนยันฐาน VAT');
      record = { group: { id: groupId(key), item: point.item, detail: point.detail, unit,
        original_units: [], currency, price_basis, tax_basis, count: 0, vendors: 0,
        ready: issues.length === 0, issues }, points: [], vendors: new Set() };
      records.set(key, record);
    }
    record.points.push(point);
    record.vendors.add(point.vendor_key || point.vendor);
    record.group.count++;
    record.group.vendors = record.vendors.size;
    if (!record.group.original_units.includes(point.unit)) record.group.original_units.push(point.unit);
  }
  return [...records.values()].sort((a, b) => b.group.count - a.group.count || a.group.id.localeCompare(b.group.id));
}

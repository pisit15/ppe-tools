import type { PricePoint } from './types';
import { offerCurrency } from './offers';

export const pricePointKey = (point: PricePoint) => JSON.stringify([point.source, point.id, point.pr_no, point.requester]);

/** Document day only. Do not invent dates from the PR fallback or accept rolled-over dates. */
export function documentDay(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/u.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}` ? timestamp : null;
}

export function searchChartModel(points: PricePoint[]) {
  // An unknown denomination is not a comparable numeric axis, even when its
  // amount is valid. Keep that omission distinct from an invalid/missing price.
  const confirmedCurrency = points.filter(point => !!offerCurrency(point.currency));
  const unconfirmedCurrency = points.filter(point => !offerCurrency(point.currency));
  const valid = confirmedCurrency.filter(point => Number.isFinite(point.unit_price) && point.unit_price >= 0);
  const invalid = confirmedCurrency.filter(point => !Number.isFinite(point.unit_price) || point.unit_price < 0);
  const dated = valid.flatMap(point => {
    const day = documentDay(point.date);
    return day === null ? [] : [{ point, day }];
  });
  const undated = valid.filter(point => documentDay(point.date) === null);
  const vendorMap = new Map<string, { key: string; name: string; points: PricePoint[] }>();
  for (const point of valid) {
    const key = point.vendor_key || point.vendor.trim() || 'unknown-vendor';
    const vendor = vendorMap.get(key) || { key, name: point.vendor.trim() || 'ไม่ระบุผู้ขาย', points: [] };
    vendor.points.push(point);
    vendorMap.set(key, vendor);
  }
  // Alphabetical, never a ranking of prices that might use different units or terms.
  const vendors = [...vendorMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const days = dated.map(record => record.day);
  const firstDay = days.length ? Math.min(...days) : 0;
  const lastDay = days.length ? Math.max(...days) : 0;
  return {
    valid, invalid, dated, undated, vendors, unconfirmedCurrency,
    maxPrice: Math.max(0, ...valid.map(point => point.unit_price)),
    firstDay, lastDay,
    incomplete: valid.filter(point => !point.unit.trim() || !point.price_basis || point.price_basis === 'unknown' || !point.tax_basis || point.tax_basis === 'unknown'),
  };
}

export type PositionedPrice = { point: PricePoint; x: number; y: number };
export type PriceMarker = { key: string; points: PricePoint[]; x: number; y: number; nearby: boolean };
const searchAmount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const searchMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

/** Bounded picker pages retain original records and make every selected observation reachable. */
export function priceRecordPage(points: PricePoint[], query: string, requestedPage: number, pageSize = 6) {
  const terms = query.normalize('NFC').trim().toLocaleLowerCase('th').split(/\s+/u).filter(Boolean);
  const matches = terms.length ? points.filter(point => {
    const text = [point.item, point.detail, point.vendor, point.pr_no, point.ref, point.requester, point.date,
      point.currency, point.unit, point.source === 'po' ? 'po ราคาตาม PO' : 'quote ใบเสนอราคา',
      String(point.unit_price), searchAmount.format(point.unit_price), searchMoney.format(point.unit_price)].join(' ').normalize('NFC').toLocaleLowerCase('th');
    return terms.every(term => text.includes(term));
  }) : points;
  const size = Math.max(1, Math.floor(pageSize));
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(requestedPage)));
  return { records: matches.slice(page * size, (page + 1) * size), total: matches.length, page, pages };
}

/**
 * Merge screen-space collisions so every record remains reachable by touch and keyboard.
 * These are display markers, never comparison groups or statistical aggregates.
 * A cluster's position is illustrative; its detail always contains the exact source values.
 */
export function priceMarkers(positions: PositionedPrice[], distance = 44): PriceMarker[] {
  const grouped: PositionedPrice[][] = [];
  const ordered = [...positions].sort((a, b) => a.x - b.x || a.y - b.y || pricePointKey(a.point).localeCompare(pricePointKey(b.point)));
  for (const position of ordered) {
    // Fixed anchors stay at least one target width apart. A record must be within
    // that radius of the anchor itself; nearby members cannot extend the cluster.
    const records = grouped.find(group => Math.hypot(position.x - group[0].x, position.y - group[0].y) < distance);
    if (records) records.push(position);
    else grouped.push([position]);
  }
  return grouped.map(records => ({
    key: records.map(record => pricePointKey(record.point)).sort().join('|'),
    points: records.map(record => record.point),
    // Anchor to a real observation, not an average price/date that never existed.
    x: records[0].x,
    y: records[0].y,
    nearby: records.some(record => record.x !== records[0].x || record.y !== records[0].y),
  }));
}

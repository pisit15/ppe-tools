const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/procurement', `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  cache.set(name, loaded);
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, specifier => {
    assert.ok(specifier.startsWith('./'));
    return load(specifier.slice(2));
  });
  return loaded.exports;
}
const { documentDay, searchChartModel, priceMarkers, pricePointKey, priceRecordPage } = load('search-chart-model');
const point = (id, extra = {}) => ({ source: 'po', id, pr_no: `PR${id}`, requester: 'Requester', vendor: 'Vendor A', vendor_key: 'a', date: '2026-02-17', period_date: '2026-02-17', item: 'อบรมรถยก', detail: 'หลักสูตรตัวอย่าง', qty: 1, unit: 'รุ่น', currency: 'THB', price_basis: 'once', tax_basis: 'ex_vat', unit_price: 22000, ref: `PO${id}`, duplicate: false, ...extra });

test('document dates reject missing, invalid and rolled-over days without using fallback PR dates', () => {
  for (const invalid of [null, '', 'not-a-date', '2026-02-30', '2026-13-01', '17/02/2026', '2026-2-17']) assert.equal(documentDay(invalid), null);
  assert.equal(documentDay('2026-02-17T23:30:00+07:00'), Date.UTC(2026, 1, 17));
  assert.equal(documentDay('2024-02-29'), Date.UTC(2024, 1, 29));
});

test('display counts partition all results and preserve zero prices', () => {
  const input = [point(1), point(2, { unit_price: 0 }), point(3, { date: null }), point(4, { date: '2026-02-30' }), point(5, { unit_price: NaN }), point(6, { unit_price: -1 })];
  const result = searchChartModel(input);
  assert.equal(result.valid.length, 4);
  assert.equal(result.dated.length, 2);
  assert.equal(result.undated.length, 2);
  assert.equal(result.invalid.length, 2);
  assert.equal(result.dated.length + result.undated.length + result.invalid.length, input.length);
  assert.deepEqual(result.undated.map(p => p.id), [3, 4]);
});

test('unconfirmed currencies never enter numeric plots or their scales, and remain a distinct omission', () => {
  const unknown = [undefined, '', '$', '¥', 'THB/USD', 'UNKNOWN'].map((currency, index) => point(index, { currency, unit_price: 999999 }));
  const input = [...unknown, point(6, { unit_price: 120 }), point(7, { currency: 'บาท', unit_price: 150 }), point(8, { unit_price: NaN }), point(9, { date: null })];
  const model = searchChartModel(input);
  assert.deepEqual(model.unconfirmedCurrency, unknown);
  assert.deepEqual(model.valid.map(record => record.id), [6, 7, 9]);
  assert.equal(model.invalid.length, 1);
  assert.equal(model.maxPrice, 22000, 'unknown amounts cannot stretch the numeric scale');
  assert.equal(model.dated.length + model.undated.length + model.invalid.length + model.unconfirmedCurrency.length, input.length);
  const onlyUnknown = searchChartModel(unknown);
  assert.equal(onlyUnknown.valid.length, 0);
  assert.equal(onlyUnknown.dated.length, 0);
  assert.equal(onlyUnknown.vendors.length, 0);
  assert.equal(onlyUnknown.invalid.length, 0, 'valid amounts with unknown currency are not labelled invalid prices');
  assert.equal(onlyUnknown.maxPrice, 0);
  assert.equal(unknown[0].unit_price, 999999, 'source amounts are preserved for the table');
});

test('exact overlaps keep every source and its original unit, VAT, basis and PR', () => {
  const records = [point(1), point(2, { source: 'quote', unit: 'คน', tax_basis: 'unknown', price_basis: 'month' }), point(3, { vendor: 'Vendor B', vendor_key: 'b', unit: '' })];
  const markers = priceMarkers(records.map(point => ({ point, x: 100, y: 100 })));
  assert.equal(markers.length, 1);
  assert.equal(markers[0].nearby, false);
  const preserved = [...markers[0].points].sort((a, b) => a.id - b.id);
  assert.deepEqual(preserved, records);
  assert.deepEqual(preserved.map(p => p.unit), ['รุ่น', 'คน', '']);
  assert.equal(searchChartModel(records).incomplete.length, 2);
});

test('nearby markers aggregate without losing records, separated markers keep exact positions', () => {
  const records = [point(1), point(2, { unit_price: 22001 }), point(3, { unit_price: 60000 })];
  const markers = priceMarkers([{ point: records[0], x: 10, y: 100 }, { point: records[1], x: 12, y: 100 }, { point: records[2], x: 100, y: 20 }]);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].nearby, true);
  assert.equal(markers[0].x, 10);
  assert.deepEqual(markers.flatMap(m => m.points).map(p => p.id).sort(), [1, 2, 3]);
  assert.equal(markers[1].x, 100);
});

test('a dense chain cannot collapse an entire axis into one invented average', () => {
  const positions = Array.from({ length: 100 }, (_, index) => ({ point: point(index), x: index * 20, y: 100 }));
  const markers = priceMarkers(positions, 44);
  assert.ok(markers.length >= 34);
  assert.equal(markers.flatMap(marker => marker.points).length, 100);
  assert.ok(markers.every(marker => marker.points.length <= 3));
  for (const marker of markers) {
    const xs = marker.points.map(point => positions[point.id].x);
    assert.ok(Math.max(...xs) - Math.min(...xs) < 44);
    assert.ok(xs.includes(marker.x), 'marker is anchored to an actual record');
  }
});

test('two-dimensional collisions cannot create nearly coincident marker anchors', () => {
  const positions = [
    { point: point(0), x: 0, y: 0 },
    { point: point(1), x: 1, y: 43 },
    { point: point(2), x: 2, y: -1 },
    { point: point(3), x: 46, y: 0 },
    { point: point(4), x: 47, y: 43 },
    { point: point(5), x: 48, y: -1 },
  ];
  const markers = priceMarkers(positions, 44);
  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map(marker => marker.points.map(point => point.id)), [[0, 1, 2], [3, 4, 5]]);
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      assert.ok(Math.hypot(markers[i].x - markers[j].x, markers[i].y - markers[j].y) >= 44);
    }
    for (const record of markers[i].points) {
      const original = positions[record.id];
      assert.ok(Math.hypot(markers[i].x - original.x, markers[i].y - original.y) < 44);
    }
  }
  assert.deepEqual(priceMarkers([...positions].reverse(), 44), markers);
});

test('vendor rows keep aliases together and use name order instead of cheapest-first ranking', () => {
  const model = searchChartModel([point(1, { vendor: 'Vendor Z', vendor_key: 'z', unit_price: 1 }), point(2, { vendor: 'Vendor A', unit_price: 500 }), point(3, { vendor: 'Vendor A Limited' })]);
  assert.deepEqual(model.vendors.map(v => v.key), ['a', 'z']);
  assert.equal(model.vendors[0].points.length, 2);
  assert.equal(model.maxPrice, 22000);
});

test('empty and 600 coincident records keep consistent counts and stable marker identity', () => {
  assert.deepEqual(priceMarkers([]), []);
  assert.equal(searchChartModel([]).maxPrice, 0);
  const records = Array.from({ length: 600 }, (_, index) => point(index));
  const positions = records.map(point => ({ point, x: 50, y: 50 }));
  const [marker] = priceMarkers(positions);
  assert.equal(marker.points.length, 600);
  assert.equal(new Set(marker.points.map(pricePointKey)).size, 600);
  assert.equal(priceMarkers([...positions].reverse())[0].key, marker.key);
});

test('large record picker exposes all 600 observations in bounded pages without mutating selection or metadata', () => {
  const records = Array.from({ length: 600 }, (_, id) => point(id, { vendor: `Vendor ${id}`, ref: `DOC-${id}` }));
  const active = records[599];
  const seen = [];
  for (let page = 0; page < 100; page++) {
    const result = priceRecordPage(records, '', page);
    assert.equal(result.records.length, 6);
    seen.push(...result.records);
  }
  assert.deepEqual(seen, records);
  const filtered = priceRecordPage(records, 'DOC-599 Vendor', 99);
  assert.equal(filtered.page, 0, 'a narrower search clamps the old page');
  assert.deepEqual(filtered.records, [active]);
  assert.equal(filtered.records[0], active, 'original metadata and selected identity are retained');
  assert.equal(priceRecordPage(records, 'ไม่พบรายการนี้', 1).total, 0);
  assert.equal(priceRecordPage(records, '22,000 อบรม', 0).total, 600);
  assert.equal(priceRecordPage(records, '22,000.00', 0).total, 600);
  assert.equal(priceRecordPage(records, 'po', 0).total, 600);
  assert.equal(priceRecordPage(records, 'ใบเสนอราคา', 0).total, 0);
});

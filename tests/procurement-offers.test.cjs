const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/procurement/offers.ts'), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded, loaded.exports);
const { offerGroups, offerComparison, offerCurrency } = loaded.exports;
const q = (vendor, subtotal, extra = {}) => ({ vendor, vendor_group: vendor, vendor_key: vendor, selected: false, subtotal, total: subtotal === null ? null : subtotal * 1.07, vat: subtotal === null ? null : subtotal * .07, currency: 'THB', price_basis: 'once', ...extra });

test('one vendor, including several quotations and a PO match, does not establish a lowest vendor', () => {
  const { groups } = offerGroups([q('A', 100, { selected: true }), q('A', 80), q('A', 90)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].offers.length, 1);
  assert.equal(groups[0].offers[0].value, 80);
  assert.equal(groups[0].offers[0].selected, true);
  assert.equal(offerComparison(groups[0]), null);
});

test('only distinct vendors with complete matching bases qualify, including tied minimums', () => {
  const { groups } = offerGroups([q('A', 100), q('B', 100), q('C', 140)]);
  assert.deepEqual(offerComparison(groups[0]).lowest.map(o => o.name), ['A', 'B']);
  assert.equal(offerComparison(groups[0]).vendorCount, 3);
});

test('monthly, yearly and unknown prices never pool even if there is just one known basis', () => {
  const { groups, mixed } = offerGroups([q('A', 100, { price_basis: 'month' }), q('B', 90, { price_basis: null }), q('C', 1000, { price_basis: 'year' }), q('D', 80, { price_basis: null })]);
  assert.equal(mixed, true);
  assert.equal(groups.length, 3);
  assert.equal(groups.every(g => offerComparison(g) === null), true);
  assert.deepEqual(groups.find(g => g.basis === null).offers.map(o => o.name), ['B', 'D'], 'unknown group must not appear ranked by price');
});

test('pretax subtotals, tax-inclusive totals and unknown tax totals stay separate', () => {
  const { groups } = offerGroups([q('A', 100), q('B', null, { total: 90, vat: 5 }), q('C', null, { total: 80, vat: null }), q('D', null, { total: 70, vat: null })]);
  assert.equal(groups.length, 3);
  assert.deepEqual(new Set(groups.map(g => g.taxBasis)), new Set(['excluding_vat', 'including_vat', 'unknown']));
  assert.equal(groups.every(g => offerComparison(g) === null), true);
});

test('currency and missing currency form separate groups without converting or assuming THB', () => {
  const { groups } = offerGroups([q('A', 100), q('B', 90, { currency: 'USD' }), q('C', 80, { currency: '' }), q('D', 70, { currency: undefined })]);
  assert.equal(groups.length, 3);
  assert.equal(groups.every(g => offerComparison(g) === null), true);
  assert.equal(groups.find(g => g.currency === null).offers.length, 2);
  assert.equal(offerCurrency('บาท'), 'THB');
  assert.equal(offerCurrency(' thb '), 'THB');
  assert.equal(offerCurrency('UNKNOWN'), null);
  assert.equal(offerCurrency('XXX'), null);
  assert.equal(offerCurrency('ABC'), null);
});

test('duplicate files and unreadable/nonfinite amounts do not create comparison coverage', () => {
  const { groups } = offerGroups([q('A', 100), q('B', 80, { duplicate_file: true }), q('C', null), q('D', NaN), q('E', Infinity)]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].offers.map(o => o.name), ['A']);
  assert.equal(offerComparison(groups[0]), null);
});

test('aliases of one vendor and unnamed vendors do not qualify as competitors', () => {
  const { groups } = offerGroups([q('Thai name', 100, { vendor_key: 'same' }), q('English name', 80, { vendor_key: 'same' })]);
  assert.equal(groups[0].offers.length, 1);
  assert.equal(offerComparison(groups[0]), null);
  assert.equal(offerComparison(offerGroups([q('', 70), q('A', 100)]).groups[0]), null);
});

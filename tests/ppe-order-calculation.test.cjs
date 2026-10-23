const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '../src/lib/ppe-order.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helper = new Module(sourcePath, module);
helper._compile(compiled, sourcePath);
const { calculateOrderRows, isOrderPeriod, leadTimeDays, monthKey, orderDateRange, orderMonths } = helper.exports;
const months = ['2026-08', '2026-09', '2026-10'];

function product(id, overrides = {}) {
  return { id, name: id, is_active: true, can_reorder: true, ...overrides };
}
function stock(product_id, current_stock) { return { product_id, current_stock }; }
function movement(product_id, quantity, transaction_date = '2026-10-01', transaction_type = 'stock_out') {
  return { product_id, quantity, transaction_date, transaction_type };
}
function rows(products, stocks, transactions, leadMonths = 1) {
  return calculateOrderRows({ products, stocks, transactions, months, leadMonths });
}

test('purchase status uses Stock on hand <= Re-order point, independently of positive suggested quantity', () => {
  const result = rows(
    [product('medium'), product('large'), product('boundary')],
    [stock('medium', 40), stock('large', 116), stock('boundary', 44)],
    [movement('medium', 66), movement('large', 165), movement('boundary', 66)],
  );
  const byId = Object.fromEntries(result.map(row => [row.product.id, row]));
  assert.equal(byId.medium.reorderPoint, 44);
  assert.equal(byId.medium.needToOrder, 26);
  assert.equal(byId.medium.requiresOrder, true);
  assert.equal(byId.boundary.requiresOrder, true, 'Equality must trigger purchase');
  assert.equal(byId.large.needToOrder, 49, 'Suggested quantity alone must not trigger purchase');
  assert.equal(byId.large.requiresOrder, false);
  assert.deepEqual(result.map(row => row.product.id), ['medium', 'boundary', 'large']);
});

test('disabled purchases and empty catalog rows never trigger purchase; explicit policy overrides item names', () => {
  const result = rows(
    [product('used', { name: 'หมวก มือสอง', can_reorder: false }), product('empty'),
      product('manually-enabled', { name: 'เสื้อ มือสอง', can_reorder: true }),
      product('inactive', { is_active: false }), product('legacy', { can_reorder: undefined })],
    [stock('used', 0), stock('empty', 0), stock('manually-enabled', 0), stock('inactive', 0), stock('legacy', 1)],
    [movement('used', 3), movement('manually-enabled', 3), movement('inactive', 30), movement('legacy', 6)],
  );
  const byId = Object.fromEntries(result.map(row => [row.product.id, row]));
  assert.equal(byId.used.requiresOrder, false);
  assert.equal(byId.used.needToOrder, 3, 'Keep consumption calculations while policy prevents purchase');
  assert.equal(byId.empty.isEmpty, true);
  assert.equal(byId.empty.requiresOrder, false, 'Zero <= zero is not an actionable purchase');
  assert.equal(byId['manually-enabled'].requiresOrder, true);
  assert.equal(byId.legacy.canReorder, true);
  assert.equal(byId.inactive, undefined);
  assert.deepEqual(result.map(row => row.product.id), ['legacy', 'manually-enabled', 'used', 'empty']);
});

test('usage counts only issues and loans inside the selected window and respects configured lead time', () => {
  const [row] = rows([product('gloves')], [stock('gloves', 23)], [
    movement('gloves', 6, '2026-08-01'),
    movement('gloves', 6, '2026-09-15', 'borrow'),
    movement('gloves', 6, '2026-10-31'),
    movement('gloves', 300, '2026-10-31', 'stock_in'),
    movement('gloves', 300, '2026-10-31', 'return'),
    movement('gloves', 300, '2026-07-31'),
    movement('gloves', 300, '2026-11-01'),
  ], 2);
  assert.deepEqual(row.usage, [6, 6, 6]);
  assert.equal(row.usage3, 18);
  assert.equal(row.avg3, 6);
  assert.equal(row.safetyStock, 12);
  assert.equal(row.minV, 18);
  assert.equal(row.maxV, 42);
  assert.equal(row.avgV, 30);
  assert.equal(row.reorderPoint, 24);
  assert.equal(row.needToOrder, 7);
  assert.equal(row.requiresOrder, true);
  assert.equal(leadTimeDays(null), 30);
  assert.equal(leadTimeDays({ quotation_days: 5, pr_days: 10, wams_open_days: 5, wams_process_days: 10, delivery_days: 30 }), 60);
});

test('three-month windows cross years correctly and include the last day of leap February', () => {
  assert.deepEqual(orderMonths('2026-01'), ['2025-11', '2025-12', '2026-01']);
  assert.deepEqual(orderDateRange('2024-02'), { start: '2023-12-01', end: '2024-02-29' });
  assert.deepEqual(orderDateRange('2025-02'), { start: '2024-12-01', end: '2025-02-28' });
  assert.equal(monthKey(2026, -1), '2025-12');
});

test('URL periods must be complete Gregorian months within the supported range', () => {
  for (const value of [null, '', '2026-1', '2026-00', '2026-13', '2026-10-01', '2569-10', '1999-12', 'abc']) {
    assert.equal(isOrderPeriod(value), false, String(value));
  }
  for (const value of ['2000-01', '2026-10', '2100-12']) assert.equal(isOrderPeriod(value), true);
});

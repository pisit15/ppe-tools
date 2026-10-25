// Live local HTTP regression against synthetic in-memory data only.
// Start `node tests/procurement-preview.cjs`, then `node --test tests/procurement-api-smoke.cjs`.
// This does not start a browser, alter procurement records, or contact a production service.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:4320';

test('procurement HTTP flow: auth, group evidence, filters and PR documents', async t => {
  let cookie = '';
  const request = async (path, options = {}) => {
    const response = await fetch(base + path, {
      ...options, headers: { origin: base, ...(cookie ? { cookie } : {}), ...options.headers },
      signal: AbortSignal.timeout(60_000),
    });
    return { response, data: await response.json() };
  };
  const get = async path => {
    const result = await request(path);
    assert.equal(result.response.status, 200, `GET ${path} should succeed`);
    return result.data;
  };
  const search = values => get('/api/procurement/search?' + new URLSearchParams(values));

  await t.test('anonymous search and PR access are rejected', async () => {
    for (const path of ['/api/procurement/search?q=glove', '/api/procurement/pr?no=PR24000001', '/api/procurement/prs']) {
      assert.equal((await request(path)).response.status, 401);
    }
  });

  await t.test('test administrator authenticates through the application login', async () => {
    const { response, data } = await request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'audit-admin', password: 'local-test-only' }),
    });
    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.user.username, 'audit-admin');
    cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(cookie, 'session cookie issued');
  });

  const initial = await search({ q: 'ถุงมือ' });
  assert.equal(initial.meta.imported_by, 'local-test-admin', 'only the synthetic procurement fixture is allowed');
  let cotton;
  await t.test('mixed search has groups and raw records, without pooled statistics', () => {
    assert.ok(initial.total > 0);
    assert.ok(initial.groups.length >= 6);
    assert.equal(initial.comparison_ready, false);
    assert.equal(initial.summary, null);
    assert.deepEqual(initial.vendors, []);
    assert.ok(initial.points.every(p => typeof p.unit_price === 'number'));
    assert.deepEqual(new Set(initial.units.map(u => u.unit)), new Set(['คู่', 'กล่อง']));
    cotton = initial.groups.find(g => g.item === 'ถุงมือผ้าฝ้าย 7 ขีด' && g.ready);
    assert.ok(cotton, 'known-basis cotton PO group exists');
    assert.ok(cotton.original_units.includes('PAIR'));
    assert.ok(cotton.original_units.includes('pair'));
    assert.ok(cotton.original_units.includes('คู่'));
  });

  await t.test('selected known PO group returns accurate full summary and vendor table data', async () => {
    const selected = await search({ q: 'ถุงมือ', group: cotton.id });
    assert.equal(selected.comparison_ready, true);
    assert.equal(selected.selected_group, cotton.id);
    assert.equal(selected.total, 4);
    assert.equal(selected.summary.po_count, 4);
    assert.equal(selected.summary.po_median, 23.02);
    assert.equal(selected.summary.vendor_count, 2);
    assert.equal(selected.vendors.length, 2);
    assert.ok(selected.points.every(p => p.item === cotton.item && p.source === 'po'));
    assert.ok(selected.points.every(p => p.currency === 'THB' && p.tax_basis === 'ex_vat'));
  });

  await t.test('unconfirmed quotation group exposes documents without price summaries', async () => {
    const unknown = initial.groups.find(g => g.tax_basis === 'unknown');
    assert.ok(unknown);
    const selected = await search({ q: 'ถุงมือ', group: unknown.id });
    assert.ok(selected.points.length > 0);
    assert.equal(selected.comparison_ready, false);
    assert.equal(selected.summary, null);
    assert.deepEqual(selected.vendors, []);
    assert.ok(selected.points.every(p => p.source === 'quote'));
  });

  await t.test('year and unit aliases constrain records, while stale group selection stays empty', async () => {
    const year = await search({ q: 'ถุงมือ', y: '2025', group: cotton.id });
    assert.equal(year.summary.po_count, 2);
    assert.equal(year.summary.po_median, 23.52);
    assert.ok(year.points.every(p => p.period_date.startsWith('2025')));
    assert.equal(year.outside, 2);
    const pair = await search({ q: 'ถุงมือ', unit: 'PAIR' });
    assert.ok(pair.points.length > 0);
    assert.ok(pair.points.every(p => ['คู่', 'PAIR', 'pair', 'PRS'].includes(p.unit)));
    assert.ok(pair.groups.every(g => g.unit === 'คู่'));
    const box = await search({ q: 'ถุงมือ', unit: 'กล่อง' });
    assert.ok(box.points.length > 0);
    assert.ok(box.points.every(p => p.unit === 'กล่อง'));
    for (const extra of [{ y: '2026' }, { unit: 'กล่อง' }, { q: 'ถุงมือไนไตรล์' }]) {
      const stale = await search({ q: 'ถุงมือ', group: cotton.id, ...extra });
      assert.equal(stale.comparison_ready, false);
      assert.equal(stale.selected_group, null);
      assert.equal(stale.summary, null);
      assert.deepEqual(stale.vendors, []);
      assert.deepEqual(stale.points, []);
    }
  });

  await t.test('PR list, one-quote detail, summary and vendor reports remain reachable', async () => {
    const list = await get('/api/procurement/prs');
    assert.equal(list.isAdmin, true);
    assert.equal(list.prs.length, 19);
    const pr = await get('/api/procurement/pr?no=PR24000001');
    assert.equal(pr.pr.pr_no, 'PR24000001');
    assert.equal(pr.quotes.length, 1);
    assert.equal(pr.po.length, 1);
    assert.equal(pr.lines.length, 1);
    assert.equal(pr.items.length, 1);
    assert.equal(typeof pr.po[0].subtotal, 'number');
    assert.equal((await request('/api/procurement/pr?no=invalid')).response.status, 400);
    assert.equal((await request('/api/procurement/pr?no=PR99999999')).response.status, 404);
    const summary = await get('/api/procurement/summary');
    assert.equal(summary.prs.length, 19);
    const vendors = await get('/api/procurement/vendors?y=2025');
    assert.equal(vendors.sel, 2025);
    assert.ok(vendors.vendors.length >= 3);
    const idle = await search({ q: '' });
    assert.ok(idle.top.length > 0);
  });

  await t.test('search overview returns all seven training records without requiring a group', async () => {
    const result = await search({ q: 'อบรม รถยก', y: '2026' });
    assert.equal(result.match_total, 7);
    assert.equal(result.points.length, 7);
    assert.equal(result.points.filter(point => point.source === 'po').length, 3);
    assert.equal(result.points.filter(point => point.source === 'quote').length, 4);
    assert.equal(new Set(result.points.map(point => point.vendor_key)).size, 4);
    assert.equal(result.points.filter(point => point.date === null).length, 1);
    assert.equal(result.points.filter(point => point.date?.slice(0, 10) === '2026-03-09' && point.unit_price === 22000).length, 3);
    assert.equal(result.summary, null, 'unlike units must not receive a pooled price statistic');
  });
  await t.test('dense and unconfirmed-currency records remain complete for browser verification', async () => {
    const dense = await search({ q: 'ตรวจกราฟหลายรายการ' });
    assert.equal(dense.points.length, 25);
    assert.equal(new Set(dense.points.map(point => point.id)).size, 25);
    const unknown = await search({ q: 'สกุลเงินทดสอบ' });
    assert.equal(unknown.points.length, 2);
    assert.ok(unknown.points.every(point => !point.currency && point.unit_price === 22000));
  });
});

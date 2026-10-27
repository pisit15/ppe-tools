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
    for (const path of ['/api/procurement/search?q=glove', '/api/procurement/pr?no=PR24000001', '/api/procurement/prs', '/api/procurement/summary', '/api/procurement/vendors']) {
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

  let directVendorKey;
  await t.test('a cold direct PR request learns Thai and English vendor aliases before marking the chosen quotation', async () => {
    // This must be the first authenticated procurement request after a fresh fixture server start.
    const detail = await get('/api/procurement/pr?no=PR24000001');
    assert.equal(detail.po.length, 1);
    assert.equal(detail.quotes.length, 1);
    assert.ok(detail.po[0].vendor.includes('(Siam Safety Test Co., Ltd.)'));
    assert.equal(detail.quotes[0].vendor, 'Siam Safety Test Co., Ltd.');
    assert.equal(detail.quotes[0].selected, true, 'English-only quotation must match the PO supplier alias on first request');
    directVendorKey = detail.quotes[0].vendor_key;
    assert.ok(directVendorKey);
  });

  const initial = await search({ q: 'ถุงมือ' });
  assert.equal(initial.meta.imported_by, 'local-test-admin', 'only the synthetic procurement fixture is allowed');
  assert.ok(initial.points.filter(point => point.pr_no === 'PR24000001').every(point => point.vendor_key === directVendorKey), 'direct PR and search use the same resolved vendor identity');
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
    assert.equal(list.prs.length, 21);
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
    assert.equal(summary.prs.length, 21);
    assert.equal(summary.scope, 'all');
    assert.ok(summary.prs.some(pr => pr.odoo_id === 92), 'admin summary includes unresolved sites');
    const vendors = await get('/api/procurement/vendors?y=2025');
    assert.equal(vendors.sel, 2025);
    assert.ok(vendors.vendors.length >= 3);
    const allVendors = await get('/api/procurement/vendors?y=all');
    assert.equal(allVendors.currency_omissions.all.foreign, 1, 'EUR PO line is disclosed and omitted from THB totals');
    assert.equal(allVendors.currency_omissions.all.unknown, 0);
    const eur = await search({ q: 'อุปกรณ์จำลองสกุลยูโร' });
    assert.equal(eur.points.length, 1);
    assert.equal(eur.points[0].currency, 'EUR', 'foreign-currency source record stays accessible');
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
  await t.test('large results can be paged without missing or repeating records', async () => {
    const first = await search({ q: 'รายการแบ่งหน้าทดสอบ', page: '1' });
    const second = await search({ q: 'รายการแบ่งหน้าทดสอบ', page: '2' });
    assert.equal(first.total, 650);
    assert.equal(first.page_count, 2);
    assert.equal(first.points.length, 600);
    assert.equal(second.page, 2);
    assert.equal(second.points.length, 50);
    assert.equal(new Set([...first.points, ...second.points].map(point => `${point.source}:${point.id}`)).size, 650);
    const beyond = await search({ q: 'รายการแบ่งหน้าทดสอบ', page: '999' });
    assert.equal(beyond.page, 2, 'out-of-range pages clamp to the last page');
    assert.equal(beyond.points.length, 50);
    const filter = await search({ q: 'รายการแบ่งหน้าทดสอบ', basis: 'once', tax: 'unknown', page: '2' });
    assert.equal(filter.total, 650);
    assert.equal(filter.points.length, 50);
    assert.ok(filter.points.every(point => point.price_basis === 'once' && point.tax_basis === 'unknown'));
  });

  await t.test('all active user account types read every PR, while summaries stay within assigned companies', async t => {
    const accounts = [
      { username: 'audit-amt', sites: ['amt'], count: 10 },
      { username: 'audit-aab', sites: ['aab'], count: 10 },
      { username: 'amt', sites: ['amt'], count: 10 }, // Shared company login.
      { username: 'audit-restricted', sites: ['amt'], count: 10 }, // Other module limited to PPE.
      { username: 'audit-tools', sites: ['aab'], count: 10 },
      { username: 'audit-multi', company_id: 'amt', sites: ['aab', 'amt'], count: 20 },
      { username: 'audit-linked', sites: ['aab', 'amt'], count: 20 }, // Linked account names, same requester.
      { username: 'audit-unassigned', sites: ['unknown'], count: 0 },
    ];
    for (const account of accounts) await t.test(account.username, async () => {
      cookie = '';
      const login = await request('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: 'local-test-only', company_id: account.company_id }),
      });
      assert.equal(login.response.status, 200);
      assert.equal(login.data.success, true);
      assert.equal(login.data.user.role, 'user');
      cookie = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.ok(cookie);

      const list = await get('/api/procurement/prs');
      assert.equal(list.isAdmin, false);
      assert.equal(list.prs.length, 21, 'PR list includes every company and unmapped PR');
      for (const no of ['PR24000001', 'PR24000002', 'PR26000901', 'PR26000902']) {
        const detail = await get('/api/procurement/pr?' + new URLSearchParams({ no }));
        assert.equal(detail.pr.pr_no, no, 'direct links work across companies and unmapped sites');
      }
      const summary = await get('/api/procurement/summary');
      assert.equal(summary.scope, 'company');
      assert.equal(summary.prs.length, account.count);
      assert.deepEqual(summary.sites.map(site => site.id).sort(), account.sites);
      assert.ok(summary.prs.every(pr => pr.sites.some(site => account.sites.includes(site))), 'every summary PR intersects assigned sites');
      assert.ok(!summary.prs.some(pr => pr.odoo_id === 92), 'unresolved PR is excluded from nonadmin summaries');
      if (account.username === 'audit-amt') {
        assert.ok(!summary.prs.some(pr => pr.odoo_id === 91), 'own PR for AAB must not enter the AMT summary');
      }
      const forged = await get('/api/procurement/summary?company_id=aab&site=aab&scope=all&isAdmin=true');
      assert.deepEqual(forged.prs.map(pr => pr.odoo_id), summary.prs.map(pr => pr.odoo_id), 'client parameters cannot broaden summary access');

      const results = await search({ q: 'ถุงมือ' });
      assert.equal(results.points.length, initial.points.length, 'price search is global for every user');
      const vendor = await get('/api/procurement/vendors?' + new URLSearchParams({ name: 'บริษัท สยามเซฟตี้ ทดสอบ จำกัด', y: 'all' }));
      assert.ok(vendor.prs.some(pr => pr.company === 'AMT'));
      assert.ok(vendor.prs.some(pr => pr.company === 'AAB'), 'vendor related PRs include all companies');

      const deniedImport = await request('/api/procurement/import', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upsert', table: 'proc_pr', rows: [] }),
      });
      assert.equal(deniedImport.response.status, 403, 'read access never grants import permission');
    });
  });
});

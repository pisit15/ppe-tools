const { test, expect } = require('@playwright/test');

// Eight active items: three purchase candidates; six distinct stock alerts
// (four empty and two low-but-positive); one never-used item; one non-purchasable.
// The inactive item, positive calculated need above the reorder point, and old
// usage outside the selected window must not inflate purchasing counts.
const inventory = [
  { id: 'below', name: 'ถุงมือ ต่ำกว่าเกณฑ์', item_code: 'LOW', current_stock: 4, usage: 9, min_stock: 5, total_in: 13, total_out: 9 },
  { id: 'equal', name: 'รองเท้า เท่ากับเกณฑ์', item_code: 'EQUAL', current_stock: 6, usage: 9, min_stock: 0, total_in: 15, total_out: 9, transaction_type: 'borrow' },
  { id: 'above', name: 'แว่นตา สูงกว่าเกณฑ์', item_code: 'ABOVE', current_stock: 7, usage: 9, min_stock: 10, total_in: 16, total_out: 9 },
  { id: 'used-zero', name: 'หน้ากาก หมดแต่มีการใช้', item_code: 'USED-ZERO', current_stock: 0, usage: 3, min_stock: 5, total_in: 3, total_out: 3 },
  { id: 'reused', name: 'หมวก มือสอง', item_code: 'REUSED', current_stock: 0, usage: 90, min_stock: 5, total_in: 90, total_out: 90, can_reorder: false },
  { id: 'never', name: 'เสื้อ ไม่เคยเคลื่อนไหว', item_code: 'NEVER', current_stock: 0, usage: 0, min_stock: 5, total_in: 0, total_out: 0 },
  { id: 'stocked', name: 'อุปกรณ์ มีสต็อกแต่ไม่ใช้ช่วงนี้', item_code: 'STOCKED', current_stock: 2, usage: 0, min_stock: 0, total_in: 5, total_out: 3 },
  { id: 'old-zero', name: 'สายรัด เคยใช้ก่อนช่วงนี้', item_code: 'OLD-ZERO', current_stock: 0, usage: 0, min_stock: 5, total_in: 10, total_out: 10 },
  { id: 'inactive', name: 'สินค้ายกเลิกใช้งาน', item_code: 'INACTIVE', current_stock: 0, usage: 100, min_stock: 5, total_in: 100, total_out: 100, is_active: false },
];

async function mockDashboard(page) {
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00Z'));
  const state = { failCompany: null, requests: [] };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method(), 'Dashboard checks must never write data').toBe('GET');
    state.requests.push(url);
    const company = url.searchParams.get('company_id') || 'aab';
    const items = company === 'bbb'
      ? [{ id: 'other-company', name: 'สินค้า บริษัทบี', item_code: 'BBB', current_stock: 42, usage: 0, min_stock: 1, total_in: 42, total_out: 0 }]
      : inventory;
    const products = items.map(item => ({
      id: item.id, name: item.name, item_code: item.item_code, company_id: company,
      type: 'gloves', unit: 'ชิ้น', min_stock: item.min_stock, unit_price: 10,
      is_active: item.is_active !== false, can_reorder: item.can_reorder !== false,
    }));
    const stocks = items.map(item => ({
      product_id: item.id, company_id: company, name: item.name, type: 'gloves', unit: 'ชิ้น',
      current_stock: item.current_stock, min_stock: item.min_stock,
      total_in: item.total_in, total_out: item.total_out,
    }));
    const transactions = items.filter(item => item.usage).map(item => ({
      id: `usage-${item.id}`, company_id: company, product_id: item.id,
      transaction_type: item.transaction_type || 'stock_out', transaction_date: '2026-10-01',
      quantity: item.usage, unit: 'ชิ้น', ppe_products: { name: item.name, type: 'gloves' },
    }));
    if (company === 'aab') {
      transactions.push(
        { id: 'old-usage', company_id: company, product_id: 'old-zero', transaction_type: 'stock_out', transaction_date: '2026-06-01', quantity: 10, unit: 'ชิ้น', ppe_products: { name: 'สายรัด เคยใช้ก่อนช่วงนี้', type: 'gloves' } },
        { id: 'stock-in', company_id: company, product_id: 'above', transaction_type: 'stock_in', transaction_date: '2026-10-02', quantity: 100, unit: 'ชิ้น', ppe_products: { name: 'แว่นตา สูงกว่าเกณฑ์', type: 'gloves' } },
        { id: 'returned', company_id: company, product_id: 'above', transaction_type: 'return', transaction_date: '2026-10-03', quantity: 100, unit: 'ชิ้น', ppe_products: { name: 'แว่นตา สูงกว่าเกณฑ์', type: 'gloves' } },
      );
    }
    const start = url.searchParams.get('start_date');
    const end = url.searchParams.get('end_date');
    const responses = {
      '/api/auth/session': { user: { id: 'test-admin', username: 'test-admin', role: 'admin', companyId: 'aab', companyName: 'AAB', displayName: 'Test Admin' } },
      '/api/companies': { data: [{ company_id: 'aab', company_name: 'AAB' }, { company_id: 'bbb', company_name: 'บริษัทบี' }] },
      '/api/ppe/products': { data: products },
      '/api/ppe/stock': { data: stocks },
      '/api/ppe/transactions': { data: transactions.filter(item => (!start || item.transaction_date >= start) && (!end || item.transaction_date <= end)) },
      '/api/ppe/order-settings': { data: { company_id: company, quotation_days: 1, pr_days: 1, wams_open_days: 1, wams_process_days: 13, delivery_days: 14 } },
      '/api/ppe/order-remarks': { data: [] },
    };
    expect(Object.hasOwn(responses, url.pathname), `Unexpected API request: ${url.pathname}`).toBe(true);
    if (url.pathname === '/api/ppe/stock') {
      expect(url.searchParams.has('low_stock'), 'Do not fetch overlapping alert groups separately').toBe(false);
      expect(url.searchParams.has('out_of_stock')).toBe(false);
    }
    if (url.pathname === '/api/ppe/products' && state.failCompany === company) {
      return route.fulfill({ status: 500, json: { error: 'Controlled dashboard load failure' } });
    }
    await route.fulfill({ json: responses[url.pathname] });
  });
  await page.goto('/ppe?company_id=aab');
  await expect(page.getByRole('heading', { name: 'ภาพรวม PPE', exact: true })).toBeVisible();
  await expect(page.getByTestId('dashboard-kpi-products')).toContainText('8');
  return state;
}

function actions(page) {
  return page.getByTestId('dashboard-actions');
}

function filter(page, label) {
  return actions(page).getByRole('button', { name: new RegExp(`^${label}`) });
}

async function expectVisibleActionNames(page, names) {
  for (const item of inventory) {
    const name = actions(page).getByText(item.name, { exact: true }).filter({ visible: true });
    if (names.includes(item.name)) await expect(name).toBeVisible();
    else await expect(name).toHaveCount(0);
  }
}

test('dashboard deduplicates stock alerts and its purchase candidates match the linked order report', async ({ page }) => {
  const state = await mockDashboard(page);
  await expect(page.getByTestId('dashboard-kpi-reorder')).toContainText('3');
  await expect(page.getByTestId('dashboard-kpi-alerts')).toContainText('6');
  await expect(page.getByTestId('dashboard-kpi-alerts')).toContainText('หมด 4 · ต่ำแต่ยังมี 2');
  await expect(page.getByTestId('dashboard-kpi-no-reorder')).toContainText('1');
  await expectVisibleActionNames(page, [inventory[0].name, inventory[1].name, inventory[3].name]);
  expect(await page.getByRole('heading', { name: 'รายการที่ต้องดำเนินการ', exact: true }).evaluate(element =>
    Boolean(element.compareDocumentPosition(document.getElementById('category-heading')) & Node.DOCUMENT_POSITION_FOLLOWING),
  )).toBe(true);
  const txRequest = state.requests.find(url => url.pathname === '/api/ppe/transactions');
  expect(txRequest.searchParams.get('start_date')).toBe('2026-08-01');
  expect(txRequest.searchParams.get('end_date')).toBe('2026-10-31');
  expect(txRequest.searchParams.get('limit')).toBe('20000');

  const orderLink = page.getByRole('link', { name: 'ไปหน้าคำนวณสั่งซื้อ', exact: true });
  const destination = new URL(await orderLink.getAttribute('href'), page.url());
  expect(destination.searchParams.get('company_id')).toBe('aab');
  expect(destination.searchParams.get('period')).toBe('2026-10');
  expect(destination.searchParams.get('only_need')).toBe('1');
  await page.screenshot({ path: 'test-results/ppe-dashboard-desktop.png', fullPage: true });
  await orderLink.click();
  await expect(page.getByRole('heading', { name: 'คำนวณสั่งซื้อ', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (3)' })).toBeChecked();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  expect((await page.locator('tbody tr td:nth-child(2)').allTextContents()).sort()).toEqual(['EQUAL', 'LOW', 'USED-ZERO']);
});

test('action filters distinguish stock alerts, purchasing policy, and truly unused items', async ({ page }) => {
  await mockDashboard(page);
  await filter(page, 'แจ้งเตือนสต็อก').click();
  await expectVisibleActionNames(page, ['below', 'above', 'used-zero', 'reused', 'never', 'old-zero'].map(id => inventory.find(item => item.id === id).name));
  await filter(page, 'ไม่สั่งซื้อเพิ่ม').click();
  await expectVisibleActionNames(page, [inventory[4].name]);
  await filter(page, 'ยังไม่เคยเคลื่อนไหว').click();
  await expectVisibleActionNames(page, [inventory[5].name]);
  await filter(page, 'ทั้งหมด').click();
  await expect(actions(page).locator('tbody tr')).toHaveCount(8);
  await expect(actions(page).locator('tbody tr').last()).toContainText('NEVER');
  await actions(page).getByLabel('ค้นหารายการ', { exact: true }).fill('OLD-ZERO');
  await expectVisibleActionNames(page, [inventory[7].name]);
});

test('all-company dashboard asks for a company without requesting misleading aggregate totals', async ({ page }) => {
  const state = await mockDashboard(page);
  const requestStart = state.requests.length;
  await page.goto('/ppe?company_id=all');
  await expect(page.getByRole('heading', { name: 'เลือกบริษัทเพื่อดูภาพรวม PPE', exact: true })).toBeVisible();
  const companyLink = page.getByRole('link', { name: 'AAB', exact: true });
  await expect(companyLink).toBeVisible();
  await expect(page.getByTestId('dashboard-kpi-products')).not.toBeVisible();
  await expect(actions(page)).not.toBeVisible();
  expect(state.requests.slice(requestStart).filter(url => url.pathname.startsWith('/api/ppe/'))).toEqual([]);

  await companyLink.click();
  await expect(page).toHaveURL(/\/ppe\?company_id=aab$/);
  await expect(page.getByTestId('dashboard-kpi-products')).toContainText('8');
  await expect(page.getByTestId('dashboard-kpi-reorder')).toContainText('3');
  expect(state.requests.filter(url => url.pathname.startsWith('/api/ppe/') && ['all', 'admin'].includes(url.searchParams.get('company_id')))).toEqual([]);
});

test('period changes recalculate usage and company load failures hide stale data until retry succeeds', async ({ page }) => {
  const state = await mockDashboard(page);
  await page.getByRole('combobox', { name: 'ช่วงการใช้งาน', exact: true }).selectOption('2026-09');
  await expect(page.getByTestId('dashboard-kpi-reorder')).toContainText('0');
  await expect(page.getByTestId('dashboard-kpi-products')).toContainText('8');
  await expect(page.getByTestId('dashboard-kpi-alerts')).toContainText('6');
  expect(state.requests.some(url => url.pathname === '/api/ppe/transactions' && url.searchParams.get('start_date') === '2026-07-01' && url.searchParams.get('end_date') === '2026-09-30')).toBe(true);
  const destination = new URL(await page.getByRole('link', { name: 'ไปหน้าคำนวณสั่งซื้อ', exact: true }).getAttribute('href'), page.url());
  expect(destination.searchParams.get('period')).toBe('2026-09');

  state.failCompany = 'bbb';
  await page.getByRole('combobox', { name: 'เลือกบริษัท', exact: true }).selectOption('bbb');
  await expect(page.getByText('โหลดข้อมูลไม่สำเร็จ', { exact: true })).toBeVisible();
  await expect(actions(page)).not.toBeVisible();
  await expect(page.getByTestId('dashboard-kpi-products')).not.toBeVisible();
  state.failCompany = null;
  await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click();
  await expect(page.getByTestId('dashboard-kpi-products')).toContainText('1');
  await expect(page.getByTestId('dashboard-kpi-reorder')).toContainText('0');
  await expect(page.getByTestId('dashboard-kpi-alerts')).toContainText('0');
  await filter(page, 'ทั้งหมด').click();
  await expect(actions(page).getByText('สินค้า บริษัทบี', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(actions(page).getByText(inventory[0].name, { exact: true })).toHaveCount(0);
});

test('mobile dashboard stays within the viewport and its navigation opens and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await expect(page.getByRole('button', { name: 'เปิดเมนู', exact: true })).toBeVisible();
  await expectVisibleActionNames(page, [inventory[0].name, inventory[1].name, inventory[3].name]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'เปิดเมนู', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ปิดเมนู', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'เลือกบริษัท', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'เปิดเมนู', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'เลือกบริษัท', exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ppe-dashboard-mobile.png', fullPage: true });
});

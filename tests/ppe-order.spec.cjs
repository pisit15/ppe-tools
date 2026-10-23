const { test, expect } = require('@playwright/test');
const ExcelJS = require('exceljs');

// Above-threshold products have a larger calculated order quantity than all
// qualifying products, and enough rows to expose sorting after pagination.
const above = Array.from({ length: 35 }, (_, i) => ({
  id: `above-${i + 1}`,
  name: `Above threshold ${String(i + 1).padStart(2, '0')}`,
  item_code: `ABOVE-${String(i + 1).padStart(2, '0')}`,
  current_stock: 116,
  usage: 165, // Re-order point 110, quantity 49: positive quantity alone is insufficient.
  unit_price: 100,
}));
const qualifying = [
  { id: 'below', name: 'Below threshold gloves', item_code: 'EDGE-LOW', current_stock: 40, usage: 66, unit_price: 10 },
  { id: 'equal', name: 'Boundary gloves', item_code: 'EDGE-EQUAL', current_stock: 44, usage: 66, unit_price: 20 },
  { id: 'zero', name: 'Zero stock and usage', item_code: 'EDGE-ZERO', current_stock: 0, usage: 0, unit_price: 30 },
];
const inventory = [
  ...above,
  // Deliberately shuffled: the displayed order must come from the calculation.
  qualifying[2], qualifying[1], qualifying[0],
  { id: 'inactive', name: 'Inactive product', item_code: 'INACTIVE', current_stock: 0, usage: 300, unit_price: 100, is_active: false },
];
const expectedCodes = [...qualifying, ...above].map(item => item.item_code);

async function openReport(page) {
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00Z'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.method(), 'Report verification must never write data').toBe('GET');
    const responses = {
      '/api/auth/session': { user: { id: 'test-admin', username: 'test-admin', role: 'admin', companyId: 'amt', companyName: 'AMT', displayName: 'Test Admin' } },
      '/api/companies': { data: [{ company_id: 'amt', company_name: 'AMT' }] },
      '/api/ppe/products': { data: inventory.map(item => ({
        id: item.id, name: item.name, item_code: item.item_code, unit_price: item.unit_price,
        company_id: 'amt', type: 'PPE', unit: 'ชิ้น', is_active: item.is_active !== false,
      })) },
      '/api/ppe/stock': { data: inventory.map(item => ({ product_id: item.id, current_stock: item.current_stock })) },
      '/api/ppe/transactions': { data: inventory.filter(item => item.usage).map(item => ({
        id: `usage-${item.id}`, product_id: item.id, transaction_type: 'stock_out',
        transaction_date: '2026-10-01', quantity: item.usage,
      })) },
      '/api/ppe/order-settings': { data: {
        company_id: 'amt', quotation_days: 0.5, pr_days: 0.5,
        wams_open_days: 1, wams_process_days: 14, delivery_days: 14,
      } },
      '/api/ppe/order-remarks': { data: [] },
    };
    expect(Object.hasOwn(responses, url.pathname), `Unexpected API request: ${url.pathname}`).toBe(true);
    if (url.pathname.startsWith('/api/ppe/')) expect(url.searchParams.get('company_id')).toBe('amt');
    await route.fulfill({ json: responses[url.pathname] });
  });
  await page.goto('/ppe/reports/order?company_id=amt');
  await expect(page.getByRole('heading', { name: 'คำนวณสั่งซื้อ' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(30);
}

function productRow(page, code) {
  return page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: code, exact: true }) });
}

async function visibleCodes(page) {
  return page.locator('tbody tr td:nth-child(2)').allTextContents();
}

async function exportedSheet(page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Excel' }).click();
  const download = await downloaded;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  return workbook.worksheets[0];
}

test('badge includes equality and zero, excludes positive quantities above threshold, and preserves quantities', async ({ page }) => {
  await openReport(page);
  for (const code of ['EDGE-LOW', 'EDGE-EQUAL', 'EDGE-ZERO']) {
    await expect(productRow(page, code).getByText('ต้องสั่งซื้อ', { exact: true })).toBeVisible();
  }
  await expect(productRow(page, 'ABOVE-01').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
  await expect(page.locator('tbody').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(3);
  await expect(productRow(page, 'EDGE-LOW').locator('td').nth(14)).toHaveText('26');
  await expect(productRow(page, 'EDGE-EQUAL').locator('td').nth(14)).toHaveText('22');
  await expect(productRow(page, 'EDGE-ZERO').locator('td').nth(14)).toHaveText('0');
  await expect(productRow(page, 'ABOVE-01').locator('td').nth(14)).toHaveText('49');
  await expect(page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (3)' })).toBeVisible();
  await expect(page.getByText('สินค้าทั้งหมด', { exact: true }).locator('..')).toContainText('38');
  await expect(page.getByText('มูลค่าโดยประมาณ (เฉพาะที่มีราคา)', { exact: true }).locator('..')).toContainText('฿700');
  await expect(page.getByText('Inactive product', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ppe-order-reorder-tag.png', fullPage: true });
});

test('qualifying items precede all other rows across pagination and search works with the reorder filter', async ({ page }) => {
  await openReport(page);
  expect(await visibleCodes(page)).toEqual(expectedCodes.slice(0, 30));
  const pagination = page.getByText('หน้า 1 / 2 · 38 รายการ', { exact: true }).locator('..');
  await pagination.getByRole('button').last().click();
  await expect(page.getByText('หน้า 2 / 2 · 38 รายการ', { exact: true })).toBeVisible();
  expect(await visibleCodes(page)).toEqual(expectedCodes.slice(30));
  await expect(page.locator('tbody').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (3)' }).check();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  expect(await visibleCodes(page)).toEqual(['EDGE-LOW', 'EDGE-EQUAL', 'EDGE-ZERO']);
  const search = page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code');
  await search.fill('gloves');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  expect(await visibleCodes(page)).toEqual(['EDGE-LOW', 'EDGE-EQUAL']);
  await search.fill('edge-zero');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(await visibleCodes(page)).toEqual(['EDGE-ZERO']);
  await search.fill('ABOVE-01');
  await expect(page.getByText('ไม่พบรายการ', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (3)' }).uncheck();
  await expect(productRow(page, 'ABOVE-01')).toBeVisible();
});

test('Excel exports every filtered row in the same priority order and retains the purchasing formulas', async ({ page }) => {
  await openReport(page);
  const fullSheet = await exportedSheet(page);
  expect(expectedCodes.map((_, i) => fullSheet.getCell(i + 5, 2).value)).toEqual(expectedCodes);
  expect(fullSheet.getCell('B43').value).toBeNull();
  expect(fullSheet.getCell('G5').value).toBe(40);
  expect(fullSheet.getCell('O5').formula).toBe('(J5*H5)+K5');
  expect(fullSheet.getCell('P5').formula).toBe('N5-G5');

  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (3)' }).check();
  await page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code').fill('gloves');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const filteredSheet = await exportedSheet(page);
  expect([filteredSheet.getCell('B5').value, filteredSheet.getCell('B6').value]).toEqual(['EDGE-LOW', 'EDGE-EQUAL']);
  expect(filteredSheet.getCell('B7').value).toBeNull();
});

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
  { id: 'used-zero', name: 'Used product with zero stock', item_code: 'EDGE-USED-ZERO', current_stock: 0, usage: 6, unit_price: 0 },
  { id: 'secondhand-override', name: 'รองเท้า มือสอง อนุญาตสั่งเพิ่ม', item_code: 'SECONDHAND-OVERRIDE', current_stock: 0, usage: 3, unit_price: 0, can_reorder: true },
];
const stockedWithoutUsage = { id: 'stocked-unused', name: 'Stock without recent usage', item_code: 'STOCKED-UNUSED', current_stock: 5, usage: 0, unit_price: 10 };
const empty = { id: 'zero', name: 'Zero stock and usage', item_code: 'EDGE-ZERO', current_stock: 0, usage: 0, unit_price: 30 };
const nonReorderable = [
  { id: 'secondhand', name: 'เสื้อสะท้อนแสง มือสอง', item_code: 'NO-REORDER-USED', current_stock: 0, usage: 900, unit_price: 999, can_reorder: false },
  { id: 'discontinued', name: 'Discontinued ordinary product', item_code: 'NO-REORDER-ORDINARY', current_stock: 1, usage: 150, unit_price: 999, can_reorder: false },
];
const nonReorderableEmpty = { id: 'secondhand-empty', name: 'หมวก มือสอง ไม่มียอดใช้', item_code: 'NO-REORDER-EMPTY', current_stock: 0, usage: 0, unit_price: 999, can_reorder: false };
const inventory = [
  ...above,
  // Deliberately shuffled: the displayed order must come from the calculation.
  nonReorderableEmpty, nonReorderable[1], empty, qualifying[2], stockedWithoutUsage,
  qualifying[1], nonReorderable[0], qualifying[0], qualifying[3],
  { id: 'inactive', name: 'Inactive product', item_code: 'INACTIVE', current_stock: 0, usage: 300, unit_price: 100, is_active: false },
];
const expectedCodes = [...qualifying, ...above, stockedWithoutUsage, ...nonReorderable, empty, nonReorderableEmpty].map(item => item.item_code);

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
        ...(item.can_reorder === undefined ? {} : { can_reorder: item.can_reorder }),
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
      '/api/ppe/order-remarks': { data: [{ product_id: 'secondhand', remark: 'เก็บคืนไว้ใช้ซ้ำ', actual_order_qty: 12 }] },
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

test('badge includes equality and zero stock with usage, excludes unused rows, and preserves quantities', async ({ page }) => {
  await openReport(page);
  for (const code of qualifying.map(item => item.item_code)) {
    await expect(productRow(page, code).getByText('ต้องสั่งซื้อ', { exact: true })).toBeVisible();
  }
  await expect(productRow(page, 'ABOVE-01').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
  await expect(page.locator('tbody').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(4);
  await expect(productRow(page, 'EDGE-LOW').locator('td').nth(14)).toHaveText('26');
  await expect(productRow(page, 'EDGE-EQUAL').locator('td').nth(14)).toHaveText('22');
  await expect(productRow(page, 'EDGE-USED-ZERO').locator('td').nth(14)).toHaveText('6');
  await expect(productRow(page, 'EDGE-ZERO')).toHaveCount(0);
  await expect(productRow(page, 'ABOVE-01').locator('td').nth(14)).toHaveText('49');
  await expect(page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' })).toBeVisible();
  await expect(page.getByText('สินค้าทั้งหมด', { exact: true }).locator('..')).toContainText(String(expectedCodes.length));
  await expect(page.getByText('มูลค่าโดยประมาณ (เฉพาะที่มีราคา)', { exact: true }).locator('..')).toContainText('฿700');
  await expect(page.getByText('Inactive product', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ppe-order-reorder-tag.png', fullPage: true });
});

test('sorts required items by quantity, keeps unused rows last across pagination, and excludes them from the filter', async ({ page }) => {
  await openReport(page);
  expect(await visibleCodes(page)).toEqual(expectedCodes.slice(0, 30));
  const pagination = page.getByText(`หน้า 1 / 2 · ${expectedCodes.length} รายการ`, { exact: true }).locator('..');
  await pagination.getByRole('button').last().click();
  await expect(page.getByText(`หน้า 2 / 2 · ${expectedCodes.length} รายการ`, { exact: true })).toBeVisible();
  expect(await visibleCodes(page)).toEqual(expectedCodes.slice(30));
  await expect(page.locator('tbody').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
  await expect(page.locator('tbody tr').last()).toContainText('NO-REORDER-EMPTY');
  await expect(productRow(page, 'EDGE-ZERO').locator('td').nth(14)).toHaveText('0');
  // The raw need is -5, but the purchasing display clamps it to zero.
  await expect(productRow(page, 'STOCKED-UNUSED').locator('td').nth(14)).toHaveText('0');

  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).check();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  expect(await visibleCodes(page)).toEqual(qualifying.map(item => item.item_code));
  const search = page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code');
  await search.fill('gloves');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  expect(await visibleCodes(page)).toEqual(['EDGE-LOW', 'EDGE-EQUAL']);
  await search.fill('edge-zero');
  await expect(page.getByText('ไม่พบรายการ', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).uncheck();
  await expect(productRow(page, 'EDGE-ZERO')).toBeVisible();
  await expect(productRow(page, 'EDGE-ZERO').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).check();
  await search.fill('ABOVE-01');
  await expect(page.getByText('ไม่พบรายการ', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).uncheck();
  await expect(productRow(page, 'ABOVE-01')).toBeVisible();
});

test('Excel exports every filtered row in the same priority order and retains the purchasing formulas', async ({ page }) => {
  await openReport(page);
  const fullSheet = await exportedSheet(page);
  expect(expectedCodes.map((_, i) => fullSheet.getCell(i + 5, 2).value)).toEqual(expectedCodes);
  expect(fullSheet.getCell(expectedCodes.length + 3, 2).value).toBe('EDGE-ZERO');
  expect(fullSheet.getCell(expectedCodes.length + 4, 2).value).toBe('NO-REORDER-EMPTY');
  expect(fullSheet.getCell(expectedCodes.length + 5, 2).value).toBeNull();
  expect(fullSheet.getCell('G5').value).toBe(40);
  expect(fullSheet.getCell('O5').formula).toBe('(J5*H5)+K5');
  expect(fullSheet.getCell('P5').formula).toBe('N5-G5');
  expect(fullSheet.getCell('S3').value).toBe('การสั่งซื้อเพิ่ม');
  for (const item of [...nonReorderable, nonReorderableEmpty]) {
    const row = expectedCodes.indexOf(item.item_code) + 5;
    expect(fullSheet.getCell(row, 16).value).toBe('—');
    expect(fullSheet.getCell(row, 16).formula).toBeUndefined();
    expect(fullSheet.getCell(row, 19).value).toBe('ไม่สั่งซื้อเพิ่ม');
    expect(fullSheet.getCell(row, 7).value).toBe(item.current_stock);
    expect(fullSheet.getCell(row, 9).formula).toBe(`SUM(D${row}:F${row})`);
  }
  expect(fullSheet.getCell(expectedCodes.indexOf('NO-REORDER-USED') + 5, 17).value).toBe('เก็บคืนไว้ใช้ซ้ำ');
  const overrideRow = expectedCodes.indexOf('SECONDHAND-OVERRIDE') + 5;
  expect(fullSheet.getCell(overrideRow, 16).formula).toBe(`N${overrideRow}-G${overrideRow}`);
  expect(fullSheet.getCell(overrideRow, 19).value).toBe('สั่งซื้อเพิ่มได้');

  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).check();
  await page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code').fill('gloves');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const filteredSheet = await exportedSheet(page);
  expect([filteredSheet.getCell('B5').value, filteredSheet.getCell('B6').value]).toEqual(['EDGE-LOW', 'EDGE-EQUAL']);
  expect(filteredSheet.getCell('B7').value).toBeNull();
});

test('non-reorderable products retain stock and remarks but cannot be ordered or included in required export', async ({ page }) => {
  await openReport(page);
  const search = page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code');
  await search.fill('NO-REORDER');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  expect(await visibleCodes(page)).toEqual([...nonReorderable, nonReorderableEmpty].map(item => item.item_code));
  for (const item of [...nonReorderable, nonReorderableEmpty]) {
    const row = productRow(page, item.item_code);
    await expect(row.getByText('ไม่สั่งซื้อเพิ่ม', { exact: true })).toBeVisible();
    await expect(row.getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
    await expect(row.locator('td').nth(14)).toHaveText('—');
    await expect(row.locator('td').nth(15)).toHaveText('—');
    await expect(row.getByRole('spinbutton')).toHaveCount(0);
    await expect(row.locator('td').nth(6)).toHaveText(String(item.current_stock));
    await expect(row.locator('td').nth(7)).toHaveText(String(item.usage));
  }
  await expect(productRow(page, 'NO-REORDER-USED').getByPlaceholder('เหตุผล / หมายเหตุ...')).toHaveValue('เก็บคืนไว้ใช้ซ้ำ');
  const sheet = await exportedSheet(page);
  expect([sheet.getCell('B5').value, sheet.getCell('B6').value, sheet.getCell('B7').value]).toEqual(['NO-REORDER-USED', 'NO-REORDER-ORDINARY', 'NO-REORDER-EMPTY']);
  expect(sheet.getCell('B8').value).toBeNull();
  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).check();
  await expect(page.getByText('ไม่พบรายการ', { exact: true })).toBeVisible();
  const emptySheet = await exportedSheet(page);
  expect(emptySheet.getCell('B5').value).toBeNull();
});

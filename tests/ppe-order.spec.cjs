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

async function openReport(page, { savedPurchases } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-23T05:00:00Z'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (savedPurchases && request.method() === 'POST' && url.pathname === '/api/ppe/order-remarks') {
      const purchase = request.postDataJSON();
      savedPurchases.push(purchase);
      await route.fulfill({ json: { data: purchase } });
      return;
    }
    expect(request.method(), 'Only the explicit editing test may save mock purchase data').toBe('GET');
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
  await expect(page.getByTestId('order-item')).toHaveCount(30);
}

function productRow(page, code) {
  return page.locator(`[data-testid="order-item"][data-product-code="${code}"]`);
}

async function visibleCodes(page) {
  return page.getByTestId('order-item').evaluateAll(items => items.map(item => item.getAttribute('data-product-code')));
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
  await expect(page.getByTestId('order-list').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(4);
  await expect(productRow(page, 'EDGE-LOW').getByTestId('order-need')).toHaveText('26');
  await expect(productRow(page, 'EDGE-EQUAL').getByTestId('order-need')).toHaveText('22');
  await expect(productRow(page, 'EDGE-USED-ZERO').getByTestId('order-need')).toHaveText('6');
  await expect(productRow(page, 'EDGE-ZERO')).toHaveCount(0);
  await expect(productRow(page, 'ABOVE-01').getByTestId('order-need')).toHaveText('49');
  await expect(page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' })).toBeVisible();
  await expect(page.getByText('สินค้าทั้งหมด', { exact: true }).locator('..')).toContainText(String(expectedCodes.length));
  await expect(page.getByText('มูลค่าโดยประมาณ (เฉพาะที่มีราคา)', { exact: true }).locator('..')).toContainText('฿700');
  await expect(page.getByText('Inactive product', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ppe-order-reorder-tag.png', fullPage: true });
});

test('sorts required items by quantity, keeps unused rows last across pagination, and excludes them from the filter', async ({ page }) => {
  await openReport(page);
  expect(await visibleCodes(page)).toEqual(expectedCodes.slice(0, 30));
  await page.getByRole('button', { name: 'หน้าถัดไป', exact: true }).click();
  await expect(page.getByText(`หน้า 2 / 2 · ${expectedCodes.length} รายการ`, { exact: true })).toBeVisible();
  expect(await visibleCodes(page)).toEqual(expectedCodes.slice(30));
  await expect(page.getByTestId('order-list').getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('order-item').last()).toHaveAttribute('data-product-code', 'NO-REORDER-EMPTY');
  await expect(productRow(page, 'EDGE-ZERO').getByTestId('order-need')).toHaveText('0');
  // The raw need is -5, but the purchasing display clamps it to zero.
  await expect(productRow(page, 'STOCKED-UNUSED').getByTestId('order-need')).toHaveText('0');

  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).check();
  await expect(page.getByTestId('order-item')).toHaveCount(4);
  expect(await visibleCodes(page)).toEqual(qualifying.map(item => item.item_code));
  const search = page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code');
  await search.fill('gloves');
  await expect(page.getByTestId('order-item')).toHaveCount(2);
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
  await expect(page.getByTestId('order-item')).toHaveCount(2);
  const filteredSheet = await exportedSheet(page);
  expect([filteredSheet.getCell('B5').value, filteredSheet.getCell('B6').value]).toEqual(['EDGE-LOW', 'EDGE-EQUAL']);
  expect(filteredSheet.getCell('B7').value).toBeNull();
});

test('non-reorderable products retain stock and remarks but cannot be ordered or included in required export', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReport(page);
  const search = page.getByPlaceholder('ค้นหาชื่อสินค้า / Item Code');
  await search.fill('NO-REORDER');
  await expect(page.getByTestId('order-item')).toHaveCount(3);
  expect(await visibleCodes(page)).toEqual([...nonReorderable, nonReorderableEmpty].map(item => item.item_code));
  for (const item of [...nonReorderable, nonReorderableEmpty]) {
    const row = productRow(page, item.item_code);
    await expect(row.getByText('ไม่สั่งซื้อเพิ่ม', { exact: true }).first()).toBeVisible();
    await expect(row.getByText('ต้องสั่งซื้อ', { exact: true })).toHaveCount(0);
    await expect(row.getByTestId('order-need')).toHaveText('—');
    await expect(row.getByRole('spinbutton')).toHaveCount(0);
    await expect(row.getByTestId('order-stock')).toHaveText(String(item.current_stock));
    await row.getByRole('button', { name: `รายละเอียด ${item.name}`, exact: true }).click();
    await expect(row.getByTestId('order-details').getByText('ใช้ 3 เดือน', { exact: true }).locator('..').locator('dd')).toHaveText(String(item.usage));
    await expect(row.getByRole('spinbutton')).toHaveCount(0);
  }
  await expect(productRow(page, 'NO-REORDER-USED').getByLabel('หมายเหตุ เสื้อสะท้อนแสง มือสอง', { exact: true })).toHaveValue('เก็บคืนไว้ใช้ซ้ำ');
  const sheet = await exportedSheet(page);
  expect([sheet.getCell('B5').value, sheet.getCell('B6').value, sheet.getCell('B7').value]).toEqual(['NO-REORDER-USED', 'NO-REORDER-ORDINARY', 'NO-REORDER-EMPTY']);
  expect(sheet.getCell('B8').value).toBeNull();
  await page.getByRole('checkbox', { name: 'เฉพาะที่ต้องสั่งซื้อ (4)' }).check();
  await expect(page.getByText('ไม่พบรายการ', { exact: true })).toBeVisible();
  const emptySheet = await exportedSheet(page);
  expect(emptySheet.getCell('B5').value).toBeNull();
});

async function expectReportFitsViewport(page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  const overflows = await page.getByTestId('order-list').evaluate(list =>
    [list, ...list.querySelectorAll('[data-testid="order-item"], [data-testid="order-details"], input, textarea, button')]
      .filter(element => element.getClientRects().length)
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 ||
          (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.scrollWidth > element.clientWidth + 1);
      })
      .map(element => ({ tag: element.tagName, testId: element.dataset.testid, width: element.clientWidth, contentWidth: element.scrollWidth })),
  );
  expect(overflows, 'Report items and editing controls must fit without clipping or horizontal scrolling').toEqual([]);
}

test('order report fits desktop and small phones with every calculation available through details', async ({ page }) => {
  await openReport(page);
  const item = productRow(page, 'EDGE-LOW');
  const toggle = item.getByRole('button', { name: 'รายละเอียด Below threshold gloves', exact: true });
  const details = item.getByTestId('order-details');
  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(page.getByTestId('order-table')).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(15);
  for (const name of ['Item Code', 'Remark', 'ราคา/หน่วย']) {
    await expect(page.getByRole('columnheader', { name, exact: true })).toHaveCount(0);
  }
  await expectReportFitsViewport(page);
  await page.screenshot({ path: 'test-results/ppe-order-desktop-table.png' });
  for (const width of [390, 320]) {
    await test.step(`No horizontal overflow at ${width}px, collapsed or expanded`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(details).not.toBeVisible();
      await expectReportFitsViewport(page);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(details).toBeVisible();
      for (const [label, value] of [
        ['ส.ค. 69', '0'], ['ก.ย. 69', '0'], ['ต.ค. 69', '66'],
        ['ใช้ 3 เดือน', '66'], ['เฉลี่ย/เดือน', '22'], ['Safety Stock', '22'],
        ['MIN', '44'], ['MAX', '88'], ['AVG.', '66'], ['ราคา/หน่วย', '฿10'],
      ]) {
        await expect(details.getByText(label, { exact: true }).locator('..').locator('dd')).toHaveText(value);
      }
      await expect(item.getByTestId('order-stock')).toHaveText('40');
      await expect(item.getByTestId('order-reorder-point')).toHaveText('44');
      await expect(item.getByTestId('order-need')).toHaveText('26');
      await expect(item.getByLabel('สั่งจริง Below threshold gloves', { exact: true })).toBeVisible();
      await expect(item.getByLabel('หมายเหตุ Below threshold gloves', { exact: true })).toBeVisible();
      await expectReportFitsViewport(page);
      if (width === 390) await page.screenshot({ path: 'test-results/ppe-order-mobile-details.png' });
      await toggle.click();
    });
  }
});

test('mobile purchase quantity and remarks save the correct product and survive detail toggles', async ({ page }) => {
  const savedPurchases = [];
  await page.setViewportSize({ width: 320, height: 844 });
  await openReport(page, { savedPurchases });
  const item = productRow(page, 'EDGE-LOW');
  const quantity = item.getByLabel('สั่งจริง Below threshold gloves', { exact: true });
  const remark = item.getByLabel('หมายเหตุ Below threshold gloves', { exact: true });
  const toggle = item.getByRole('button', { name: 'รายละเอียด Below threshold gloves', exact: true });
  await quantity.fill('18');
  await quantity.blur();
  await expect.poll(() => savedPurchases.at(-1)).toEqual({
    company_id: 'amt', product_id: 'below', period: '2026-10', remark: '', actual_order_qty: 18,
  });
  await remark.fill('สั่งตามจำนวนบรรจุในกล่อง เตรียมใช้เดือนถัดไป');
  await remark.blur();
  await expect.poll(() => savedPurchases.at(-1)).toEqual({
    company_id: 'amt', product_id: 'below', period: '2026-10',
    remark: 'สั่งตามจำนวนบรรจุในกล่อง เตรียมใช้เดือนถัดไป', actual_order_qty: 18,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(quantity).toHaveValue('18');
  await expect(remark).toHaveValue('สั่งตามจำนวนบรรจุในกล่อง เตรียมใช้เดือนถัดไป');
  expect(savedPurchases).toHaveLength(2);
  await expectReportFitsViewport(page);
});

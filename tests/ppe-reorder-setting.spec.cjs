const { test, expect } = require('@playwright/test');

async function openInventory(page, { rejectPatch = false } = {}) {
  const products = [
    { id: 'reused', name: 'หมวกเซฟตี้ มือสอง', can_reorder: false },
    { id: 'regular', name: 'ถุงมือใหม่', can_reorder: true },
    { id: 'legacy', name: 'Legacy product' },
  ].map(product => ({
    ...product, company_id: 'amt', type: 'gloves', unit: 'piece',
    min_stock: 10, is_active: true, image_url: null,
  }));
  const writes = [];

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/ppe/products' && request.method() !== 'GET') {
      const body = request.postDataJSON();
      writes.push({ method: request.method(), body });
      expect(typeof body.can_reorder).toBe('boolean');
      if (request.method() === 'POST') {
        expect(body.company_id).toBe('amt');
        const product = { id: `new-${products.length}`, is_active: true, ...body };
        products.push(product);
        return route.fulfill({ status: 201, json: { data: product } });
      }
      expect(request.method()).toBe('PATCH');
      if (rejectPatch) return route.fulfill({ status: 500, json: { error: 'Test save failure' } });
      const product = products.find(item => item.id === body.id);
      expect(product).toBeDefined();
      Object.assign(product, body);
      return route.fulfill({ json: { data: product } });
    }

    expect(request.method()).toBe('GET');
    const responses = {
      '/api/auth/session': { user: { id: 'test-admin', username: 'test-admin', role: 'admin', companyId: 'amt', companyName: 'AMT', displayName: 'Test Admin' } },
      '/api/companies': { data: [{ company_id: 'amt', company_name: 'AMT' }] },
      '/api/ppe/products': { data: products },
      '/api/ppe/stock': { data: products.map(product => ({ product_id: product.id, current_stock: 2 })) },
    };
    expect(Object.hasOwn(responses, url.pathname), `Unexpected API request: ${url.pathname}`).toBe(true);
    if (url.pathname.startsWith('/api/ppe/')) expect(url.searchParams.get('company_id')).toBe('amt');
    await route.fulfill({ json: responses[url.pathname] });
  });
  await page.goto('/ppe/inventory?company_id=amt');
  await expect(page.getByRole('heading', { name: 'จัดการสต็อก PPE' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  return writes;
}

function setting(page, name) {
  return page.getByRole('combobox', { name: `การสั่งซื้อเพิ่ม ${name}`, exact: true });
}

test('new products default to purchasable and save either explicit purchase setting', async ({ page }) => {
  const writes = await openInventory(page);
  await page.getByRole('button', { name: 'เพิ่มสินค้า', exact: true }).click();
  const createSetting = page.getByRole('combobox', { name: 'การสั่งซื้อเพิ่ม', exact: true });
  await expect(createSetting).toHaveValue('true');
  await page.getByLabel('ชื่อสินค้า *', { exact: true }).fill('New purchasable product');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(setting(page, 'New purchasable product')).toHaveValue('true');
  expect(writes[0]).toMatchObject({ method: 'POST', body: { can_reorder: true } });

  await page.getByRole('button', { name: 'เพิ่มสินค้า', exact: true }).click();
  await page.getByLabel('ชื่อสินค้า *', { exact: true }).fill('Returned product');
  await createSetting.selectOption('false');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(setting(page, 'Returned product')).toHaveValue('false');
  expect(writes[1]).toMatchObject({ method: 'POST', body: { can_reorder: false } });
  await page.reload();
  await expect(setting(page, 'Returned product')).toHaveValue('false');
  await expect(setting(page, 'New purchasable product')).toHaveValue('true');
  await page.getByRole('button', { name: 'เพิ่มสินค้า', exact: true }).click();
  await expect(createSetting).toHaveValue('true');
});

test('existing products persist explicit changes both ways without inferring setting from name', async ({ page }) => {
  const writes = await openInventory(page);
  await expect(setting(page, 'หมวกเซฟตี้ มือสอง')).toHaveValue('false');
  await expect(setting(page, 'Legacy product')).toHaveValue('true');
  await setting(page, 'ถุงมือใหม่').selectOption('false');
  await expect(setting(page, 'ถุงมือใหม่')).toHaveValue('false');
  await expect(setting(page, 'ถุงมือใหม่')).toBeEnabled();
  await setting(page, 'หมวกเซฟตี้ มือสอง').selectOption('true');
  await expect(setting(page, 'หมวกเซฟตี้ มือสอง')).toHaveValue('true');
  await expect(setting(page, 'หมวกเซฟตี้ มือสอง')).toBeEnabled();
  expect(writes).toEqual([
    { method: 'PATCH', body: { id: 'regular', can_reorder: false } },
    { method: 'PATCH', body: { id: 'reused', can_reorder: true } },
  ]);
  await page.reload();
  await expect(setting(page, 'ถุงมือใหม่')).toHaveValue('false');
  await expect(setting(page, 'หมวกเซฟตี้ มือสอง')).toHaveValue('true');
});

test('failed save keeps the stored purchase setting and reports the failure', async ({ page }) => {
  const writes = await openInventory(page, { rejectPatch: true });
  await setting(page, 'ถุงมือใหม่').selectOption('false');
  await expect(page.getByText('บันทึกการสั่งซื้อเพิ่มไม่สำเร็จ กรุณาลองใหม่', { exact: true })).toBeVisible();
  await expect(setting(page, 'ถุงมือใหม่')).toHaveValue('true');
  await expect(setting(page, 'ถุงมือใหม่')).toBeEnabled();
  expect(writes).toHaveLength(1);
  await page.reload();
  await expect(setting(page, 'ถุงมือใหม่')).toHaveValue('true');
});

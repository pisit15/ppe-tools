const { test, expect } = require('@playwright/test');
const id = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const foreign = '44444444-4444-4444-8444-444444444444';
const root = '/api/chemical/substances';
async function login(request) {
  expect((await request.post('/api/auth/login', { data: { username: 'audit-amt', password: 'local-test-only' } })).status()).toBe(200);
}
async function get(request, key = id) {
  return (await (await request.get(`${root}/${key}`)).json()).data;
}
async function update(request, key, data) {
  const current = await get(request, key);
  return request.put(`${root}/${key}`, { data: { ...data, expected_updated_at: current.updated_at } });
}
test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:4311/__test/reset')).ok()).toBe(true);
});

test('company document codes save through form, sort naturally both ways with blanks last, and search', async ({ page }) => {
  await login(page.request);
  await page.goto('/chemical?company_id=amt');
  await page.getByRole('link', { name: 'แก้ไข Test Acetone', exact: true }).click();
  await page.getByLabel('รหัส / หมายเลขเอกสาร', { exact: true }).fill('  SDS-10  ');
  await page.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Test Acetone' })).toContainText('SDS-10');
  expect((await get(page.request)).document_code).toBe('SDS-10');
  await page.reload();
  await page.getByRole('link', { name: 'แก้ไข Test Acetone', exact: true }).click();
  await expect(page.getByLabel('รหัส / หมายเลขเอกสาร', { exact: true })).toHaveValue('SDS-10');
  expect((await update(page.request, second, { document_code: 'SDS-2' })).status()).toBe(200);
  expect((await page.request.post(root, { data: { company_id: 'amt', name: 'First document', document_code: 'SDS-001' } })).status()).toBe(201);
  await page.goto('/chemical?company_id=amt');
  const sort = page.getByRole('button', { name: /^รหัส \/ เลขเอกสาร/ });
  const codes = page.locator('tbody tr td:first-child');
  await expect(page.locator('thead th').first()).toHaveAttribute('aria-sort', 'ascending');
  await expect(codes).toHaveText(['SDS-001', 'SDS-2', 'SDS-10', '—']);
  await sort.click();
  await expect(page.locator('thead th').first()).toHaveAttribute('aria-sort', 'descending');
  await expect(codes).toHaveText(['SDS-10', 'SDS-2', 'SDS-001', '—']);
  await page.getByLabel('ค้นหาสารเคมี', { exact: true }).fill('sds-2');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('Test Missing SDS');
  await page.getByLabel('ค้นหาสารเคมี', { exact: true }).fill('');
  await sort.click();
  await page.screenshot({ path: 'test-results/chemical-document-codes-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(codes).toHaveText(['SDS-001', 'SDS-2', 'SDS-10', '—']);
});

test('partial edits preserve document code, explicit clear works, invalid values and foreign tenants are rejected', async ({ request }) => {
  await login(request);
  expect((await update(request, id, { document_code: '  เอกสาร-001  ' })).status()).toBe(200);
  expect((await get(request)).document_code).toBe('เอกสาร-001');
  expect((await update(request, id, { notes: 'Unrelated edit' })).status()).toBe(200);
  expect((await get(request)).document_code).toBe('เอกสาร-001');
  for (const code of [12, {}, [], 'A'.repeat(121)]) {
    expect((await update(request, id, { document_code: code })).status()).toBe(400);
  }
  expect((await request.put(`${root}/${foreign}`, { data: { document_code: 'DENIED' } })).status()).toBe(404);
  expect((await update(request, id, { document_code: '   ' })).status()).toBe(200);
  expect((await get(request)).document_code).toBeNull();
  expect((await update(request, id, { document_code: '0' })).status()).toBe(200);
  expect((await get(request)).document_code).toBe('0');
  expect((await update(request, id, { document_code: null })).status()).toBe(200);
  expect((await get(request)).document_code).toBeNull();
});

test('new posters inherit the registry code while saved revisions retain their document number', async ({ page }) => {
  await login(page.request);
  expect((await update(page.request, id, { document_code: 'SDS-001' })).status()).toBe(200);
  await page.goto(`/chemical/${id}/poster`);
  await expect(page.getByLabel('รหัสเอกสาร SDS', { exact: true })).toHaveValue('SDS-001');
  await page.getByRole('button', { name: 'บันทึกเป็น Rev ใหม่', exact: true }).click();
  await expect(page.getByText('บันทึก Rev1 แล้ว', { exact: false })).toBeVisible();
  expect((await update(page.request, id, { document_code: 'SDS-002' })).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('รหัสเอกสาร SDS', { exact: true })).toHaveValue('SDS-001');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'เริ่มใหม่จากทะเบียน', exact: true }).click();
  await expect(page.getByLabel('รหัสเอกสาร SDS', { exact: true })).toHaveValue('SDS-002');
});

test('changing document-code order resets pagination and sorts the full filtered register', async ({ page }) => {
  await login(page.request);
  for (let n = 1; n <= 32; n++) {
    expect((await page.request.post(root, { data: { company_id: 'amt', name: `Bulk ${String(n).padStart(2, '0')}`, document_code: `DOC-${33-n}` } })).status()).toBe(201);
  }
  await page.goto('/chemical?company_id=amt');
  await page.getByLabel('ค้นหาสารเคมี', { exact: true }).fill('Bulk');
  await page.getByRole('button', { name: 'ถัดไป →', exact: true }).click();
  await expect(page.getByText('หน้า 2/2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^รหัส \/ เลขเอกสาร/ }).click();
  await expect(page.getByText('หน้า 1/2', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr td:first-child')).toHaveText(Array.from({ length: 30 }, (_, i) => `DOC-${32-i}`));
  await page.getByRole('button', { name: 'ถัดไป →', exact: true }).click();
  await expect(page.locator('tbody tr td:first-child')).toHaveText(['DOC-2', 'DOC-1']);
});

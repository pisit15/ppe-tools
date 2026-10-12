// Deployed UI verification with read-only fixtures in an isolated browser.
// No authenticated production API calls or customer writes.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const base = process.argv[2] || 'https://tools.eashe.org';
const items = [
  ['00000000-0000-4000-8000-000000000010', 'Sort fixture 10', 'SDS-10'],
  ['00000000-0000-4000-8000-000000000002', 'Sort fixture 2', 'SDS-2'],
  ['00000000-0000-4000-8000-000000000003', 'Sort fixture blank', null],
].map(([id, name, document_code]) => ({ id, name, document_code, company_id: 'amt',
  ghs_pictograms: [], hazard_classes: [], h_codes: [], p_codes: [], ppe_required: [], first_aid: {},
  is_active: true, is_demo: false, updated_at: '2026-10-12T00:00:00Z' }));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    expect((await page.request.get(base + '/api/chemical/substances?company_id=amt')).status()).toBe(401);
    await page.route('**/api/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      expect(request.method()).toBe('GET');
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'ui-fixture', username: 'ui-fixture', companyId: 'amt', companyName: 'AMT', role: 'user' } } });
      if (path === '/api/chemical/substances') return route.fulfill({ json: { data: items } });
      if (path === '/api/chemical/storage-areas') return route.fulfill({ json: { data: [] } });
      if (path === '/api/chemical/extract') return route.fulfill({ json: { available: false } });
      const item = items.find(item => path === `/api/chemical/substances/${item.id}`);
      if (item) return route.fulfill({ json: { data: item } });
      throw new Error('Unexpected API request blocked: ' + path);
    });
    await page.goto(base + '/chemical?company_id=amt');
    const codes = page.locator('tbody tr td:first-child');
    const sort = page.getByRole('button', { name: /^รหัส \/ เลขเอกสาร/ });
    await sort.click();
    await expect(codes).toHaveText(['SDS-2', 'SDS-10', '—']);
    await expect(page.locator('thead th').first()).toHaveAttribute('aria-sort', 'ascending');
    await sort.click();
    await expect(codes).toHaveText(['SDS-10', 'SDS-2', '—']);
    await expect(page.locator('thead th').first()).toHaveAttribute('aria-sort', 'descending');
    await page.getByLabel('ค้นหาสารเคมี', { exact: true }).fill('sds-2');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'ดาวน์โหลดฉลากของ Sort fixture 2', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'โปสเตอร์สรุป SDS ของ Sort fixture 2', exact: true })).toBeVisible();
    await page.getByLabel('ค้นหาสารเคมี', { exact: true }).fill('');
    fs.mkdirSync('.verification/document-code', { recursive: true });
    await page.screenshot({ path: '.verification/document-code/register.png', fullPage: true });
    await page.getByRole('link', { name: 'แก้ไข Sort fixture 2', exact: true }).click();
    await expect(page.getByLabel('รหัส / หมายเลขเอกสาร', { exact: true })).toHaveValue('SDS-2');
    await expect(page.getByLabel('รหัส / หมายเลขเอกสาร', { exact: true })).toHaveAttribute('maxlength', '120');
    await page.getByRole('button', { name: 'กลับทะเบียน', exact: true }).click();
    await page.getByRole('link', { name: 'เพิ่มสารเคมี', exact: true }).click();
    await expect(page.getByLabel('รหัส / หมายเลขเอกสาร', { exact: true })).toHaveValue('');
    expect(errors).toEqual([]);
    const report = { base, checkedAt: new Date().toISOString(), naturalAscending: ['SDS-2', 'SDS-10', null], descendingNullsLast: true, codeSearch: true, editAndCreateField: true, labelAndPosterActions: true, errors, note: 'Deployed client; page APIs mocked only in isolated browser; no production writes.' };
    fs.writeFileSync('.verification/document-code/smoke.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

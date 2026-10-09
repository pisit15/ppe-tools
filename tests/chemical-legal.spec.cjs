const { test, expect } = require('@playwright/test');
const catalog = require('../data/chemical-legal/catalog-2026-10-09-v2.json');
const substanceId = '11111111-1111-4111-8111-111111111111';
const context = { purpose: 'Industrial cleaning; checked SDS and six-month possession log', concentration: '99', concentration_unit: '%w/w', reporting_period: '2569-1', reporting_scope: 'in', possessed_100kg: 'yes', workplace_exposure: 'yes' };
const login = async (request, username = 'audit-admin') => {
  const r = await request.post('/api/auth/login', { data: { username, password: 'local-test-only' } });
  expect(r.status(), await r.text()).toBe(200);
};
test.beforeEach(async ({ request }) => { expect((await request.post('http://127.0.0.1:4311/__test/reset')).ok()).toBe(true); });

test('previously audited peroxide and hydroxide show verified references, with no assessment UI', async ({ page }) => {
  await login(page.request);
  await page.goto('/chemical/legal?company_id=amt');
  await expect(page.getByText('ฐานข้อมูลอยู่ระหว่างตรวจทาน', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'ค้นหาสารอื่น', exact: true }).click();
  for (const cas of ['7722-84-1','1310-73-2']) {
    await page.getByLabel('ชื่อสารภาษาไทย / อังกฤษ หรือเลข CAS').fill(cas);
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.getByText('จับคู่ด้วย CAS ' + cas)).toBeVisible();
    await expect(page.getByRole('button', { name: /^สอ\.1 พบ [12] รายการยืนยัน/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^ตรวจความเข้มข้น พบ 1 รายการยืนยัน/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'บันทึกผลคัดกรอง', exact: true })).toHaveCount(0);
  }
});

test('register → verified legal reference → source and CSV, without assessment workflow', async ({ page }) => {
  await login(page.request);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/chemical?company_id=amt');
  await page.getByRole('link', { name: 'ตรวจสอบกฎหมายของ Test Acetone', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ตรวจสอบกฎหมายสารเคมี' })).toBeVisible();
  await expect(page.getByText('จับคู่ด้วย CAS 67-64-1')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'ชนิดวัตถุอันตราย' }).filter({ hasText: 'บัญชี 5.1 ลำดับ 367' }).click();
  await expect(page.getByText('ชนิดที่ 3 ตามเงื่อนไขรายการ')).toBeVisible();
  await expect(page.getByText('ความเข้มข้นมากกว่าร้อยละ 75', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ต้นฉบับ หน้า PDF 127' })).toHaveAttribute('href', /hazard\.fda\.moph\.go\.th.*#page=127/);
  await expect(page.getByRole('heading', { name: 'บันทึกบริบทและผลคัดกรอง' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'บันทึกผลคัดกรอง', exact: true })).toHaveCount(0);
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'ส่งออกผล CSV' }).click();
  expect((await downloaded).suggestedFilename()).toBe('chemical-legal-67-64-1.csv');
  await page.screenshot({ path: 'test-results/chemical-legal-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('external search distinguishes name candidates, invalid CAS, amendments and entry-specific repeal', async ({ page }) => {
  await login(page.request);
  await page.goto('/chemical/legal?company_id=amt');
  await page.getByRole('button', { name: 'ค้นหาสารอื่น', exact: true }).click();
  await page.getByLabel('ชื่อสารภาษาไทย / อังกฤษ หรือเลข CAS').fill('methanol');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'เลือกตัวตนของสารก่อนดูผลกฎหมาย' })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'CAS 67-56-1' }).click();
  await expect(page.getByText('จับคู่ด้วย CAS 67-56-1')).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'บัญชี 4.1 ลำดับ 159' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'รวมยกเลิก/ข้อความเดิม' }).check();
  await expect(page.locator('summary').filter({ hasText: 'บัญชี 4.1 ลำดับ 159' })).toContainText('ยกเลิกเฉพาะรายการนี้');
  await expect(page.locator('summary').filter({ hasText: 'ชนิดวัตถุอันตราย' }).filter({ hasText: 'บัญชี 5.1 ลำดับ 321' })).toContainText('มีผลตามเงื่อนไข');
  await page.getByLabel('ชื่อสารภาษาไทย / อังกฤษ หรือเลข CAS').fill('67641');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page.getByText('เลข CAS ไม่ถูกต้อง กรุณาตรวจจาก SDS ระบบจะไม่เติมขีดหรือเดาตัวเลขที่ขาด')).toBeVisible();
  await page.getByRole('button', { name: 'Sodium cyanide', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: 'ชนิดวัตถุอันตราย' }).filter({ hasText: 'บัญชี 5.1 ลำดับ 147' })).toHaveCount(1);
  await page.locator('summary').filter({ hasText: 'ชนิดวัตถุอันตราย' }).filter({ hasText: 'บัญชี 5.1 ลำดับ 147' }).click();
  await expect(page.getByText('ฉบับที่ 8 ตัดเงื่อนไขความเข้มข้นมากกว่า 1% w/w ออก')).toBeVisible();
});

test('legal routes reject anonymous, cross-company, forged results, stale register and cross-site writes', async ({ request }) => {
  expect((await request.get('/api/chemical/legal?company_id=amt')).status()).toBe(401);
  await login(request, 'audit-amt');
  expect((await request.get('/api/chemical/legal?company_id=aab')).status()).toBe(403);
  expect((await request.get(`/api/chemical/legal?company_id=amt&substance_id=44444444-4444-4444-8444-444444444444`)).status()).toBe(404);
  const base = { company_id: 'amt', cas: '67-64-1', release_id: catalog.release.id, review_status: 'pending', review_note: '', context };
  expect((await request.post('/api/chemical/legal/assessments', { data: { ...base, company_id: 'aab' } })).status()).toBe(403);
  expect((await request.post('/api/chemical/legal/assessments', { data: { ...base, substance_id: substanceId, substance_updated_at: '2000-01-01' } })).status()).toBe(409);
  expect((await request.post('/api/chemical/legal/assessments', { data: { ...base, release_id: 'forged-version' } })).status()).toBe(409);
  expect((await request.post('/api/chemical/legal/assessments', { headers: { origin: 'https://evil.example' }, data: base })).status()).toBe(403);
  const saved = await request.post('/api/chemical/legal/assessments', { data: { ...base, snapshot: { verdict: 'exempt' }, actor_name: 'Forged reviewer' } });
  expect(saved.status()).toBe(201);
  const row = (await saved.json()).data;
  expect(row.actor_name).toBe('audit-amt'); expect(row.snapshot.verdict).toBeUndefined(); expect(row.snapshot.check.cas).toBe('67-64-1');
  expect((await request.get('/api/chemical/legal/assessments?company_id=aab&cas=67-64-1')).status()).toBe(403);
  expect((await request.post('http://127.0.0.1:4311/__test/large-register')).ok()).toBe(true);
  const large = await (await request.get('/api/chemical/legal?company_id=amt&mode=register')).json();
  expect(large.register).toHaveLength(1004);
  expect(large.register.every(row => row.company_id === 'amt')).toBe(true);
});

test('mobile search, explicit uncertainty and company switch clear prior assessment context', async ({ page }) => {
  await login(page.request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/chemical/legal?company_id=amt&substance_id=${substanceId}`);
  await expect(page.getByText('จับคู่ด้วย CAS 67-64-1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'บันทึกผลคัดกรอง', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'เปิดเมนู Chemical' }).click();
  await page.getByLabel('เลือกบริษัท', { exact: true }).selectOption('aab');
  await expect(page).toHaveURL('/chemical/legal?company_id=aab');
  await expect(page.getByText('Test AAB Only', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดเมนู Chemical' }).click();
  await page.getByRole('button', { name: 'ค้นหาสารอื่น', exact: true }).click();
  await page.getByLabel('ชื่อสารภาษาไทย / อังกฤษ หรือเลข CAS').fill('7732-18-5');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ยังไม่พบรายการในชุดข้อมูล' })).toBeVisible();
  await expect(page.getByLabel('ลักษณะการใช้ / ผลิตภัณฑ์ / งานที่สัมผัส')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/chemical-legal-mobile.png', fullPage: true });
});

test('failed catalog load is not an empty result and retry loads complete catalog beyond 1,000 rows', async ({ page }) => {
  await login(page.request);
  await page.route('**/api/chemical/legal?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ชุดข้อมูลกฎหมายไม่ครบ' }) }));
  await page.goto('/chemical/legal?company_id=amt');
  await expect(page.getByRole('alert').filter({ hasText: 'ชุดข้อมูลกฎหมายไม่ครบ' })).toBeVisible();
  await expect(page.getByText('ยังไม่มีสารในทะเบียนใช้งานจริง', { exact: false })).toHaveCount(0);
  await page.unroute('**/api/chemical/legal?**');
  await page.getByRole('button', { name: 'ลองโหลดใหม่' }).click();
  await expect(page.getByText('Test Acetone', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'แหล่งข้อมูลและความครอบคลุม', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'สอ.1' })).toContainText('1516');
  const data = await (await page.request.get('/api/chemical/legal?company_id=amt&cas=108-88-3')).json();
  expect(data.check.entries.some(e => e.id === 'labour-1379')).toBe(true);
  await page.screenshot({ path: 'test-results/chemical-legal-sources.png', fullPage: true });
});

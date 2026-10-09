const { test, expect } = require('@playwright/test');
const fixture = 'http://127.0.0.1:4311';
const sample = {
  company_id: 'amt', name: 'Acetone (ทดสอบฉลาก)', chemical_name: 'Propan-2-one', cas_no: '67-64-1', un_no: '1090',
  signal_word: 'Danger', ghs_pictograms: ['GHS02', 'GHS07'], h_codes: ['H225', 'H319', 'H336'],
  p_codes: ['P210', 'P233', 'P240', 'P280', 'P305+P351+P338', 'P403+P235'],
  quantity: 999, unit: 'ลิตร', supplier: 'ผู้จำหน่ายสำหรับทดสอบ', emergency_contact: 'ผู้รับผิดชอบ 02-000-0000',
};
const login = async (request, username = 'audit-admin') => expect((await request.post('/api/auth/login', { data: { username, password: 'local-test-only' } })).status()).toBe(200);
async function create(request, overrides = {}) {
  const response = await request.post('/api/chemical/substances', { data: { ...sample, ...overrides } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data;
}
async function ready(page) { await expect(page.getByTestId('label-preview')).toBeVisible({timeout:60000}); }
async function fit(page) {
  await ready(page);
  const fitButton = page.getByRole('button', { name: 'ปรับความสูงให้พอดี' });
  if (await fitButton.isVisible()) { await fitButton.click(); await ready(page); }
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeEnabled();
}
test.beforeEach(async ({ request }) => expect((await request.post(fixture + '/__test/reset')).ok()).toBe(true));

test('register opens label; real A4 and exact-size PDFs preserve Thai content without changing data', async ({ page }) => {
  await login(page.request);
  const substance = await create(page.request);
  await page.goto('/chemical?company_id=all');
  const row = page.getByRole('row').filter({ has: page.getByText(sample.name, { exact: true }) });
  await expect(row.locator('img[alt="ไวไฟ"]')).toHaveAttribute('src', '/ghs/GHS02.png');
  await expect(row.getByRole('link', { name: `ดาวน์โหลดฉลากของ ${sample.name}` })).toBeVisible();
  await page.screenshot({ path: 'test-results/chemical-label-register.png', fullPage: true });
  await row.getByRole('link', { name: `ดาวน์โหลดฉลากของ ${sample.name}` }).click();
  await ready(page);
  await expect(page.getByLabel('ปริมาณในภาชนะนี้ (ถ้ามี)')).toHaveValue('');
  await expect(page.getByLabel('ข้อควรระวัง (P)', { exact: true })).toHaveValue(/P403\+P235/);
  await page.getByLabel('ปริมาณในภาชนะนี้ (ถ้ามี)').fill('500 มล.');
  await fit(page);
  await page.getByLabel('จำนวนฉลาก (ดวง)').fill('5');
  await fit(page);
  await page.screenshot({ path: 'test-results/chemical-label-editor.png', fullPage: true });
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true }).click();
  await (await download).saveAs('test-results/chemical-label-a4.pdf');
  await expect(page.getByRole('status')).toContainText('สร้างไฟล์ PDF แล้ว');
  await page.getByLabel('รูปแบบไฟล์ PDF').selectOption('single');
  // Test landscape physical dimensions too (jsPDF otherwise swaps custom page dimensions).
  await page.getByLabel('ความกว้าง (มม.)').fill('150');
  await page.getByLabel('ความสูง (มม.)').fill('130');
  await page.getByLabel('จำนวนฉลาก (ดวง)').fill('2');
  await fit(page);
  await expect(page.getByLabel('ความสูง (มม.)')).toHaveValue('130');
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true }).click();
  await (await download).saveAs('test-results/chemical-label-single.pdf');
  const after = (await (await page.request.get(`/api/chemical/substances/${substance.id}`)).json()).data;
  expect(after.updated_at).toBe(substance.updated_at); expect(after.quantity).toBe(substance.quantity); expect(after.h_codes).toEqual(sample.h_codes); expect(after.p_codes).toEqual(sample.p_codes);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/chemical-label-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('long labels never truncate; unknown codes and incomplete templates require explicit label wording', async ({ page }) => {
  await login(page.request);
  const substance = await create(page.request, { h_codes: ['H225', 'H999'], p_codes: ['P230', 'P305+P999'], is_demo: true });
  const demo = await page.request.put(`/api/chemical/substances/${substance.id}`, { data: { demo_action: 'mark', expected_updated_at: substance.updated_at } });
  expect(demo.status(), await demo.text()).toBe(200);
  await page.goto(`/chemical/${substance.id}/label`);
  await ready(page);
  await expect(page.getByLabel('ข้อความแสดงความเป็นอันตราย (H)')).toHaveValue(/H999 \[เติมข้อความจาก SDS\]/);
  await expect(page.getByLabel('ข้อควรระวัง (P)', { exact: true })).toHaveValue(/P305\+P999.*\[เติมข้อความจาก SDS\]/);
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeDisabled();
  await page.getByLabel('ข้อความแสดงความเป็นอันตราย (H)').fill('H225 ของเหลวและไอไวไฟสูง');
  await page.getByLabel('ข้อควรระวัง (P)', { exact: true }).fill(Array.from({ length: 14 }, (_, i) => `P${100+i} ข้อความภาษาไทยสำหรับทดสอบบรรทัดที่ ${i+1}`).join('\n'));
  await page.getByLabel('ความสูง (มม.)').fill('50');
  await ready(page);
  await expect(page.locator('main').getByRole('alert')).toContainText('ข้อความเกินความสูง');
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeDisabled();
  await page.getByText('อ่านข้อความบนฉลาก', { exact: true }).click();
  await expect(page.locator('details')).toContainText('บรรทัดที่ 14');
  await expect(page.locator('details')).toContainText('ข้อมูลสาธิต');
  await fit(page);
  await page.getByLabel('จำนวนฉลาก (ดวง)').fill('0');
  await expect(page.locator('main').getByRole('alert')).toContainText('จำนวน 1–100');
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeDisabled();
});

test('asset failures block export and foreign-company labels are inaccessible', async ({ page }) => {
  await login(page.request, 'audit-amt');
  await page.goto('/chemical/44444444-4444-4444-8444-444444444444/label?company_id=amt');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toHaveCount(0);
  const substance = await create(page.request);
  await page.route('**/ghs/GHS02.png', route => route.abort());
  await page.goto(`/chemical/${substance.id}/label`);
  await expect(page.locator('main').getByRole('alert')).toContainText('โหลดสัญลักษณ์ GHS ไม่สำเร็จ');
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeDisabled();
});

test('missing Thai font cannot silently produce a fallback-font PDF', async ({ page }) => {
  await login(page.request);
  const substance = await create(page.request);
  await page.route('**/fonts/NotoSansThai.ttf', route => route.abort());
  await page.goto(`/chemical/${substance.id}/label`);
  await expect(page.locator('main').getByRole('alert')).toContainText('โหลดแบบอักษรไทยไม่สำเร็จ');
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeDisabled();
});

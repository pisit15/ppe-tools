const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const ownerKey = 'company_users:aaaaaaaa-1111-4111-8111-111111111111';
const safetyKey = 'company_users:bbbbbbbb-1111-4111-8111-111111111111';
const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmV8AAAAASUVORK5CYII=';
const output = 'output/permit';
test.use({ actionTimeout: 15000 });

async function login(request, username = 'audit-admin') {
  const response = await request.post('/api/auth/login', { data: { username, password: 'local-test-only' } });
  expect(response.status(), await response.text()).toBe(200);
}
async function api(request, resource, method = 'get', data) {
  const response = await request[method]('/api/permit/' + resource + (resource.includes('?') ? '&' : '?') + 'company_id=amt', data ? { data } : undefined);
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body;
}
async function seed(request, browser) {
  await request.post('http://127.0.0.1:4321/__test/reset');
  await login(request);
  await api(request, 'templates', 'post', { action: 'import' });
  const templates = (await api(request, 'templates')).data;
  const general = templates.find(t => t.code === 'AHS-003');
  await api(request, 'templates', 'patch', { id: general.id, active: true, confirm: true });
  const now = Date.now();
  const account = { username: 'fmt-design-test', password: 'local-test-only', display_name: 'สมชาย · แผนก FMT', requester_type: 'employee', department: 'FMT', contractor_name: '', starts_at: new Date(now - 60000).toISOString(), expires_at: new Date(now + 86400000).toISOString() };
  await api(request, 'contractors', 'post', account);
  const requester = await browser.newContext({ baseURL: 'http://127.0.0.1:4320' });
  await api(requester.request, 'session', 'post', account);
  const owner = await browser.newContext({ baseURL: 'http://127.0.0.1:4320' });
  const safety = await browser.newContext({ baseURL: 'http://127.0.0.1:4320' });
  await login(owner.request, 'permit-owner');
  await login(safety.request, 'permit-safety');
  const permits = [];
  for (const [index, title, location] of [[0, 'ตรวจระบบระบายอากาศ อาคารผลิต 1', 'อาคารผลิต 1 · ชั้น 2'], [1, 'เปลี่ยนวาล์วน้ำหล่อเย็น', 'อาคารสาธารณูปโภค'], [2, 'ตรวจระบบแสงสว่างคลังสินค้า', 'คลังสินค้า · โซน B']]) {
    let permit = (await api(requester.request, 'permits', 'post', { data: { title, location, detail: 'ตรวจเช็กอุปกรณ์ กั้นพื้นที่ และประสานงานเจ้าของพื้นที่ก่อนเริ่มปฏิบัติงาน', contractorName: 'FMT', phone: '0000000000', workers: 'ผู้ปฏิบัติงานทดสอบ 1\nผู้ควบคุมงานทดสอบ 1', startsAt: new Date(now - 60000).toISOString(), endsAt: new Date(now + 7 * 3600000).toISOString(), fireImpact: 'ไม่มีผลกระทบ', project: false, forms: [{ template: { id: general.id }, answers: Object.fromEntries(general.config.fields.map(f => [f.id, f.kind === 'check' ? 'yes' : 'ตรวจสอบเรียบร้อย'])) }], approvers: { area_owner: ownerKey, safety: safetyKey }, attachments: [], signatures: [], events: [] } })).data;
    async function action(request, action) { permit = (await api(request, 'permits/' + permit.id, 'post', { version: permit.version, action, signature, confirm: true, note: 'ข้อมูลทดสอบการออกแบบ' })).data; }
    if (index < 2) await action(requester.request, 'submit');
    if (index === 0) { await action(owner.request, 'approve'); await action(safety.request, 'approve'); await action(owner.request, 'start'); }
    permits.push(permit);
  }
  await owner.close(); await safety.close();
  fs.mkdirSync(output, { recursive: true });
  return { account, requester, permits };
}
async function noOverflow(page) {
  const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(bounds.document, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewport);
}

test('redesigned work list stays responsive during search and avoids reloading company metadata', async ({ page, browser }) => {
  const { requester, permits } = await seed(page.request, browser);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/permit?company_id=amt');
    await expect(page.getByRole('button', { name: permits[0].data.title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'สร้างคำขอใหม่', exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${output}/design-dashboard-desktop.png` });

    const counts = { templates: 0, directory: 0, session: 0, companies: 0 };
    page.on('request', request => {
      const resource = new URL(request.url()).pathname.split('/').pop();
      if (request.method() === 'GET' && request.url().includes('/api/permit/') && resource in counts) counts[resource]++;
    });
    let releaseSearch;
    const gate = new Promise(resolve => { releaseSearch = resolve; });
    let searchStarted;
    const started = new Promise(resolve => { searchStarted = resolve; });
    await page.route('**/api/permit/permits?*', async route => {
      if (new URL(route.request().url()).searchParams.get('q') === 'วาล์ว') { searchStarted(); await gate; }
      await route.continue();
    });
    const searchResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/permit/permits' && url.searchParams.get('q') === 'วาล์ว' && response.status() === 200;
    });
    await page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true }).fill('วาล์ว');
    await started;
    // The previous list remains actionable while its replacement is fetched.
    await expect(page.getByRole('button', { name: permits[0].data.title, exact: true })).toBeVisible();
    releaseSearch();
    await searchResponse;
    await expect(page.getByRole('button', { name: permits[1].data.title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: permits[0].data.title, exact: true })).toHaveCount(0);
    expect(counts).toEqual({ templates: 0, directory: 0, session: 0, companies: 0 });
    await page.unroute('**/api/permit/permits?*');
    await page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true }).fill('');
    await expect(page.getByRole('button', { name: permits[0].data.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: permits[0].data.title, exact: true }).click();
    await expect(page.locator('.wp-document')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${output}/design-detail-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.screenshot({ path: `${output}/design-detail-mobile.png` });
    expect(errors).toEqual([]);
  } finally { await requester.close(); }
});

test('staff and requester entry remain clear and the mobile workspace is usable at 390px', async ({ page, browser }) => {
  const { account, requester, permits } = await seed(page.request, browser);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4320', viewport: { width: 390, height: 844 } });
  const mobile = await context.newPage();
  const errors = []; mobile.on('pageerror', error => errors.push(error.message));
  try {
    await mobile.goto('/permit');
    await expect(mobile.getByRole('button', { name: 'ผู้ดูแลระบบ SHE', exact: true })).toBeVisible();
    await expect(mobile.getByRole('button', { name: 'ผู้ขออนุญาตทำงาน', exact: true })).toBeVisible();
    await noOverflow(mobile);
    await mobile.screenshot({ path: `${output}/design-login-mobile.png` });
    await mobile.setViewportSize({ width: 1440, height: 1000 });
    await noOverflow(mobile);
    await mobile.screenshot({ path: `${output}/design-login-desktop.png` });
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.getByRole('button', { name: 'ผู้ขออนุญาตทำงาน', exact: true }).click();
    await mobile.getByLabel('ชื่อผู้ใช้', { exact: true }).fill(account.username);
    await mobile.keyboard.press('Tab');
    await expect(mobile.getByLabel('รหัสผ่าน', { exact: true })).toBeFocused();
    await mobile.getByLabel('รหัสผ่าน', { exact: true }).fill(account.password);
    await mobile.keyboard.press('Tab');
    await expect(mobile.getByRole('button', { name: 'เข้าสู่ Work Permit', exact: true })).toBeFocused();
    await mobile.keyboard.press('Enter');
    await expect(mobile.getByRole('button', { name: 'สร้างคำขอใหม่', exact: true })).toBeVisible();
    await expect(mobile.getByRole('button', { name: permits[0].data.title, exact: true })).toBeVisible();
    await noOverflow(mobile);
    await mobile.screenshot({ path: `${output}/design-dashboard-mobile.png` });
    await mobile.getByRole('button', { name: 'สร้างคำขอใหม่', exact: true }).click();
    await expect(mobile.getByLabel('ชื่องาน', { exact: true })).toBeVisible();
    await mobile.getByRole('button', { name: 'งานทั่วไป', exact: true }).click();
    await mobile.getByLabel('ชื่องาน', { exact: true }).fill('ตรวจระบบระบายอากาศ อาคารผลิต 1');
    await mobile.getByLabel('รายละเอียด / ขอบเขตงาน', { exact: true }).fill('ตรวจเช็กอุปกรณ์และกั้นพื้นที่ ก่อนเริ่มปฏิบัติงาน');
    await mobile.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    const saveDraft = mobile.getByRole('button', { name: 'บันทึกร่างคำขอ', exact: true });
    const preview = mobile.getByRole('button', { name: 'ดูตัวอย่างแม่แบบจริง', exact: true });
    for (const width of [320, 390, 760]) {
      await mobile.setViewportSize({ width, height: 844 });
      await mobile.evaluate(() => window.scrollTo(0, 0));
      await noOverflow(mobile);
      await expect(saveDraft).toBeInViewport({ ratio: 1 });
      await expect(preview).toBeInViewport({ ratio: 1 });
      const saveBounds = await saveDraft.boundingBox();
      const previewBounds = await preview.boundingBox();
      expect(saveBounds.height, `save tap target at ${width}px`).toBeGreaterThanOrEqual(44);
      expect(previewBounds.height, `preview tap target at ${width}px`).toBeGreaterThanOrEqual(44);
      const overlapWidth = Math.min(saveBounds.x + saveBounds.width, previewBounds.x + previewBounds.width) - Math.max(saveBounds.x, previewBounds.x);
      const overlapHeight = Math.min(saveBounds.y + saveBounds.height, previewBounds.y + previewBounds.height) - Math.max(saveBounds.y, previewBounds.y);
      expect(overlapWidth <= 0 || overlapHeight <= 0, `preview and save overlap at ${width}px: ${JSON.stringify({ saveBounds, previewBounds })}`).toBe(true);
    }
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.evaluate(() => window.scrollTo(0, 0));
    await mobile.screenshot({ path: `${output}/design-editor-mobile.png` });
    await mobile.setViewportSize({ width: 1440, height: 1000 });
    await expect(mobile.getByTestId('permit-live-preview')).toHaveAttribute('data-preview-state', 'current', { timeout: 45000 });
    await mobile.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await noOverflow(mobile);
    await mobile.screenshot({ path: `${output}/design-editor-desktop.png` });
    expect(errors).toEqual([]);
  } finally { await context.close(); await requester.close(); }
});

test('late search errors and detail responses cannot replace a newer search, company or navigation', async ({ page, browser }) => {
  const { requester, permits } = await seed(page.request, browser);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const nextFrame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.goto('/permit?company_id=amt');
    await expect(page.getByRole('button', { name: permits[0].data.title, exact: true })).toBeVisible();
    let releaseOldSearch;
    const oldSearchGate = new Promise(resolve => { releaseOldSearch = resolve; });
    const oldSearchStarted = page.waitForRequest(request => new URL(request.url()).pathname === '/api/permit/permits' && new URL(request.url()).searchParams.get('q') === 'old-delayed-search');
    await page.route('**/api/permit/permits?*', async route => {
      if (new URL(route.request().url()).searchParams.get('q') !== 'old-delayed-search') return route.continue();
      await oldSearchGate;
      await route.fulfill({ status: 500, json: { error: 'OLD_SEARCH_FAILURE_MUST_BE_IGNORED' } });
    });
    await page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true }).fill('old-delayed-search');
    await oldSearchStarted;
    await page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true }).fill('วาล์ว');
    await expect(page.getByRole('button', { name: permits[1].data.title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: permits[0].data.title, exact: true })).toHaveCount(0);
    const oldSearchResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/permit/permits' && new URL(response.url()).searchParams.get('q') === 'old-delayed-search');
    releaseOldSearch();
    await (await oldSearchResponse).finished();
    await nextFrame();
    await expect(page.getByText('OLD_SEARCH_FAILURE_MUST_BE_IGNORED', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: permits[1].data.title, exact: true })).toBeVisible();
    await page.unroute('**/api/permit/permits?*');

    let releaseCompanySearch;
    const companySearchGate = new Promise(resolve => { releaseCompanySearch = resolve; });
    const companySearchStarted = page.waitForRequest(request => {
      const url = new URL(request.url());
      return url.pathname === '/api/permit/permits' && url.searchParams.get('company_id') === 'amt' && url.searchParams.get('q') === 'old-company-search';
    });
    await page.route('**/api/permit/permits?*', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('company_id') !== 'amt' || url.searchParams.get('q') !== 'old-company-search') return route.continue();
      await companySearchGate;
      await route.fulfill({ status: 500, json: { error: 'OLD_COMPANY_FAILURE_MUST_BE_IGNORED' } });
    });
    await page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true }).fill('old-company-search');
    await companySearchStarted;
    await page.getByRole('combobox', { name: 'บริษัทที่กำลังจัดการ', exact: true }).selectOption('aab');
    await expect(page.getByRole('combobox', { name: 'บริษัทที่กำลังจัดการ', exact: true })).toHaveValue('aab');
    await expect(page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true })).toBeVisible();
    const companySearchResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/permit/permits' && url.searchParams.get('company_id') === 'amt' && url.searchParams.get('q') === 'old-company-search';
    });
    releaseCompanySearch();
    await (await companySearchResponse).finished();
    await nextFrame();
    await expect(page.getByText('OLD_COMPANY_FAILURE_MUST_BE_IGNORED', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'บริษัทที่กำลังจัดการ', exact: true })).toHaveValue('aab');
    await page.unroute('**/api/permit/permits?*');
    await page.getByRole('combobox', { name: 'บริษัทที่กำลังจัดการ', exact: true }).selectOption('amt');
    await page.getByRole('textbox', { name: 'ค้นหาใบอนุญาต', exact: true }).fill('');
    await expect(page.getByRole('button', { name: permits[2].data.title, exact: true })).toBeVisible();

    for (const destination of ['แม่แบบเอกสาร', 'ภาพรวมและใบอนุญาต']) {
      let releaseOpen;
      const openGate = new Promise(resolve => { releaseOpen = resolve; });
      const path = '/api/permit/permits/' + permits[2].id;
      const opened = page.waitForRequest(request => new URL(request.url()).pathname === path);
      await page.route('**' + path + '?*', async route => {
        await openGate;
        await route.fulfill({ status: 200, json: { data: permits[2] } });
      });
      await page.getByRole('button', { name: permits[2].data.title, exact: true }).click();
      await opened;
      await page.getByRole('button', { name: destination, exact: true }).click();
      if (destination === 'แม่แบบเอกสาร') await expect(page.getByRole('heading', { name: 'แม่แบบเอกสาร', exact: true })).toBeVisible();
      else await expect(page.getByRole('heading', { name: 'ภาพรวมใบอนุญาตทำงาน', exact: true })).toBeVisible();
      const lateOpen = page.waitForResponse(response => new URL(response.url()).pathname === path);
      releaseOpen();
      await (await lateOpen).finished();
      await nextFrame();
      await expect(page.locator('.wp-document')).toHaveCount(0);
      if (destination === 'แม่แบบเอกสาร') await expect(page.getByRole('heading', { name: 'แม่แบบเอกสาร', exact: true })).toBeVisible();
      else await expect(page.getByRole('heading', { name: 'ภาพรวมใบอนุญาตทำงาน', exact: true })).toBeVisible();
      await page.unroute('**' + path + '?*');
      if (destination !== 'ภาพรวมและใบอนุญาต') await page.getByRole('button', { name: 'ภาพรวมและใบอนุญาต', exact: true }).click();
    }
    expect(errors).toEqual([]);
  } finally { await requester.close(); }
});

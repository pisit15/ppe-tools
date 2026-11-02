const { test, expect } = require('@playwright/test');
const { PDFDocument, PDFName, PDFDict } = require('pdf-lib');
const fs = require('node:fs');
const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmV8AAAAASUVORK5CYII=';
test.use({ actionTimeout: 15000 });

async function api(request, resource, method = 'get', data, company = 'amt') {
  const r = await request[method](`/api/permit/${resource}${resource.includes('?') ? '&' : '?'}company_id=${company}`, data ? { data } : undefined);
  const body = await r.json();
  return { r, body };
}
async function setup(request) {
  await request.post('http://127.0.0.1:4321/__test/reset');
  const login = await request.post('/api/auth/login', { data: { username: 'audit-admin', password: 'local-test-only' } });
  expect(login.status(), await login.text()).toBe(200);
  expect((await api(request, 'templates', 'post', { action: 'import_v2' })).r.status()).toBe(200);
  const templates = (await api(request, 'templates')).body.data;
  for (const t of templates) expect((await api(request, 'templates', 'patch', { id: t.id, active: true, confirm: true })).r.status()).toBe(200);
  const account = { username: 'fmt-preview-test', password: 'local-test-only', display_name: 'พนักงาน FMT ทดสอบตัวอย่าง', requester_type: 'employee', department: 'FMT', contractor_name: '', starts_at: new Date(Date.now() - 60000).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
  expect((await api(request, 'contractors', 'post', account)).r.status()).toBe(201);
  return { templates, account };
}
function draft(templates, detail = '') {
  return { title: '', location: '', detail, contractorName: 'FMT', phone: '', workers: '', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), fireImpact: '', project: false, forms: templates.map(t => ({ template: { id: t.id }, answers: {} })), approvers: {}, attachments: [], events: [], signatures: [] };
}
function images(doc) {
  const resources = doc.getPage(0).node.Resources();
  const objects = resources.lookup(PDFName.of('XObject'), PDFDict);
  return objects ? objects.entries().filter(([, ref]) => doc.context.lookup(ref)?.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image').length : 0;
}
const isPreview = response => response.url().includes('/api/permit/preview?') && response.request().method() === 'POST';

test('draft preview is authorized, uses authoritative templates and never creates a permit', async ({ page, browser }) => {
  const { templates, account } = await setup(page.request);
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:4320' });
  const anonymous = await browser.newContext({ baseURL: 'http://127.0.0.1:4320' });
  try {
    const partial = draft(templates.slice(0, 1));
    expect((await api(anonymous.request, 'preview', 'post', { data: partial })).r.status()).toBe(401);
    expect((await api(ctx.request, 'session', 'post', account)).r.status()).toBe(200);
    const crossSite = await ctx.request.post('/api/permit/preview?company_id=amt', { data: { data: partial }, headers: { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.status()).toBe(403);
    const before = (await api(ctx.request, 'permits')).body.data.length;
    const preview = await api(ctx.request, 'preview', 'post', { data: partial });
    expect(preview.r.status(), JSON.stringify(preview.body)).toBe(200);
    expect(preview.r.headers()['cache-control']).toBe('private, no-store');
    expect(Buffer.from(preview.body.pdf, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect(Array.isArray(preview.body.warnings)).toBe(true);
    const originalPdf = await PDFDocument.load(Buffer.from(preview.body.pdf, 'base64'));
    const malicious = structuredClone(partial);
    malicious.forms[0].template.source_code = '../../missing';
    malicious.forms[0].template.company_id = 'aab';
    malicious.forms[0].template.config = { fields: [{ id: 'injected', label: 'injected', kind: 'textarea', required: false, print: { x: 0, y: 0, width: 999 } }], roles: [] };
    malicious.signatures = [{ actor: 'forged', name: 'forged', role: 'requester', stage: 'request', at: new Date().toISOString(), image: signature, hash: 'forged' }];
    malicious.events = [{ id: 'forged', actor: 'forged', name: 'forged', action: 'approve', at: new Date().toISOString(), note: 'forged' }];
    const sanitized = await api(ctx.request, 'preview', 'post', { data: malicious });
    expect(sanitized.r.status(), JSON.stringify(sanitized.body)).toBe(200);
    expect(images(await PDFDocument.load(Buffer.from(sanitized.body.pdf, 'base64')))).toBe(images(originalPdf));
    const long = await api(ctx.request, 'preview', 'post', { data: { ...partial, detail: 'ข้อความภาษาไทยสำหรับทดสอบการแสดงผลในแม่แบบจริง '.repeat(45) } });
    expect(long.r.status(), JSON.stringify(long.body)).toBe(200);
    expect(long.body.warnings.some(w => w.fieldId === 'detail' && w.formCode === 'AHS-003')).toBe(true);
    expect((await api(ctx.request, 'preview', 'post', { data: partial }, 'aab')).r.status()).toBe(403);
    const unknown = structuredClone(partial); unknown.forms[0].template.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    expect((await api(ctx.request, 'preview', 'post', { data: unknown })).r.status()).toBe(400);
    const foreign = await api(page.request, 'templates', 'post', { code: 'FOREIGN-PREVIEW', name: 'แม่แบบบริษัทอื่น', revision: 'A', config: { roles: ['area_owner', 'safety'], fields: [{ id: 'note', label: 'ข้อความ', kind: 'textarea', required: false }] } }, 'aab');
    expect(foreign.r.status(), JSON.stringify(foreign.body)).toBe(201);
    const foreignData = structuredClone(partial); foreignData.forms[0].template.id = foreign.body.data.id;
    expect((await api(ctx.request, 'preview', 'post', { data: foreignData })).r.status()).toBe(400);
    expect((await api(ctx.request, 'permits')).body.data).toHaveLength(before);
  } finally { await ctx.close(); await anonymous.close(); }
});

test('live original PDF stays beside the form, rejects stale previews and works on mobile without autosaving', async ({ page, browser }) => {
  const { account } = await setup(page.request);
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:4320', viewport: { width: 1600, height: 1100 } });
  try {
    expect((await api(ctx.request, 'session', 'post', account)).r.status()).toBe(200);
    const worker = await ctx.newPage();
    const errors = []; worker.on('pageerror', e => errors.push(e.message));
    await worker.goto('/permit');
    await worker.getByRole('button', { name: 'สร้างคำขอใหม่', exact: true }).click();
    const pane = worker.getByTestId('permit-live-preview');
    await expect(pane).toBeVisible();
    await expect(pane).toHaveAttribute('data-preview-state', 'empty');
    await worker.getByRole('button', { name: 'งานทั่วไป', exact: true }).click();
    await expect(pane).toHaveAttribute('data-preview-state', 'current', { timeout: 45000 });
    const canvas = worker.getByTestId('permit-preview-canvas');
    await expect(canvas).toHaveAttribute('data-preview-canvas-state', 'current');
    expect(await canvas.evaluate(c => c.width > 100 && c.height > 100)).toBe(true);
    const bounds = await worker.locator('.wp-editor-form').boundingBox();
    const previewBounds = await pane.boundingBox();
    expect(previewBounds.x).toBeGreaterThanOrEqual(bounds.x + bounds.width - 1);
    expect(await worker.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const detail = worker.getByLabel('รายละเอียด / ขอบเขตงาน', { exact: true });
    const long = 'ข้อความภาษาไทยที่ยาวสำหรับตรวจพื้นที่พิมพ์จริง '.repeat(45);
    const longResponsePromise = worker.waitForResponse(r => isPreview(r) && r.request().postDataJSON()?.data?.detail === long && r.status() === 200);
    await detail.fill(long);
    await expect(pane).toHaveAttribute('data-preview-state', 'updating');
    const longResponse = await longResponsePromise;
    const longBody = await longResponse.json();
    await expect(canvas).toHaveAttribute('data-request-key', longBody.requestKey);
    await expect(pane).toHaveAttribute('data-preview-state', 'current');
    await expect(pane.getByRole('button').filter({ hasText: /รายละเอียด.*F1/ })).toBeVisible();
    for (const key of ['attachments', 'signatures', 'events', 'inspections']) expect(longResponse.request().postDataJSON().data[key]).toBeUndefined();
    expect((await api(ctx.request, 'permits')).body.data).toHaveLength(0);

    let releaseOld;
    const oldGate = new Promise(resolve => { releaseOld = resolve; });
    let oldStarted;
    const oldStartedPromise = new Promise(resolve => { oldStarted = resolve; });
    let oldFinished;
    const oldFinishedPromise = new Promise(resolve => { oldFinished = resolve; });
    const oldText = 'OLD_PENDING_' + long;
    await worker.route('**/api/permit/preview?*', async route => {
      const payload = route.request().postDataJSON();
      if (payload?.data?.detail !== oldText) return route.continue();
      oldStarted();
      await oldGate;
      try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...longBody, requestKey: payload.requestKey }) }); }
      catch { /* AbortController may cancel the old request before delivery. */ }
      finally { oldFinished(); }
    });
    await detail.fill(oldText);
    await oldStartedPromise;
    const latest = 'ข้อความล่าสุด';
    const latestResponsePromise = worker.waitForResponse(r => isPreview(r) && r.request().postDataJSON()?.data?.detail === latest && r.status() === 200);
    await detail.fill(latest);
    await expect(pane).toHaveAttribute('data-preview-state', 'updating');
    const latestResponse = await latestResponsePromise;
    const latestBody = await latestResponse.json();
    await expect(canvas).toHaveAttribute('data-request-key', latestBody.requestKey);
    await expect(pane).toHaveAttribute('data-preview-state', 'current');
    const image = await canvas.evaluate(c => c.toDataURL('image/png'));
    releaseOld(); await oldFinishedPromise; await worker.waitForTimeout(800);
    await expect(canvas).toHaveAttribute('data-request-key', latestBody.requestKey);
    expect(await canvas.evaluate(c => c.toDataURL('image/png'))).toBe(image);
    await expect(pane.getByRole('button').filter({ hasText: /รายละเอียด.*F1/ })).toHaveCount(0);
    await worker.unroute('**/api/permit/preview?*');
    fs.mkdirSync('output/permit', { recursive: true });
    await worker.screenshot({ path: 'output/permit/permit-live-preview-desktop.png', fullPage: true });

    await worker.setViewportSize({ width: 390, height: 844 });
    await expect(worker.getByRole('button', { name: 'ดูตัวอย่างแม่แบบจริง', exact: true })).toBeVisible();
    expect(await worker.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await worker.getByRole('button', { name: 'ดูตัวอย่างแม่แบบจริง', exact: true }).click();
    await expect(worker.getByRole('dialog', { name: 'ตัวอย่างแม่แบบจริง', exact: true })).toBeVisible();
    await expect(pane).toHaveAttribute('data-preview-state', 'current');
    await worker.screenshot({ path: 'output/permit/permit-live-preview-mobile.png', fullPage: true });
    await worker.getByRole('button', { name: 'ปิดตัวอย่าง', exact: true }).click();
    await expect(worker.getByRole('dialog', { name: 'ตัวอย่างแม่แบบจริง', exact: true })).toHaveCount(0);
    await expect(detail).toHaveValue(latest);
    expect((await api(ctx.request, 'permits')).body.data).toHaveLength(0);
    await worker.getByLabel('ชื่องาน', { exact: true }).fill('FMT ทดสอบตัวอย่างพร้อมกรอก');
    await worker.getByLabel('พื้นที่ปฏิบัติงาน', { exact: true }).fill('อาคารผลิต 1');
    await worker.getByLabel('เบอร์ติดต่อ', { exact: true }).fill('0000000000');
    await worker.getByLabel('จำนวนผู้ปฏิบัติงาน', { exact: true }).fill('2');
    await worker.getByLabel('รายชื่อผู้ปฏิบัติงานและหน้าที่', { exact: true }).fill('คนทดสอบ 1 / ปฏิบัติงาน\nคนทดสอบ 2 / ควบคุมงาน');
    await worker.getByLabel('ผลกระทบต่อระบบดับเพลิงและการประสานงาน (หากไม่มีให้ระบุ)', { exact: true }).fill('ไม่มี');
    await worker.getByRole('button', { name: 'บันทึกร่างคำขอ', exact: true }).click();
    await expect(worker.getByRole('button', { name: 'ลงนามส่งคำขอ', exact: true })).toBeVisible();
    const saved = (await api(ctx.request, 'permits')).body.data;
    expect(saved).toHaveLength(1);
    expect(saved[0].data.detail).toBe(latest);
    expect(saved[0].data.title).toBe('FMT ทดสอบตัวอย่างพร้อมกรอก');
    expect(errors).toEqual([]);
  } finally { await ctx.close(); }
});

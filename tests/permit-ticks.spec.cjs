const { test, expect } = require('@playwright/test');
const { PDFDocument, decodePDFRawStream } = require('pdf-lib');
const fs = require('node:fs');
const { setPermitChoice } = require('./permit-field-input.cjs');

test.use({ actionTimeout: 15000 });
async function api(request, resource, method = 'get', data) {
  const response = await request[method]('/api/permit/' + resource + (resource.includes('?') ? '&' : '?') + 'company_id=amt', data ? { data } : undefined);
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body;
}
async function setup(request, browser, activateDetailed = true) {
  await request.post('http://127.0.0.1:4321/__test/reset');
  const login = await request.post('/api/auth/login', { data: { username: 'audit-admin', password: 'local-test-only' } });
  expect(login.ok(), await login.text()).toBe(true);
  await api(request, 'templates', 'post', { action: 'import' });
  const legacy = (await api(request, 'templates')).data.find(t => t.code === 'AHS-003');
  await api(request, 'templates', 'patch', { id: legacy.id, active: true, confirm: true });
  await api(request, 'templates', 'post', { action: 'import_v2' });
  const detailed = (await api(request, 'templates')).data.filter(t => t.config.layoutVersion === 'amt-2026-11-v2');
  if (activateDetailed) for (const template of detailed) await api(request, 'templates', 'patch', { id: template.id, active: true, confirm: true });
  const account = { username: 'fmt-tick-test', password: 'local-test-only', display_name: 'พนักงาน FMT ทดสอบช่องติ๊ก', requester_type: 'employee', department: 'FMT', contractor_name: '', starts_at: new Date(Date.now() - 60000).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() };
  await api(request, 'contractors', 'post', account);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4320', viewport: { width: 1600, height: 1100 } });
  await api(context.request, 'session', 'post', account);
  return { context, legacy, detailed };
}
function sourceStrokeOperations(bytes) {
  return PDFDocument.load(bytes).then(document => {
    const streams = document.getPage(0).node.Contents();
    return streams.asArray().reduce((sum, ref) => sum + (Buffer.from(decodePDFRawStream(document.context.lookup(ref)).decode()).toString('latin1').match(/(?:^|\s)S(?=\s|$)/g) || []).length, 0);
  });
}
function formIn(response, template) {
  return response.request().postDataJSON()?.data?.forms?.find(form => form.template.id === template.id);
}
function previewMatching(page, template, predicate = () => true) {
  return page.waitForResponse(response => response.url().includes('/api/permit/preview?') && response.request().method() === 'POST' && response.status() === 200 && predicate(formIn(response, template)));
}
async function expectHazardLabelsFit(page, width) {
  const overflowing = await page.locator('.wp-tick-hazard-name strong').evaluateAll(elements => elements
    .filter(element => element.scrollWidth > element.clientWidth)
    .map(element => ({ label: element.textContent, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })));
  expect(overflowing, 'hazard text must stay inside its column at ' + width + 'px').toEqual([]);
}

test('original AMT tick matrix starts unanswered, maps selected boxes to the PDF and clears irrelevant controls', async ({ page, browser }) => {
  const { context, legacy, detailed } = await setup(page.request, browser);
  const general = detailed.find(t => t.code === 'AHS-003');
  const hazard = general.config.fields.find(f => f.id.startsWith('hazard_'));
  const control = general.config.fields.find(f => f.id.startsWith('control_' + hazard.id.slice(7) + '_'));
  const errors = [];
  const worker = await context.newPage();
  worker.on('pageerror', error => errors.push(error.message));
  try {
    await worker.goto('/permit?company_id=amt');
    await worker.getByRole('button', { name: 'สร้างคำขอใหม่', exact: true }).click();
    const baselineResponse = previewMatching(worker, general);
    await worker.getByRole('button', { name: 'งานทั่วไป', exact: true }).click();
    const baseline = await baselineResponse;
    const initialForm = formIn(baseline, general);
    expect(initialForm).toBeTruthy();
    expect(initialForm.template.id).not.toBe(legacy.id);
    expect(Object.values(initialForm.answers).every(value => value === '')).toBe(true);
    const baselinePdf = Buffer.from((await baseline.json()).pdf, 'base64');
    const baselineOperations = await sourceStrokeOperations(baselinePdf);
    const pane = worker.getByTestId('permit-live-preview');
    await expect(pane).toHaveAttribute('data-preview-state', 'current', { timeout: 45000 });
    const hazardGroup = worker.locator(`[id="${general.id}-${hazard.id}"]`);
    const controlGroup = worker.locator(`[id="${general.id}-${control.id}"]`);
    const hazardYes = hazardGroup.locator('input[type="radio"][value="yes"]');
    const hazardNo = hazardGroup.locator('input[type="radio"][value="no"]');
    const controlYes = controlGroup.locator('input[type="radio"][value="yes"]');
    await expect(hazardGroup.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(controlGroup.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(controlYes).toBeDisabled();

    const selectedResponse = previewMatching(worker, general, form => form?.answers[hazard.id] === 'yes' && form?.answers[control.id] === 'yes');
    await setPermitChoice(worker, `${general.id}-${hazard.id}`, 'yes');
    await expect(controlYes).toBeEnabled();
    await setPermitChoice(worker, `${general.id}-${control.id}`, 'yes');
    const selected = await selectedResponse;
    const selectedBody = await selected.json();
    const selectedPdf = Buffer.from(selectedBody.pdf, 'base64');
    expect(await sourceStrokeOperations(selectedPdf) - baselineOperations).toBe(4);
    await expect(worker.getByTestId('permit-preview-canvas')).toHaveAttribute('data-request-key', selectedBody.requestKey);
    await expect(pane).toHaveAttribute('data-preview-state', 'current');
    await expect(hazardYes).toBeChecked();
    await expect(controlYes).toBeChecked();
    await expectHazardLabelsFit(worker, 1600);
    fs.mkdirSync('output/pdf', { recursive: true });
    fs.mkdirSync('output/permit', { recursive: true });
    fs.writeFileSync('output/pdf/amt-tick-preview.pdf', selectedPdf);
    await hazardGroup.evaluate(element => { element.closest('details')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -100); });
    await worker.screenshot({ path: 'output/permit/amt-tick-matrix-desktop.png' });

    const clearedResponse = previewMatching(worker, general, form => form?.answers[hazard.id] === 'no' && form?.answers[control.id] === '');
    await setPermitChoice(worker, `${general.id}-${hazard.id}`, 'no');
    const cleared = await clearedResponse;
    expect(await sourceStrokeOperations(Buffer.from((await cleared.json()).pdf, 'base64'))).toBe(baselineOperations);
    await expect(controlYes).not.toBeChecked();
    await expect(controlYes).toBeDisabled();
    // Native radio arrow-key behavior must change the answer through onChange.
    await hazardNo.focus();
    await worker.keyboard.press('ArrowLeft');
    await expect(hazardYes).toBeChecked();
    await expect(controlYes).toBeEnabled();
    await expect(controlYes).not.toBeChecked();

    for (const width of [320, 390, 760]) {
      await worker.setViewportSize({ width, height: 844 });
      await hazardGroup.evaluate(element => { element.scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); });
      expect(await worker.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'document overflow at ' + width).toBe(false);
      await expectHazardLabelsFit(worker, width);
      const target = await hazardYes.evaluate(element => { const label = element.closest('label'); const box = label?.getBoundingClientRect(); return box ? { width: box.width, height: box.height } : null; });
      expect(target, 'native radio needs a clickable label').not.toBeNull();
      expect(target.height, 'radio tap target at ' + width).toBeGreaterThanOrEqual(44);
    }
    await worker.setViewportSize({ width: 390, height: 844 });
    await hazardGroup.evaluate(element => { element.scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); });
    await worker.screenshot({ path: 'output/permit/amt-tick-matrix-mobile.png' });
    expect((await api(context.request, 'permits')).data).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('an existing summarized draft can explicitly adopt tick fields without guessing answers or losing its original assessment', async ({ page, browser }) => {
  const { context, legacy, detailed } = await setup(page.request, browser, false);
  const general = detailed.find(template => template.code === 'AHS-003');
  const originalAssessment = 'ระวังจุดหนีบเครื่องจักร ตัดพลังงานและติดตั้งการ์ดครอบก่อนทำงาน - ข้อความเดิมต้องคงอยู่';
  const data = {
    title: 'FMT เปลี่ยนจากแบบสรุปเป็นช่องติ๊ก', location: 'อาคารผลิต 1', detail: 'ทดสอบคงข้อมูลงานเดิมขณะปรับแม่แบบ',
    contractorName: 'FMT', phone: '0000000000', workers: 'ผู้ปฏิบัติงานทดสอบ 1',
    startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 4 * 3600000).toISOString(), fireImpact: 'ไม่มี', project: false,
    forms: [{ template: { id: legacy.id }, answers: { equipment: 'เครื่องมือช่างและหมวกนิรภัย', hazards: 'อันตรายที่บันทึกเดิม', hazard_controls: originalAssessment, additional: 'มาตรการเพิ่มเติมเดิม', check_1: 'yes', check_2: 'yes', check_3: 'yes' } }],
    approvers: {}, attachments: [], signatures: [], events: [],
  };
  try {
    const original = (await api(context.request, 'permits', 'post', { data })).data;
    for (const template of detailed) await api(page.request, 'templates', 'patch', { id: template.id, active: true, confirm: true });
    const worker = await context.newPage();
    await worker.goto('/permit?company_id=amt&id=' + original.id);
    await worker.getByRole('button', { name: 'แก้ไขร่าง', exact: true }).click();
    await worker.getByRole('button', { name: 'เปลี่ยนเป็นแบบติ๊กตามต้นฉบับ', exact: true }).click();
    const hazard = general.config.fields.find(field => field.id.startsWith('hazard_'));
    const hazardGroup = worker.locator(`[id="${general.id}-${hazard.id}"]`);
    await expect(hazardGroup.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(worker.getByLabel('ชื่องาน', { exact: true })).toHaveValue(data.title);
    await expect(worker.getByLabel('พื้นที่ปฏิบัติงาน', { exact: true })).toHaveValue(data.location);
    await expect(worker.getByLabel('รายละเอียด / ขอบเขตงาน', { exact: true })).toHaveValue(data.detail);
    await worker.getByRole('button', { name: 'บันทึกร่างคำขอ', exact: true }).click();
    await expect(worker.getByRole('button', { name: 'แก้ไขร่าง', exact: true })).toBeVisible();
    const saved = (await api(context.request, 'permits/' + original.id)).data;
    expect(saved.status).toBe('draft');
    expect(saved.data.title).toBe(data.title);
    expect(saved.data.forms[0].template.id).toBe(general.id);
    for (const field of general.config.fields.filter(field => field.kind === 'choice')) expect(saved.data.forms[0].answers[field.id] || '').toBe('');
    const previous = saved.data.events.find(event => event.action === 'edit' && event.document?.forms.some(form => form.template.id === legacy.id));
    expect(previous, 'the server retains the prior template and assessment as a historical document').toBeTruthy();
    expect(previous.document.forms.find(form => form.template.id === legacy.id).answers.hazard_controls).toBe(originalAssessment);
  } finally { await context.close(); }
});

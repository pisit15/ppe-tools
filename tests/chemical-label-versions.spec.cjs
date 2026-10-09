const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const id = '11111111-1111-4111-8111-111111111111';
const foreign = '44444444-4444-4444-8444-444444444444';
const root = `/api/chemical/substances/${id}`;
const url = `${root}/labels`;
const login = async (request, username='audit-amt') => expect((await request.post('/api/auth/login', { data: { username, password: 'local-test-only' } })).status()).toBe(200);
const payload = (name='ฉลากทดสอบ') => ({ request_id: randomUUID(), title: 'ขวด 500 มล.', snapshot: { schema: 1,
  draft: { name, identity: 'CAS 67-64-1', pictograms: ['GHS02'], signal: 'Danger', hazards: 'ข้อความทดสอบ', precautions: 'ข้อควรระวังทดสอบ', supplier: '', emergency: '', contents: '500 มล.', extra: '' },
  options: { width: 93, height: 136.5, fontSize: 9, copies: 4, layout: 'a4', pageOrientation: 'portrait', content: 'full', includeQr: true },
} });
test.beforeEach(async ({ request }) => expect((await request.post('http://127.0.0.1:4311/__test/reset')).ok()).toBe(true));

test('save V1, reopen, save V2, recall V1 as V3, reset from fresh registry without deleting history', async ({ page }) => {
  await login(page.request);
  const before = (await (await page.request.get(root)).json()).data;
  await page.goto(`/chemical/${id}/label`);
  const name = page.getByLabel('ชื่อสารเคมี / ผลิตภัณฑ์', {exact:true});
  const save = page.getByRole('button', {name:'บันทึกเป็นเวอร์ชันใหม่',exact:true});
  await name.fill('Acetone ฉลากขวดเล็ก');
  await page.getByLabel('ชื่อแบบฉลาก / หมายเหตุ (ถ้ามี)').fill('ขวด 500 มล.');
  await page.getByLabel('ปริมาณในภาชนะนี้ (ถ้ามี)').fill('500 มล.');
  await page.getByLabel('คำสัญญาณ',{exact:true}).selectOption('Danger');
  await page.getByLabel('ฉลากย่อสำหรับภาชนะเล็ก',{exact:true}).check();
  await page.getByRole('button',{name:'ฉลากแนวนอน 4 ดวงต่อ A4',exact:true}).click();
  await save.click();
  await expect(page.getByText('บันทึก V1 แล้ว', {exact:false})).toBeVisible();
  await expect(save).toBeDisabled();
  await page.reload();
  await expect(name).toHaveValue('Acetone ฉลากขวดเล็ก');
  await expect(page.getByLabel('จำนวนฉลาก (ดวง)')).toHaveValue('4');
  await expect(page.getByRole('button',{name:'ฉลากแนวนอน 4 ดวงต่อ A4',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('บันทึกโดย audit-amt', {exact:false})).toBeVisible();
  await name.fill('Acetone รุ่นที่ 2'); await save.click();
  await expect(page.getByText('บันทึก V2 แล้ว',{exact:false})).toBeVisible();
  await page.getByLabel('เลือกเวอร์ชันฉลาก').selectOption('1');
  await expect(name).toHaveValue('Acetone ฉลากขวดเล็ก');
  await page.getByLabel('ปริมาณในภาชนะนี้ (ถ้ามี)').fill('250 มล.'); await save.click();
  await expect(page.getByText('บันทึก V3 แล้ว',{exact:false})).toBeVisible();
  // Same-company user reopens on another device/context; data is server-persistent.
  const other = await page.context().browser().newContext({baseURL:'http://127.0.0.1:4310'});
  try {
    await login(other.request);
    const tab = await other.newPage(); await tab.goto(`/chemical/${id}/label`);
    await expect(tab.getByLabel('ปริมาณในภาชนะนี้ (ถ้ามี)')).toHaveValue('250 มล.');
    await expect(tab.getByLabel('เลือกเวอร์ชันฉลาก')).toHaveValue('3');
  } finally { await other.close(); }
  const after = (await (await page.request.get(root)).json()).data;
  expect(after.updated_at).toBe(before.updated_at); expect(after.name).toBe(before.name);
  expect((await page.request.put(root,{data:{...after,name:'Registry updated',expected_updated_at:after.updated_at}})).status()).toBe(200);
  page.once('dialog', d=>d.accept());
  await page.getByRole('button',{name:'เริ่มใหม่จากข้อมูลทะเบียน',exact:true}).click();
  await expect(name).toHaveValue('Registry updated');
  await expect(page.getByLabel('ปริมาณในภาชนะนี้ (ถ้ามี)')).toHaveValue('');
  await expect(page.getByRole('button',{name:'ฉลากแนวตั้ง 4 ดวงต่อ A4',exact:true})).toHaveAttribute('aria-pressed','true');
  const list = (await (await page.request.get(url)).json()).versions;
  expect(list.map(v=>v.version)).toEqual([3,2,1]);
  await page.reload(); await expect(name).toHaveValue('Acetone ฉลากขวดเล็ก');
  await expect(page.getByLabel('เลือกเวอร์ชันฉลาก')).toHaveValue('3');
  await expect(page.getByTestId('label-preview')).toBeVisible();
  await expect(page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true})).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true}).click();
  await (await download).saveAs('test-results/chemical-label-saved-version.pdf');
  await page.screenshot({path:'test-results/chemical-label-versions-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/chemical-label-versions-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('API isolates tenants, attributes actual actor, validates payload and keeps immutable versions with idempotent retries', async ({ request }) => {
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.post(url,{data:payload()})).status()).toBe(401);
  await login(request);
  expect((await request.get(`/api/chemical/substances/${foreign}/labels`)).status()).toBe(404);
  expect((await request.post(`/api/chemical/substances/${foreign}/labels`,{data:payload()})).status()).toBe(404);
  expect((await request.post(url,{data:payload(),headers:{origin:'https://evil.example'}})).status()).toBe(403);
  const body = payload(); body.company_id='aab'; body.created_by={displayName:'Spoofed admin'}; body.snapshot.draft.sdsUrl='https://evil.example'; body.snapshot.draft.demo=false;
  const response = await request.post(url,{data:body}); expect(response.status(), await response.text()).toBe(201);
  const first = (await response.json()).data;
  expect(first.company_id).toBe('amt'); expect(first.created_by.username).toBe('audit-amt');
  expect(first.snapshot.draft).not.toHaveProperty('sdsUrl'); expect(first.snapshot.draft).not.toHaveProperty('demo');
  const retry = (await (await request.post(url,{data:body})).json()).data;
  expect(retry.id).toBe(first.id); expect(retry.version).toBe(1);
  body.snapshot.draft.name='different'; expect((await request.post(url,{data:body})).status()).toBe(409);
  for(const method of ['put','patch','delete']) expect((await request[method](url,{data:{title:'Overwrite'}})).status()).toBe(405);
  for(const mutate of [p=>p.snapshot.options.width=500,p=>p.snapshot.options.copies=0,p=>p.snapshot.options.includeQr='false',p=>p.snapshot.options.layout='evil',p=>p.snapshot.options.layout=['a4'],p=>p.snapshot.draft.signal=['Danger'],p=>p.snapshot.draft.name='x'.repeat(501),p=>p.snapshot.draft.pictograms=['GHS10']]) {
    const invalid=payload();mutate(invalid);expect((await request.post(url,{data:invalid})).status()).toBe(400);
  }
  const parallel=await Promise.all(Array.from({length:5},(_,i)=>request.post(url,{data:payload('concurrent '+i)})));
  expect(parallel.map(r=>r.status())).toEqual([201,201,201,201,201]);
  const history=(await(await request.get(url)).json()); expect(history.versions.map(v=>v.version)).toEqual([6,5,4,3,2,1]);
  expect((await(await request.get(url+'?version=1')).json()).data.snapshot.draft.name).toBe('ฉลากทดสอบ');
  expect((await request.get(url+'?version=999')).status()).toBe(404);
  expect((await request.get(url+'?before=0')).status()).toBe(400);
  expect((await request.delete(root)).status()).toBe(200);
  expect((await request.post(url,{data:payload()})).status()).toBe(404);
});

test('failed loads are not empty histories, lost save response retries safely, unsaved edits are protected', async ({ page }) => {
  await login(page.request);
  await page.request.post(url,{data:payload('Saved initial')});
  await page.route('**/substances/*/labels', route=>route.fulfill({status:503,json:{error:'ทดสอบโหลดไม่สำเร็จ'}}));
  await page.goto(`/chemical/${id}/label`);
  await expect(page.getByText('โหลดประวัติฉลากไม่สำเร็จ:',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'บันทึกเป็นเวอร์ชันใหม่'})).toHaveCount(0);
  await page.unroute('**/substances/*/labels');
  await page.getByRole('button',{name:'ลองโหลดประวัติอีกครั้ง'}).click();
  const name=page.getByLabel('ชื่อสารเคมี / ผลิตภัณฑ์',{exact:true});
  await expect(name).toHaveValue('Saved initial');
  await name.fill('Must survive lost response');
  await page.route('**/substances/*/labels', async route=>{
    if(route.request().method() !== 'POST') return route.continue();
    const response=await route.fetch(); expect(response.status()).toBe(201);
    await route.fulfill({status:503,json:{error:'ทดสอบการตอบกลับขาดหาย'}});
  });
  await page.getByRole('button',{name:'บันทึกเป็นเวอร์ชันใหม่'}).click();
  await expect(page.getByText('ทดสอบการตอบกลับขาดหาย',{exact:false})).toBeVisible();
  await expect(name).toHaveValue('Must survive lost response');
  await page.unroute('**/substances/*/labels');
  await page.getByRole('button',{name:'บันทึกเป็นเวอร์ชันใหม่'}).click();
  await expect(page.getByText('บันทึก V2 แล้ว',{exact:false})).toBeVisible();
  expect((await(await page.request.get(url)).json()).versions).toHaveLength(2);
  await name.fill('Unsaved');
  page.once('dialog',d=>d.dismiss()); await page.getByLabel('เลือกเวอร์ชันฉลาก').selectOption('1');
  await expect(name).toHaveValue('Unsaved'); await expect(page.getByLabel('เลือกเวอร์ชันฉลาก')).toHaveValue('2');
  page.once('dialog',d=>d.accept()); await page.getByLabel('เลือกเวอร์ชันฉลาก').selectOption('1');
  await expect(name).toHaveValue('Saved initial');
});

test('history pagination exposes older versions and saved drafts keep current SDS and demo state', async ({ page }) => {
  await login(page.request,'audit-admin');
  for(let i=1;i<=52;i++) expect((await page.request.post(url,{data:payload('Version '+i)})).status()).toBe(201);
  await page.goto(`/chemical/${id}/label`);
  await expect(page.getByLabel('เลือกเวอร์ชันฉลาก')).toHaveValue('52');
  await expect(page.locator('#label-version option')).toHaveCount(51);
  await page.getByRole('button',{name:'โหลดเวอร์ชันก่อนหน้า'}).click();
  await expect(page.locator('#label-version option')).toHaveCount(53);
  await expect(page.getByRole('button',{name:'โหลดเวอร์ชันก่อนหน้า'})).toHaveCount(0);
  const substance=(await(await page.request.get(root)).json()).data;
  await page.request.put(root,{data:{...substance,sds_url:null,expected_updated_at:substance.updated_at}});
  const updated=(await(await page.request.get(root)).json()).data;
  await page.request.put(root,{data:{demo_action:'mark',expected_updated_at:updated.updated_at}});
  await page.getByLabel('เลือกเวอร์ชันฉลาก').selectOption('1');
  await expect(page.getByLabel('ชื่อสารเคมี / ผลิตภัณฑ์',{exact:true})).toHaveValue('Version 1');
  await expect(page.getByLabel('ใส่ QR Code ไปยัง SDS ฉบับจริง')).toBeDisabled();
  await expect(page.getByTestId('label-preview')).toBeVisible();
  await page.getByText('อ่านข้อความบนฉลาก',{exact:true}).click();
  await expect(page.locator('details').filter({hasText:'อ่านข้อความบนฉลาก'})).toContainText('ข้อมูลสาธิต');
});

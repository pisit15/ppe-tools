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
  await page.getByText('กำหนดขนาดเอง / รูปแบบไฟล์', {exact:true}).click();
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
  await page.getByText('กำหนดขนาดเอง / รูปแบบไฟล์', {exact:true}).click();
  await page.getByLabel('ความสูง (มม.)').fill('50');
  await ready(page);
  await expect(page.locator('main').getByRole('alert')).toContainText('ข้อความเกินความสูง');
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeDisabled();
  await page.getByText('อ่านข้อความบนฉลาก', { exact: true }).click();
  await expect(page.locator('details').filter({hasText:'อ่านข้อความบนฉลาก'})).toContainText('บรรทัดที่ 14');
  await expect(page.locator('details').filter({hasText:'อ่านข้อความบนฉลาก'})).toContainText('ข้อมูลสาธิต');
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

test('all eight presets export exact A4 counts and a decodable permanent SDS QR', async ({ page }) => {
  test.setTimeout(180000);
  await login(page.request);
  const substance = await create(page.request, {name:'Acetone', sds_url:'https://example.com/original-sds.pdf'});
  await page.goto(`/chemical/${substance.id}/label`);
  await ready(page);
  await expect(page.getByLabel('ใส่ QR Code ไปยัง SDS ฉบับจริง')).toBeChecked();
  await page.getByLabel('ฉลากย่อสำหรับภาชนะเล็ก', {exact:true}).check();
  const presets = [
    ['landscape-8','แนวนอน',8,210,297], ['landscape-6','แนวนอน',6,297,210],
    ['landscape-4','แนวนอน',4,297,210], ['landscape-2','แนวนอน',2,210,297],
    ['landscape-1','แนวนอน',1,297,210], ['portrait-6','แนวตั้ง',6,210,297],
    ['portrait-4','แนวตั้ง',4,210,297], ['portrait-1','แนวตั้ง',1,210,297],
  ];
  await page.addScriptTag({path:require.resolve('jsqr')});
  for (const [id, direction, count] of presets) {
    await page.getByRole('button',{name:`ฉลาก${direction} ${count} ดวงต่อ A4`,exact:true}).click();
    await ready(page);
    await expect(page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true})).toBeEnabled();
    const decoded=await page.evaluate(()=>{
      const image=document.querySelector('[data-testid="label-preview"]');
      const canvas=document.createElement('canvas'); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      return window.jsQR(pixels.data,pixels.width,pixels.height)?.data;
    });
    expect(decoded).toBe(`https://tools.eashe.org/sds/${substance.id}`);
    const event=page.waitForEvent('download');
    await page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true}).click();
    await (await event).saveAs(`test-results/chemical-label-${id}.pdf`);
  }
  require('node:fs').writeFileSync('test-results/chemical-label-presets.json',JSON.stringify({presets,url:`https://tools.eashe.org/sds/${substance.id}`}));
  await page.getByRole('button',{name:'ฉลากแนวนอน 8 ดวงต่อ A4',exact:true}).click();
  await ready(page);
  await page.screenshot({path:'test-results/chemical-label-presets-qr.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Complete mode remains available and does not silently become compact for a small preset.
  await page.getByLabel('รายละเอียดครบ',{exact:true}).check();
  await ready(page);
  await expect(page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true})).toBeDisabled();
  await expect(page.locator('main').getByRole('alert')).toContainText('ข้อความเกินความสูง');
});

test('public SDS resolves attachments without login, follows replacements, and exposes no registry access', async ({ page, request }) => {
  await login(page.request);
  let substance=await create(page.request,{sds_url:'https://example.com/original-sds.pdf'});
  const scan=()=>request.get(`/sds/${substance.id}`,{maxRedirects:0});
  let result=await scan();
  expect(result.status()).toBe(307); expect(result.headers().location).toBe('https://example.com/original-sds.pdf');
  expect(result.headers()['cache-control']).toContain('no-store');
  const upload=await page.request.post('/api/chemical/sds',{multipart:{company_id:'amt',file:{name:'qr-test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')}}});
  expect(upload.status(),await upload.text()).toBe(201); const file=await upload.json();
  const changed=await page.request.put(`/api/chemical/substances/${substance.id}`,{data:{sds_file_path:file.path,expected_updated_at:substance.updated_at}});
  expect(changed.status(),await changed.text()).toBe(200);substance=(await changed.json()).data;
  result=await scan(); expect(result.status()).toBe(307);
  expect(result.headers().location).toContain('/storage/v1/object/sign/chemical-sds/amt/');
  expect(result.headers().location).not.toContain('example.com');
  expect(result.headers()['x-robots-tag']).toContain('noindex');
  expect((await request.get(`/api/chemical/substances/${substance.id}`)).status()).toBe(401);
  expect((await request.get(`/api/chemical/sds?path=${encodeURIComponent(file.path)}`)).status()).toBe(401);
  expect((await request.put(`/api/chemical/substances/${substance.id}`,{data:{name:'Not allowed'}})).status()).toBe(401);
  expect((await request.get('/sds/not-a-uuid')).status()).toBe(404);
  expect((await request.get('/sds/22222222-2222-4222-8222-222222222222')).status()).toBe(404);
  expect((await request.get('/sds/99999999-9999-4999-8999-999999999999')).status()).toBe(404);
  const removed=await page.request.put(`/api/chemical/substances/${substance.id}`,{data:{sds_file_path:null,sds_url:null,expected_updated_at:substance.updated_at}});
  expect(removed.status()).toBe(200);expect((await scan()).status()).toBe(404);
  const attached=await create(page.request,{sds_url:'https://example.com/retired-sds.pdf'});
  expect((await page.request.delete(`/api/chemical/substances/${attached.id}`)).status()).toBe(200);
  expect((await request.get(`/sds/${attached.id}`,{maxRedirects:0})).status()).toBe(404);
});

test('optional PPE prints small, persists with QR size, supports old versions, and exports readable QR at all sizes', async ({ page }) => {
  await login(page.request);
  const substance=await create(page.request,{name:'PPE label fixture',h_codes:['H225'],p_codes:[],ghs_pictograms:['GHS02'],sds_url:'https://example.com/sds.pdf'});
  const api=`/api/chemical/substances/${substance.id}/labels`;
  // Exact old schema shape: neither PPE nor QR size existed before this release.
  const legacy={request_id:require('node:crypto').randomUUID(),title:'Legacy',snapshot:{schema:1,
    draft:{name:'PPE label fixture',identity:'CAS 67-64-1',pictograms:['GHS02'],signal:'Danger',hazards:'H225 ของเหลวและไอไวไฟสูง',precautions:'',supplier:'',emergency:'',contents:'',extra:''},
    options:{width:93,height:136.5,fontSize:9,copies:4,layout:'a4',pageOrientation:'portrait',content:'full',includeQr:true}}};
  expect((await page.request.post(api,{data:legacy})).status()).toBe(201);
  await page.goto(`/chemical/${substance.id}/label`);
  await ready(page);
  await expect(page.getByLabel('ขนาด QR Code',{exact:true})).toHaveValue('16');
  const ppe=page.getByRole('checkbox',{name:/^PPE /});
  await expect(ppe).toHaveCount(9);
  for(const item of await ppe.all()) await expect(item).not.toBeChecked();
  await page.getByLabel('ฉลากย่อสำหรับภาชนะเล็ก',{exact:true}).check();
  await page.getByRole('button',{name:'ฉลากแนวนอน 4 ดวงต่อ A4',exact:true}).click();
  for(const name of ['PPE แว่นตานิรภัย','PPE ถุงมือป้องกันสารเคมี','PPE หน้ากากกรองไอ / ก๊าซ']) await page.getByRole('checkbox',{name,exact:true}).check();
  await page.getByText('อ่านข้อความบนฉลาก',{exact:true}).click();
  await ready(page);
  await expect(page.locator('details').filter({hasText:'อ่านข้อความบนฉลาก'})).toContainText('รูป PPE: แว่นตานิรภัย · ถุงมือป้องกันสารเคมี · หน้ากากกรองไอ / ก๊าซ');
  await page.addScriptTag({path:require.resolve('jsqr')});
  for(const size of [16,20,24]) {
    await page.getByLabel('ขนาด QR Code',{exact:true}).selectOption(String(size)); await ready(page);
    // Independently decode the real raster at 300 DPI and a downsampled 150 DPI print resolution.
    for(const scale of [1,0.5]) {
      const decoded=await page.evaluate(scale=>{
        const image=document.querySelector('[data-testid="label-preview"]');const canvas=document.createElement('canvas');
        canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const p=ctx.getImageData(0,0,canvas.width,canvas.height);return window.jsQR(p.data,p.width,p.height)?.data;
      },scale);
      expect(decoded).toBe(`https://tools.eashe.org/sds/${substance.id}`);
    }
    const event=page.waitForEvent('download');await page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true}).click();
    await(await event).saveAs(`test-results/chemical-label-ppe-qr-${size}.pdf`);
  }
  await page.getByLabel('ขนาด QR Code',{exact:true}).selectOption('20');
  await page.getByRole('button',{name:'บันทึกเป็นเวอร์ชันใหม่'}).click();
  await expect(page.getByText('บันทึก V2 แล้ว',{exact:false})).toBeVisible();
  await page.reload(); await ready(page);
  await expect(page.getByLabel('ขนาด QR Code',{exact:true})).toHaveValue('20');
  await expect(page.getByRole('checkbox',{name:'PPE ถุงมือป้องกันสารเคมี',exact:true})).toBeChecked();
  const saved=(await(await page.request.get(api+'?version=2')).json()).data;
  expect(saved.snapshot.draft.ppe).toEqual(['goggles','gloves','respirator']);expect(saved.snapshot.options.qrSize).toBe(20);
  const fresh=(await(await page.request.get(`/api/chemical/substances/${substance.id}`)).json()).data;
  expect(fresh.ppe_required).toEqual([]);expect(fresh.updated_at).toBe(substance.updated_at);
  await page.locator('fieldset').filter({has:page.locator('legend').filter({hasText:'รูปอุปกรณ์ป้องกันส่วนบุคคล (PPE)'})}).last().screenshot({path:'test-results/chemical-label-ppe-picker.png'});
  await page.screenshot({path:'test-results/chemical-label-ppe-screen.png',fullPage:true});
  // All nine icons wrap; no selection is silently removed when a small label overflows.
  for(const item of await ppe.all()) await item.check();
  await page.getByRole('button',{name:'ฉลากแนวนอน 8 ดวงต่อ A4',exact:true}).click(); await ready(page);
  await expect(page.getByRole('checkbox',{name:/^PPE /}).filter({visible:true})).toHaveCount(9);
  await page.getByRole('button',{name:'ฉลากแนวตั้ง 1 ดวงต่อ A4',exact:true}).click(); await ready(page);
  let event=page.waitForEvent('download');await page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true}).click();
  await(await event).saveAs('test-results/chemical-label-ppe-nine.pdf');
  await page.getByRole('button',{name:'ล้างการเลือก PPE'}).click(); await ready(page);
  event=page.waitForEvent('download');await page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true}).click();
  await(await event).saveAs('test-results/chemical-label-ppe-none.pdf');
  await page.getByRole('button',{name:'บันทึกเป็นเวอร์ชันใหม่'}).click();await expect(page.getByText('บันทึก V3 แล้ว',{exact:false})).toBeVisible();
  await page.reload();await ready(page);
  for(const item of await ppe.all()) await expect(item).not.toBeChecked();
  await page.getByLabel('เลือกเวอร์ชันฉลาก').selectOption('1');await ready(page);
  for(const item of await ppe.all()) await expect(item).not.toBeChecked();
  await expect(page.getByLabel('ขนาด QR Code',{exact:true})).toHaveValue('16');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/chemical-label-ppe-mobile.png',fullPage:true});
});

test('a selected PPE image failure blocks PDF rather than silently omitting protection symbols', async ({ page }) => {
  await login(page.request);
  const substance=await create(page.request);
  await page.route('**/ppe-label/gloves.svg',route=>route.abort());
  await page.goto(`/chemical/${substance.id}/label`);await ready(page);
  await page.getByRole('checkbox',{name:'PPE ถุงมือป้องกันสารเคมี',exact:true}).check();
  await expect(page.locator('main').getByRole('alert')).toContainText('โหลดสัญลักษณ์ PPE ไม่สำเร็จ');
  await expect(page.getByRole('button',{name:'ดาวน์โหลด PDF',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'ล้างการเลือก PPE'}).click();await ready(page);
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
});

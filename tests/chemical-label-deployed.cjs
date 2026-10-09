// Read-only smoke check of the deployed client. Synthetic session/substance responses
// stay inside this isolated browser; this does not authenticate to the live API.
const { chromium, expect } = require('@playwright/test');
const base = process.argv[2] || 'https://tools.eashe.org';
const publicSubstanceId = process.argv[3];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const id = '00000000-0000-4000-8000-000000000001';
    expect((await page.request.get(`${base}/api/chemical/substances/${id}`)).status()).toBe(401);
    expect((await page.request.get(`${base}/api/auth/session`)).status()).toBe(401);
    let publicSdsStatus;
    if (publicSubstanceId) {
      const sds = await page.request.get(`${base}/sds/${publicSubstanceId}`, {maxRedirects:0});
      publicSdsStatus = sds.status();
      expect(publicSdsStatus).toBe(307);
      expect(sds.headers().location).toMatch(/^https?:\/\//);
      expect(sds.headers()['cache-control']).toContain('no-store');
    }
    for (const path of ['/fonts/NotoSansThai.ttf', ...Array.from({ length: 9 }, (_, i) => `/ghs/GHS0${i+1}.png`)]) {
      const response = await page.request.get(base + path);
      expect(response.status(), path).toBe(200);
      expect((await response.body()).length).toBeGreaterThan(1000);
    }
    const intercepted = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      expect(request.method()).toBe('GET');
      intercepted.push(path);
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'synthetic', username: 'browser-fixture', displayName: 'Browser fixture', companyId: 'amt', companyName: 'Synthetic AMT', role: 'user' } } });
      if (path === `/api/chemical/substances/${id}`) return route.fulfill({ json: { data: {
        id, company_id: 'amt', name: 'PDF rendering test', chemical_name: 'ข้อมูลสาธิตสำหรับทดสอบการแสดงผล',
        ghs_pictograms: ['GHS02', 'GHS07'], signal_word: 'Danger', h_codes: ['H225', 'H319'], p_codes: ['P210', 'P280'],
        supplier: 'ผู้จำหน่ายสมมติ', emergency_contact: 'ผู้รับผิดชอบสมมติ', is_demo: true, sds_url: 'https://example.com/synthetic.pdf',
      } } });
      throw new Error(`Unexpected live API request blocked: ${path}`);
    });
    const response = await page.goto(`${base}/chemical/${id}/label`);
    expect(response.status()).toBe(200);
    await expect(page.getByTestId('label-preview')).toBeVisible();
    await page.getByLabel('ฉลากย่อสำหรับภาชนะเล็ก', {exact:true}).check();
    await page.getByRole('button',{name:'ฉลากแนวนอน 4 ดวงต่อ A4',exact:true}).click();
    await expect(page.getByTestId('label-preview')).toBeVisible();
    await page.addScriptTag({path:require.resolve('jsqr')});
    const decoded=await page.evaluate(()=>{
      const image=document.querySelector('[data-testid="label-preview"]');
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height);
      return window.jsQR(data.data,data.width,data.height)?.data;
    });
    expect(decoded).toBe(`https://tools.eashe.org/sds/${id}`);
    await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true })).toBeEnabled();
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ดาวน์โหลด PDF', exact: true }).click();
    const download = await event;
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10000);
    expect(await download.failure()).toBeNull();
    expect(errors).toEqual([]);
    expect(intercepted).toContain(`/api/chemical/substances/${id}`);
    await page.screenshot({ path: 'test-results/chemical-label-deployed-synthetic.png', fullPage: true });
    console.log(JSON.stringify({ base, anonymousApiStatus: 401, publicSdsStatus, assets: 10, decodedQr: decoded, syntheticClientPdfBytes: pdf.length, filename: download.suggestedFilename(), pageErrors: errors, note: 'No authenticated live API calls or production writes; session/substance mocked only in isolated browser.' }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const {test,expect}=require('@playwright/test');
const fixture='http://127.0.0.1:4311';
const pdf={name:'provenance-test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% Local provenance test only\n%%EOF')};
const login=async(request,username='audit-admin')=>expect((await request.post('/api/auth/login',{data:{username,password:'local-test-only'}})).status()).toBe(200);
const data=async(response,status=200)=>{expect(response.status(),await response.text()).toBe(status);return (await response.json()).data;};
test.beforeEach(async({request})=>expect((await request.post(fixture+'/__test/reset')).ok()).toBe(true));

test('file upload captures actual importer and survives save, reload and another editor',async({page})=>{
 const request=page.request;
 await login(request,'audit-amt');
 await page.goto('/chemical/new?company_id=amt');
 await page.getByLabel('ชื่อสารเคมี / ชื่อทางการค้า *',{exact:true}).fill('SDS provenance file');
 await page.locator('input[type=file]').setInputFiles(pdf);
 await expect(page.getByText('ระบบจะบันทึกผู้นำเข้า SDS และเวลาเมื่อบันทึกสารเคมี')).toBeVisible();
 await page.getByRole('button',{name:'บันทึกสารเคมี',exact:true}).click();
 const row=page.getByRole('row').filter({has:page.getByText('SDS provenance file',{exact:true})});
 await expect(row).toContainText('อัปโหลดไฟล์โดย audit-amt');
 await expect(row.locator('time')).toHaveAttribute('datetime',/T.*Z$/);
 await page.reload();
 await expect(row).toContainText('อัปโหลดไฟล์โดย audit-amt');
 await page.screenshot({path:'test-results/chemical-sds-importer-register.png',fullPage:true});
 let saved=(await (await request.get(fixture+'/__test/state')).json()).find(x=>x.name==='SDS provenance file');
 const importer=saved.sds_import;
 expect(importer.account_table).toBe('company_users');
 expect(importer.method).toBe('file');
 expect(importer.actor_id).toBeTruthy();
 const storage=await (await request.get(fixture+'/__test/sds-state')).json();
 expect(storage.receipts[0].importer).toEqual(importer);
 expect(storage.objects).toEqual([saved.sds_file_path]);
 await login(request);
 const copied=await data(await request.post('/api/chemical/substances',{data:{company_id:'amt',name:'SDS attached by admin',sds_file_path:saved.sds_file_path,sds_file_name:pdf.name,sds_import:{username:'forged'}}}),201);
 expect(copied.created_by).toBe('audit-admin');
 expect(copied.sds_import).toEqual(importer);
 await page.goto(`/chemical/${saved.id}/edit?company_id=amt`);
 await expect(page.locator('#sds')).toContainText('อัปโหลดไฟล์โดย audit-amt');
 await page.getByLabel('ชื่อทางเคมี',{exact:true}).fill('Edited by admin');
 await page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).click();
 await expect(row).toContainText('อัปโหลดไฟล์โดย audit-amt');
 saved=await data(await request.get('/api/chemical/substances/'+saved.id));
 expect(saved.sds_import).toEqual(importer);
 await page.goto(`/chemical/${saved.id}/edit?company_id=amt`);
 await page.screenshot({path:'test-results/chemical-sds-importer-details.png',fullPage:true});
 await page.locator('input[type=file]').setInputFiles({...pdf,name:'replacement.pdf'});
 await expect(page.locator('#sds')).not.toContainText('อัปโหลดไฟล์โดย audit-amt');
 await page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).click();
 await expect(row).toContainText('อัปโหลดไฟล์โดย Local test admin');
 saved=await data(await request.get('/api/chemical/substances/'+saved.id));
 expect(saved.sds_import.account_table).toBe('admin_accounts');
 expect(saved.sds_import.imported_at).not.toBe(importer.imported_at);
});

test('links are attributed on change, legacy SDS stays unknown, and removal clears provenance',async({page})=>{
 const request=page.request;await login(request);
 let old=await data(await request.get('/api/chemical/substances/11111111-1111-4111-8111-111111111111'));
 expect(old.sds_import).toBeNull();
 old=await data(await request.put('/api/chemical/substances/'+old.id,{data:{notes:'Unrelated edit',expected_updated_at:old.updated_at,sds_import:{username:'forged'}}}));
 expect(old.sds_import).toBeNull();
 await page.goto(`/chemical/${old.id}/edit?company_id=amt`);
 await expect(page.locator('#sds')).toContainText('ไม่พบประวัติผู้นำเข้า SDS');
 await page.getByLabel('ลิงก์ SDS จากผู้ผลิต').fill('https://example.com/new-sds.pdf');
 await page.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).click();
 const row=page.getByRole('row').filter({has:page.getByText('Test Acetone',{exact:true})});
 await expect(row).toContainText('เพิ่มลิงก์โดย Local test admin');
 old=await data(await request.get('/api/chemical/substances/'+old.id));
 const importer=old.sds_import;expect(importer.username).toBe('audit-admin');expect(importer.method).toBe('link');
 await login(request,'audit-amt');
 old=await data(await request.put('/api/chemical/substances/'+old.id,{data:{sds_url:old.sds_url,quantity:10,expected_updated_at:old.updated_at}}));
 expect(old.sds_import).toEqual(importer);
 old=await data(await request.put('/api/chemical/substances/'+old.id,{data:{sds_url:'https://example.com/updated.pdf',expected_updated_at:old.updated_at}}));
 expect(old.sds_import.username).toBe('audit-amt');
 old=await data(await request.put('/api/chemical/substances/'+old.id,{data:{sds_url:null,sds_file_path:null,expected_updated_at:old.updated_at}}));
 expect(old.sds_import).toBeNull();
 await page.goto('/chemical?company_id=amt');
 await expect(row).not.toContainText('เพิ่มลิงก์โดย');
 await expect(row).not.toContainText('ไม่พบประวัติผู้นำเข้า');
});

test('untrusted uploads cannot be attached; scope and receipt failure prevent false attribution',async({request})=>{
 const upload=(company_id='amt')=>request.post('/api/chemical/sds',{multipart:{company_id,file:pdf}});
 expect((await upload()).status()).toBe(401);
 await login(request,'audit-amt');
 expect((await upload('aab')).status()).toBe(403);
 expect((await request.post('/api/chemical/substances',{data:{company_id:'amt',name:'Fake file',sds_file_path:'amt/missing.pdf',sds_import:{username:'forged'}}})).status()).toBe(400);
 await request.post(fixture+'/__test/fail-sds-receipt');
 expect((await upload()).status()).toBeGreaterThanOrEqual(400);
 expect(await (await request.get(fixture+'/__test/sds-state')).json()).toEqual({objects:[],receipts:[]});
 await login(request);
 const uploaded=await upload('aab');expect(uploaded.status(),await uploaded.text()).toBe(201);
 const file=await uploaded.json();
 expect((await request.post('/api/chemical/substances',{data:{company_id:'amt',name:'Foreign file',sds_file_path:file.path}})).status()).toBe(400);
});

test('mobile tap opens original SDS through a native link without asynchronous popups',async({browser})=>{
 // Local document stand-in follows the real server redirect, including the popup's first request.
 const documentServer=require('node:http').createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<h1>Original SDS fixture opened</h1>');});
 await new Promise(resolve=>documentServer.listen(0,'127.0.0.1',resolve));
 const documentUrl=`http://127.0.0.1:${documentServer.address().port}/sds.pdf`;
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4310',viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 try{
  const page=await context.newPage();await login(context.request);
  // Deliberately block JS popups. Native anchor navigation must still succeed.
  await page.addInitScript(()=>{window.open=()=>{throw new Error('Asynchronous popup blocked');};});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original=await data(await context.request.get('/api/chemical/substances/11111111-1111-4111-8111-111111111111'));
  await data(await context.request.put('/api/chemical/substances/'+original.id,{data:{sds_url:documentUrl,expected_updated_at:original.updated_at}}));
  await page.goto('/chemical?company_id=amt');
  const link=page.getByRole('link',{name:'เปิด SDS ฉบับจริงของ Test Acetone (แท็บใหม่)',exact:true});
  await expect(link).toHaveAttribute('href','/sds/11111111-1111-4111-8111-111111111111');
  await expect(link).toHaveAttribute('target','_blank');
  const popupPromise=page.waitForEvent('popup');await link.tap();const popup=await popupPromise;
  await expect(popup.getByRole('heading',{name:'Original SDS fixture opened'})).toBeVisible();
  await expect(popup).toHaveURL(documentUrl);
  expect(await popup.evaluate(()=>window.opener===null)).toBe(true);await popup.close();
  await page.goto('/chemical/legal?company_id=amt&substance_id=11111111-1111-4111-8111-111111111111');
  const legalPopupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'เปิด SDS ฉบับจริงของ Test Acetone (แท็บใหม่)',exact:true}).tap();
  await expect((await legalPopupPromise).getByRole('heading',{name:'Original SDS fixture opened'})).toBeVisible();
  expect(errors).toEqual([]);
 }finally{await context.close();await new Promise(resolve=>documentServer.close(resolve));}
});

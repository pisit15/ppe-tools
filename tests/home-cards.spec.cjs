const {test,expect}=require('@playwright/test');
const fixture='http://127.0.0.1:4311';
const adminApi='/api/admin/home-cards';
const login=async(request,username='audit-admin')=>expect((await request.post('/api/auth/login',{data:{username,password:'local-test-only'}})).status()).toBe(200);
const patch=(card,values={})=>({id:card.id,name:card.name,description:card.description,is_visible:card.is_visible,revision:card.revision,...values});
test.beforeEach(async({request})=>expect((await request.post(fixture+'/__test/reset')).ok()).toBe(true));

test('admin edits, hides and restores cards, with persisted public presentation',async({page,request})=>{
 await login(page.request);
 await page.goto('/');
 await page.getByRole('button',{name:'จัดการการ์ด',exact:true}).click();
 await expect(page.getByRole('heading',{name:'จัดการการ์ดหน้าแรก'})).toBeVisible();
 const editor=page.locator('form[data-card-id="chemical"]');
 await editor.getByLabel('ชื่อการ์ด',{exact:true}).fill('ทะเบียนและกฎหมายสารเคมี');
 await editor.getByLabel('คำอธิบาย',{exact:true}).fill('นำเข้า SDS และค้นหากฎหมายที่เกี่ยวข้อง');
 await editor.getByLabel('แสดงการ์ดบนหน้าแรก').uncheck();
 await editor.getByRole('button',{name:'บันทึกการ์ด',exact:true}).click();
 await expect(editor.getByRole('status')).toContainText('ซ่อนจากหน้าแรก');
 const visible=(await (await request.get('/api/home-cards')).json()).data;
 expect(visible.map(c=>c.id)).not.toContain('chemical');
 expect(visible.every(c=>c.is_visible)).toBe(true);
 expect(visible.some(c=>'updated_by' in c)).toBe(false);
 await page.getByRole('button',{name:'กลับไปดูหน้าแรก'}).click();
 await expect(page.getByRole('heading',{name:'ทะเบียนและกฎหมายสารเคมี'})).toHaveCount(0);
 await page.reload();
 await page.getByRole('button',{name:'จัดการการ์ด',exact:true}).click();
 await expect(editor.getByLabel('ชื่อการ์ด',{exact:true})).toHaveValue('ทะเบียนและกฎหมายสารเคมี');
 await expect(editor.getByLabel('แสดงการ์ดบนหน้าแรก')).not.toBeChecked();
 await expect(editor.getByText('ซ่อนอยู่',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/home-cards-admin.png',fullPage:true});
 await editor.getByLabel('แสดงการ์ดบนหน้าแรก').check();
 await editor.getByRole('button',{name:'บันทึกการ์ด',exact:true}).click();
 await expect(editor.getByRole('status')).toContainText('แสดงบนหน้าแรก');
 await page.getByRole('button',{name:'กลับไปดูหน้าแรก'}).click();
 const card=page.getByRole('link').filter({has:page.getByRole('heading',{name:'ทะเบียนและกฎหมายสารเคมี'})});
 await expect(card).toHaveAttribute('href','/chemical');
 await expect(card).toContainText('นำเข้า SDS และค้นหากฎหมายที่เกี่ยวข้อง');
 await expect(page.getByRole('heading',{name:'PPE Inventory'})).toBeVisible();
 const restored=(await (await request.get('/api/home-cards')).json()).data.find(c=>c.id==='chemical');
 expect(restored.name).toBe('ทะเบียนและกฎหมายสารเคมี');expect(restored.is_visible).toBe(true);
 await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();
 await expect(page.getByRole('button',{name:'จัดการการ์ด',exact:true})).toHaveCount(0);
 await expect(card).toBeVisible();
});

test('server rejects nonadmins, forged configuration, invalid data, cross-site writes and lost updates',async({request})=>{
 expect((await request.get(adminApi)).status()).toBe(401);
 expect((await request.patch(adminApi,{data:{}})).status()).toBe(401);
 await login(request,'audit-amt');
 expect((await request.get(adminApi)).status()).toBe(403);
 expect((await request.patch(adminApi,{data:{}})).status()).toBe(403);
 await login(request);
 const card=(await (await request.get(adminApi)).json()).data.find(c=>c.id==='ppe');
 expect((await request.patch(adminApi,{headers:{origin:'https://unrelated.invalid'},data:patch(card)})).status()).toBe(403);
 for(const values of [{name:' '},{description:'a'.repeat(501)},{is_visible:'false'},{revision:0},{href:'javascript:alert(1)'},{updated_by:'forged'},{ready:true},{id:'other'}]) {
  expect((await request.patch(adminApi,{data:patch(card,values)})).status()).toBe(400);
 }
 const writes=await Promise.all([request.patch(adminApi,{data:patch(card,{name:'First edit'})}),request.patch(adminApi,{data:patch(card,{name:'Second edit'})})]);
 expect(writes.map(r=>r.status()).sort()).toEqual([200,409]);
 const current=(await (await request.get(adminApi)).json()).data.find(c=>c.id==='ppe');
 expect(current.revision).toBe(2);expect(['First edit','Second edit']).toContain(current.name);
 const markup=await request.patch(adminApi,{data:patch(current,{name:'<b>Plain card text</b>'})});expect(markup.status()).toBe(200);
});

test('conflicting edits remain visible until admin reloads, and mobile form fits the viewport',async({page})=>{
 await login(page.request);await page.goto('/');await page.getByRole('button',{name:'จัดการการ์ด',exact:true}).click();
 const editor=page.locator('form[data-card-id="ppe"]');
 await editor.getByLabel('ชื่อการ์ด',{exact:true}).fill('My pending edit');
 const card=(await (await page.request.get(adminApi)).json()).data.find(c=>c.id==='ppe');
 expect((await page.request.patch(adminApi,{data:patch(card,{name:'Saved in another window'})})).status()).toBe(200);
 await editor.getByRole('button',{name:'บันทึกการ์ด',exact:true}).click();
 await expect(editor.getByRole('alert')).toContainText('หน้าต่างอื่น');
 await expect(editor.getByLabel('ชื่อการ์ด',{exact:true})).toHaveValue('My pending edit');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'โหลดข้อมูลล่าสุด'}).click();
 await expect(editor.getByLabel('ชื่อการ์ด',{exact:true})).toHaveValue('Saved in another window');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/home-cards-admin-mobile.png',fullPage:true});
});

test('homepage handles loading, errors and all hidden cards without showing static fallbacks',async({page})=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/home-cards',async route=>{await gate;await route.fulfill({status:500,json:{error:'ทดสอบโหลดการ์ดไม่สำเร็จ'}});});
 await page.goto('/');
 await expect(page.getByRole('status')).toContainText('กำลังโหลดเครื่องมือ');
 await expect(page.getByRole('heading',{name:'PPE Inventory'})).toHaveCount(0);
 release();await expect(page.getByRole('alert').filter({hasText:'ทดสอบโหลดการ์ดไม่สำเร็จ'})).toBeVisible();
 await page.unroute('**/api/home-cards');
 await page.getByRole('button',{name:'ลองใหม่',exact:true}).click();
 await expect(page.getByRole('heading',{name:'PPE Inventory'})).toBeVisible();
 await login(page.request);
 const cards=(await (await page.request.get(adminApi)).json()).data;
 for(const card of cards) expect((await page.request.patch(adminApi,{data:patch(card,{is_visible:false})})).status()).toBe(200);
 await page.reload();
 await expect(page.getByText('ยังไม่มีเครื่องมือที่แสดงบนหน้าแรก',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'จัดการการ์ด',exact:true}).click();
 await expect(page.locator('form[data-card-id]')).toHaveCount(5);
 await expect(page.getByText('ซ่อนอยู่',{exact:true})).toHaveCount(5);
});

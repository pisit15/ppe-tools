const {test,expect}=require('@playwright/test');
const {apiEmployee,uiEmployee,otherEmployee,oldApiName,oldUiName}=require('./ppe-employees-fixture.cjs');
const {product}=require('./ppe-requests-fixture.cjs');
const baseURL='http://127.0.0.1:4337';
async function login(context,username='manager-amt') {
  const response=await context.request.post('/api/auth/login',{data:{username,password:'local-test-password'}});
  expect(response.status(),await response.text()).toBe(200);
}
async function read(context,url) {
  const response=await context.request.get(url);
  expect(response.status(),await response.text()).toBe(200);
  return response.json();
}
async function employee(context,id) {
  return (await read(context,'/api/ppe/employees?company_id=amt&status=all')).data.find(e=>e.id===id);
}
async function patch(context,row,changes) {
  return context.request.patch('/api/ppe/employees',{data:{id:row.id,company_id:'amt',expected_revision:row.revision,...changes}});
}
function snapshots(rows) {
  return rows.filter(t=>t.employee_code==='EAPI01'||t.employee_code==='EUI01').map(t=>({id:t.id,employee_code:t.employee_code,employee_name:t.employee_name,department:t.department,quantity:t.quantity,unit:t.unit,transaction_type:t.transaction_type})).sort((a,b)=>a.id.localeCompare(b.id));
}
test('employee management enforces company ownership, revisions, immutable codes and unchanged historical records',async({browser,context})=>{
  expect((await context.request.get('/api/ppe/employees?company_id=amt')).status()).toBe(401);
  await login(context);
  const historyBefore=snapshots((await read(context,'/api/ppe/transactions?company_id=amt')).data);
  const reportBefore=snapshots((await read(context,'/api/ppe/reports?company_id=amt&from=2026-10&to=2026-10')).transactions);
  let row=await employee(context,apiEmployee);
  const stale=row;
  let response=await patch(context,row,{name:'สมชาย ชื่อปัจจุบัน',position:'หัวหน้างาน'});
  expect(response.status(),await response.text()).toBe(200);
  row=(await response.json()).data;
  expect(row.id).toBe(apiEmployee);expect(row.employee_code).toBe('EAPI01');expect(row.name).toBe('สมชาย ชื่อปัจจุบัน');expect(row.revision).toBeGreaterThan(stale.revision);
  expect((await patch(context,stale,{name:'stale overwrite'})).status()).toBe(409);
  expect((await patch(context,row,{employee_code:'CHANGED'})).status()).toBe(409);
  const foreign=await context.request.patch('/api/ppe/employees',{data:{id:otherEmployee,company_id:'aab',expected_revision:0,name:'forbidden'}});
  expect(foreign.status()).toBe(403);
  expect((await context.request.get('/api/ppe/employees?company_id=aab&status=all')).status()).toBe(403);
  const child=await browser.newContext({baseURL});
  await login(child,'ppe.amt.employeetest');
  expect((await child.request.get('/api/ppe/employees?company_id=amt')).status()).toBe(403);
  expect((await patch(child,row,{is_active:false})).status()).toBe(403);
  await child.close();
  response=await patch(context,row,{is_active:false});expect(response.status(),await response.text()).toBe(200);row=(await response.json()).data;
  expect((await read(context,'/api/ppe/employees?company_id=amt')).data.some(e=>e.id===apiEmployee)).toBe(false);
  expect((await read(context,'/api/ppe/employees?company_id=amt&status=inactive')).data.some(e=>e.id===apiEmployee)).toBe(true);
  const movement={company_id:'amt',product_id:product,quantity:1,unit:'pair',employee_code:'EAPI01',employee_name:oldApiName,transaction_date:'2030-01-01'};
  for(const transaction_type of ['stock_out','borrow']) expect((await context.request.post('/api/ppe/transactions',{data:{...movement,transaction_type}})).status()).toBe(409);
  const returned=await context.request.post('/api/ppe/transactions',{data:{...movement,transaction_type:'return'}});
  expect(returned.status(),await returned.text()).toBe(201);
  const duplicate=await context.request.post('/api/ppe/employees',{data:{company_id:'amt',employee_code:'EAPI01',name:'คนใหม่ใช้รหัสเก่า'}});
  expect(duplicate.status()).toBe(409);
  response=await patch(context,row,{is_active:true});expect(response.status(),await response.text()).toBe(200);row=(await response.json()).data;
  expect((await read(context,'/api/ppe/employees?company_id=amt')).data.some(e=>e.id===apiEmployee)).toBe(true);
  const rename=await context.request.patch('/api/ppe/departments',{data:{id:1,company_id:'amt',expected_name:'ฝ่ายช่างเดิม',name:'ฝ่ายช่างชื่อปัจจุบัน'}});
  expect(rename.status(),await rename.text()).toBe(200);
  expect((await employee(context,apiEmployee)).department).toBe('ฝ่ายช่างชื่อปัจจุบัน');
  const audit=(await read(context,`/api/ppe/employees?company_id=amt&id=${apiEmployee}&view=history`)).data;
  expect(audit.some(a=>a.before_data?.name===oldApiName&&a.after_data?.name==='สมชาย ชื่อปัจจุบัน')).toBe(true);
  expect(audit.some(a=>a.after_data?.is_active===false)).toBe(true);
  expect(audit.every(a=>a.actor_name)).toBe(true);
  const originalIds=new Set(historyBefore.map(t=>t.id));
  expect(snapshots((await read(context,'/api/ppe/transactions?company_id=amt')).data).filter(t=>originalIds.has(t.id))).toEqual(historyBefore);
  expect(snapshots((await read(context,'/api/ppe/reports?company_id=amt&from=2026-10&to=2026-10')).transactions)).toEqual(reportBefore);
});

test('main user edits names, reviews warnings, deactivates and restores employees on desktop and mobile',async({browser,page,context})=>{
  await login(context);
  const impact=(await read(context,`/api/ppe/employees?company_id=amt&id=${uiEmployee}&view=impact`)).data;
  expect(impact.borrow_record_count).toBe(1);expect(impact.open_request_count).toBe(1);
  expect(impact.requester_accounts[0].username).toBe('ppe.amt.employeetest');expect(impact.requester_accounts[0].password).toBeUndefined();
  await page.goto('/ppe/employees');
  await page.getByRole('button',{name:`แก้ไข ${oldUiName}`,exact:true}).click();
  const edit=page.getByRole('dialog',{name:'แก้ไขพนักงาน',exact:true});
  await expect(edit.getByLabel('รหัสพนักงาน',{exact:true})).toHaveAttribute('readonly','');
  const newName='พนักงาน ชื่อปัจจุบันสำหรับทดสอบการแสดงข้อความชื่อเต็มบนมือถือ';
  await edit.getByLabel('ชื่อ-นามสกุล',{exact:true}).fill(newName);
  await edit.getByLabel('ตำแหน่ง',{exact:true}).fill('ผู้ประสานงานแผนก');
  await edit.getByLabel('แผนก',{exact:true}).fill('ฝ่ายคลังสินค้าใหม่');
  await edit.getByRole('button',{name:'บันทึกการแก้ไข',exact:true}).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole('button',{name:`แก้ไข ${newName}`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:`ประวัติการแก้ไข ${newName}`,exact:true}).click();
  const history=page.getByRole('dialog',{name:'ประวัติการแก้ไขพนักงาน',exact:true});
  await expect(history).toContainText(oldUiName);await expect(history).toContainText(newName);
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:`ปิดใช้งาน ${newName}`,exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'ปิดใช้งานพนักงาน',exact:true});
  await expect(confirm).toContainText('ppe.amt.employeetest');await expect(confirm).toContainText('ยืม');
  await confirm.getByRole('button',{name:'ยืนยันปิดใช้งาน',exact:true}).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('button',{name:`แก้ไข ${newName}`,exact:true})).toHaveCount(0);
  const defaultList=(await read(context,'/api/ppe/employees?company_id=amt')).data;
  expect(defaultList.some(e=>e.id===uiEmployee)).toBe(false);
  const child=await browser.newContext({baseURL});
  await login(child,'ppe.amt.employeetest');
  expect((await child.request.get('/api/auth/session')).status()).toBe(200);
  expect((await read(child,'/api/ppe/requests?company_id=amt')).data.some(r=>r.status==='pending')).toBe(true);
  await child.close();
  await page.goto('/ppe/stock-out');
  await page.getByPlaceholder('ค้นหาพนักงาน...').fill('EUI01');
  await expect(page.getByRole('button').filter({hasText:'EUI01'})).toHaveCount(0);
  await page.goto('/ppe/history');
  await page.getByPlaceholder('ค้นหาสินค้า, พนักงาน, หมายเหตุ...').fill('EUI01');
  await expect(page.getByRole('cell').filter({hasText:oldUiName}).first()).toBeVisible();
  await page.goto('/ppe/employees');
  await page.getByRole('button',{name:'ปิดใช้งาน',exact:true}).click();
  await expect(page.getByRole('button',{name:`เปิดใช้งาน ${newName}`,exact:true})).toBeVisible();
  let bounds=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));expect(bounds.s).toBeLessThanOrEqual(bounds.w);
  await page.screenshot({path:'test-results/ppe-employees-inactive-mobile.png',fullPage:true});
  await page.getByRole('button',{name:`เปิดใช้งาน ${newName}`,exact:true}).click();
  await page.getByRole('dialog',{name:'เปิดใช้งานพนักงาน',exact:true}).getByRole('button',{name:'ยืนยันเปิดใช้งาน',exact:true}).click();
  await page.getByRole('button',{name:'กำลังใช้งาน',exact:true}).click();
  await expect(page.getByRole('button',{name:`แก้ไข ${newName}`,exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/ppe-employees-active-mobile.png',fullPage:true});
  const records=snapshots((await read(context,'/api/ppe/transactions?company_id=amt')).data).filter(t=>t.employee_code==='EUI01');
  expect(records).toHaveLength(2);expect(records.every(t=>t.employee_name===oldUiName)).toBe(true);
});

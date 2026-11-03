const fs=require('node:fs');
const path=require('node:path');
const bcrypt=require('bcryptjs');
const {startFixture,product}=require('./ppe-requests-fixture.cjs');
const apiEmployee='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uiEmployee='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherEmployee='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requester='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const oldApiName='สมชาย ประวัติเดิม';
const oldUiName='พนักงาน ทดสอบหน้าจอ';
const uiDepartment='ฝ่ายผลิตและประกอบอุปกรณ์ป้องกันอันตราย ชื่อแผนกฉบับเต็ม';
async function setup(db) {
  await db.exec('alter table ppe_departments add column updated_at timestamptz default now(); create unique index ppe_departments_company_name on ppe_departments(company_id,name);');
  const migrations=path.join(__dirname,'../supabase/migrations');
  const file=fs.readdirSync(migrations).find(f=>f.endsWith('_ppe_employee_management.sql'));
  if(!file)throw new Error('Employee migration is required for this fixture');
  await db.exec(fs.readFileSync(path.join(migrations,file),'utf8'));
  await db.query(`insert into ppe_departments(id,company_id,name) values(1,'amt','ฝ่ายช่างเดิม'),(2,'amt',$1),(3,'aab','แผนกต่างบริษัท')`,[uiDepartment]);
  for(const [id,company,code,name,department] of [[apiEmployee,'amt','EAPI01',oldApiName,'ฝ่ายช่างเดิม'],[uiEmployee,'amt','EUI01',oldUiName,uiDepartment],[otherEmployee,'aab','EUI01','ข้อมูลต่างบริษัท','แผนกต่างบริษัท']]) {
    await db.query('insert into ppe_employees(id,company_id,employee_code,name,department) values($1,$2,$3,$4,$5)',[id,company,code,name,department]);
  }
  for(const [code,name,department] of [['EAPI01',oldApiName,'ฝ่ายช่างเดิม'],['EUI01',oldUiName,uiDepartment]]) {
    await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date,employee_code,employee_name,department) values('amt',$1,'stock_out',5,'pair','2026-10-01',$2,$3,$4),('amt',$1,'borrow',2,'pair','2026-10-02',$2,$3,$4)`,[product,code,name,department]);
  }
  const hash=await bcrypt.hash('local-test-password',4);
  await db.query(`insert into ppe_requesters(id,company_id,username,password,display_name,employee_code,department,created_by) values($1,'amt','ppe.amt.employeetest',$2,$3,'EUI01',$4,'test')`,[requester,hash,oldUiName,uiDepartment]);
  await db.query(`select ppe_request_action('ppe_requesters',$1,'amt','submit',null,$2,1,'local test',gen_random_uuid())`,[requester,product]);
}
module.exports={apiEmployee,uiEmployee,otherEmployee,requester,oldApiName,oldUiName,uiDepartment};
if(require.main===module) startFixture(4338,{setup,rpc:['ppe_employee_write','ppe_employee_impact','ppe_department_rename']}).catch(e=>{console.error(e);process.exit(1);});

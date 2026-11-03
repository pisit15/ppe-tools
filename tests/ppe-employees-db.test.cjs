const { test,before,after }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { createDb,product }=require('./ppe-requests-fixture.cjs');
const migration=path.join(__dirname,'../supabase/migrations/20261103062525_ppe_employee_management.sql');
let db,employee,other;
async function write(id,revision,changes,company='amt',actor='1',table='company_users') {
  return (await db.query('select ppe_employee_write($1,$2,$3,$4,$5,$6::jsonb) as result',[table,actor,company,id,revision,JSON.stringify(changes)])).rows[0].result;
}
async function employeeRow(id=employee.id) { return (await db.query('select * from ppe_employees where id=$1',[id])).rows[0]; }
before(async()=>{
  db=await createDb();
  await db.exec('alter table ppe_departments add column updated_at timestamptz default now();');
  await db.exec(fs.readFileSync(migration,'utf8'));
  employee=await write(null,null,{employee_code:'EMP-1',name:'ชื่อเดิม',department:'แผนกเดิม',position:'ช่าง'});
  other=await write(null,null,{employee_code:'EMP-1',name:'ต่างบริษัท'},'aab','2');
});
after(async()=>{await db?.close();});

test('create is audited and own company/module/requester rules are checked inside RPC',async()=>{
  const log=(await db.query('select * from ppe_employee_changes where employee_id=$1',[employee.id])).rows[0];
  assert.equal(log.action,'create'); assert.equal(log.before_data,null); assert.equal(log.after_data.name,'ชื่อเดิม'); assert.equal(log.actor,'company_users:1');
  await assert.rejects(write(other.id,1,{name:'wrong'},'aab','1'),/บริษัท/);
  await assert.rejects(write(employee.id,1,{name:'wrong'},'amt','1','ppe_requesters'),/ผู้ดูแล/);
  await db.exec("insert into company_users(username,password,company_id,display_name,allowed_modules) values('chemical','hash','amt','Chemical',array['chemical']);");
  await assert.rejects(write(employee.id,1,{name:'wrong'},'amt','3'),/PPE/);
  await db.exec('update company_users set is_active=false where id=3');
  await assert.rejects(write(employee.id,1,{name:'wrong'},'amt','3'),/สิทธิ์/);
  await db.exec('set role anon');
  try { await assert.rejects(write(employee.id,1,{name:'wrong'}),/permission denied/); await assert.rejects(db.query('select * from ppe_employee_changes'),/permission denied/); }
  finally { await db.exec('reset role'); }
});

test('edit, deactivate, reactivate preserve all old transaction snapshots, stock and requester accounts',async()=>{
  await db.query("insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,employee_code,employee_name,department) values('amt',$1,'stock_out',2,'pair','EMP-1','ชื่อเดิม','แผนกเดิม')",[product]);
  await db.exec("insert into ppe_requesters(company_id,username,password,display_name,employee_code,department,created_by) values('amt','ppe.amt.old','hash','ชื่อบัญชีเดิม','EMP-1','แผนกเดิม','test');");
  const before=(await db.query('select * from ppe_transactions order by id')).rows;
  const stock=(await db.query('select * from ppe_stock_summary order by product_id')).rows;
  const account=(await db.query("select * from ppe_requesters where employee_code='EMP-1'")).rows;
  let current=await write(employee.id,1,{name:'ชื่อใหม่',position:'หัวหน้า',department:'แผนกใหม่'});
  assert.equal(current.id,employee.id); assert.equal(current.revision,2); assert.equal(current.employee_code,'EMP-1');
  await assert.rejects(write(employee.id,1,{name:'stale'}),/รีเฟรช/);
  await assert.rejects(write(employee.id,2,{employee_code:'EMP-NEW'}),/รหัสพนักงาน/);
  current=await write(employee.id,2,{is_active:false}); assert.equal(current.is_active,false);
  await assert.rejects(write(null,null,{employee_code:'emp-1',name:'คนใหม่'}),/มีอยู่แล้ว/);
  assert.equal((await db.query("select count(*)::int n from ppe_employees where id=$1 and is_active=true",[employee.id])).rows[0].n,0);
  current=await write(employee.id,3,{is_active:true}); assert.equal(current.revision,4);
  assert.deepEqual((await db.query('select * from ppe_transactions order by id')).rows,before);
  assert.deepEqual((await db.query('select * from ppe_stock_summary order by product_id')).rows,stock);
  assert.deepEqual((await db.query("select * from ppe_requesters where employee_code='EMP-1'")).rows,account);
  const actions=(await db.query('select action from ppe_employee_changes where employee_id=$1 order by (after_data->>\'revision\')::int',[employee.id])).rows.map(x=>x.action);
  assert.deepEqual(actions,['create','update','deactivate','reactivate']);
  const unchanged=await write(employee.id,4,{name:current.name}); assert.equal(unchanged.revision,4);
});

test('impact reports pending requests and historical loans without exposing account secrets or changing them',async()=>{
  const person=(await db.query("select id from ppe_requesters where username='ppe.amt.old'")).rows[0].id;
  await db.query("insert into ppe_requests(company_id,requester_id,product_id,quantity,reason,submission_key,status) values('amt',$1,$2,3,'',gen_random_uuid(),'pending'),('amt',$1,$2,2,'',gen_random_uuid(),'cancelled')",[person,product]);
  await db.query("insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,employee_code) values('amt',$1,'borrow',3,'pair','EMP-1'),('amt',$1,'return',3,'pair','EMP-1')",[product]);
  const result=(await db.query("select ppe_employee_impact('company_users','1','amt',$1) r",[employee.id])).rows[0].r;
  assert.equal(result.open_request_count,1); assert.equal(result.borrow_record_count,1);
  assert.deepEqual(Object.keys(result.requester_accounts[0]).sort(),['display_name','id','is_active','username']);
  assert.equal(result.requester_accounts[0].is_active,true);
});

test('department rename atomically updates current profiles and audit but preserves snapshots and stale edits are rejected',async()=>{
  await db.exec("insert into ppe_departments(company_id,name) values('amt','แผนกใหม่');");
  const department=(await db.query("select id from ppe_departments where name='แผนกใหม่'")).rows[0].id;
  const before=(await db.query('select * from ppe_transactions order by id')).rows;
  const result=(await db.query("select ppe_department_rename('company_users','1','amt',$1,'แผนกใหม่','แผนกเปลี่ยนชื่อ') r",[department])).rows[0].r;
  assert.equal(result.cascaded.employees,1); assert.equal(result.cascaded.transactions,0);
  const current=await employeeRow(); assert.equal(current.department,'แผนกเปลี่ยนชื่อ'); assert.equal(current.revision,5);
  assert.deepEqual((await db.query('select * from ppe_transactions order by id')).rows,before);
  await assert.rejects(write(employee.id,4,{name:'stale before rename'}),/รีเฟรช/);
  await assert.rejects(db.query("select ppe_department_rename('company_users','1','amt',$1,'แผนกใหม่','stale')",[department]),/รีเฟรช/);
  await db.exec("create function test_reject_audit() returns trigger language plpgsql as $$ begin raise exception 'audit insert failed'; end $$; create trigger test_reject_audit before insert on ppe_employee_changes for each row execute function test_reject_audit();");
  try {
    await assert.rejects(write(employee.id,5,{name:'must rollback'}),/audit insert failed/);
    assert.equal((await employeeRow()).name,current.name);
    await assert.rejects(db.query("select ppe_department_rename('company_users','1','amt',$1,'แผนกเปลี่ยนชื่อ','must rollback')",[department]),/audit insert failed/);
    assert.equal((await employeeRow()).department,current.department);
    assert.equal((await db.query('select name from ppe_departments where id=$1',[department])).rows[0].name,'แผนกเปลี่ยนชื่อ');
  } finally { await db.exec('drop trigger test_reject_audit on ppe_employee_changes; drop function test_reject_audit();'); }
});

test('invalid fields and legacy-code reuse are refused; service cannot rewrite audit history',async()=>{
  await assert.rejects(write(employee.id,5,{name:''}),/ไม่ถูกต้อง/);
  await assert.rejects(write(employee.id,5,{is_active:'false'}),/สถานะ/);
  await assert.rejects(write(employee.id,5,{company_id:'aab'}),/ไม่ถูกต้อง/);
  await db.query("insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit,employee_code) values('amt',$1,'stock_out',1,'pair','HISTORICAL')",[product]);
  await assert.rejects(write(null,null,{employee_code:'HISTORICAL',name:'New person'}),/ประวัติเดิม/);
  await db.exec('set role service_role');
  try {
    await assert.rejects(db.query("update ppe_employee_changes set actor_name='tampered'"),/permission denied/);
    await assert.rejects(db.query('delete from ppe_employee_changes'),/permission denied/);
    const current=await write(employee.id,5,{position:'ผู้ดูแล'}); assert.equal(current.revision,6);
  } finally { await db.exec('reset role'); }
});

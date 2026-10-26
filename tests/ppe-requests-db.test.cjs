const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
let db, product, otherProduct, person, peer, otherPerson;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table company_users(id integer primary key,company_id text,display_name text,is_active boolean default true,allowed_modules text[]);
    create table tools_users(id uuid primary key,company_id text,display_name text,is_active boolean default true);
    create table admin_accounts(id integer primary key,display_name text,is_active boolean default true);
    create table ppe_departments(id integer); create table ppe_order_settings(company_id text); create table ppe_order_remarks(id integer);
    insert into company_users values(1,'amt','AMT Manager',true,null),(2,'aab','AAB Manager',true,null),(3,'amt','Chemical only',true,array['chemical']);
    insert into admin_accounts values(1,'Admin',true);`);
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/001_ppe_tables.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261026020248_ppe_request_workflow.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261026020729_ppe_private_stock_view.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261026024306_ppe_request_batch.sql'), 'utf8'));
  product = randomUUID(); otherProduct = randomUUID(); person = randomUUID(); peer = randomUUID(); otherPerson = randomUUID();
  await db.query(`insert into ppe_products(id,company_id,name,type) values ($1,'amt','ถุงมือ L','ppe'),($2,'aab','AAB only','ppe')`, [product, otherProduct]);
  for (const [id, company, code] of [[person,'amt','001'],[peer,'amt','002'],[otherPerson,'aab','003']]) {
    await db.query(`insert into ppe_requesters(id,company_id,username,password,display_name,employee_code,created_by) values($1,$2,$3,'hash','Test Employee',$4,'test')`, [id, company, `${company}.${code}`, code]);
  }
  await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit) values('amt',$1,'stock_in',100,'ชิ้น')`, [product]);
});
after(async () => { await db?.close(); });
async function action(type, id, action, request = null, qty = null, opts = {}) {
  return (await db.query(`select ppe_request_action($1,$2,$3,$4,$5,$6,$7,$8,$9) as result`,
    [type, String(id), opts.company || 'amt', action, request, opts.product || product, qty, opts.note ?? 'Test reason', opts.key || randomUUID()])).rows[0].result;
}
async function stock() { const r = (await db.query('select current_stock,reserved_quantity,available_stock from ppe_stock_availability where product_id=$1', [product])).rows[0]; return Object.fromEntries(Object.entries(r).map(([k,v]) => [k,Number(v)])); }

test('reserve on approval, dispatch without stock-out, partial receipt and retries commit once', async () => {
  const key = randomUUID();
  const r = await action('ppe_requesters', person, 'submit', null, 20, { key });
  assert.equal((await action('ppe_requesters', person, 'submit', null, 20, { key })).id, r.id);
  assert.deepEqual(await stock(), { current_stock:100, reserved_quantity:0, available_stock:100 });
  await action('company_users',1,'approve',r.id,20);
  await action('company_users',1,'approve',r.id,20);
  assert.deepEqual(await stock(), { current_stock:100, reserved_quantity:20, available_stock:80 });
  await assert.rejects(action('ppe_requesters',person,'receive',r.id,20), /สถานะ/);
  await action('company_users',1,'dispatch',r.id);
  assert.equal((await stock()).current_stock,100);
  await assert.rejects(action('company_users',1,'receive',r.id,20), /บัญชีตัวเอง/);
  await action('ppe_requesters',person,'receive',r.id,7);
  await action('ppe_requesters',person,'receive',r.id,7);
  assert.deepEqual(await stock(), { current_stock:93, reserved_quantity:13, available_stock:80 });
  await assert.rejects(action('ppe_requesters',person,'receive',r.id,6), /จำนวนรับ/);
  const done = await action('ppe_requesters',person,'receive',r.id,20);
  assert.equal(done.status,'received');
  await action('ppe_requesters',person,'receive',r.id,20);
  assert.deepEqual(await stock(), { current_stock:80, reserved_quantity:0, available_stock:80 });
  const tx = (await db.query('select id,quantity,employee_code from ppe_transactions where ppe_request_id=$1 order by quantity',[r.id])).rows;
  assert.deepEqual(tx.map(t => t.quantity),[7,13]); assert.equal(tx[0].employee_code,'001');
  await assert.rejects(db.query('delete from ppe_transactions where id=$1',[tx[0].id]), /แก้ไขหรือลบไม่ได้/);
  await assert.rejects(db.query('update ppe_transactions set quantity=1 where id=$1',[tx[0].id]), /แก้ไขหรือลบไม่ได้/);
  assert.equal((await db.query('select count(*)::int as n from ppe_request_events where request_id=$1',[r.id])).rows[0].n,5);
});
test('rejects foreign company/product, other owner, requester escalation, inactive and non-PPE manager', async () => {
  const r=await action('ppe_requesters',person,'submit',null,5);
  await assert.rejects(action('ppe_requesters',person,'submit',null,1,{product:otherProduct}),/ไม่พบสินค้า/);
  await assert.rejects(action('ppe_requesters',otherPerson,'submit',null,1),/บริษัท/);
  await assert.rejects(action('company_users',2,'approve',r.id,5),/บริษัท/);
  await assert.rejects(action('company_users',3,'approve',r.id,5),/PPE/);
  await assert.rejects(action('ppe_requesters',person,'approve',r.id,5),/ผู้ดูแล/);
  await assert.rejects(action('ppe_requesters',peer,'cancel',r.id),/ไม่มีสิทธิ์/);
  await db.query('update ppe_requesters set is_active=false where id=$1',[person]);
  await assert.rejects(action('ppe_requesters',person,'submit',null,1),/ไม่มีสิทธิ์/);
  await assert.rejects(action('company_users',1,'approve',r.id,5),/สถานะ/);
  await db.query('update ppe_requesters set is_active=true where id=$1',[person]);
  await action('ppe_requesters',person,'cancel',r.id);
});
test('competing approvals and manual issues cannot spend reserved stock; cancellation releases only outstanding units', async () => {
  const a=await action('ppe_requesters',person,'submit',null,70);
  const b=await action('ppe_requesters',peer,'submit',null,70);
  await action('company_users',1,'approve',a.id,70);
  await assert.rejects(action('company_users',1,'approve',b.id,70),/พร้อมเบิกไม่พอ/);
  await assert.rejects(db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit) values('amt',$1,'stock_out',11,'ชิ้น')`,[product]), /พร้อมเบิกไม่พอ/);
  await assert.rejects(db.query('update ppe_products set is_active=false where id=$1',[product]), /คำขอจอง/);
  await assert.rejects(db.query(`update ppe_transactions set quantity=80 where product_id=$1 and transaction_type='stock_in'`,[product]), /พร้อมเบิกไม่พอ/);
  await assert.rejects(action('ppe_requesters',person,'cancel',a.id), /ยกเลิก/);
  await action('company_users',1,'dispatch',a.id);
  await action('ppe_requesters',person,'receive',a.id,5);
  await action('company_users',1,'cancel',a.id,null,{note:'Return undistributed balance'});
  assert.deepEqual(await stock(), {current_stock:75,reserved_quantity:0,available_stock:75});
  await action('company_users',1,'reject',b.id,null,{note:'No longer needed'});
});
test('failed stock receipt rolls back reservation/status and ledger together', async () => {
  const r=await action('ppe_requesters',person,'submit',null,4);
  await action('company_users',1,'approve',r.id,4); await action('company_users',1,'dispatch',r.id);
  await db.exec(`create function test_receipt_failure() returns trigger language plpgsql as $$ begin if NEW.ppe_request_id is not null then raise exception 'simulated write failure'; end if; return NEW; end $$;
    create trigger zz_test_failure before insert on ppe_transactions for each row execute function test_receipt_failure();`);
  await assert.rejects(action('ppe_requesters',person,'receive',r.id,4), /simulated/);
  assert.deepEqual(await stock(), {current_stock:75,reserved_quantity:4,available_stock:71});
  assert.equal((await db.query('select received_quantity from ppe_requests where id=$1',[r.id])).rows[0].received_quantity,0);
  await db.exec('drop trigger zz_test_failure on ppe_transactions; drop function test_receipt_failure();');
  await action('company_users',1,'cancel',r.id,null,{note:'Test complete'});
});

test('legacy manager without a display name still produces a named audit event', async () => {
  const r=await action('ppe_requesters',person,'submit',null,1);
  await db.exec('update company_users set display_name=null where id=1');
  await action('company_users',1,'reject',r.id,null,{note:'Test fallback name'});
  assert.equal((await db.query("select actor_name from ppe_request_events where request_id=$1 and action='reject'",[r.id])).rows[0].actor_name,'company_users:1');
});
test('Data API roles cannot read PPE identities, stock or requests or execute workflow; service role has explicit grants', async () => {
  for(const role of ['anon','authenticated']) {
    for(const table of ['ppe_requesters','ppe_requests','ppe_request_events','ppe_stock_summary','ppe_stock_availability','ppe_products','ppe_transactions']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,\'SELECT\') as ok',[role,table])).rows[0].ok,false);
    }
    assert.equal((await db.query(`select has_function_privilege($1,'ppe_request_action(text,text,text,text,uuid,uuid,integer,text,uuid)','EXECUTE') as ok`,[role])).rows[0].ok,false);
  }
  for(const table of ['ppe_requesters','ppe_requests','ppe_request_events']) {
    assert.equal((await db.query('select has_table_privilege(\'service_role\',$1,\'SELECT,INSERT,UPDATE,DELETE\') as ok',[table])).rows[0].ok,true);
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
  }
});

test('batch submissions are atomic, company scoped and idempotent without reserving stock',async()=>{
  const second=randomUUID();
  await db.query(`insert into ppe_products(id,company_id,name,type) values($1,'amt','แว่นตา','ppe')`,[second]);
  await db.query(`insert into ppe_transactions(company_id,product_id,transaction_type,quantity,unit) values('amt',$1,'stock_in',3,'piece')`,[second]);
  const batch=(items,actor=person,company='amt',table='ppe_requesters')=>db.query('select ppe_request_batch($1,$2,$3,$4::jsonb,$5) as result',[table,actor,company,JSON.stringify(items),'ขออุปกรณ์หลายรายการ']);
  const first={product_id:product,quantity:2,submission_key:randomUUID()};
  const next={product_id:second,quantity:2,submission_key:randomUUID()};
  const before=await stock();
  await assert.rejects(batch([first,{...next,quantity:4}]),/พร้อมเบิก/);
  assert.equal((await db.query('select count(*)::int as n from ppe_requests where submission_key=$1',[first.submission_key])).rows[0].n,0);
  await assert.rejects(batch([first,{...next,product_id:otherProduct}]),/พร้อมเบิก|บริษัท/);
  await assert.rejects(batch([first,first]),/ซ้ำ/);
  await assert.rejects(batch([first,next],person,'aab'),/บริษัท/);
  await assert.rejects(batch([first,next],'1','amt','company_users'),/ผู้ขอเบิก/);
  const saved=(await batch([first,next])).rows[0].result;
  assert.equal(saved.length,2);
  assert.deepEqual((await batch([first,next])).rows[0].result.map(r=>r.id),saved.map(r=>r.id));
  assert.deepEqual(await stock(),before);
  for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,'ppe_request_batch(text,text,text,jsonb,text)','EXECUTE') as ok",[role])).rows[0].ok,false);
});

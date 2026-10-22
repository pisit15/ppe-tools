// Procurement tables: service_role only, constraints and cascade. Local PGlite, no credentials.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const mig=f=>fs.readFileSync(path.join(__dirname,'..','supabase/migrations',f),'utf8');

test('procurement tables deny direct clients, keep constraints and add a hidden home card',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(mig('20261009122344_tools_home_cards.sql'));
  await db.exec(mig('20261022160000_procurement_pr.sql'));
  const card=(await db.query("select is_visible from tools_home_cards where id='procurement'")).rows[0];
  assert.equal(card.is_visible,false);
  for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   for(const t of ['proc_pr','proc_pr_lines','proc_po_lines','proc_quotes','proc_quote_items','proc_sync_runs'])
    await assert.rejects(db.query(`select * from ${t}`),/permission denied/,`${role} must not read ${t}`);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query("insert into proc_pr(odoo_id,pr_no,requester,state) values (1,'PR26000001','Tester','done')");
  await db.query("insert into proc_pr_lines(odoo_id,pr_odoo_id,pr_no) values (10,1,'PR26000001')");
  await db.query("insert into proc_po_lines(odoo_id,po_no,pr_odoo_id,pr_no,requester,unit_price) values (20,'PO26000001',1,'PR26000001','Tester',100)");
  await assert.rejects(db.query("insert into proc_pr(odoo_id,pr_no,requester,state) values (2,'PR26000002','Tester','weird')"),/check constraint/);
  await assert.rejects(db.query("insert into proc_po_lines(odoo_id,po_no,pr_odoo_id,pr_no,requester) values (21,'PO1',999,'PR1','x')"),/foreign key/);
  await db.query('delete from proc_pr where odoo_id=1');
  assert.equal((await db.query('select count(*)::int n from proc_po_lines')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from proc_pr_lines')).rows[0].n,0);
  await db.query(`insert into proc_sync_runs(source,counts,imported_by) values ('test','{}','admin')`);
  await assert.rejects(db.query('delete from proc_sync_runs'),/permission denied/);
 } finally { await db.close(); }
});

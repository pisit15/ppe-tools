const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createDb } = require('./chemical-db-fixture.cjs');
test('migration denies direct client access and service updates; RPC checks scope, active record and retry identity', async () => {
  const db = await createDb();
  try {
    const privileges=(await db.query(`select c.relrowsecurity,
      has_table_privilege('anon','public.chem_label_versions','SELECT') as anon_read,
      has_table_privilege('authenticated','public.chem_label_versions','INSERT') as user_write,
      has_table_privilege('service_role','public.chem_label_versions','UPDATE') as service_update,
      has_table_privilege('service_role','public.chem_label_versions','DELETE') as service_delete,
      has_function_privilege('anon','public.chem_save_label_version(uuid,text,uuid,text,jsonb,jsonb)','EXECUTE') as anon_rpc,
      has_function_privilege('authenticated','public.chem_save_label_version(uuid,text,uuid,text,jsonb,jsonb)','EXECUTE') as user_rpc
      from pg_class c where c.oid='public.chem_label_versions'::regclass`)).rows[0];
    assert.deepEqual(privileges,{relrowsecurity:true,anon_read:false,user_write:false,service_update:false,service_delete:false,anon_rpc:false,user_rpc:false});
    const id='11111111-1111-4111-8111-111111111111';
    const args=[id,'amt',randomUUID(),'test','{"schema":1}','{"id":"verified-actor"}'];
    const sql='select * from public.chem_save_label_version($1,$2,$3,$4,$5::jsonb,$6::jsonb)';
    await db.exec('set role service_role');
    const before=(await db.query('select updated_at from chem_substances where id=$1',[id])).rows[0];
    const first=(await db.query(sql,args)).rows[0];
    assert.equal(first.version,1);
    assert.equal((await db.query(sql,args)).rows[0].id,first.id);
    await assert.rejects(db.query(sql,[id,'aab',randomUUID(),'test','{}','{}']),/unavailable/);
    await assert.rejects(db.query(sql,[...args.slice(0,3),'changed',...args.slice(4)]),/already used/);
    await assert.rejects(db.query('update chem_label_versions set title=$1 where id=$2',['overwrite',first.id]),/permission denied/);
    await assert.rejects(db.query('delete from chem_label_versions where id=$1',[first.id]),/permission denied/);
    assert.deepEqual((await db.query('select updated_at from chem_substances where id=$1',[id])).rows[0],before);
  } finally { await db.close(); }
});

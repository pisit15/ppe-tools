const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDb}=require('./chemical-db-fixture.cjs');

test('homepage cards have constrained defaults and deny direct clients or service deletion',async()=>{
 const db=await createDb();
 try {
  const cards=(await db.query('select * from tools_home_cards')).rows;
  assert.equal(cards.length,5);assert.ok(cards.every(c=>c.is_visible && c.revision===1));
  await assert.rejects(db.query("update tools_home_cards set name=' ' where id='ppe'"),/check constraint/);
  await assert.rejects(db.query("update tools_home_cards set description=repeat('a',501) where id='ppe'"),/check constraint/);
  await assert.rejects(db.query("update tools_home_cards set revision=0 where id='ppe'"),/check constraint/);
  for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from tools_home_cards'),/permission denied/);
   await assert.rejects(db.query("update tools_home_cards set is_visible=false where id='ppe'"),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query("update tools_home_cards set name='Edited PPE',is_visible=false,revision=revision+1,updated_by='verified-admin' where id='ppe'");
  assert.equal((await db.query("select name from tools_home_cards where id='ppe'")).rows[0].name,'Edited PPE');
  await assert.rejects(db.query("update tools_home_cards set id='other' where id='ppe'"),/permission denied/);
  await assert.rejects(db.query('delete from tools_home_cards'),/permission denied/);
  await assert.rejects(db.query("insert into tools_home_cards(id,name,description) values ('other','Other','Other')"),/permission denied/);
 }finally{await db.close();}
});

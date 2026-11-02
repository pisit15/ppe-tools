const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {load}=require('./permit-helpers.cjs');
const {AMT_V2_SEEDS}=load('src/lib/permit/amt-forms.ts');
const {PERMIT_SEEDS}=load('src/lib/permit/catalog.ts');

test('AMT detailed templates preserve old revisions and bind the reviewed source bytes',()=>{
 assert.equal(AMT_V2_SEEDS.length,2);
 for(const t of AMT_V2_SEEDS){
  assert.equal(t.active,false);assert.equal(t.version,2);assert.equal(t.revision,'D');
  assert.equal(t.config.layoutVersion,'amt-2026-11-v2');
  const hash=createHash('sha256').update(fs.readFileSync(`data/permit-templates/${t.source_code}.pdf`)).digest('hex');
  assert.equal(t.config.sourceSha256,hash);
  const old=PERMIT_SEEDS.find(s=>s.source_code===t.source_code);
  assert.equal(old.version,1);assert.ok(!old.config.layoutVersion);
  assert.notEqual(t.config.fields,old.config.fields);
 }
});
test('one field per original hazard/control/PPE/checklist item, without preselected safety results',()=>{
 const general=AMT_V2_SEEDS[0],height=AMT_V2_SEEDS[1];
 assert.equal(general.config.fields.filter(f=>f.id.startsWith('hazard_')).length,14);
 assert.equal(height.config.fields.filter(f=>f.kind==='check').length,9);
 assert.equal(height.config.fields.filter(f=>/^ppe_(?!.*text)/.test(f.id)).length,9);
 for(const t of AMT_V2_SEEDS){
  const ids=t.config.fields.map(f=>f.id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length<=100);
  for(const f of t.config.fields){
   assert.ok(!Object.hasOwn(f,'defaultValue'));
   if(f.kind==='choice'){assert.deepEqual(f.options.map(o=>o.value),['yes','no']);}
   for(const mark of f.print?.marks||[]){
    assert.ok(mark.x>20&&mark.x<807);assert.ok(mark.y>270&&mark.y<860);
   }
  }
 }
});

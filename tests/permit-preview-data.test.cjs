const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./permit-helpers.cjs');
const {validateData}=load('src/lib/permit/validation.ts');
const {AMT_V2_SEEDS}=load('src/lib/permit/amt-forms.ts');
const templates=AMT_V2_SEEDS.map((t,i)=>({...t,id:`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,active:true}));
test('incomplete preview uses authoritative templates and keeps final save validation strict',()=>{
 const partial={forms:templates.map(t=>({template:{id:t.id,source_code:'../../private'},answers:{}})),attachments:[],signatures:[{image:'forged'}],events:[{action:'fake'}]};
 const d=validateData(partial,templates,{preview:true});
 assert.equal(d.title,'');assert.equal(d.startsAt,'');assert.equal(d.forms[0].template.source_code,'003');
 assert.deepEqual(d.signatures,[]);assert.deepEqual(d.events,[]);
 assert.throws(()=>validateData(partial,templates));
 assert.throws(()=>validateData(partial,templates.map(t=>({...t,active:false})),{preview:true}));
 assert.throws(()=>validateData({...partial,forms:[{template:{id:'unknown'},answers:{}}]},templates,{preview:true}));
 assert.throws(()=>validateData({...partial,detail:'x'.repeat(5001)},templates,{preview:true}));
});

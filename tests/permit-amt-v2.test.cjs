const {test}=require('node:test'),assert=require('node:assert/strict');
const {load,setup}=require('./permit-helpers.cjs');
const {createDb}=require('./chemical-db-fixture.cjs');
const {AMT_V2_SEEDS}=load('src/lib/permit/amt-forms.ts');
const {validateTemplate,validateData,assertReady}=load('src/lib/permit/validation.ts');
const {transition}=load('src/lib/permit/workflow.ts');
function data(){return {title:'FMT ตรวจซ่อม',location:'อาคาร1',contractorName:'FMT',phone:'000',detail:'ทดสอบ',workers:'คน1\nคน2',workerCount:2,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),fireImpact:'ไม่มี',project:false,approvers:{area_owner:'company_users:owner',safety:'company_users:safety'},signatures:[],events:[],attachments:[],forms:AMT_V2_SEEDS.map(t=>({template:{...t,id:crypto.randomUUID(),active:true},answers:Object.fromEntries(t.config.fields.map(f=>[f.id,f.kind==='choice'?(t.source_code==='004'&&['equipment_ladder','ppe_harness'].includes(f.id)?'yes':'no'):f.kind==='check'?'yes':f.required?'ข้อมูลทดสอบ':'']))}))};}
test('v2 bound layouts, conditional controls, worker count and other details are enforced',()=>{
 const d=data();for(const f of d.forms)assert.doesNotThrow(()=>validateTemplate(f.template.config));
 assert.doesNotThrow(()=>assertReady(d));delete d.workerCount;assert.throws(()=>assertReady(d));d.workerCount=2;
 const general=d.forms[0];general.answers.hazard_machine='yes';assert.throws(()=>assertReady(d));general.answers.control_machine_guard='yes';assert.doesNotThrow(()=>assertReady(d));
 d.forms[1].answers.equipment_other='yes';assert.throws(()=>assertReady(d));d.forms[1].answers.equipment_other_text='รายละเอียด';assert.doesNotThrow(()=>assertReady(d));
 const altered=structuredClone(general.template.config);altered.fields[0].print={x:1,y:1};assert.throws(()=>validateTemplate(altered));
 general.answers.hazard_machine='no';const clean=validateData(d,d.forms.map(f=>f.template));assert.equal(clean.forms[0].answers.control_machine_guard,'');
 d.forms[1].answers.ppe_helmet='invented';assert.throws(()=>validateData(d,d.forms.map(f=>f.template)));
});
test('v2 inspection fails without complete rows, unsafe results suspend, resume requires signature',()=>{
 const d=data(),actor={key:'company_users:owner',name:'เจ้าของพื้นที่',companyId:'amt',admin:false,contractor:false,roles:['area_owner']};
 const p={id:crypto.randomUUID(),company_id:'amt',created_by:'requester',data:d,status:'active',version:1,created_at:d.startsAt};
 assert.throws(()=>transition(p,actor,'inspect',{note:'ตรวจ'}));
 const answers=Object.fromEntries(d.forms[1].template.config.fields.filter(f=>f.kind==='check').map(f=>[f.id,'yes']));answers.check_1='no';
 const next=transition(p,actor,'inspect',{note:'พบสภาพไม่ปลอดภัย',inspection:{formCode:'AHS-004',answers}});assert.equal(next.status,'suspended');assert.equal(next.data.inspections.length,1);
 assert.throws(()=>transition(next,actor,'resume',{note:'แก้ไขแล้ว'}));
});
test('search covers all history, ordered personal queues and company ownership without exposing images',async()=>{
 const db=await createDb();try{await setup(db);const d=data();d.forms=d.forms.slice(0,1);
 for(let i=0;i<103;i++)await db.query('insert into wp_permits(id,company_id,created_by,data,created_at) values($1,$2,$3,$4,$5)',[crypto.randomUUID(),i===102?'aab':'amt',i===101?'other':'requester',JSON.stringify({...d,title:i===0?'Oldest FMT record':'Job '+i}),new Date(Date.now()+i*1000).toISOString()]);
 await db.exec('set role service_role');
 const query=async(search='',own=false,offset=0)=> (await db.query("select wp_search_permits('amt','requester',$1,$2,'all','all',$3,25) result",[own,search,offset])).rows[0].result;
 const all=await query();assert.equal(all.total,102);assert.equal(all.data.length,25);assert.equal((await query('Oldest FMT')).total,1);assert.equal((await query('',true)).total,101);assert.equal((await query('',false,100)).data.length,2);assert.deepEqual(all.data[0].data.signatures,[]);
 await db.exec('reset role;set role anon');await assert.rejects(db.query("select wp_search_permits('amt','requester',false)"),/permission denied/);await assert.rejects(db.query('select * from wp_locations'),/permission denied/);
 }finally{await db.close();}
});

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
let db,today,expired,early,late;
before(async()=>{
  db=new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261102105832_first_aid_control.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261102111010_first_aid_inspection_ready.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261102115731_first_aid_unknown_expiry_hold.sql'),'utf8'));
  ({today,expired,early,late}=(await db.query(`select to_char((now() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD') today,to_char((now() at time zone 'Asia/Bangkok')::date-1,'YYYY-MM-DD') expired,to_char((now() at time zone 'Asia/Bangkok')::date+30,'YYYY-MM-DD') early,to_char((now() at time zone 'Asia/Bangkok')::date+300,'YYYY-MM-DD') late`)).rows[0]);
});
after(async()=>{await db?.close();});
async function fixture(){
  const f={company:'a_'+randomUUID().slice(0,8),other:'b_'+randomUUID().slice(0,8),location:randomUUID(),self:randomUUID(),foreign:randomUUID(),item:randomUUID(),otherItem:randomUUID(),equipment:randomUUID(),first:randomUUID(),last:randomUUID(),old:randomUUID(),publicLot:randomUUID(),publicLast:randomUUID(),hash:createHash('sha256').update(randomUUID()).digest('hex')};
  await db.query('insert into fa_company_settings(company_id) values($1),($2)',[f.company,f.other]);
  await db.query(`insert into fa_locations(id,company_id,name,type,area,issue_mode,public_token_hash) values($1,$2,'Office','Cabinet','Ground floor','controlled',null),($3,$2,'Bag','Bag','Gate','self_service',$4),($5,$6,'Other','Cabinet','Other site','controlled',null)`,[f.location,f.company,f.self,f.hash,f.foreign,f.other]);
  await db.query(`insert into fa_items(id,company_id,name,unit,track_expiry) values($1,$2,'Gauze','pack',true),($3,$4,'Other item','pack',true),($5,$2,'Scissors','piece',false)`,[f.item,f.company,f.otherItem,f.other,f.equipment]);
  await db.query(`insert into fa_lots(id,company_id,item_id,location_id,code,expiry,quantity) values($1,$2,$3,$4,'EARLY',$5,10),($6,$2,$3,$4,'LATE',$7,20),($8,$2,$3,$4,'EXPIRED',$9,5),($10,$2,$3,$11,'PUBLIC-EARLY',$5,10),($12,$2,$3,$11,'PUBLIC-LATE',$7,20)`,[f.first,f.company,f.item,f.location,early,f.last,late,f.old,expired,f.publicLot,f.self,f.publicLast]);
  return f;
}
function payload(f,extra={}){return {kind:'issue',locationId:f.location,date:today,mode:'staff',requester:{id:'person-1',name:'Test Collector',code:'TEST-1',department:'Unit A'},onBehalf:false,lines:[{itemId:f.item,quantity:1}],...extra};}
async function post(f,p=payload(f),key=randomUUID(),hash=null,actor='company_users:test'){
  return (await db.query('select fa_post_transaction($1,$2,$3,$4,$5::jsonb,$6) result',[f.company,actor,'Test Staff',key,JSON.stringify(p),hash])).rows[0].result;
}
async function quantity(id){return (await db.query('select quantity from fa_lots where id=$1',[id])).rows[0]?.quantity;}
async function countDocs(f){return Number((await db.query('select count(*) n from fa_documents where company_id=$1',[f.company])).rows[0].n);}

test('service-only grants and RLS prevent direct table and function access for browser roles',async()=>{
  const rows=(await db.query(`select tablename,rowsecurity from pg_tables where schemaname='public' and tablename like 'fa_%'`)).rows;
  assert.equal(rows.length,9);assert.ok(rows.every(row=>row.rowsecurity));
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    try{
      await assert.rejects(db.query('select * from fa_lots'),/permission denied/);
      await assert.rejects(db.query(`select fa_post_transaction('test','actor','Name',gen_random_uuid(),'{}'::jsonb,null)`),/permission denied/);
      await assert.rejects(db.query(`select fa_record_inspection('test',gen_random_uuid(),'actor','',false)`),/permission denied/);
      await assert.rejects(db.query(`select fa_record_inspection('test',gen_random_uuid(),'actor','',false,gen_random_uuid())`),/permission denied/);
      await assert.rejects(db.query(`select fa_save_thresholds('test',gen_random_uuid(),'[]'::jsonb)`),/permission denied/);
      await assert.rejects(db.query(`select fa_usage_summary('test')`),/permission denied/);
    }finally{await db.exec('reset role');}
  }
});

test('FEFO allocations exclude expired stock and record actual expiry and identity provenance',async()=>{
  const f=await fixture();const result=await post(f,payload(f,{lines:[{itemId:f.item,quantity:12}]}));
  assert.equal(await quantity(f.first),0);assert.equal(await quantity(f.last),18);assert.equal(await quantity(f.old),5);
  assert.deepEqual(result.movements[0].allocations.map(l=>[l.code,l.quantity]),[['EARLY',10],['LATE',2]]);
  assert.equal(result.movements[0].allocations[0].expiry,early);
  assert.equal(result.document.requester.identityMethod,'self_declared');
  assert.equal(result.document.actor_key,'company_users:test');assert.equal(result.document.actor_name,'Test Staff');
  assert.equal(result.document.request_payload,undefined);
});

test('a later failing line rolls back document, earlier allocations and stock together',async()=>{
  const f=await fixture();const before=await countDocs(f);
  await assert.rejects(post(f,payload(f,{lines:[{itemId:f.item,quantity:5},{itemId:f.item,quantity:100}]})),/ยอดพร้อมใช้ไม่เพียงพอ/);
  assert.equal(await quantity(f.first),10);assert.equal(await quantity(f.last),20);assert.equal(await countDocs(f),before);
});

test('idempotency returns the same document once and rejects altered payload or actor',async()=>{
  const f=await fixture(),key=randomUUID(),p=payload(f,{lines:[{itemId:f.item,quantity:3}]});
  const one=await post(f,p,key),two=await post(f,p,key);
  assert.equal(one.document.id,two.document.id);assert.equal(await quantity(f.first),7);assert.equal(await countDocs(f),1);
  await assert.rejects(post(f,{...p,note:'changed'},key),/ใช้กับรายการอื่นแล้ว/);
  await assert.rejects(post(f,p,key,null,'other-actor'),/ใช้กับรายการอื่นแล้ว/);
});

test('company ownership rejects foreign items, locations, destinations and same-company foreign lots',async()=>{
  const f=await fixture();
  await assert.rejects(post(f,payload(f,{lines:[{itemId:f.otherItem,quantity:1}]})),/บริษัทนี้/);
  await assert.rejects(post(f,payload(f,{locationId:f.foreign})),/บริษัทนี้/);
  await assert.rejects(post(f,payload(f,{kind:'transfer',destinationId:f.foreign})),/บริษัทเดียวกัน/);
  await assert.rejects(post(f,payload(f,{lines:[{itemId:f.item,quantity:1,lotId:f.publicLot}]})),/ล็อตที่เลือกไม่ตรง/);
  await assert.rejects(db.query(`insert into fa_lots(company_id,item_id,location_id,code,quantity) values($1,$2,$3,'WRONG',1)`,[f.company,f.otherItem,f.location]),/foreign key/);
  assert.equal(await countDocs(f),0);
});

test('self-service is capability scoped, cannot perform staff operations, and requires actual lot when ambiguous',async()=>{
  const f=await fixture(),p=payload(f,{locationId:f.self,mode:'self_service'});
  await assert.rejects(post(f,p,randomUUID(),'b'.repeat(64)),/ไม่เปิดให้/);
  await assert.rejects(post(f,{...p,locationId:f.location},randomUUID(),f.hash),/ไม่เปิดให้/);
  await assert.rejects(post(f,{...p,kind:'receive',expiry:late},randomUUID(),f.hash),/ไม่เปิดให้/);
  await assert.rejects(post(f,p,randomUUID(),null),/ผู้บันทึก/);
  await assert.rejects(post(f,p,randomUUID(),f.hash),/เลือกล็อตที่หยิบจริง/);
  const result=await post(f,{...p,lines:[{itemId:f.item,quantity:2,lotId:f.publicLast}]},randomUUID(),f.hash);
  assert.equal(await quantity(f.publicLot),10);assert.equal(await quantity(f.publicLast),18);
  assert.equal(result.document.actor_key,'self_declared');assert.equal(result.document.actor_name,'Test Collector');
  assert.equal(result.movements[0].allocations[0].code,'PUBLIC-LATE');
});

test('expiry checks and selected-lot quantity cannot spill into another lot',async()=>{
  const f=await fixture();
  await assert.rejects(post(f,payload(f,{lines:[{itemId:f.item,quantity:1,lotId:f.old}]})),/หมดอายุ/);
  await assert.rejects(post(f,payload(f,{lines:[{itemId:f.item,quantity:11,lotId:f.first}]})),/ยอดพร้อมใช้ไม่เพียงพอ/);
  assert.equal(await quantity(f.first),10);assert.equal(await quantity(f.last),20);
});

test('receipt expiry validation, typed quantity checks and non-expiring equipment',async()=>{
  const f=await fixture();
  await assert.rejects(post(f,payload(f,{kind:'receive',expiry:expired})),/หมดอายุแล้ว/);
  await assert.rejects(post(f,payload(f,{kind:'receive'})),/วันหมดอายุ/);
  for(const q of [0,-1,1.5,'2',1000001])await assert.rejects(post(f,payload(f,{lines:[{itemId:f.item,quantity:q}]})),/จำนวน/);
  const result=await post(f,payload(f,{kind:'receive',lines:[{itemId:f.equipment,quantity:3}],lotCode:'NO-EXPIRY'}));
  assert.equal(result.movements[0].allocations[0].expiry,null);
  assert.equal((await db.query('select quantity from fa_lots where item_id=$1',[f.equipment])).rows[0].quantity,3);
});

test('tracked imported stock without expiry cannot issue or transfer; untracked equipment remains usable',async()=>{
  const f=await fixture(),pending=randomUUID(),equipmentLot=randomUUID();
  await db.query(`insert into fa_lots(id,company_id,item_id,location_id,code,expiry,quantity) values($1,$2,$3,$4,'IMPORT-PENDING',null,12),($5,$2,$6,$4,'EQUIPMENT',null,3)`,[pending,f.company,f.item,f.location,equipmentLot,f.equipment]);
  for(const kind of ['issue','transfer']){
    await assert.rejects(post(f,payload(f,{kind,...(kind==='transfer'?{destinationId:f.self}:{}),lines:[{itemId:f.item,quantity:1,lotId:pending}]})),/ยอดพร้อมใช้ไม่เพียงพอ/);
  }
  await assert.rejects(post(f,payload(f,{lines:[{itemId:f.item,quantity:31}]})),/ยอดพร้อมใช้ไม่เพียงพอ/);
  assert.equal(await quantity(pending),12);
  await post(f,payload(f,{lines:[{itemId:f.equipment,quantity:1,lotId:equipmentLot}]}));
  assert.equal(await quantity(equipmentLot),2);
});

test('public self-service cannot select imported tracked stock whose expiry is unconfirmed',async()=>{
  const f=await fixture(),pending=randomUUID();
  await db.query(`insert into fa_lots(id,company_id,item_id,location_id,code,expiry,quantity) values($1,$2,$3,$4,'IMPORT-PENDING',null,12)`,[pending,f.company,f.item,f.self]);
  await assert.rejects(post(f,payload(f,{locationId:f.self,mode:'self_service',lines:[{itemId:f.item,quantity:1,lotId:pending}]}),randomUUID(),f.hash),/ยอดพร้อมใช้ไม่เพียงพอ/);
  assert.equal(await quantity(pending),12);
});

test('inspection cannot mark a point ready while tracked stock has an unconfirmed expiry even at minimum zero',async()=>{
  const f=await fixture();
  await db.query('update fa_lots set quantity=0 where location_id=$1',[f.location]);
  await db.query(`insert into fa_lots(company_id,item_id,location_id,code,expiry,quantity) values($1,$2,$3,'IMPORT-PENDING',null,12)`,[f.company,f.item,f.location]);
  await db.query('insert into fa_location_items(company_id,location_id,item_id,min) values($1,$2,$3,0)',[f.company,f.location,f.item]);
  const result=(await db.query(`select fa_record_inspection($1,$2,'staff','Checked',false,$3) result`,[f.company,f.location,randomUUID()])).rows[0].result;
  assert.equal(result.ready,false);
});

test('transfer conserves physical stock and preserves lot and expiry at destination',async()=>{
  const f=await fixture();const total=Number((await db.query('select sum(quantity) n from fa_lots where company_id=$1',[f.company])).rows[0].n);
  await post(f,payload(f,{kind:'transfer',destinationId:f.self,lines:[{itemId:f.item,quantity:12}]}));
  assert.equal(Number((await db.query('select sum(quantity) n from fa_lots where company_id=$1',[f.company])).rows[0].n),total);
  const dest=(await db.query(`select code,to_char(expiry,'YYYY-MM-DD') expiry,quantity from fa_lots where location_id=$1 and code in ('EARLY','LATE') order by expiry`,[f.self])).rows;
  assert.deepEqual(dest.map(l=>[l.code,l.quantity]),[['EARLY',10],['LATE',2]]);
  assert.equal(dest[0].expiry,early);
});

test('disposal requires reason and removes expired physical stock before usable lots',async()=>{
  const f=await fixture();await assert.rejects(post(f,payload(f,{kind:'dispose'})),/เหตุผล/);
  const result=await post(f,payload(f,{kind:'dispose',note:'Expired package',lines:[{itemId:f.item,quantity:5}]}));
  assert.equal(await quantity(f.old),0);assert.equal(await quantity(f.first),10);assert.equal(result.movements[0].allocations[0].code,'EXPIRED');
});

test('requester and recipient are required snapshots and cannot silently impersonate recorded actor',async()=>{
  const f=await fixture();
  await assert.rejects(post(f,payload(f,{requester:{name:'',department:''}})),/ผู้เบิก/);
  await assert.rejects(post(f,payload(f,{onBehalf:true})),/ผู้รับจริง/);
  await assert.rejects(post(f,payload(f,{onBehalf:true,recipientPerson:{name:'test collector',department:'Unit A'}})),/ต้องต่าง/);
  const result=await post(f,payload(f,{onBehalf:true,recipientPerson:{name:'Actual Recipient',department:'External company'},recordedBy:{name:'Forged',id:'forged'}}));
  assert.equal(result.document.requester.name,'Test Collector');assert.equal(result.document.recipient_person.name,'Actual Recipient');assert.equal(result.document.actor_name,'Test Staff');
});

test('inspection insert and readiness flags update atomically within the selected company',async()=>{
  const f=await fixture();
  const one=(await db.query('select fa_record_inspection($1,$2,$3,$4,$5) r',[f.company,f.location,'staff:1','Broken case',true])).rows[0].r;
  assert.equal(one.has_issue,true);
  assert.deepEqual((await db.query("select to_char(last_checked,'YYYY-MM-DD') last_checked,inspection_issue from fa_locations where id=$1",[f.location])).rows[0],{last_checked:today,inspection_issue:true});
  await assert.rejects(db.query('select fa_record_inspection($1,$2,$3,$4,$5)',[f.company,f.foreign,'staff:1','',false]),/บริษัทนี้/);
  await db.query('select fa_record_inspection($1,$2,$3,$4,$5)',[f.company,f.location,'staff:1','Resolved',false]);
  assert.equal((await db.query('select inspection_issue from fa_locations where id=$1',[f.location])).rows[0].inspection_issue,false);
  assert.equal(Number((await db.query('select count(*) n from fa_inspections where company_id=$1',[f.company])).rows[0].n),2);
});

test('service-role function access and threshold batches remain atomic and company-scoped',async()=>{
  const f=await fixture();
  await db.exec('set role service_role');
  try{
    await post(f,payload(f,{lines:[{itemId:f.item,quantity:1}]}));
    const first=(await db.query('select fa_save_thresholds($1,$2,$3::jsonb) r',[f.company,f.location,JSON.stringify([{itemId:f.item,min:7}])])).rows[0].r;
    assert.equal(first[0].min,7);
    await assert.rejects(db.query('select fa_save_thresholds($1,$2,$3::jsonb)',[f.company,f.location,JSON.stringify([{itemId:f.item,min:20},{itemId:f.otherItem,min:5}])]),/บริษัทนี้/);
    assert.equal((await db.query('select min from fa_location_items where company_id=$1 and location_id=$2 and item_id=$3',[f.company,f.location,f.item])).rows[0].min,7);
  }finally{await db.exec('reset role');}
});

test('usage aggregates count every issue line beyond the history limit, scoped by company/location/date',async()=>{
  const f=await fixture();
  const issue=await post(f,payload(f,{lines:[{itemId:f.item,quantity:3}]}));
  await db.query(`insert into fa_movements(company_id,document_id,item_id,location_id,quantity) select $1,$2,$3,$4,999 from generate_series(1,501)`,[f.company,issue.document.id,f.item,f.location]);
  await post(f,payload(f,{kind:'receive',expiry:late,lines:[{itemId:f.item,quantity:2}]}));
  const other=await fixture();await post(other);
  let summary=(await db.query('select fa_usage_summary($1) r',[f.company])).rows[0].r;
  assert.deepEqual(summary.monthUsesByLocation,[{locationId:f.location,count:502}]);
  assert.deepEqual(summary.dailyUsesByLocation,[{locationId:f.location,date:today,count:502}]);
  await db.exec('set role service_role');
  try{
    summary=(await db.query('select fa_usage_summary($1,$2) r',[f.company,today])).rows[0].r;
    assert.equal(summary.monthUsesByLocation[0].count,502);
    await assert.rejects(db.query('select fa_usage_summary($1,$2) r',[f.company,late]),/วันที่รายงาน/);
  }finally{await db.exec('reset role');}
});

test('an empty unconfigured point is not ready in its persisted inspection snapshot',async()=>{
  const f=await fixture(),empty=randomUUID();
  await db.query(`insert into fa_locations(id,company_id,name) values($1,$2,'Empty point')`,[empty,f.company]);
  const before=(await db.query('select fa_record_inspection($1,$2,$3,$4,$5) r',[f.company,empty,'staff:test','No assigned inventory',false])).rows[0].r;
  assert.equal(before.ready,false);assert.deepEqual(before.low_items,[]);assert.deepEqual(before.expired_lots,[]);
  await post(f,payload(f,{kind:'receive',locationId:empty,expiry:early,lines:[{itemId:f.item,quantity:2}]}));
  const after=(await db.query('select fa_record_inspection($1,$2,$3,$4,$5) r',[f.company,empty,'staff:test','Configured and stocked',false])).rows[0].r;
  assert.equal(after.ready,true);
});

test('database guard prevents unit edits after stock history, including zero-balance lots',async()=>{
  const f=await fixture();
  await db.exec('set role service_role');
  try{
    await db.query(`update fa_items set unit='tool' where id=$1`,[f.equipment]);
    await assert.rejects(db.query(`update fa_items set unit='box' where id=$1`,[f.item]),/ไม่สามารถเปลี่ยนหน่วยนับ/);
    await post(f,payload(f,{kind:'receive',lines:[{itemId:f.equipment,quantity:1}],lotCode:'EMPTY-LATER'}));
    await post(f,payload(f,{kind:'issue',lines:[{itemId:f.equipment,quantity:1}]}));
    assert.equal((await db.query('select sum(quantity) n from fa_lots where item_id=$1',[f.equipment])).rows[0].n,0);
    await assert.rejects(db.query(`update fa_items set unit='pair' where id=$1`,[f.equipment]),/ไม่สามารถเปลี่ยนหน่วยนับ/);
    assert.equal((await db.query('select unit from fa_items where id=$1',[f.equipment])).rows[0].unit,'tool');
    // Renames remain allowed: the invariant concerns quantity units, not labels.
    await db.query(`update fa_items set name='Renamed scissors',unit='tool' where id=$1`,[f.equipment]);
  }finally{await db.exec('reset role');}
});

test('database expiry-mode guard cannot reinterpret positive undated stock as expiry-tracked stock',async()=>{
  const f=await fixture();
  await post(f,payload(f,{kind:'receive',lines:[{itemId:f.equipment,quantity:2}],lotCode:'UNDATED'}));
  await assert.rejects(db.query('update fa_items set track_expiry=true where id=$1',[f.equipment]),/ยังไม่ระบุวันหมดอายุ/);
  assert.equal((await db.query('select track_expiry from fa_items where id=$1',[f.equipment])).rows[0].track_expiry,false);
  await post(f,payload(f,{kind:'dispose',note:'Retire untracked stock',lines:[{itemId:f.equipment,quantity:2}]}));
  await db.query('update fa_items set track_expiry=true where id=$1',[f.equipment]);
  assert.equal((await db.query('select track_expiry from fa_items where id=$1',[f.equipment])).rows[0].track_expiry,true);
});

test('inspection request identifiers deduplicate acknowledgements and reject conflicting/cross-company retries',async()=>{
  const f=await fixture(),key=randomUUID();
  const inspect=(company,location,notes='Observed issue',issue=true,actor='staff:test')=>db.query('select fa_record_inspection($1,$2,$3,$4,$5,$6) r',[company,location,actor,notes,issue,key]).then(r=>r.rows[0].r);
  const first=await inspect(f.company,f.location),retry=await inspect(f.company,f.location);
  assert.deepEqual(retry,first);assert.equal(first.id,key);
  assert.equal(Number((await db.query('select count(*) n from fa_inspections where company_id=$1',[f.company])).rows[0].n),1);
  await assert.rejects(inspect(f.company,f.location,'Changed observation'),/ใช้กับผลตรวจอื่นแล้ว/);
  await assert.rejects(inspect(f.company,f.location,'Observed issue',false),/ใช้กับผลตรวจอื่นแล้ว/);
  await assert.rejects(inspect(f.company,f.location,'Observed issue',true,'different:actor'),/ใช้กับผลตรวจอื่นแล้ว/);
  await assert.rejects(inspect(f.other,f.foreign),/ใช้กับผลตรวจอื่นแล้ว/);
  assert.equal((await db.query('select inspection_issue from fa_locations where id=$1',[f.location])).rows[0].inspection_issue,true);
  assert.equal((await db.query('select inspection_issue from fa_locations where id=$1',[f.foreign])).rows[0].inspection_issue,false);
  assert.equal(Number((await db.query('select count(*) n from fa_inspections where company_id=$1',[f.other])).rows[0].n),0);
  await db.exec('set role service_role');
  try{assert.equal((await inspect(f.company,f.location)).id,key);}finally{await db.exec('reset role');}
});

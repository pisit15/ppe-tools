// Cancelling a First Aid record in the real SQL (PGlite): a stock receipt (fa_void_receive) and a dispense ticket
// (fa_void_issue). Loads every First Aid migration in order, so the functions run against the current schema.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
let db,today,daysAgo;
const dir=path.join(__dirname,'../supabase/migrations');
before(async()=>{
  db=new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  // The only thing the First Aid migrations need from outside their own tables: the storage bucket list.
  await db.exec('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  // The home-card migration writes to the tools home page, which is not part of First Aid.
  for(const file of fs.readdirSync(dir).filter(name=>/first_aid/.test(name)&&!/first_aid_home_card/.test(name)).sort()) await db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
  today=(await db.query(`select to_char((now() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD') d`)).rows[0].d;
  daysAgo=async n=>(await db.query(`select to_char((now() at time zone 'Asia/Bangkok')::date-$1::int,'YYYY-MM-DD') d`,[n])).rows[0].d;
});
after(async()=>{await db?.close();});

async function fixture(){
  const f={company:'v_'+randomUUID().slice(0,8),other:'w_'+randomUUID().slice(0,8),location:randomUUID(),second:randomUUID(),item:randomUUID(),tool:randomUUID()};
  await db.query('insert into fa_company_settings(company_id) values($1),($2)',[f.company,f.other]);
  await db.query(`insert into fa_locations(id,company_id,name,type,area,issue_mode) values($1,$2,'Office','Cabinet','Ground floor','controlled'),($3,$2,'Clinic','Room','First floor','controlled')`,[f.location,f.company,f.second]);
  await db.query(`insert into fa_items(id,company_id,name,unit,track_expiry) values($1,$2,'Air-X','tablet',true),($3,$2,'Scissors','piece',false)`,[f.item,f.company,f.tool]);
  return f;
}
const expiry=async()=>(await db.query(`select to_char((now() at time zone 'Asia/Bangkok')::date+400,'YYYY-MM-DD') d`)).rows[0].d;
async function post(f,p,actor='company_users:test'){
  return (await db.query('select fa_post_transaction($1,$2,$3,$4,$5::jsonb,null) result',[f.company,actor,'Test Staff',randomUUID(),JSON.stringify({mode:'staff',onBehalf:false,requester:null,recipientPerson:null,destinationId:null,expiry:null,lotCode:'',note:'',...p})])).rows[0].result;
}
const receive=async(f,quantity,extra={})=>post(f,{kind:'receive',locationId:f.location,date:today,lines:[{itemId:f.item,quantity}],expiry:await expiry(),lotCode:'LOT-A',...extra});
const issue=(f,quantity)=>post(f,{kind:'issue',locationId:f.location,date:today,lines:[{itemId:f.item,quantity}],requester:{id:'p1',name:'Test Collector',code:'T1',department:'Unit A'}});
const voidReceive=(f,documentId,reason='ผิดจำนวน',company=f.company)=>db.query('select fa_void_receive($1,$2,$3,$4,$5) result',[company,documentId,'company_users:nurse','Nurse',reason]).then(r=>r.rows[0].result);
const voidIssue=(f,documentId,reason='ผิดคน')=>db.query('select fa_void_issue($1,$2,$3,$4,$5) result',[f.company,documentId,'company_users:nurse','Nurse',reason]).then(r=>r.rows[0].result);
const stock=async(f,item=f.item)=>Number((await db.query('select coalesce(sum(quantity),0) n from fa_lots where company_id=$1 and item_id=$2',[f.company,item])).rows[0].n);
const doc=async id=>(await db.query('select voided_at,voided_by_key,voided_by_name,void_reason from fa_documents where id=$1',[id])).rows[0];

test('browser roles cannot call either cancel function',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    try{
      await assert.rejects(db.query(`select fa_void_receive('test',gen_random_uuid(),'actor','Name','reason')`),/permission denied/);
      await assert.rejects(db.query(`select fa_void_issue('test',gen_random_uuid(),'actor','Name','reason')`),/permission denied/);
    }finally{await db.exec('reset role');}
  }
});

test('a wrong receipt is cancelled: its quantity leaves the lot it went into, the receipt is kept and marked, a second press changes nothing',async()=>{
  const f=await fixture();
  const good=await receive(f,30);                              // the correct receipt
  const wrong=await receive(f,10,{lotCode:'LOT-B'});           // typed by mistake, a different lot
  assert.equal(await stock(f),40);
  assert.deepEqual(await voidReceive(f,wrong.document.id,' ผิดจำนวน '),{documentId:wrong.document.id,removed:10,already:false});
  assert.equal(await stock(f),30);
  const lots=(await db.query('select code,quantity from fa_lots where company_id=$1 order by code',[f.company])).rows;
  assert.deepEqual(lots,[{code:'LOT-A',quantity:30},{code:'LOT-B',quantity:0}]);   // taken from the wrong lot, not from the earliest one
  const marked=await doc(wrong.document.id);
  assert.ok(marked.voided_at);assert.deepEqual([marked.voided_by_key,marked.voided_by_name,marked.void_reason],['company_users:nurse','Nurse','ผิดจำนวน']);
  assert.equal((await doc(good.document.id)).voided_at,null);
  assert.equal(Number((await db.query('select count(*) n from fa_movements where document_id=$1',[wrong.document.id])).rows[0].n),1);   // the record itself is not deleted
  assert.deepEqual(await voidReceive(f,wrong.document.id),{documentId:wrong.document.id,removed:0,already:true});
  assert.equal(await stock(f),30);
});

test('a receipt that topped up an existing lot is cancelled by quantity: what the lot held before stays',async()=>{
  const f=await fixture();
  await receive(f,20);
  const extra=await receive(f,10);                             // same lot code and expiry → the same lot, now 30
  await issue(f,5);                                            // 25 left, still at least the 10 being cancelled
  assert.equal((await voidReceive(f,extra.document.id)).removed,10);
  assert.equal(await stock(f),15);
});

test('a receipt whose stock has been used cannot be cancelled, and nothing changes when it is refused',async()=>{
  const f=await fixture();
  const r=await receive(f,10);
  await issue(f,4);                                            // 6 left of the 10 received
  await assert.rejects(voidReceive(f,r.document.id),/Air-X ล็อต LOT-A เหลือ 6 จากที่รับเข้า 10/);
  assert.equal(await stock(f),6);assert.equal((await doc(r.document.id)).voided_at,null);
  // moved to another point counts as used too
  const g=await fixture();
  const moved=await receive(g,10);
  await post(g,{kind:'transfer',locationId:g.location,destinationId:g.second,date:today,lines:[{itemId:g.item,quantity:3}]});
  await assert.rejects(voidReceive(g,moved.document.id),/เหลือ 7 จากที่รับเข้า 10/);
  assert.equal(await stock(g),10);
});

test('a receipt of several lines is cancelled as a whole or not at all',async()=>{
  const f=await fixture();
  const r=await post(f,{kind:'receive',locationId:f.location,date:today,lines:[{itemId:f.tool,quantity:2},{itemId:f.item,quantity:10}],expiry:await expiry(),lotCode:'LOT-A'});
  await issue(f,1);                                            // only the second line has been used
  await assert.rejects(voidReceive(f,r.document.id),/เหลือ 9 จากที่รับเข้า 10/);
  assert.equal(await stock(f,f.tool),2);assert.equal(await stock(f),9);   // the first line was not taken back either
  const clean=await post(f,{kind:'receive',locationId:f.location,date:today,lines:[{itemId:f.tool,quantity:3},{itemId:f.item,quantity:5}],expiry:await expiry(),lotCode:'LOT-C'});
  assert.equal((await voidReceive(f,clean.document.id)).removed,8);
  assert.equal(await stock(f,f.tool),2);assert.equal(await stock(f),9);
});

test('what cannot be cancelled as a receipt: other kinds, another company, old or imported receipts, count corrections, no reason',async()=>{
  const f=await fixture();
  const r=await receive(f,10);
  const ticket=await issue(f,1);
  await assert.rejects(voidReceive(f,ticket.document.id),/ยกเลิกได้เฉพาะรายการรับเข้า/);
  await assert.rejects(voidIssue(f,r.document.id),/ยกเลิกได้เฉพาะใบจ่ายยา/);
  await assert.rejects(voidReceive(f,r.document.id,'ผิดจำนวน',f.other),/ไม่พบรายการรับเข้านี้/);
  await assert.rejects(voidReceive(f,randomUUID()),/ไม่พบรายการรับเข้านี้/);
  await assert.rejects(voidReceive(f,r.document.id,'   '),/กรุณาระบุเหตุผลที่ยกเลิก/);
  await assert.rejects(db.query('select fa_void_receive($1,$2,$3,$4,$5)',[f.company,r.document.id,'','Nurse','ผิดจำนวน']),/ไม่พบผู้บันทึกรายการ/);
  const week=await receive(f,2,{date:await daysAgo(7),lotCode:'D7'});
  const older=await receive(f,2,{date:await daysAgo(8),lotCode:'D8'});
  assert.equal((await voidReceive(f,week.document.id)).removed,2);                       // the seventh day is still inside the window
  await assert.rejects(voidReceive(f,older.document.id),/ยกเลิกได้ภายใน 7 วัน/);
  const imported=await post(f,{kind:'receive',locationId:f.location,date:today,lines:[{itemId:f.item,quantity:2}],expiry:await expiry(),lotCode:'IMP'},'excel-import:2026');
  await assert.rejects(voidReceive(f,imported.document.id),/นำเข้าจากไฟล์เดิม/);
  const counted=await receive(f,3,{lotCode:'COUNT-20261124',note:`ตรวจนับ ${today}: นับได้ 13 ระบบ 10`});
  await assert.rejects(voidReceive(f,counted.document.id),/ตรวจนับใหม่/);
  assert.equal(await stock(f),10-1+2+2+3);                     // 16: only the day-7 receipt came back out
});

test('cancelling a dispense ticket still returns its stock, and a cancelled receipt does not block it',async()=>{
  const f=await fixture();
  await receive(f,10);
  const ticket=await issue(f,4);
  assert.equal(await stock(f),6);
  assert.deepEqual(await voidIssue(f,ticket.document.id),{documentId:ticket.document.id,restored:4,already:false});
  assert.equal(await stock(f),10);
  assert.equal((await voidIssue(f,ticket.document.id)).already,true);
  assert.equal(await stock(f),10);
});

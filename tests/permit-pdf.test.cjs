const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PDFDocument}=require('pdf-lib');
const {load}=require('./permit-helpers.cjs');
const {renderPermitPdf,supportsOriginalPdf}=load('src/lib/permit/pdf.ts');
const {PERMIT_SEEDS}=load('src/lib/permit/catalog.ts');
const {documentHash}=load('src/lib/permit/workflow.ts');
function sample(){
 const data={title:'ตรวจซ่อมหลังคาอาคารผลิต',location:'อาคารผลิต 1',detail:'ตรวจซ่อมหลังคา',contractorName:'FMT',phone:'0000000000',workers:'ผู้ปฏิบัติงานทดสอบ 1\nผู้ปฏิบัติงานทดสอบ 2',startsAt:'2026-10-15T01:00:00Z',endsAt:'2026-10-15T10:00:00Z',fireImpact:'ไม่มี',project:false,approvers:{},attachments:[],events:[],signatures:[],forms:PERMIT_SEEDS.map(t=>({template:{...t,id:crypto.randomUUID()},answers:Object.fromEntries(t.config.fields.map(f=>[f.id,f.kind==='check'?'yes':'ข้อมูลสำหรับตรวจรูปแบบการพิมพ์ ไม่ใช่ใบอนุญาตจริง']))}))};
 return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',company_id:'amt',created_by:'contractor:test',version:7,status:'closed',created_at:data.startsAt,updated_at:data.endsAt,data};
}
test('original output preserves all 10 source pages and adds complete annexes without changing signed data',async()=>{
 const p=sample();
 const {chromium}=require('@playwright/test');const b=await chromium.launch({channel:'msedge'});const pg=await b.newPage();
 const signature=await pg.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=80;const x=c.getContext('2d');x.strokeStyle='#183b67';x.lineWidth=3;x.beginPath();x.moveTo(20,45);x.bezierCurveTo(60,0,80,75,160,20);x.bezierCurveTo(210,0,170,75,270,35);x.stroke();x.fillStyle='#183b67';x.font='12px Arial';x.fillText('TEST ONLY',100,72);return c.toDataURL('image/png');});await b.close();
 for(const [stage,role] of [['submit','requester'],['approve','area_owner'],['approve','safety'],['request_close','requester'],['close','area_owner'],['close','safety']])p.data.signatures.push({actor:role,name:'ผู้ทดสอบ '+role,role,stage,at:p.data.endsAt,image:signature,hash:documentHash(p.data)});
 const before=JSON.stringify(p);const bytes=await renderPermitPdf(p);assert.equal(JSON.stringify(p),before);
 const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>10);for(let i=0;i<10;i++){const size=doc.getPage(i).getSize();assert.ok(Math.abs(size.width-595.3)<.1);assert.ok(Math.abs(size.height-841.9)<.1);}
 assert.ok(doc.getSubject().includes(documentHash(p.data)));
 fs.mkdirSync('output/pdf',{recursive:true});fs.writeFileSync('output/pdf/work-permit-template-sample.pdf',bytes);
});
test('unsupported company or changed revision cannot be printed with another original',async()=>{
 const p=sample();p.company_id='other';assert.equal(supportsOriginalPdf(p),false);await assert.rejects(renderPermitPdf(p));
 p.company_id='amt';p.data.forms[0].template.revision='E';assert.equal(supportsOriginalPdf(p),false);
});
test('long Thai values are retained in additional pages',async()=>{
 const p=sample();p.data.forms=p.data.forms.slice(0,1);const short=await PDFDocument.load(await renderPermitPdf(p));
 p.data.detail='รายละเอียดเพิ่มเติมทดสอบการตัดบรรทัดภาษาไทย '.repeat(150);
 const long=await PDFDocument.load(await renderPermitPdf(p));assert.ok(long.getPageCount()>short.getPageCount());
});

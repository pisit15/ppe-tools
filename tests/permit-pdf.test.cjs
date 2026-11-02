const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PDFDocument,PDFName,PDFDict,decodePDFRawStream}=require('pdf-lib');
const {load}=require('./permit-helpers.cjs');
const {renderPermitPdf,supportsOriginalPdf}=load('src/lib/permit/pdf.ts');
const {PERMIT_SEEDS}=load('src/lib/permit/catalog.ts');
const {AMT_V2_SEEDS}=load('src/lib/permit/amt-forms.ts');
const {transition,documentHash}=load('src/lib/permit/workflow.ts');
let signature;
before(async()=>{
 const {chromium}=require('@playwright/test');const browser=await chromium.launch({channel:'msedge'});
 try {const pg=await browser.newPage();signature=await pg.evaluate(()=>{
  const c=document.createElement('canvas');c.width=300;c.height=80;const x=c.getContext('2d');
  x.strokeStyle='#183b67';x.lineWidth=3;x.beginPath();x.moveTo(20,45);x.bezierCurveTo(60,0,80,75,160,20);x.bezierCurveTo(210,0,170,75,270,35);x.stroke();
  x.fillStyle='#183b67';x.font='12px Arial';x.fillText('TEST ONLY',100,72);return c.toDataURL('image/png');
 });}finally{await browser.close();}
});
const requester={key:'contractor:test',id:'test',name:'ผู้ขอทดสอบ FMT',companyId:'amt',admin:false,contractor:true,roles:[]};
const owner={...requester,key:'company_users:owner',contractor:false,name:'เจ้าของพื้นที่ทดสอบ',roles:['area_owner']};
const safety={...requester,key:'company_users:safety',contractor:false,name:'จป.ทดสอบ',roles:['safety']};
function sample(seeds=PERMIT_SEEDS){
 const now=Date.now();const startsAt=new Date(now-60000).toISOString(),endsAt=new Date(now+3600000).toISOString();
 const data={title:'ตรวจซ่อมหลังคาอาคารผลิต',location:'อาคารผลิต 1',detail:'ตรวจซ่อมหลังคา',contractorName:'FMT',phone:'0000000000',workers:'ผู้ปฏิบัติงานทดสอบ 1\nผู้ปฏิบัติงานทดสอบ 2',workerCount:2,startsAt,endsAt,fireImpact:'ไม่มี',project:false,approvers:{area_owner:owner.key,safety:safety.key},attachments:[{id:crypto.randomUUID(),name:'หลักฐานทดสอบ.pdf',type:'application/pdf',data:'data:application/pdf;base64,JVBERi0='}],events:[],signatures:[],forms:seeds.map(t=>({template:{...structuredClone(t),id:crypto.randomUUID()},answers:Object.fromEntries(t.config.fields.map(f=>[f.id,f.kind==='check'?'yes':f.kind==='choice'?'yes':'ข้อมูลทดสอบ ไม่ใช่ใบอนุญาตจริง']))}))};
 return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',company_id:'amt',created_by:requester.key,version:1,status:'draft',created_at:startsAt,updated_at:startsAt,data};
}
function act(p,actor,action,extra={}){return transition(p,actor,action,{signature,confirm:true,note:'ตรวจยืนยันสำหรับการทดสอบ',...extra});}
function closed(p){
 p=act(p,requester,'submit');p=act(p,owner,'approve');p=act(p,safety,'approve');p=act(p,owner,'start');
 const structured=p.data.forms.find(f=>f.template.config.layoutVersion==='amt-2026-11-v2'&&f.template.config.fields.some(f=>f.kind==='check'));
 if(structured){
  const fields=structured.template.config.fields.filter(f=>f.kind==='check');
  const answers=Object.fromEntries(fields.map((f,index)=>[f.id,index===0?'no':'yes']));
  p=act(p,safety,'inspect',{inspection:{formCode:structured.template.code,answers}});assert.equal(p.status,'suspended');
  p=act(p,owner,'resume');
 }
 p=act(p,requester,'request_close');p=act(p,owner,'close');return act(p,safety,'close');
}
function imageRefs(doc,pageIndex=0){
 const resources=doc.getPage(pageIndex).node.Resources();const objects=resources.lookup(PDFName.of('XObject'),PDFDict);
 if(!objects)return 0;
 return objects.entries().filter(([,ref])=>{
  const item=doc.context.lookup(ref);return item?.dict?.get(PDFName.of('Subtype'))?.toString()==='/Image';
 }).length;
}
function textOperations(doc,pageIndex=0){
 const streams=doc.getPage(pageIndex).node.Contents();
 return streams.asArray().reduce((sum,ref)=>sum+(Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1').match(/\bBT\b/g)||[]).length,0);
}
function strokeOperations(doc,pageIndex=0){
 const streams=doc.getPage(pageIndex).node.Contents();
 return streams.asArray().reduce((sum,ref)=>sum+(Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1').match(/(?:^|\s)S(?=\s|$)/g)||[]).length,0);
}
function linePaths(doc,pageIndex=0){
 const streams=doc.getPage(pageIndex).node.Contents();
 return streams.asArray().flatMap(ref=>{
  const source=Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1');
  return [...source.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l\s+S/g)].map(match=>match.slice(1).map(Number));
 });
}
function decodedQr(doc){
 const jsQR=require('jsqr');
 for(const page of doc.getPages()){
  const objects=page.node.Resources().lookup(PDFName.of('XObject'),PDFDict);if(!objects)continue;
  for(const [,ref]of objects.entries()){
   const image=doc.context.lookup(ref);if(image?.dict?.get(PDFName.of('Subtype'))?.toString()!=='/Image')continue;
   const width=image.dict.get(PDFName.of('Width')).asNumber(),height=image.dict.get(PDFName.of('Height')).asNumber();if(width!==240||height!==240)continue;
   const rgb=decodePDFRawStream(image).decode();if(rgb.length!==width*height*3)continue;
   const rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=255;}
   const qr=jsQR(rgba,width,height);if(qr)return qr.data;
  }
 }
 return null;
}
test('request and close signatures from the real workflow appear on the original page',async()=>{
 const p=sample(PERMIT_SEEDS.slice(0,1));
 const draft=await PDFDocument.load(await renderPermitPdf(p));
 const submitted=act(p,requester,'submit');assert.equal(submitted.data.signatures[0].stage,'request');
 const requestedPdf=await PDFDocument.load(await renderPermitPdf(submitted));
 assert.equal(imageRefs(requestedPdf),imageRefs(draft)+1,'the requester signature must be an image on the original, not just an annex');
 const active=act(act(act(submitted,owner,'approve'),safety,'approve'),owner,'start');
 const activePdf=await PDFDocument.load(await renderPermitPdf(active));
 const closing=act(active,requester,'request_close');assert.equal(closing.data.signatures.at(-1).stage,'close');assert.equal(closing.data.signatures.at(-1).role,'requester');
 const closingPdf=await PDFDocument.load(await renderPermitPdf(closing));
 assert.equal(imageRefs(closingPdf),imageRefs(activePdf)+1,'requester close signature must be on the close block of the original');
});
test('legacy output preserves all 10 source pages and signed data with complete annexes',async()=>{
 const p=closed(sample());const before=JSON.stringify(p);const bytes=await renderPermitPdf(p);assert.equal(JSON.stringify(p),before);
 const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>10);
 for(let i=0;i<10;i++){const size=doc.getPage(i).getSize();assert.ok(Math.abs(size.width-595.3)<.1);assert.ok(Math.abs(size.height-841.9)<.1);}
 assert.ok(doc.getSubject().includes(documentHash(p.data)));
 fs.mkdirSync('output/pdf',{recursive:true});fs.writeFileSync('output/pdf/work-permit-template-sample.pdf',bytes);
});
test('structured AMT forms print reviewed checkbox fields and preserve N/A reasons and overflow',async()=>{
 const p=sample(AMT_V2_SEEDS);const height=p.data.forms.find(f=>f.template.source_code==='004');
 const check=height.template.config.fields.find(f=>f.kind==='check');height.answers[check.id]='na:ไม่มีบันได ใช้รถกระเชา';
  height.answers.equipment_ladder='no';
 p.data.detail='รายละเอียดเพิ่มเติมการตรวจรูปแบบภาษาไทย '.repeat(30);
 const signed=closed(p),before=JSON.stringify(signed);const bytes=await renderPermitPdf(signed);
 assert.equal(signed.data.signatures.length,8);assert.equal(signed.data.inspections.length,1);
 assert.equal(JSON.stringify(signed),before);const doc=await PDFDocument.load(bytes);assert.ok(doc.getPageCount()>=4);
 assert.ok(imageRefs(doc)>=4,'all real signatures must be placed on original paper blocks');
 assert.ok(doc.getSubject().includes(documentHash(signed.data)));
 assert.equal(decodedQr(doc),'https://tools.eashe.org/permit?company_id=amt&id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 fs.mkdirSync('output/pdf',{recursive:true});fs.writeFileSync('output/pdf/amt-general-height-v2-sample.pdf',bytes);
});
test('structured inspection results are included in a dedicated printable annex',async()=>{
 const p=closed(sample(AMT_V2_SEEDS));const recorded=await PDFDocument.load(await renderPermitPdf(p));
 const without=structuredClone(p);delete without.data.inspections;
 const noResults=await PDFDocument.load(await renderPermitPdf(without));
 assert.ok(recorded.getPageCount()>noResults.getPageCount(),'stored inspection results must not disappear when exporting the permit');
});
test('an explicit unselected choice leaves its exact original checkbox blank',async()=>{
 const p=sample(AMT_V2_SEEDS);const field=p.data.forms[0].template.config.fields.find(f=>f.kind==='choice'&&f.print?.marks?.some(m=>m.value==='yes'));
 const selected=await PDFDocument.load(await renderPermitPdf(p));p.data.forms[0].answers[field.id]='no';
 const unselected=await PDFDocument.load(await renderPermitPdf(p));
 assert.equal(strokeOperations(selected)-strokeOperations(unselected),2,'the selected checkbox adds the two strokes of a tick to the source page');
 assert.equal(textOperations(selected)-textOperations(unselected),0,'ticks are vector paths rather than font-dependent X glyphs');
 const blankPaths=linePaths(unselected);
 const added=linePaths(selected).filter(path=>!blankPaths.some(other=>path.every((value,i)=>Math.abs(value-other[i])<0.0001)));
 assert.equal(added.length,2,'a selected box has exactly two new line segments');
 const page=selected.getPage(0),scale=page.getWidth()/827,mark=field.print.marks.find(mark=>mark.value==='yes');
 for(const path of added)for(let i=0;i<4;i+=2){
  const x=path[i]/scale,y=(page.getHeight()-path[i+1])/scale;
  assert.ok(Math.abs(x-mark.x)<=4&&Math.abs(y-mark.y)<=4,'every tick endpoint remains inside its reviewed original checkbox');
 }
});
test('unsupported company, revision or source checksum cannot use another original mapping',async()=>{
 const p=sample();p.company_id='other';assert.equal(supportsOriginalPdf(p),false);await assert.rejects(renderPermitPdf(p));
 p.company_id='amt';p.data.forms[0].template.revision='E';assert.equal(supportsOriginalPdf(p),false);
 const altered=sample(AMT_V2_SEEDS);altered.data.forms[0].template.config.sourceSha256='0'.repeat(64);await assert.rejects(renderPermitPdf(altered));
});
test('long Thai values are retained in additional pages',async()=>{
 const p=sample(PERMIT_SEEDS.slice(0,1));const short=await PDFDocument.load(await renderPermitPdf(p));
 p.data.detail='รายละเอียดเพิ่มเติมทดสอบการตัดบรรทัดภาษาไทย '.repeat(150);
 const long=await PDFDocument.load(await renderPermitPdf(p));assert.ok(long.getPageCount()>short.getPageCount());
});

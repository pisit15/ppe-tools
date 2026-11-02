const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fontkit=require('@pdf-lib/fontkit');
const {PDFDocument,PDFName,PDFDict}=require('pdf-lib');
const {load}=require('./permit-helpers.cjs');
const {createPdfTextMetrics,fitPdfSlotText}=load('src/lib/permit/pdf-text-layout.ts');
const {renderPermitPdf}=load('src/lib/permit/pdf.ts');
const {AMT_V2_SEEDS}=load('src/lib/permit/amt-forms.ts');
const bytes=fs.readFileSync('public/fonts/NotoSansThai.ttf');
const metrics=createPdfTextMetrics(bytes);
const rawFont=fontkit.create(bytes);

// Independently check the glyphs that the PDF font actually encodes, translated
// by the returned draw origin and baseline. The test checks ink, not character count.
function assertContained(result,width,height){
 assert.ok(result,'the reference should fit');
 let pen=0;
 for(const glyph of rawFont.layout(result.text).glyphs){
  const b=glyph.bbox,scale=result.size/rawFont.unitsPerEm;
  if(b.width>0||b.height>0){
   const left=result.x+(pen+b.minX)*scale,right=result.x+(pen+b.maxX)*scale;
   const top=result.baseline-b.maxY*scale,bottom=result.baseline-b.minY*scale;
   assert.ok(left>=1-1e-8&&right<=width-1+1e-8,`horizontal ink outside ${width}: ${left},${right}`);
   assert.ok(top>=1-1e-8&&bottom<=height-1+1e-8,`vertical ink outside ${height}: ${top},${bottom}`);
  }
  pen+=glyph.advanceWidth;
 }
}
test('normal Thai text fits width and height with an ink-safe baseline',()=>{
 const result=fitPdfSlotText('ตรวจซ่อมหลังคา',146,15,metrics,'F1');
 assert.equal(result.originalFits,true);assertContained(result,146,15);
});
test('wide text moves to a measured reference, including narrow slots',()=>{
 const result=fitPdfSlotText('รายละเอียดงานภาษาไทยที่ยาวเกินพื้นที่ '.repeat(25),52,14,metrics,'F1');
 assert.equal(result.originalFits,false);assert.equal(result.text,'F1');assertContained(result,52,14);
});
test('Thai ascenders and descenders cannot bypass the height limit',()=>{
 const value='ผู้ปฏิบัติงาน';assert.ok(metrics(value,9).advance<200);
 const result=fitPdfSlotText(value,200,10,metrics,'F2');
 assert.equal(result.originalFits,false);assert.equal(result.text,'F2');assertContained(result,200,10);
});
test('even the fallback is withheld when a slot is too small',()=>{
 assert.equal(fitPdfSlotText('ข้อความยาว',7,6,metrics,'F1'),null);
 assert.equal(fitPdfSlotText('ข้อความ',0,14,metrics,'F1'),null);
});
test('combining marks and explicit line breaks remain contained or move intact to the annex',()=>{
 const samples=['กีุุุ้่','กีุุุ้่'.repeat(15),'ติดตั้งอุปกรณ์\nตรวจสอบอีกครั้ง','A_1234567890'.repeat(40),'ผู้ปฏิบัติงานชั้นที่หนึ่ง'];
 for(const value of samples)for(const [width,height] of [[67,13],[107,14],[196,14],[20,10]]){
  const result=fitPdfSlotText(value,width,height,metrics,'F2');
  if(result)assertContained(result,width,height);
 }
 assert.equal(fitPdfSlotText('บรรทัดแรก\nบรรทัดที่สอง',300,14,metrics,'F1').originalFits,false);
});
test('preview accepts partial draft fields, reports exact overflow fields and never adds a saved-document QR',async()=>{
 const data={title:'ตัวอย่างข้อความระหว่างกรอก',location:'อาคารผลิต 1',contractorName:'FMT',phone:'',detail:'รายละเอียดเพิ่มเติมเพื่อทดสอบข้อความยาวในแม่แบบจริง '.repeat(35),workers:'พนักงานทดสอบ 1',workerCount:1,startsAt:'',endsAt:'',fireImpact:'',project:false,approvers:{},signatures:[],events:[],attachments:[],forms:AMT_V2_SEEDS.map(t=>({template:{...t,id:crypto.randomUUID()},answers:{}}))};
 data.forms[0].answers.control_low_height_other_1_text='มาตรการเพิ่มเติมที่ต้องคงข้อความเต็มในภาคผนวก '.repeat(12);
 const p={id:'00000000-0000-4000-8000-000000000000',company_id:'amt',created_by:'test',version:1,status:'draft',data,created_at:'2026-11-02T01:00:00Z',updated_at:'2026-11-02T01:00:00Z'};
 data.forms[1].answers.check_1='na:ไม่ได้ใช้บันไดในงานนี้';
 const before=JSON.stringify(p),warnings=[];
 const pdf=await renderPermitPdf(p,{preview:true,onOverflow:w=>warnings.push(w)});
 assert.equal(JSON.stringify(p),before);
 const doc=await PDFDocument.load(pdf);
 assert.equal(doc.getSubject(),'Unsaved work permit preview');
 assert.ok(warnings.some(w=>w.formCode==='AHS-003'&&w.fieldId==='detail'&&w.page===1&&w.annex==='F1'&&w.reason==='overflow'));
 assert.ok(warnings.some(w=>w.formCode==='AHS-004'&&w.fieldId==='detail'&&w.page===2&&w.annex==='F2'));
 assert.ok(warnings.some(w=>w.fieldId==='control_low_height_other_1_text'));
 assert.ok(warnings.some(w=>w.formCode==='AHS-004'&&w.fieldId==='check_1'&&w.reason==='unmapped'));
 const objects=doc.getPages().at(-1).node.Resources().lookupMaybe(PDFName.of('XObject'),PDFDict);
 assert.ok(!objects||objects.entries().length===0,'an unsaved preview has no QR or signature image');
 fs.mkdirSync('output/pdf',{recursive:true});fs.writeFileSync('output/pdf/live-preview-overflow-sample.pdf',pdf);
});

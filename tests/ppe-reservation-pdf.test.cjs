const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const {PDFDocument}=require('pdf-lib');
function load(file){
  const helper=new Module(file,module); helper.paths=Module._nodeModulePaths(path.dirname(file));
  const original=helper.require.bind(helper);
  helper.require=id=>id==='./constants'?load(path.join(path.dirname(file),'constants.ts')):original(id);
  helper._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
  return helper.exports;
}
const {createReservationPDF}=load(path.join(__dirname,'../src/lib/ppe-reservation-pdf.ts'));
test('long Thai names, multiline reasons and cancellation produce a paginated A4 reservation',async()=>{
  const row={id:'11111111-1111-4111-8111-111111111111',company_id:'amt',status:'cancelled',quantity:1000000,approved_quantity:999999,received_quantity:5,
    created_at:'2026-10-26T02:00:00Z',approved_at:'2026-10-26T02:30:00Z',
    ppe_requesters:{display_name:'ผู้ขอเบิกอุปกรณ์สำหรับทดสอบเอกสาร',employee_code:'E001',department:'ฝ่ายความปลอดภัย'},
    ppe_products:{name:'ถุงมือป้องกันสารเคมีสำหรับใช้งานในพื้นที่ปฏิบัติงาน '.repeat(8),unit:'pair'},
    reason:'ขอเบิกเพื่อใช้งานในพื้นที่ปฏิบัติงานที่กำหนด\n'.repeat(24),manager_note:'ยกเลิกยอดค้างที่ยังไม่ได้ส่งมอบ',
    ppe_request_events:[{action:'approve',actor_name:'ผู้ดูแลคลังอุปกรณ์'}]};
  const pdf=await createReservationPDF(row,'บริษัทตัวอย่าง',new Date('2026-10-26T03:00:00Z'));
  const document=await PDFDocument.load(pdf);
  assert.ok(document.getPageCount()>1);
  for(const page of document.getPages()){assert.equal(page.getWidth(),595.28);assert.equal(page.getHeight(),841.89);}
  fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../test-results/ppe-reservation-long.pdf'),pdf);
});

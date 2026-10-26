const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const ExcelJS=require('exceljs');
const cache=new Map();
function load(name) {
  const file=path.join(__dirname,'../src/lib',name+'.ts');
  if(cache.has(file))return cache.get(file).exports;
  const mod=new Module(file,module);mod.paths=Module._nodeModulePaths(path.dirname(file));cache.set(file,mod);
  const original=mod.require.bind(mod);mod.require=id=>id.startsWith('./')?load(id.slice(2)):original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
  return mod.exports;
}
const {usageRows,usageGroups,usageTotals,reportPeriod}=load('ppe-usage');
const {usageWorkbook}=load('ppe-usage-export');
const movement=(extra={})=>({company_id:'amt',product_id:'gloves',department:'ฝ่ายผลิต',employee_code:'001',employee_name:'สมชาย',transaction_type:'stock_out',transaction_date:'2026-10-01',quantity:2,unit:'pair',ppe_products:{name:'ถุงมือป้องกันการบาด รุ่น L',unit:'pair'},...extra});
test('period includes calendar end dates and comparison across years, rejects invalid ranges',()=>{
  assert.deepEqual(reportPeriod('2024-02','2024-02'),{start:'2024-02-01',end:'2024-02-29',previousStart:'2024-01-01'});
  assert.equal(reportPeriod('2026-01','2026-03').previousStart,'2025-10-01');
  for(const pair of [['2026-13','2026-13'],['2026-10','2026-09'],['','']])assert.throws(()=>reportPeriod(...pair));
});
test('separates issues and gross borrows, uses historical units, includes both boundaries and excludes return/incoming',()=>{
  const rows=usageRows([
    movement(),movement({transaction_type:'borrow',quantity:7,transaction_date:'2026-10-31'}),
    movement({unit:'คู่',quantity:3}),movement({unit:'box',quantity:4}),
    ...['stock_in','return'].map(transaction_type=>movement({transaction_type,quantity:100})),
    movement({transaction_date:'2026-09-30',quantity:100}),movement({transaction_date:'2026-11-01',quantity:100}),
  ],[],'2026-10','2026-10');
  assert.equal(rows.length,2);
  assert.deepEqual(usageTotals(rows),[{unit:'กล่อง',issued:4,borrowed:0},{unit:'คู่',issued:5,borrowed:7}]);
});
test('keeps duplicate names across product IDs, companies, units and employees separate; never truncates details',()=>{
  const movements=Array.from({length:15},(_,i)=>movement({product_id:'p'+i}));
  movements.push(movement({company_id:'aab',product_id:'p0'}),movement({employee_code:'002',product_id:'p0'}));
  const rows=usageRows(movements,[],'2026-10','2026-10');
  const dept=usageGroups(rows,'dept');
  assert.equal(dept.length,2);assert.equal(dept.find(g=>g.company==='amt').rows.length,15);
  assert.equal(dept.find(g=>g.company==='amt').rows.find(r=>r.productId==='p0').issued,4);
  assert.equal(usageGroups(rows,'product').length,16);
  assert.equal(usageGroups(rows,'emp').length,3);
  assert.equal(usageTotals(dept.flatMap(g=>g.rows))[0].issued,34);
});
test('search and Excel retain exactly the displayed scope, units, full names and numeric columns',async()=>{
  const full='ฝ่ายปฏิบัติการประกอบอุปกรณ์ป้องกันอันตรายส่วนบุคคล ชื่อยาวครบถ้วน';
  const rows=usageRows([
    movement({department:full}),movement({department:full,transaction_type:'borrow',quantity:8}),
    movement({department:'แผนกอื่น',quantity:20}),
    movement({product_id:'unsafe',ppe_products:{name:'=HYPERLINK("example")'},department:full,quantity:1}),
  ],[],'2026-10','2026-10');
  const groups=usageGroups(rows,'product',full);
  assert.equal(groups.length,2);
  assert.ok(groups.flatMap(g=>g.rows).every(r=>r.department===full));
  const buffer=await usageWorkbook(groups,'product','2026-10','2026-10',full);
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
  const sheet=book.getWorksheet('ตามสินค้า');
  assert.match(sheet.getCell('A2').value,/2026-10/);
  assert.equal(sheet.getCell('A3').value,'ตัวกรอง: '+full);
  assert.deepEqual(sheet.getRow(5).values.slice(1),['บริษัท','สินค้า','แผนก','หน่วยนับ','เบิกออก','ยืม']);
  const values=[6,7].map(n=>sheet.getRow(n).values.slice(1));
  assert.ok(values.every(r=>r[2]===full&&r[3]==='คู่'&&typeof r[4]==='number'&&typeof r[5]==='number'));
  assert.equal(values.reduce((sum,r)=>sum+r[4],0),3);
  assert.equal(values.reduce((sum,r)=>sum+r[5],0),8);
  const formulaRow=[6,7].find(n=>sheet.getCell(n,2).value.startsWith('='));
  assert.equal(sheet.getCell(formulaRow,2).type,ExcelJS.ValueType.String);
  assert.equal(sheet.getCell(formulaRow,2).formula,undefined);
});

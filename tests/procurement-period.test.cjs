// Period rules, spend categories and the vendor report (src/lib/procurement/{period,categories,report}.ts), compiled on the fly.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');

const dir=path.join(__dirname,'..','src/lib/procurement');
const cache={};
function load(name){
  if(cache[name])return cache[name].exports;
  const src=fs.readFileSync(path.join(dir,name+'.ts'),'utf8');
  const m={exports:{}};cache[name]=m;
  const req=p=>{if(p.startsWith('./'))return load(p.slice(2));throw new Error('unexpected import '+p);};
  new Function('module','exports','require',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,req);
  return m.exports;
}
const P=load('period');const C=load('categories');const R=load('report');

const meta={as_of:'2026-10-23',years:[2026,2025,2024],coverage:{pr:'2024-01-29',po:'2024-04-28',quote:'2024-01-01'},imported_at:null,imported_by:null,counts:{}};

test('running year is cut at the as-of day and compared with the same span last year',()=>{
  const i=P.periodInfo(2026,meta,'po');
  assert.deepEqual(i.range,{from:'2026-01-01',to:'2026-10-23'});
  assert.deepEqual(i.prev,{from:'2025-01-01',to:'2025-10-23',year:2025});
  assert.equal(i.partial,true);
  assert.deepEqual(i.notes,[]);assert.deepEqual(i.compareNotes,[]);
  const full=P.periodInfo(2025,meta,'po');
  assert.deepEqual(full.range,{from:'2025-01-01',to:'2025-12-31'});
  assert.equal(full.partial,false);
  assert.deepEqual(full.notes,[]);
  assert.match(full.compareNotes[0],/ฐานเทียบไม่ครบ/); // 2024 PO data starts 28 Apr
  const first=P.periodInfo(2024,meta,'po');
  assert.equal(first.prev,null);
  assert.match(first.notes[0],/ไม่ครบปี/);
  // PR data starting 29 Jan is within the grace period: no warning
  assert.deepEqual(P.periodInfo(2025,meta,'pr').compareNotes,[]);
  assert.equal(P.periodInfo('all',meta,'po').range,null);
});

test('leap day and URL parsing',()=>{
  assert.deepEqual(P.prevRange(2028,'2028-02-29'),{from:'2027-01-01',to:'2027-02-28'});
  assert.equal(P.parsePeriod('2025',meta.years),2025);
  assert.equal(P.parsePeriod('2019',meta.years),'all');
  assert.equal(P.parsePeriod('25; drop',meta.years),'all');
  assert.equal(P.parsePeriod(null,meta.years),'all');
  assert.equal(P.inRange('2025-10-23T09:00:00',{from:'2025-01-01',to:'2025-10-23'}),true);
  assert.equal(P.inRange('2025-10-24',{from:'2025-01-01',to:'2025-10-23'}),false);
  assert.equal(P.inRange(null,null),true);
  assert.equal(P.pctChange(150,100),50);
  assert.equal(P.pctChange(5,0),null);
});

test('categories come from the Odoo product code; note and discount lines follow their PO',()=>{
  assert.equal(C.lineCategory('[OF02-Site] ค่ายามรักษาความปลอดภัย - Site'),'guard');
  assert.equal(C.lineCategory('[OT42-Site-0044] AS-TSP'),'safety');
  assert.equal(C.lineCategory('[07-SPNM-0035] หน้ากากคาร์บอน'),'goods');
  assert.equal(C.lineCategory('[HR01-Site] ค่าอบรมสัมนา-Site'),'training');
  assert.equal(C.lineCategory('ALCOHOL 70% 450ML.'),'other');
  assert.equal(C.lineCategory('[D] Discount (Fixed)'),null);
  assert.equal(C.lineCategory(''),null);
  const m=C.categorizePoLines([
    {odoo_id:1,po_no:'PO1',product:'[OT06-Site] ค่าบริการจัดการของเสีย - Site',subtotal:1000},
    {odoo_id:2,po_no:'PO1',product:'[D] Discount (Fixed)',subtotal:-50},
    {odoo_id:3,po_no:'PO1',product:'',subtotal:0},
    {odoo_id:4,po_no:'PO2',product:'',subtotal:0},
  ]);
  assert.equal(m.get(2),'waste');assert.equal(m.get(3),'waste');assert.equal(m.get(4),'other');
});

test('vendor report: same-span comparison, category filter, new vendors, yearly trend',()=>{
  const po=(id,vendor,date,amt,product='[07-SPXX-0001] ถุงมือ',state='purchase')=>({odoo_id:id,po_no:'PO'+id,pr_odoo_id:id,pr_no:'PR'+id,requester:'A',vendor,product,item:'',qty:1,uom:'',unit_price:amt,subtotal:amt,currency:'THB',order_date:date,po_state:state});
  const lines=[
    po(1,'บริษัท ก จำกัด','2025-03-01',100),
    po(2,'บริษัท ก จำกัด','2025-11-15',900),          // after the same-day cut: not in the 2025 comparison span
    po(3,'บริษัท ก จำกัด','2026-02-01',150),
    po(4,'บริษัท ข จำกัด','2026-05-01',50),            // first PO ever in 2026 -> new
    po(5,'บริษัท ค จำกัด','2026-06-01',1000,'[OF02-Site] ค่ายามรักษาความปลอดภัย - Site'),
    po(6,'บริษัท ก จำกัด','2026-07-01',999,undefined,'cancel'), // cancelled: ignored
  ];
  const prs=lines.map(l=>({pr_no:l.pr_no,requester:'A',request_date:l.order_date}));
  const d={prs,po:lines,quotes:[],meta,prDate:new Map(prs.map(p=>[p.pr_no+'|A',p.request_date])),poCat:C.categorizePoLines(lines),prCats:new Map()};
  const all=R.vendorReport(d,2026,null);
  assert.equal(all.totals.amount,1200);
  assert.equal(all.totals.prev,100);
  assert.equal(all.totals.vendors,3);
  assert.equal(all.totals.new_vendors,2);
  const ka=all.vendors.find(v=>v.vendor==='บริษัท ก จำกัด');
  assert.equal(ka.po_amount,150);assert.equal(ka.prev_amount,100);assert.equal(ka.is_new,false);assert.equal(ka.rank,2);
  assert.deepEqual(ka.yearly,[0,1000,150]); // 2024, 2025, 2026
  assert.equal(all.vendors.find(v=>v.vendor==='บริษัท ข จำกัด').is_new,true);
  assert.deepEqual(all.cats.map(c=>[c.cat,c.amount,c.prev]),[['guard',1000,0],['goods',200,100]]);
  assert.equal(all.monthly.lastMonth,9);
  assert.equal(all.monthly.prevSame,100);
  const goods=R.vendorReport(d,2026,'goods');
  assert.equal(goods.totals.amount,200);
  assert.deepEqual(goods.vendors.map(v=>v.vendor).sort(),['บริษัท ก จำกัด','บริษัท ข จำกัด']);
  assert.equal(goods.cats.length,2); // the category chart always shows every category
  const ever=R.vendorReport(d,'all',null);
  assert.equal(ever.totals.amount,2200);
  assert.equal(ever.totals.prev,null);
  assert.equal(ever.monthly,null);
  assert.deepEqual(ever.matrix.map(m=>[m.year,m.total]),[[2024,0],[2025,1000],[2026,1200]]);
});

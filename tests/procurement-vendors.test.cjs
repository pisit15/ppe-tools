// Vendor aliases (Thai/English names in brackets) and per-basis offer groups (src/lib/procurement/{analysis,offers}.ts).
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
const A=load('analysis');const O=load('offers');const N=load('normalize');

test('Thai and English spellings of one company share a key; unrelated companies do not',()=>{
  const names=[
    'Thai lab (บริษัท ห้องปฏิบัติการไทย จำกัด)','บริษัท ห้องปฏิบัติการไทย จำกัด (สำนักงานใหญ่) (THAI LAB)','บริษัท ห้องปฏิบัติการไทย จำกัด (สำนักงานใหญ่) / THAI LAB',
    'Thai Environmental Technic Limited (TET) บริษัท เทคนิคสิ่งแวดล้อมไทย จำกัด','บริษัท เทคนิคสิ่งแวดล้อมไทย จำกัด (Thai Environmental Technic Limited)',
    'บริษัท เวสต์ 2 เอ็นเนอร์ยี่ จำกัด (Waste 2 Energy Co., Ltd.)','บริษัท กรีน เอ็นไวรอนเม้นท์ เทคโนโลยี จำกัด (ในเครือของ Waste2Energy)',
    'MKC Tools (option 1)','Other Shop (option 1)','บริษัท ซีเอสที ซัพพลายส์ จำกัด (3M)','3M Thailand Limited',
    'บริษัท อมิตา เทคโนโลยี (ประเทศไทย) จำกัด','บริษัท ไมน์ โมบิลิตี คอร์ปอเรชั่น จำกัด (ประเทศไทย)',
  ];
  const k=A.vendorKeyer(names);
  assert.equal(k('Thai lab (บริษัท ห้องปฏิบัติการไทย จำกัด)'),k('บริษัท ห้องปฏิบัติการไทย จำกัด (สำนักงานใหญ่) / THAI LAB'));
  assert.equal(k('THAI LAB'),k('บริษัท ห้องปฏิบัติการไทย จำกัด'));
  assert.equal(k('Thai Environmental Technic Limited (TET) บริษัท เทคนิคสิ่งแวดล้อมไทย จำกัด'),k('บริษัท เทคนิคสิ่งแวดล้อมไทย จำกัด'));
  assert.notEqual(k('บริษัท เวสต์ 2 เอ็นเนอร์ยี่ จำกัด'),k('บริษัท กรีน เอ็นไวรอนเม้นท์ เทคโนโลยี จำกัด'),'"ในเครือของ" names a different company');
  assert.notEqual(k('MKC Tools (option 1)'),k('Other Shop (option 1)'),'options are not names');
  assert.notEqual(k('บริษัท ซีเอสที ซัพพลายส์ จำกัด (3M)'),k('3M Thailand Limited'),'short brand in brackets is not an alias');
  assert.notEqual(k('บริษัท อมิตา เทคโนโลยี (ประเทศไทย) จำกัด'),k('บริษัท ไมน์ โมบิลิตี คอร์ปอเรชั่น จำกัด (ประเทศไทย)'),'(ประเทศไทย) is not a name');
  assert.equal(k('Unknown Vendor Co., Ltd.'),A.vendorKey('Unknown Vendor Co., Ltd.'),'unseen names fall back to vendorKey');
});

test('the installed keyer is used for vendor summaries and price points',()=>{
  const names=['Thai lab (บริษัท ห้องปฏิบัติการไทย จำกัด)','บริษัท ห้องปฏิบัติการไทย จำกัด'];
  A.setVendorKeyer(A.vendorKeyer(names));
  try{
    const po=[{odoo_id:1,po_no:'PO1',pr_odoo_id:1,pr_no:'PR1',requester:'A',vendor:'บริษัท ห้องปฏิบัติการไทย จำกัด',product:'x',item:'x',qty:1,uom:'',unit_price:10,subtotal:10,currency:'THB',order_date:'2026-01-02',po_state:'purchase'}];
    const quotes=[{id:1,pr_no:'PR1',requester:'A',vendor:'Thai lab',vendor_group:'Thai lab (บริษัท ห้องปฏิบัติการไทย จำกัด)',quote_date:'2026-01-01',duplicate_file:false}];
    const s=A.vendorSummaries([{pr_no:'PR1',requester:'A'}],po,quotes);
    assert.equal(s.length,1);assert.equal(s[0].quote_count,1);assert.equal(s[0].won_prs,1);
    const pts=A.pricePoints(po,[],new Map());
    assert.equal(pts[0].vendor_key,A.vendorId('Thai lab (บริษัท ห้องปฏิบัติการไทย จำกัด)'));
  }finally{A.setVendorKeyer(n=>A.vendorKey(n)||n);}
});

test('offers are ranked within one price basis; mixed bases are split and flagged',()=>{
  const q=(vendor,value,basis,selected=false)=>({vendor,vendor_group:vendor,vendor_key:vendor,subtotal:value,total:value*1.07,price_basis:basis,selected});
  let r=O.offerGroups([q('A',100,'year'),q('B',90,null,true),q('A',120,'year')]);
  assert.equal(r.mixed,false);assert.equal(r.groups.length,1);
  assert.deepEqual(r.groups[0].offers.map(o=>[o.name,o.value,o.selected]),[['B',90,true],['A',100,false]]);
  r=O.offerGroups([q('Guard A',100000,'month'),q('Guard B',1150000,'year',true),q('Guard C',1300000,'year'),q('Guard D',95000,'month')]);
  assert.equal(r.mixed,true);
  assert.deepEqual(r.groups.map(g=>g.basis),['year','month'],'the group with the PO vendor comes first');
  assert.deepEqual(r.groups[1].offers.map(o=>o.name),['Guard D','Guard A']);
  assert.equal(O.offerGroups([{...q('X',0,'once'),total:null,subtotal:null}]).groups.length,0);
});

test('price basis is kept only when it is one of month / year / once',()=>{
  const quotes={quotes:[1,2,3].map((id,i)=>({quote_id:id,file:'f',person:'P',pr:'PR1',doc_type:'quotation',vendor:'V',vendor_group:'V',quote_no:null,date:null,customer:null,currency:'THB',subtotal:1,discount:null,vat:null,total:1,notes:null,n_items:0,duplicate_file:false,price_basis:['month','weekly',undefined][i]})),items:[]};
  const rows=N.normalizeSync({},[],quotes);
  assert.deepEqual(rows.proc_quotes.map(r=>r.price_basis),['month',null,null]);
});

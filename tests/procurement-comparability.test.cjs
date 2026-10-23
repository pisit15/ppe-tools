// Real price grouping/search behavior; pure TypeScript compiled using the existing test harness.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const dir=path.join(__dirname,'..','src/lib/procurement');
const cache={};
function load(name){
  if(cache[name])return cache[name].exports;
  const m={exports:{}};cache[name]=m;
  const src=fs.readFileSync(path.join(dir,name+'.ts'),'utf8');
  const req=p=>{if(p.startsWith('./'))return load(p.slice(2));throw new Error('unexpected import '+p);};
  new Function('module','exports','require',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,req);
  return m.exports;
}
const A=load('analysis'), C=load('comparability'), N=load('normalize');
const point=(id,extra={})=>({id,source:'po',pr_no:`PR${id}`,requester:'A',vendor:'Vendor A',vendor_key:'a',date:'2026-10-01',period_date:'2026-10-01',item:'ถุงมือ nitrile M 100 ชิ้น',detail:'EN 374',qty:10,unit:'box',unit_price:100,ref:`PO${id}`,duplicate:false,currency:'THB',price_basis:'unit',tax_basis:'ex_vat',...extra});
const select=(points,id=0,opts={})=>{
  const initial=A.searchPrices(points,'ถุงมือ',opts);
  return A.searchPrices(points,'ถุงมือ',{...opts,group:initial.groups[id].id});
};

test('unit aliases canonicalize without changing original units or converting packs',()=>{
  for(const alias of ['pair','PAIR','คู่','PRS',' pairs ']) assert.equal(C.canonicalUnit(alias),'คู่');
  for(const alias of ['BOX','boxes','กล่อง']) assert.equal(C.canonicalUnit(alias),'กล่อง');
  assert.notEqual(C.canonicalUnit('box 50'),C.canonicalUnit('box 100'));
  assert.notEqual(C.canonicalUnit('pair'),C.canonicalUnit('piece'));
  const points=['pair','PAIR','คู่','PRS'].map((unit,i)=>point(i,{unit}));
  const result=A.searchPrices(points,'ถุงมือ',{unit:'PAIR'});
  assert.equal(result.groups.length,1);
  assert.equal(result.units.length,1);
  assert.deepEqual(result.points.map(p=>p.unit),['pair','PAIR','คู่','PRS']);
  assert.equal(result.total,4);
});

test('same category does not merge different products, specs, packaging or units',()=>{
  const points=[point(1),point(2,{item:'ถุงมือ leather L',detail:'EN 374'}),point(3,{detail:'EN 388'}),point(4,{item:'ถุงมือ nitrile M 50 ชิ้น'}),point(5,{unit:'คู่'})];
  const result=A.searchPrices(points,'ถุงมือ',{});
  assert.equal(result.groups.length,5);
  assert.equal(result.comparison_ready,false);
  assert.equal(result.summary,null);
  assert.deepEqual(result.vendors,[]);
});

test('explicit selection required even for a single group; text case and whitespace aliases are safe',()=>{
  const points=[point(1),point(2,{item:'  ถุงมือ  NITRILE M 100 ชิ้น  ',detail:'EN   374',unit:'กล่อง',unit_price:200})];
  const initial=A.searchPrices(points,'ถุงมือ',{});
  assert.equal(initial.groups.length,1);
  assert.equal(initial.comparison_ready,false);
  const result=select(points);
  assert.equal(result.comparison_ready,true);
  assert.equal(result.summary.po_median,150);
  assert.equal(result.summary.po_count,2);
  assert.match(result.comparison_message,/ตรวจสเปก/);
  assert.equal(result.groups[0].id,A.searchPrices([...points].reverse(),'ถุงมือ',{}).groups[0].id);
});

test('currency, VAT basis, duration basis and absent legacy metadata never pool',()=>{
  const points=[point(1),point(2,{currency:'USD'}),point(3,{tax_basis:'inc_vat'}),point(4,{price_basis:'month'}),point(5,{price_basis:'year'}),point(6,{currency:undefined,tax_basis:undefined,price_basis:undefined}),point(7,{source:'quote',currency:undefined,tax_basis:undefined,price_basis:undefined})];
  const result=A.searchPrices(points,'ถุงมือ',{});
  assert.equal(result.groups.length,7);
  const unknown=result.groups.find(g=>!g.currency);
  const selected=A.searchPrices(points,'ถุงมือ',{group:unknown.id});
  assert.equal(selected.total,1);
  assert.equal(selected.comparison_ready,false);
  assert.equal(selected.summary,null);
  assert.deepEqual(selected.vendors,[]);
});

test('unrecognized currency codes and ambiguous symbols cannot make a group comparison-ready',()=>{
  for(const currency of ['UNKNOWN','ABC','XXX','N/A','$','¥','THB/USD','']) {
    assert.equal(C.canonicalCurrency(currency),'',currency);
    const result=select([point(1,{currency})]);
    assert.equal(result.comparison_ready,false,currency);
    assert.equal(result.summary,null,currency);
    assert.deepEqual(result.vendors,[],currency);
  }
  for(const [raw,canonical] of [['thb','THB'],['฿','THB'],['บาท','THB'],['US$','USD'],['USD','USD'],['€','EUR']]) {
    assert.equal(C.canonicalCurrency(raw),canonical);
    assert.equal(select([point(1,{currency:raw})]).comparison_ready,true);
  }
});

test('unrecognized runtime price and tax bases remain unconfirmed',()=>{
  for(const extra of [{price_basis:'week'},{tax_basis:'maybe_included'}]) {
    const result=select([point(1,extra)]);
    assert.equal(result.comparison_ready,false);
    assert.equal(result.summary,null);
  }
});

test('selected group is filtered before the 600-row limit and statistics use all group records',()=>{
  const irrelevant=Array.from({length:650},(_,i)=>point(i,{item:'ถุงมือ leather L',date:'2026-10-02'}));
  const target=Array.from({length:620},(_,i)=>point(1000+i,{unit_price:i<600?100:1000}));
  const all=[...irrelevant,...target];
  const initial=A.searchPrices(all,'ถุงมือ',{});
  const group=initial.groups.find(g=>g.item==='ถุงมือ nitrile M 100 ชิ้น');
  assert.equal(group.count,620);
  const result=A.searchPrices(all,'ถุงมือ',{group:group.id});
  assert.equal(result.points.length,600);
  assert.equal(result.total,620);
  assert.equal(result.match_total,1270);
  assert.equal(result.truncated,true);
  assert.equal(result.summary.po_count,620);
  assert.equal(result.summary.po_max,1000);
  assert.equal(result.vendors[0].po_count,620);
  assert.ok(result.points.every(p=>p.item===group.item));
});

test('stale group after query, unit or period change never falls back to pooled results',()=>{
  const points=[point(1),point(2,{item:'ถุงมือ leather L',unit:'คู่'})];
  const initial=A.searchPrices(points,'ถุงมือ nitrile',{});
  for(const [subset,query,opts] of [[points,'ถุงมือ leather',{}],[points,'ถุงมือ',{unit:'คู่'}],[[], 'ถุงมือ',{}]]){
    const result=A.searchPrices(subset,query,{...opts,group:initial.groups[0].id});
    assert.equal(result.total,0);
    assert.deepEqual(result.points,[]);
    assert.equal(result.comparison_ready,false);
    assert.equal(result.selected_group,null);
    assert.match(result.comparison_message,/เลือกกลุ่มใหม่/);
  }
});

test('duplicate documents excluded by default, included only on explicit request',()=>{
  const points=[point(1),point(2,{duplicate:true,unit_price:900})];
  assert.equal(select(points).summary.po_median,100);
  assert.equal(select(points,0,{includeDuplicates:true}).summary.po_median,500);
});

test('PO basis requires untaxed subtotal evidence; quote totals alone do not prove item tax basis',()=>{
  const po=(id,extra={})=>({odoo_id:id,po_no:`PO${id}`,pr_no:'PR1',requester:'A',vendor:'A',item:'ถุงมือ',product:'[GLOVE] PPE',qty:10,uom:'PAIR',unit_price:100,subtotal:1000,currency:'USD',order_date:'2026-10-01',po_state:'purchase',...extra});
  const quotes=new Map([[1,{currency:'USD',price_basis:'month',requester:'A',vat:7,total:107,subtotal:100}]]);
  const points=A.pricePoints([po(1),po(2,{subtotal:934.58}),po(3,{subtotal:undefined})],[{id:1,quote_id:1,pr_no:'PR1',name:'ถุงมือ',unit:'pair',unit_price:100}],quotes);
  assert.deepEqual(points.map(p=>p.tax_basis),['ex_vat','unknown','unknown','unknown']);
  assert.equal(points[0].unit,'PAIR');
  assert.equal(points[0].currency,'USD');
  assert.equal(points[3].price_basis,'month');
});

test('new imports preserve unknown currency rather than manufacturing THB',()=>{
  const rows=N.normalizeSync({},[],{quotes:[{quote_id:1,pr:'PR1',person:'A',file:'f',currency:null}],items:[]});
  assert.equal(rows.proc_quotes[0].currency,'');
});

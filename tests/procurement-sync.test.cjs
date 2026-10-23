// Daily-sync payload builder (scripts/procurement/build_tools_payload.cjs): up to date with the source, and its output
// is exactly what /api/procurement/import accepts (batch limits, parents first, manifest hashes, finalize keys).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {bundle,out}=require('../scripts/procurement/bundle-sync.cjs');

test('committed bundle matches src/lib/procurement (run npm run build:sync-bundle after changing them)',()=>{
  assert.equal(fs.readFileSync(out,'utf8'),bundle());
});

test('builds upsert batches, finalize keys and a manifest from pull.js output',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'proc-sync-'));
  const pr=(id,name)=>({id,name,date_start:'2026-10-01',title:'T'+id,description:false,company_id:[1,'AMT'],operating_unit_id:[2,'[D8_SF00] AMT'],request_type:[3,'Service'],state:'done',estimated_cost:100,po_ids:[id*10],line_count:1});
  const sync={'Narakorn Lunthat':{prs:Array.from({length:1200},(_,i)=>pr(i+1,'PR26'+String(i+1).padStart(6,'0'))),lines:[],att:[],pos:Array.from({length:1200},(_,i)=>({id:(i+1)*10,name:'PO'+(i+1),partner_id:[9,'บริษัท ก จำกัด 00001'],amount_untaxed:100}))}};
  const po=Array.from({length:1200},(_,i)=>({id:5000+i,order_id:[(i+1)*10,'PO'+(i+1)],product_id:[7,'[07-SPXX-0001] ถุงมือ'],name:'ถุงมือ',product_qty:2,product_uom:[1,'คู่'],price_unit:50,price_subtotal:100,partner_id:[9,'บริษัท ก จำกัด 00001'],date_order:'2026-10-02 10:00:00',currency_id:[1,'THB'],state:'purchase'}));
  fs.writeFileSync(path.join(dir,'sync.json'),'﻿'+JSON.stringify(sync)); // BOM like files saved by Windows tools
  fs.writeFileSync(path.join(dir,'po.json'),JSON.stringify(po));
  const B=require(out);
  const outDir=path.join(dir,'push');
  const log=console.log;let printed='';console.log=s=>{printed+=s;};
  try{B.main([path.join(dir,'sync.json'),path.join(dir,'po.json'),outDir]);}finally{console.log=log;}
  assert.deepEqual(JSON.parse(printed).counts,{proc_pr:1200,proc_pr_lines:0,proc_po_lines:1200});
  const m=JSON.parse(fs.readFileSync(path.join(outDir,'manifest.json'),'utf8'));
  assert.deepEqual(m.files.map(f=>[f.table,f.rows]),[['proc_pr',1000],['proc_pr',200],['proc_po_lines',1000],['proc_po_lines',200]]);
  for(const f of [...m.files,m.finalize]){
    const text=fs.readFileSync(path.join(outDir,f.name));
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'),f.sha256);
  }
  const first=JSON.parse(fs.readFileSync(path.join(outDir,m.files[0].name),'utf8'));
  assert.equal(first.action,'upsert');assert.equal(first.table,'proc_pr');
  assert.equal(first.rows[0].requester,'Narakorn Lunthat');
  const fin=JSON.parse(fs.readFileSync(path.join(outDir,'finalize.json'),'utf8'));
  assert.equal(fin.action,'finalize');
  assert.deepEqual(Object.keys(fin.keys),['proc_pr','proc_pr_lines','proc_po_lines']); // no quotation file: quotations untouched
  assert.equal(fin.keys.proc_pr.length,1200);
  assert.match(fin.source,/^daily-sync: sync\.json, po\.json$/);
  const poRow=JSON.parse(fs.readFileSync(path.join(outDir,m.files[2].name),'utf8')).rows[0];
  assert.equal(poRow.vendor,'บริษัท ก จำกัด'); // Odoo branch code removed
  // refuses an empty pull instead of producing a snapshot that would wipe the site
  fs.writeFileSync(path.join(dir,'empty.json'),JSON.stringify({'Narakorn Lunthat':{prs:[],lines:[],att:[],pos:[]}}));
  assert.throws(()=>B.main([path.join(dir,'empty.json'),path.join(dir,'po.json'),path.join(dir,'x')]),/no PRs/);
});

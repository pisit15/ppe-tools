const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {validateComponents,validateProductType}=require('../src/lib/chemical/components.ts');
const {checkRegisteredProduct}=require('../src/lib/chemical/legal/product.ts');
const {checkLegalCatalog,hasVerifiedLegalMatch}=require('../src/lib/chemical/legal/engine.ts');
const {extractSds,normalizeSdsExtraction}=require('../src/lib/chemical/sds-extraction.ts');
const {createDb}=require('./chemical-db-fixture.cjs');
const catalog=require('../data/chemical-legal/catalog-2026-10-09-v2.json');
const components=require('./fixtures/chemical-mixture.json');
const product={name:'PALCOAT test mixture',product_type:'mixture',cas_no:null,components};

test('literal SDS page 2 ranges, missing water percentage and all five identities survive normalization',()=>{
 assert.deepEqual(validateComponents(components),components);
 assert.equal(components[4].concentration_text,null);
 const raw={name:product.name,product_type:'mixture',cas_no:'',components:components.map(c=>({...c,concentration_text:c.concentration_text||''}))};
 const result=normalizeSdsExtraction(raw);
 assert.equal(result.cas_no,null);assert.equal(result.product_type,'mixture');
 assert.deepEqual(result.components,components);
 assert.equal(validateComponents([{...components[0],cas_no:'000050–00–0',concentration_text:'< 0.1%'}])[0].cas_no,'000050-00-0');
 assert.equal(validateComponents([{...components[0],cas_no:null,cas_status:'confidential',concentration_text:'ไม่เปิดเผย'}])[0].cas_no,null);
 assert.throws(()=>validateProductType('guess'));
 for(const bad of [null,{},Array(101).fill(components[0]),[{...components[0],cas_no:'13473-90-1'}],[{...components[0],name:''}],[{...components[0],cas_status:'confidential'}],[{...components[0],concentration_text:20}],[{...components[0],cas_status:['specified']}],[{...components[0],concentration_basis:['w/w']}]]) assert.throws(()=>validateComponents(bad));
 assert.throws(()=>normalizeSdsExtraction({name:'Bad',components:[{...components[0],cas_no:'bad'}]}),e=>e.code==='AI_INVALID_COMPONENTS');
});

test('AI receives structured ingredient schema and never depends on notes for composition',async()=>{
 let body;
 const result=await extractSds({base64:Buffer.from('%PDF-1.4 fixture').toString('base64'),mediaType:'application/pdf',label:'test.pdf'},'test-key','claude-sonnet-5',async(url,req)=>{
  body=JSON.parse(req.body);return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({...product,cas_no:''})}]});
 });
 assert.equal(body.output_config.format.schema.properties.components.items.additionalProperties,false);
 assert.ok(body.system.includes('Never choose the main ingredient'));
 assert.equal(result.components.length,5);assert.equal(result.cas_no,null);
});

test('mixture checks all ingredients, retains unknowns and deduplicates regulatory entries without evaluating concentration thresholds',()=>{
 const mixed={...product,components:[...components,{...components[0],name:'Same ingredient repeated'},{...components[0],name:'Trade secret',cas_no:null,cas_status:'confidential',concentration_text:'<1%'}]};
 const result=checkRegisteredProduct(catalog,mixed);
 assert.equal(result.checked_cas_count,5);assert.equal(result.parts.length,7);
 assert.equal(result.missing_cas_count,1);assert.equal(result.incomplete,true);
 assert.equal(result.parts[6].check,null);assert.equal(result.parts[6].concentration,'<1%');
 assert.deepEqual(result.counts,checkRegisteredProduct(catalog,product).counts);
 for(let i=0;i<5;i++) assert.deepEqual(result.parts[i].check,checkLegalCatalog(catalog,components[i].cas_no));
 assert.ok(hasVerifiedLegalMatch(result.counts));
 assert.equal(checkRegisteredProduct(catalog,{...product,components:[]}).incomplete,true);
 const old=checkRegisteredProduct(catalog,{name:'Acetone',cas_no:'67-64-1'});
 assert.deepEqual(old.counts,checkLegalCatalog(catalog,'67-64-1').counts);
 const padded=checkRegisteredProduct(catalog,{...product,components:[{...components[0],cas_no:'000050-00-0'}]});
 assert.equal(padded.parts[0].cas,'50-00-0');assert.ok(hasVerifiedLegalMatch(padded.counts));
});

test('database enforces ingredient schema/checksum, defaults existing rows and preserves tenant protection',async()=>{
 const db=await createDb();
 try{
  assert.ok((await db.query('select product_type, components from chem_substances')).rows.every(r=>r.product_type==='unknown'&&r.components.length===0));
  await db.exec('set role service_role');
  const sql="update chem_substances set product_type='mixture',components=$1 where id='11111111-1111-4111-8111-111111111111' returning components";
  assert.deepEqual((await db.query(sql,[JSON.stringify(components)])).rows[0].components,components);
  for(const bad of [{},[{...components[0],cas_no:'13473-90-1'}],[{...components[0],cas_no:null}],[{...components[0],cas_status:'confidential'}],[{...components[0],concentration_text:25}],[{name:'incomplete'}]]) await assert.rejects(db.query(sql,[JSON.stringify(bad)]),/check constraint/);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role; set role '+role);
   await assert.rejects(db.query('select components from chem_substances'),/permission denied/);
   await assert.rejects(db.query("select public.chem_valid_components('[]'::jsonb)"),/permission denied/);
  }
 }finally{await db.close();}
});

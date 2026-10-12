const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {extractSds,normalizeSdsExtraction,SDS_SCHEMA}=require('../src/lib/chemical/sds-extraction.ts');
const source={base64:Buffer.from('%PDF-1.4\nfixture').toString('base64'),mediaType:'application/octet-stream',label:'fixture.pdf'};
const ok=(data,stop_reason='end_turn')=>Response.json({stop_reason,content:[{type:'text',text:JSON.stringify(data)}],usage:{output_tokens:3300}});

test('scanned PDFs use document vision and constrained JSON with room for Thai output',async()=>{
 let body;
 const actual=await extractSds(source,'test-only-key','claude-sonnet-5',async(url,req)=>{body=JSON.parse(req.body);return ok({name:'Fixture SDS',first_aid:{eye:'ล้างด้วยน้ำ'},h_codes:['h314'],p_codes:['P305 + P351 + P338'],ghs_pictograms:['ghs05'],signal_word:'danger'});});
 assert.equal(body.messages[0].content[0].type,'document');
 assert.equal(body.max_tokens,8192);
 assert.deepEqual(body.thinking,{type:'disabled'});
 assert.deepEqual(body.output_config.format.schema,SDS_SCHEMA);
 assert.equal(actual.name,'Fixture SDS');assert.deepEqual(actual.p_codes,['P305+P351+P338']);assert.equal(actual.signal_word,'Danger');
});

test('truncated text and thinking-only responses retry once without applying partial facts',async()=>{
 for(const partial of [{content:[{type:'text',text:'{"name":"partial","first_aid":{'}]},{content:[{type:'thinking',thinking:''}]}]){
  const requests=[];
  const result=await extractSds(source,'test-only','claude-sonnet-5',async(url,req)=>{
   requests.push(JSON.parse(req.body));
   return requests.length===1?Response.json({...partial,stop_reason:'max_tokens',usage:{output_tokens:8192}}):ok({name:'Complete',first_aid:{eye:'Eye instruction',skin:'Skin instruction'}});
  });
  assert.deepEqual(requests.map(x=>x.max_tokens),[8192,16384]);assert.equal(result.name,'Complete');assert.equal(result.first_aid.skin,'Skin instruction');
 }
});

test('repeated truncation, refusal and invalid JSON have specific safe errors',async()=>{
 let calls=0;
 await assert.rejects(extractSds(source,'test-only','custom-model',async(url,req)=>{calls++;assert.equal(JSON.parse(req.body).thinking,undefined);return ok({name:'incomplete'},'max_tokens');}),e=>e.code==='AI_TRUNCATED');assert.equal(calls,2);
 await assert.rejects(extractSds(source,'test-only','claude-sonnet-5',async()=>ok({},'refusal')),e=>e.code==='AI_REFUSED');
 await assert.rejects(extractSds(source,'test-only','claude-sonnet-5',async()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:'{"name":"x"'}]})),e=>e.code==='AI_INVALID_OUTPUT');
});

test('provider failures and network timeouts never expose provider messages or keys',async()=>{
 for(const [status,code] of [[429,'AI_BUSY'],[529,'AI_BUSY'],[401,'AI_CONFIGURATION'],[404,'AI_CONFIGURATION'],[400,'AI_DOCUMENT_REJECTED'],[500,'AI_UNAVAILABLE']]){
  await assert.rejects(extractSds(source,'secret-placeholder','claude-sonnet-5',async()=>Response.json({error:{message:'private document text secret-placeholder'}},{status})),e=>e.code===code&&!e.message.includes('secret-placeholder')&&!e.message.includes('private document'));
 }
 await assert.rejects(extractSds(source,'test-only','claude-sonnet-5',async()=>{throw new DOMException('timeout','TimeoutError');}),e=>e.code==='AI_TIMEOUT');
});

test('normalization rejects wrong field types and omits unknown facts without deleting form values',()=>{
 assert.deepEqual(normalizeSdsExtraction({name:'Valid',supplier:' ',first_aid:{eye:'',skin:''},ghs_pictograms:[],signal_word:'',flash_point_c:null,boiling_point_c:0,unrelated:'ignored'}),{name:'Valid',boiling_point_c:0});
 for(const value of [null,[],{name:'x',first_aid:'water'},{name:'x',ppe_required:[9]},{name:{html:'bad'}},{name:'x',flash_point_c:'60'},{name:'x',signal_word:'invented'}]) assert.throws(()=>normalizeSdsExtraction(value),e=>e.code==='AI_INVALID_OUTPUT');
 assert.throws(()=>normalizeSdsExtraction({extraction_notes:'unreadable'}),e=>e.code==='AI_NO_DATA');
});

test('HTML source is rejected before sending to the provider',async()=>{
 let called=false;
 await assert.rejects(extractSds({base64:Buffer.from('<html>Login</html>').toString('base64'),mediaType:'text/html',label:'link'},'test-only','claude-sonnet-5',async()=>{called=true;return ok({name:'wrong'});}),e=>e.code==='UNSUPPORTED_FILE');
 assert.equal(called,false);
});

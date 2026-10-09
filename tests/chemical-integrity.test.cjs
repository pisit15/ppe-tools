const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const {createDb} = require('./chemical-db-fixture.cjs');
process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:4311';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='local-test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-service-secret';
process.env.TOOLS_SESSION_SECRET='local-test-session-secret';
const cache=new Map();
function load(file) {
 const filename=path.join(__dirname,'..',file);if(cache.has(filename))return cache.get(filename).exports;
 const m=new Module(filename,module);m.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(filename,m);
 const native=m.require.bind(m);m.require=p=>p.startsWith('@/')?load('src/'+p.slice(2)+'.ts'):p.startsWith('.')&&fs.existsSync(path.resolve(path.dirname(filename),p)+'.ts')?load(path.relative(path.join(__dirname,'..'),path.resolve(path.dirname(filename),p)+'.ts')):native(p);
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);return m.exports;
}
const {sdsState,matchesQuality}=load('src/lib/chemical/data-quality.ts');
const {sanitizeSubstance}=load('src/lib/chemical/sanitize.ts');
const {assertCompany,issueToolsSession,verifyToolsSession}=load('src/lib/toolsSession.ts');
test('SDS completeness and policy are separate, including Bangkok midnight and leap day',()=>{
 const s={sds_url:'https://example.com/sds.pdf',sds_file_path:null,sds_revision_date:'2024-02-29'};
 assert.equal(sdsState({...s,sds_url:null}), 'missing_sds');
 assert.equal(sdsState({...s,sds_revision_date:null}), 'missing_date');
 assert.equal(sdsState({...s,sds_revision_date:'2025-02-30'}), 'missing_date');
 assert.equal(sdsState(s), 'no_policy');
 const p={sds_review_years:1,sds_review_policy:'Annual'};
 assert.equal(sdsState(s,p,new Date('2025-02-27T16:59:59Z')),'current');
 assert.equal(sdsState(s,p,new Date('2025-02-27T17:00:00Z')),'due');
 assert.equal(matchesQuality({...s,review_status:'unreviewed'},'unreviewed'),true);
});
test('company authorization rejects all, foreign company, empty and path injection for nonadmin',()=>{
 const user={companyId:'amt',isAdmin:false};
 for(const id of ['all','aab','','../amt','admin']) assert.throws(()=>assertCompany(user,id));
 assert.doesNotThrow(()=>assertCompany(user,'amt',true));
 assert.throws(()=>assertCompany({isAdmin:true},'all',true));
 assert.doesNotThrow(()=>assertCompany({isAdmin:true},'aab',true));
});
test('signed sessions reject tampered identities and expired tokens',()=>{
 const token=issueToolsSession({id:'123',username:'test',company_id:'amt',password:'hash'},'company_users');
 assert.equal(verifyToolsSession(token).companyId,'amt');
 assert.equal(verifyToolsSession(token+'x'),null);
 assert.equal(verifyToolsSession('invalid'),null);
 const realNow=Date.now;Date.now=()=>realNow()+13*3600000;
 try{assert.equal(verifyToolsSession(token),null);}finally{Date.now=realNow;}
});
test('partial edits preserve omitted fields and cannot mass-assign ownership, review or system fields',()=>{
 assert.deepEqual(sanitizeSubstance({name:'Changed',company_id:'aab',id:'spoof',reviewed_by:'spoof',is_demo:true,is_active:false,sds_import:{username:'spoof'}}),{name:'Changed'});
 assert.deepEqual(sanitizeSubstance({quantity:'',first_aid:{eye:'water'},ghs_pictograms:['GHS05',3]}),{quantity:null,first_aid:{eye:'water'},ghs_pictograms:['GHS05']});
});

test('SDS upload receipts require complete identity, matching company and immutable service access',async()=>{
 const db=await createDb();
 try {
  const importer={actor_id:'test-id',account_table:'company_users',username:'audit-amt',display_name:'Audit user',imported_at:'2026-10-09T10:00:00Z',method:'file'};
  assert.equal((await db.query('select count(*)::int as n from chem_substances where sds_import is not null')).rows[0].n,0);
  await assert.rejects(db.query("insert into chem_sds_uploads(path,company_id,importer) values ('aab/file.pdf','amt',$1)",[JSON.stringify(importer)]),/check constraint/);
  await assert.rejects(db.query("insert into chem_sds_uploads(path,company_id,importer) values ('amt/file.pdf','amt',$1)",[JSON.stringify({...importer,account_table:null})]),/check constraint/);
  await assert.rejects(db.query("update chem_substances set sds_import='{}'"),/check constraint/);
  for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from chem_sds_uploads'),/permission denied/);
   await assert.rejects(db.query("insert into chem_sds_uploads(path,company_id,importer) values ('amt/file.pdf','amt',$1)",[JSON.stringify(importer)]),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query("insert into chem_sds_uploads(path,company_id,importer) values ('amt/file.pdf','amt',$1)",[JSON.stringify(importer)]);
  assert.equal((await db.query('select importer from chem_sds_uploads')).rows[0].importer.username,'audit-amt');
  await assert.rejects(db.query('delete from chem_sds_uploads'),/permission denied/);
  await assert.rejects(db.query("update chem_sds_uploads set importer='{}'"),/permission denied/);
 }finally{await db.close();}
});
test('migration enforces company relation, review metadata, policy and direct-access denial',async()=>{
 const db=await createDb();
 try {
  await assert.rejects(db.query("insert into chem_substances(company_id,name,storage_area_id) values ('amt','Wrong area','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')"),/foreign key/);
  await assert.rejects(db.query("insert into chem_substances(company_id,name,review_status) values ('amt','Missing reviewer','reviewed')"),/check constraint/);
  await assert.rejects(db.query("insert into chem_company_settings(company_id,sds_review_years) values ('invalid',5)"),/check constraint/);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from chem_substances'),/permission denied/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query("insert into chem_substances(company_id,name) values ('amt','Unauthorized')"),/permission denied/);
  await db.exec('reset role; set role service_role');
  assert.ok((await db.query('select * from chem_substances')).rows.length>0);
 }finally{await db.close();}
});

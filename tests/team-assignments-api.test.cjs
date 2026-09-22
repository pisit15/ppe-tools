const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {blankProfile}=require('../src/lib/team-management.ts');const {assignmentsFor}=require('../src/lib/team-assignments.ts');
const {NextRequest,NextResponse}=require('next/server');
const id='30000000-0000-4000-8000-000000000001';
const member={id,full_name:'Test',nick_name:'',company_id:'amt',position:'Manager',bu:'',department:'',responsibility:'',phone:'',email:'',employment_type:'permanent',is_active:true,is_she_team:true};
let allowed=true,writes=0,dbReads=0;
const db={from(table){dbReads++;return {select(){return Promise.resolve({data:table==='company_settings'?[{company_id:'amt'},{company_id:'ea-kabin'}]:[],error:null});}};},async rpc(name,args){writes++;assert.equal(name,'save_team_member');return {data:{...args.p_profile,revision:1},error:null};}};
const file=path.join(__dirname,'../src/app/api/superadmin/team/management/route.ts');const loaded=new Module(file,module);loaded.filename=file;loaded.paths=module.paths;
loaded.require=name=>name==='@/lib/superAdminGuard'?{requireSuperAdmin:async()=>allowed?{ok:true,session:{username:'qa'}}:{ok:false,response:NextResponse.json({error:'Unauthorized'},{status:401})},saError:()=>NextResponse.json({error:'Unexpected'},{status:500})}:name==='@/lib/supabase'?{getSupabaseServer:()=>db}:name.startsWith('@/lib/')?require('../src/lib/'+name.slice(6)+'.ts'):require(name);
loaded._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {POST,GET}=loaded.exports;
const profile=()=>({...blankProfile(member),assignment_version:1,assignments:assignmentsFor(member)});
const request=(body,origin='http://localhost:3110')=>new NextRequest('http://localhost:3110/api/superadmin/team/management',{method:'POST',headers:{origin,host:'localhost:3110'},body:JSON.stringify(body)});
test('team endpoint rejects unauthenticated requests before accessing personnel data',async()=>{
  allowed=false;const before=dbReads;assert.equal((await POST(request({action:'member',member,profile:profile()}))).status,401);
  assert.equal((await GET(new NextRequest('http://localhost:3110/api/superadmin/team/management'))).status,401);
  assert.equal(dbReads,before);allowed=true;
});
test('team endpoint rejects cross-origin writes',async()=>{
  assert.equal((await POST(request({action:'member',member,profile:profile()},'https://untrusted.example'))).status,403);assert.equal(writes,0);
});
test('team endpoint validates acting details and role references before RPC',async()=>{
  const p=profile();p.assignments.push({...p.assignments[0],id:'30000000-0000-4000-8000-000000000002',company_id:'ea-kabin',kind:'acting',start_date:'2026-01-01',direct_manager:'missing'});
  const response=await POST(request({action:'member',member,profile:p}));assert.equal(response.status,400);assert.match((await response.json()).error,/ผู้บังคับบัญชา/);assert.equal(writes,0);
});
test('team endpoint passes a valid multi-company profile into the atomic save',async()=>{
  const p=profile();p.assignments.push({...p.assignments[0],id:'30000000-0000-4000-8000-000000000002',company_id:'ea-kabin',kind:'acting',start_date:'2026-01-01'});p.company_ids.push('ea-kabin');
  const response=await POST(request({action:'member',member,profile:p}));assert.equal(response.status,200);assert.equal((await response.json()).data.assignments.length,2);assert.equal(writes,1);assert.equal(response.headers.get('cache-control'),'private, no-store');
});

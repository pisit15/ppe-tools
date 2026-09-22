const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {blankProfile}=require('../src/lib/team-management.ts');
const {assignmentsFor,assignmentNodes,assignmentState,validateAssignments,withAssignments}=require('../src/lib/team-assignments.ts');
const {buildOrgChart}=require('../src/lib/team-org-chart.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const member=(n,company)=>({id:id(n),full_name:`QA ${n}`,nick_name:'',company_id:company,position:'Manager',bu:'',department:'',responsibility:'',phone:'',email:'',employment_type:'permanent',is_active:true,is_she_team:true});
const companies=['amt','ea-kabin','esm','ebi','esp'];
function fixture(){
  const manager=member(1,'amt');const staff=companies.slice(1).map((c,i)=>member(i+2,c));const people=[manager,...staff];
  const profile={...blankProfile(manager),assignment_version:1,assignments:assignmentsFor(manager)};
  profile.assignments.push(...companies.slice(1).map((c,i)=>({id:id(20+i),company_id:c,position:'Acting HSE Manager',kind:'acting',start_date:'2026-01-01',end_date:'2026-12-31',direct_manager:'',functional_manager:'',x:null,y:null})));
  const profiles=[profile,...staff.map((p,i)=>({...blankProfile(p),assignment_version:1,assignments:[{...assignmentsFor(p)[0],direct_manager:id(20+i)}]}))];
  return {manager,staff,people,profile,profiles};
}
test('one person with four acting companies becomes five roles but one personnel identity',()=>{
  const f=fixture();assert.equal(validateAssignments(f.manager,f.profile,f.people,f.profiles,companies),null);
  const graph=assignmentNodes(f.people,new Map(f.profiles.map(p=>[p.person_id,p])));
  assert.equal(graph.nodes.length,9);assert.equal(new Set(graph.nodes.map(n=>n.person_id)).size,5);
  assert.equal(graph.nodes.filter(n=>n.person_id===f.manager.id).length,5);
  for(const company of companies.slice(1)){
    const nodes=graph.nodes.filter(n=>n.company_id===company);const chart=buildOrgChart(nodes,graph.profiles,'both');
    assert.equal(nodes.length,2);assert.equal(chart.edges.length,1);assert.equal(chart.hidden.length,0);
    const manager=nodes.find(n=>n.assignment.kind==='acting');assert.equal(manager.primary_company_id,'amt');
    assert.equal(chart.edges[0].from,manager.id);
  }
});
test('legacy multi-company responsibility does not invent acting appointments or retarget reporting',()=>{
  const p=member(1,'amt'),child=member(2,'ea-kabin');const profile={...blankProfile(p),company_ids:['amt','ea-kabin']};
  assert.equal(assignmentsFor(p,profile).length,1);
  const graph=assignmentNodes([p,child],new Map([[p.id,profile],[child.id,{...blankProfile(child),direct_manager:p.id}]]));
  assert.equal(buildOrgChart(graph.nodes,graph.profiles,'both').edges[0].from,p.id);
});
test('assignment periods include both boundaries and never remove stored reporting references',()=>{
  const f=fixture();const a=f.profile.assignments[1];
  assert.equal(assignmentState(a,'2025-12-31'),'upcoming');assert.equal(assignmentState(a,'2026-01-01'),'active');
  assert.equal(assignmentState(a,'2026-12-31'),'active');assert.equal(assignmentState(a,'2027-01-01'),'ended');
  const graph=assignmentNodes(f.people,new Map(f.profiles.map(p=>[p.person_id,p])));
  const active=graph.nodes.filter(n=>assignmentState(n.assignment,'2027-01-01')==='active');
  const chart=buildOrgChart(active,graph.profiles,'both');assert.equal(chart.edges.length,0);assert.equal(chart.hidden.length,4);
  assert.equal(graph.profiles.get(f.staff[0].id).direct_manager,a.id);
});
test('unknown supervisor roles, self-reporting across roles, duplicates and malformed dates fail',()=>{
  for(const patch of [{direct_manager:id(999)},{direct_manager:id(20)},{id:id(1)},{start_date:'2026-02-30'},{end_date:'2025-12-31'},{company_id:'unknown'},{position:''}]){
    const f=fixture();const next=structuredClone(f.profile);Object.assign(next.assignments[1],patch);
    assert.ok(validateAssignments(f.manager,next,f.people,f.profiles,companies),JSON.stringify(patch));
  }
});
test('cycles are checked by role and separately for direct and functional reporting',()=>{
  const f=fixture();const next=structuredClone(f.profile);next.assignments[1].direct_manager=f.staff[0].id;
  assert.match(validateAssignments(f.manager,next,f.people,f.profiles,companies),/วนกลับ/);
  next.assignments[1].direct_manager='';next.assignments[1].functional_manager=f.staff[0].id;
  assert.equal(validateAssignments(f.manager,next,f.people,f.profiles,companies),null);
  const other=structuredClone(f.profiles);other[1].assignments[0].functional_manager=id(20);
  assert.match(validateAssignments(f.manager,next,f.people,other,companies),/วนกลับ/);
});
test('saved roles cannot be removed, moved to another company, or retyped; ending preserves identity',()=>{
  for(const change of [p=>p.assignments.pop(),p=>p.assignments[1].company_id='esm',p=>p.assignments[1].kind='additional']){
    const f=fixture(),next=structuredClone(f.profile);change(next);assert.ok(validateAssignments(f.manager,next,f.people,f.profiles,companies));
  }
  const f=fixture(),next=structuredClone(f.profile);next.assignments[1].end_date='2026-09-22';
  assert.equal(validateAssignments(f.manager,next,f.people,f.profiles,companies),null);
  assert.match(validateAssignments(f.manager,blankProfile(f.manager),f.people,f.profiles,companies),/โหลดหน้าใหม่/);
});
test('appointments cannot reuse another personnel identity or overlap the same role',()=>{
  const f=fixture(),next=structuredClone(f.profile);
  next.assignments.push({...next.assignments[1],id:id(88)});
  assert.match(validateAssignments(f.manager,next,f.people,f.profiles,companies),/ซ้อนช่วงเวลา/);
  next.assignments.at(-1).start_date='2027-01-01';next.assignments.at(-1).end_date='';
  assert.equal(validateAssignments(f.manager,next,f.people,f.profiles,companies),null);
  next.assignments.at(-1).id=f.staff[0].id;
  assert.match(validateAssignments(f.manager,next,f.people,f.profiles,companies),/บุคคลอื่น/);
});
test('role-specific coordinates and legacy manager compatibility survive normalization',()=>{
  const f=fixture(),map=new Map(f.profiles.map(p=>[p.person_id,p]));
  const role=structuredClone(f.profiles[1].assignments);role[0].x=240;role[0].y=320;
  const profile=withAssignments(f.staff[0],f.profiles[1],role,f.people,map);
  assert.equal(profile.direct_manager,f.manager.id);assert.equal(profile.assignments[0].direct_manager,id(20));
  assert.equal(profile.x,240);assert.equal(profile.assignments[0].y,320);
  const draft=withAssignments(f.manager,f.profile,[...f.profile.assignments,{...f.profile.assignments[1],id:id(77),company_id:''}],f.people,map);
  assert.ok(!draft.company_ids.includes(''));
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {buildOrgChart,connectorPath}=require('../src/lib/team-org-chart.ts');
const {blankProfile}=require('../src/lib/team-management.ts');
const people=['manager','child','advisor'].map(id=>({id,full_name:id,company_id:'aab',is_active:true,is_she_team:true}));
const profiles=new Map(people.map(p=>[p.id,{...blankProfile(p),...(p.id==='child'?{direct_manager:'manager',functional_manager:'advisor'}:{})}]));
test('both lines are present by default mode even when direct and functional managers differ',()=>{
  const c=buildOrgChart(people,profiles,'both');
  assert.deepEqual(c.edges.map(e=>e.type),['direct_manager','functional_manager']);
  assert.ok(c.points.child.y>c.points.manager.y+104);
  assert.equal(c.groups[0].id,'aab');
  assert.equal(buildOrgChart(people,profiles,'direct_manager').edges.length,1);
});
test('filtered managers are reported and never replaced by invented connections',()=>{
  const c=buildOrgChart(people.slice(1),profiles,'both');
  assert.equal(c.hidden.length,1);assert.equal(c.edges.length,1);
  assert.equal(c.edges[0].from,'advisor');
});
test('automatic cards do not overlap and manual backwards lines take an outside route',()=>{
  const many=Array.from({length:14},(_,i)=>({...people[0],id:`p${i}`}));
  const c=buildOrgChart(many,new Map(),'both');const values=Object.values(c.points);
  for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++)assert.ok(Math.abs(values[i].x-values[j].x)>=260||Math.abs(values[i].y-values[j].y)>=104);
  assert.ok(connectorPath({x:10,y:400},{x:10,y:200}).includes('H 288'));
});

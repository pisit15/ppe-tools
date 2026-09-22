const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {buildOrgChart,connectorPath,reportingNetwork,escapeSvg,NODE_WIDTH,NODE_HEIGHT}=require('../src/lib/team-org-chart.ts');
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

test('functional-only relationships establish a hierarchy in the combined view',()=>{
  const functional=new Map(people.map(p=>[p.id,{...blankProfile(p),functional_manager:p.id==='child'?'manager':''}]));
  const c=buildOrgChart(people,functional,'both');
  assert.ok(c.points.child.y>c.points.manager.y+NODE_HEIGHT);
  assert.equal(c.edges[0].type,'functional_manager');
});
test('automatic cards do not overlap and manual backwards lines take an outside route',()=>{
  const many=Array.from({length:14},(_,i)=>({...people[0],id:`p${i}`}));
  const c=buildOrgChart(many,new Map(),'both');const values=Object.values(c.points);
  for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++)assert.ok(Math.abs(values[i].x-values[j].x)>=NODE_WIDTH||Math.abs(values[i].y-values[j].y)>=NODE_HEIGHT);
  assert.ok(connectorPath({x:10,y:400},{x:10,y:200}).includes(`H ${10+NODE_WIDTH+18}`));
  assert.ok(c.width < 1100, 'unrelated people wrap into readable shelves');
});

test('independent trees remain compact, deterministic, and place managers above their children',()=>{
  const many=Array.from({length:34},(_,i)=>({...people[0],id:`p${i}`,full_name:`Person ${i}`,company_id:`company-${i%14}`}));
  const records=new Map(many.map((p,i)=>[p.id,{...blankProfile(p),direct_manager:i>0&&i<6?`p${i-1}`:''}]));
  const c=buildOrgChart(many,records,'both');
  assert.equal(Object.keys(c.points).length,34);
  assert.ok(c.width<1100);
  assert.deepEqual(c.points,buildOrgChart([...many].reverse(),records,'both').points);
  for(const e of c.edges)assert.ok(c.points[e.to].y>c.points[e.from].y+NODE_HEIGHT);
  const values=Object.values(c.points);
  for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++)assert.ok(Math.abs(values[i].x-values[j].x)>=NODE_WIDTH||Math.abs(values[i].y-values[j].y)>=NODE_HEIGHT);
});

test('legacy cycles do not hang or remove people; focus includes both reporting chains',()=>{
  const cycle=new Map(people.map((p,i)=>[p.id,{...blankProfile(p),direct_manager:people[(i+1)%people.length].id}]));
  const c=buildOrgChart(people,cycle,'both');
  assert.equal(Object.keys(c.points).length,3); assert.equal(c.edges.length,3);
  assert.equal(reportingNetwork('child',people,profiles,'both').size,3);
  assert.equal(reportingNetwork('child',people,profiles,'direct_manager').size,2);
  assert.equal(escapeSvg('<script>"&'), '&lt;script&gt;&quot;&amp;');
});

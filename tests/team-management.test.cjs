const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');
const path=require('node:path');
const source=path.join(__dirname,'../src/lib/team-management.ts');
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const loaded=new Module(source,module);loaded._compile(compiled,source);
const {WEIGHTS,scoreReview,proposedGrade,validateReview,validateProfile,blankProfile,licenseStatus,parseRoster}=loaded.exports;
const person=id=>({id,full_name:id,company_id:'aab',is_active:true,is_she_team:true});
test('all family weights reconcile to 100 and weighted score matches independent F2 example',()=>{
  for(const weights of Object.values(WEIGHTS))assert.equal(weights.reduce((a,b)=>a+b,0),100);
  assert.equal(scoreReview([4,4,3,5],WEIGHTS.F2),3.95);
});
test('missing, zero, out-of-range scores and invalid weights cannot produce a grade',()=>{
  for(const scores of [[null,4,3,5],[0,4,3,5],[6,4,3,5],[NaN,4,3,5]])assert.equal(scoreReview(scores,WEIGHTS.F2),null);
  assert.equal(scoreReview([3,3,3,3],[30,30,30,30]),null);
  assert.equal(proposedGrade(null),'');
  assert.equal(proposedGrade(4.499),'B');assert.equal(proposedGrade(4.5),'A');
});
test('review workflow requires all evidence and a reason for adjusted grade',()=>{
  const r={person_id:'a',cycle:'2026',family:'F2',weights:WEIGHTS.F2,scores:[4,4,3,5],evidence:['a','b','c','d'],reviewer:'Reviewer',state:'calibration',final_grade:'',adjustment_reason:''};
  assert.equal(validateReview(r),null);
  assert.match(validateReview({...r,evidence:['a','','c','d']}),/หลักฐาน/);
  assert.match(validateReview({...r,state:'final'}),/เกรดสุดท้าย/);
  assert.match(validateReview({...r,state:'final',final_grade:'A'}),/เหตุผล/);
  assert.equal(validateReview({...r,state:'final',final_grade:'A',adjustment_reason:'Evidence discussed'}),null);
});
test('reporting graph rejects self references and multi-hop cycles independently by line type',()=>{
  const people=['a','b','c'].map(person);const profiles=people.map(blankProfile);
  profiles[1].direct_manager='c';profiles[2].direct_manager='a';
  assert.match(validateProfile({...profiles[0],direct_manager:'b'},people,profiles),/วน/);
  assert.equal(validateProfile({...profiles[0],functional_manager:'b'},people,profiles),null);
  assert.match(validateProfile({...profiles[0],direct_manager:'a'},people,profiles),/วน/);
});
test('license expiry handles unknown dates, expiry today and 90-day boundary',()=>{
  const l={has_license:true,expiry_date:null};assert.equal(licenseStatus(l,'2026-09-08'),'ไม่ทราบวันหมดอายุ');
  assert.equal(licenseStatus({...l,expiry_date:'2026-09-07'},'2026-09-08'),'หมดอายุ');
  assert.equal(licenseStatus({...l,expiry_date:'2026-09-08'},'2026-09-08'),'ใกล้หมดอายุ');
  assert.equal(licenseStatus({...l,expiry_date:'2026-12-07'},'2026-09-08'),'ใกล้หมดอายุ');
  assert.equal(licenseStatus({...l,expiry_date:'2026-12-08'},'2026-09-08'),'ยังไม่หมดอายุ');
});
test('import ignores summary rows, preserves missing licenses, exposes duplicate matches',()=>{
  const header=['ลำดับ','ชื่อ-นามสกุล','','','','','','','ครอบครัวงาน'];
  const rows=[header,[1,'Same Person','Name','BU','Site','ESN/ESLO','Province','Safety','F2','C',null,'working',''],['','สรุป']];
  const parsed=parseRoster(rows,[{...person('a'),full_name:'Same Person'},{...person('b'),full_name:'SamePerson'}]);
  assert.equal(parsed.length,1);assert.deepEqual(parsed[0].matchedIds,['a','b']);assert.equal(parsed[0].license_claims,'');assert.equal(parsed[0].company_id,'esn');
});

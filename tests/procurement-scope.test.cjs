// Company-only summary rules (src/lib/procurement/scope.ts), compiled on the fly.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const src=fs.readFileSync(path.join(__dirname,'..','src/lib/procurement/scope.ts'),'utf8');
const m={exports:{}};new Function('module','exports',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const {unitSite,prSites,canSee}=m.exports;

test('operating unit decides the site; shared units fall back to the requester',()=>{
  assert.equal(unitSite('[D8_SF00] AMT : Safety : MB9','Amita Technology (Thailand) Co.,Ltd.'),'amt');
  assert.equal(unitSite('[EW_HNM] ESM : EA Wind: Hanuman : M99','Energy Solution Management Company Limited'),'hnm');
  assert.equal(unitSite('[ES_ESLO] ESLO : EA Solar : M99','EA Solar Company Limited'),'eslo');
  assert.equal(unitSite('[ES_ESL] ESM : EA Solar: ESL Unit : M99','x'),'esl');
  assert.equal(unitSite('[ZZ_ZZZZ] SWM : Center : M99','Smart Waste Management Co., Ltd.'),'swm');
  assert.equal(unitSite('[D0_SF00] HO : Safety : M99','Energy Solution Management Company Limited'),null);
  const req=new Map([['Napalai Yooyangget',['esp']]]);
  assert.deepEqual(prSites({operating_unit:'[D0_SF00] HO','company':'ESM',requester:'Napalai Yooyangget'},req),['esp']);
  assert.deepEqual(prSites({operating_unit:'[D0_SF00] HO','company':'ESM',requester:'Nobody'},req),[]);
});

test('summary includes responsible companies only, with no own-requester exception',()=>{
  const amt={all:false,sites:['amt'],requester:'Narakorn Lunthat'};
  assert.equal(canSee(amt,['amt']),true);
  assert.equal(canSee(amt,['aab']),false);
  // Even a legacy caller passing the matching requester must not broaden the summary.
  assert.equal(canSee(amt,['aab'],'Narakorn Lunthat'),false);
  assert.equal(canSee(amt,[],'Narakorn Lunthat'),false);
  assert.equal(canSee(amt,[]),false);
  assert.equal(canSee({all:false,sites:[]},['amt']),false);
  assert.equal(canSee({all:false,sites:['amt','aab']},['aab']),true);
  assert.equal(canSee({all:false,sites:['amt']},['aab','amt']),true);
  assert.equal(canSee({all:true,sites:[]},[]),true);
  assert.equal(canSee({all:true,sites:[]},['aab']),true);
});

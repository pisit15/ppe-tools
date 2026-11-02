const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const output=ts.transpileModule(fs.readFileSync('src/lib/first-aid/public-path.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const ctx={exports:{}};vm.runInNewContext(output,ctx);const allows=ctx.exports.isPublicFirstAidPath;
test('QR public paths remain usable with unrelated requester sessions without exposing staff routes',()=>{
 const token='a'.repeat(64);assert.equal(allows('/first-aid/take/'+token),true);assert.equal(allows('/api/first-aid/public/'+token),true);
 for(const path of ['/first-aid','/api/first-aid/state','/api/first-aid/manage','/api/first-aid/transactions','/api/first-aid/public/'+token+'/history','/first-aid/take/guess','/first-aid/take/'+token+'/admin'])assert.equal(allows(path),false,path);
});

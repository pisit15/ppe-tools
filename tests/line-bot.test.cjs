const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {verifyLineSignature}=require('../src/lib/line/signature.ts');
const {parseCommand}=require('../src/lib/line/commands.ts');
const {computeCompanyStats,formatIncidentStats,isRecordable,isLtiCase}=require('../src/lib/line/incidentStats.ts');
const {formatSummary,formatLow,formatSearch,formatCompanyOverview,isLow}=require('../src/lib/line/ppeFormat.ts');

test('signature: accepts LINE HMAC of the raw body and rejects anything else',()=>{
  const body='{"events":[]}';const secret='s3cret';
  const sig=crypto.createHmac('sha256',secret).update(body).digest('base64');
  assert.equal(verifyLineSignature(body,sig,secret),true);
  assert.equal(verifyLineSignature(body+' ',sig,secret),false);
  assert.equal(verifyLineSignature(body,sig,'other'),false);
  assert.equal(verifyLineSignature(body,null,secret),false);
  assert.equal(verifyLineSignature(body,'short',secret),false);
});

test('commands: Thai phrases map to the intended command',()=>{
  assert.deepEqual(parseCommand('PPE คงเหลือ'),{kind:'ppe_summary',company:undefined});
  assert.deepEqual(parseCommand('สรุปรายการ PPE คงเหลือ'),{kind:'ppe_summary',company:undefined});
  assert.equal(parseCommand('สรุปสถิติอุบัติเหตุปีปัจจุบัน แยกแผนก').kind,'incident_stats');
  assert.deepEqual(parseCommand('ค้นหา safety shoes'),{kind:'ppe_search',query:'safety shoes'});
  assert.deepEqual(parseCommand('safety shoes'),{kind:'ppe_search',query:'safety shoes'});
  assert.deepEqual(parseCommand('ppe ใกล้หมด'),{kind:'ppe_low',company:undefined});
  assert.deepEqual(parseCommand('PPE ใกล้หมด amt'),{kind:'ppe_low',company:'amt'});
  assert.deepEqual(parseCommand('ใกล้หมด'),{kind:'ppe_low',company:undefined});
  assert.deepEqual(parseCommand('สถิติอุบัติเหตุ'),{kind:'incident_stats',company:undefined});
  assert.deepEqual(parseCommand('สถิติอุบัติเหตุ esl'),{kind:'incident_stats',company:'esl'});
  assert.deepEqual(parseCommand('  ถุงมือ '),{kind:'ppe_search',query:'ถุงมือ'});
  assert.deepEqual(parseCommand('ค้นหา หมวกนิรภัย'),{kind:'ppe_search',query:'หมวกนิรภัย'});
  assert.equal(parseCommand('เมนู').kind,'help');
  assert.equal(parseCommand('').kind,'help');
  assert.equal(parseCommand('ก').kind,'help');
  assert.equal(parseCommand('ยกเลิกการเชื่อม').kind,'unlink');
});

test('incident rules match the dashboard (TRC v2: first aid excluded unless overridden)',()=>{
  assert.equal(isRecordable({incident_type:'บาดเจ็บ - ไม่หยุดงาน',actual_severity:'S1 ปฐมพยาบาล'}),false);
  assert.equal(isRecordable({incident_type:'บาดเจ็บ - ไม่หยุดงาน',actual_severity:'S1',recordable_override:true}),true);
  assert.equal(isRecordable({incident_type:'บาดเจ็บ - ไม่หยุดงาน',actual_severity:'S2'}),true);
  assert.equal(isRecordable({incident_type:'บาดเจ็บ - หยุดงาน',actual_severity:'S1'}),true);
  assert.equal(isLtiCase({incident_type:'บาดเจ็บ - หยุดงาน'}),true);
  assert.equal(isLtiCase({incident_type:'บาดเจ็บ - ไม่หยุดงาน'}),false);
  assert.equal(isLtiCase({incident_type:'เสียชีวิต (Fatality)'}),true);
});

test('incident stats: work-related, year-to-date, per company, rates per 1M hours',()=>{
  const inc=[
    {company_id:'a',incident_type:'บาดเจ็บ - หยุดงาน',work_related:'ใช่',incident_date:'2026-02-10'},
    {company_id:'a',incident_type:'Near Miss',work_related:'ใช่',incident_date:'2026-03-01'},
    {company_id:'a',incident_type:'บาดเจ็บ - ไม่หยุดงาน',actual_severity:'S1',work_related:'ใช่',incident_date:'2026-03-02'},
    {company_id:'a',incident_type:'บาดเจ็บ - หยุดงาน',work_related:'ไม่ใช่',incident_date:'2026-03-03'},
    {company_id:'a',incident_type:'บาดเจ็บ - หยุดงาน',work_related:'ใช่',incident_date:'2026-11-03'},
    {company_id:'b',incident_type:'ทรัพย์สินเสียหาย',work_related:'ใช่',incident_date:'',month:'Jan'},
  ];
  const mh=[{company_id:'a',month:1,employee_manhours:400000,contractor_manhours:100000},{company_id:'a',month:2,employee_manhours:500000,contractor_manhours:0},{company_id:'a',month:12,employee_manhours:999999,contractor_manhours:0}];
  const s=computeCompanyStats(inc,mh,9,{a:'Alpha'});
  const a=s.find(x=>x.companyId==='a');const b=s.find(x=>x.companyId==='b');
  assert.equal(a.total,3);assert.equal(a.recordable,1);assert.equal(a.lti,1);assert.equal(a.firstAid,1);assert.equal(a.nearMiss,1);
  assert.equal(a.manHours,1000000);assert.equal(a.trir,1);assert.equal(a.ltifr,1);
  assert.equal(b.total,1);assert.equal(b.propertyDamage,1);assert.equal(b.trir,null);
  assert.equal(s[0].companyId,'a');
  const many=formatIncidentStats(s,2026,9,false);
  assert.match(many,/รวม 4 เหตุ · TRC 1 · LTI 1/);assert.match(many,/Alpha: 3 \/ 1 \/ 1/);
  const one=formatIncidentStats([a],2026,9,true);
  assert.match(one,/TRIR 1\.00 · LTIFR 1\.00/);assert.match(one,/ม\.ค\.–ต\.ค\./);
});

test('ppe: low/out rules, urgency order, truncation, search and overview',()=>{
  const rows=[
    {company_id:'a',name:'ถุงมือผ้า',unit:'คู่',min_stock:10,current_stock:2},
    {company_id:'a',name:'หมวกนิรภัย',unit:'ใบ',min_stock:5,current_stock:0},
    {company_id:'a',name:'แว่นตา',unit:'อัน',min_stock:5,current_stock:9},
    {company_id:'a',name:'ปลั๊กอุดหู',unit:'คู่',min_stock:0,current_stock:0},
  ];
  assert.equal(isLow(rows[0]),true);assert.equal(isLow(rows[2]),false);assert.equal(isLow(rows[3]),false);
  const sum=formatSummary(rows,'Alpha');
  assert.match(sum,/ทั้งหมด 4 รายการ · หมด 2 · ต่ำกว่าขั้นต่ำ 2/);
  assert.ok(sum.indexOf('หมวกนิรภัย')<sum.indexOf('ถุงมือผ้า'));
  assert.ok(!sum.includes('แว่นตา'));
  assert.match(formatLow(rows,'Alpha'),/\(2 รายการ\)/);
  assert.match(formatSearch(rows,'ถุงมือ','Alpha'),/ถุงมือผ้า: 2 คู่ \(ขั้นต่ำ 10\)/);
  assert.match(formatSearch(rows,'xyz','Alpha'),/ไม่พบ/);
  const big=Array.from({length:40},(_,i)=>({company_id:'a',name:`item${i}`,min_stock:10,current_stock:1}));
  const low=formatLow(big,'Alpha');
  assert.match(low,/และอีก 15 รายการ/);assert.ok(low.length<5000);
  assert.match(formatCompanyOverview([...rows,{company_id:'b',name:'x',min_stock:1,current_stock:0}],{a:'Alpha'}),/Alpha \(a\): 4 \/ 2 \/ 2/);
});

const {summaryCard,lowCard,searchCard,overviewCard,withQuickReply,text}=require('../src/lib/line/flex.ts');
test('flex cards: valid shape, capped rows, small payload, quick reply on last message only',()=>{
  const big=Array.from({length:120},(_,i)=>({company_id:'aab',name:`กระจกป้องกันแสงเชื่อมและสะเก็ดไฟ หน้ากากเชื่อมชนิดสวมหัว เบอร์ ${i}`,unit:'piece',min_stock:100,current_stock:i%3===0?0:i}));
  for(const m of [summaryCard(big,'AAB'),lowCard(big,'AAB'),searchCard(big,'กระจก','AAB'),overviewCard([...big,{company_id:'amt',name:'x',min_stock:1,current_stock:0}],{aab:'AAB'})]){
    assert.equal(m.type,'flex');assert.equal(m.contents.type,'bubble');
    assert.ok(m.altText.length>0&&m.altText.length<=400);
    const size=Buffer.byteLength(JSON.stringify(m));
    assert.ok(size<25000,`bubble too large: ${size}`);
  }
  const low=lowCard(big,'AAB');
  const rows=low.contents.body.contents.filter(c=>c.type==='box');
  assert.equal(rows.length,10);
  assert.match(JSON.stringify(low.contents.footer),/และอีก 96 รายการ/);
  assert.equal(searchCard(big,'ไม่มีแน่นอน','AAB').type,'text');
  const empty=summaryCard([],'AAB');assert.match(JSON.stringify(empty),/ยังไม่มีรายการ PPE/);
  const ok=lowCard([{company_id:'a',name:'x',min_stock:1,current_stock:5}],'A');assert.match(JSON.stringify(ok),/ไม่มีรายการ/);
  const q=withQuickReply([text('a'),text('b')]);
  assert.equal(q[0].quickReply,undefined);assert.equal(q[1].quickReply.items.length,5);
  for(const it of q[1].quickReply.items) assert.ok(it.action.label.length<=20);
});

test('flex fallback turns cards into text and keeps quick replies',()=>{
  const {textFallback,lowCard,withQuickReply}=require('../src/lib/line/flex.ts');
  const msgs=withQuickReply([lowCard([{company_id:'a',name:'x',min_stock:5,current_stock:0}],'A')]);
  const fb=textFallback(msgs);
  assert.equal(fb[0].type,'text');assert.match(fb[0].text,/PPE ใกล้หมด A: 1 รายการ/);assert.ok(fb[0].quickReply);
});

test('browse: categories, paged carousel, item detail, postback round-trip and rejection',()=>{
  const {categoryCard,listCarousel,itemCard,companyPickerCard,encodePostback,decodePostback,PAGE_ROWS,PAGE_BUBBLES}=require('../src/lib/line/browse.ts');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const rows=[
    ...Array.from({length:108},(_,i)=>({product_id:id(i),company_id:'amt',name:`อุปกรณ์อื่น ๆ ที่มีชื่อยาวพอสมควรเพื่อทดสอบการตัดบรรทัด รุ่น ${i}`,type:'others',unit:'piece',min_stock:10,current_stock:i%5})),
    {product_id:id(900),company_id:'amt',name:'ถุงมือผ้า',type:'gloves',unit:'pair',min_stock:10,current_stock:0},
    {product_id:id(901),company_id:'amt',name:'ถุงมือหนัง',type:'gloves',unit:'pair',min_stock:0,current_stock:4},
  ];
  const cats=categoryCard(rows,'amt','AMT');
  const cs=JSON.stringify(cats);
  assert.match(cs,/ถุงมือ/);assert.match(cs,/อื่น ๆ/);assert.ok(cs.indexOf('ถุงมือ')<cs.indexOf('อื่น ๆ'));
  assert.match(cs,/หมด 1/);
  const p0=listCarousel(rows,'amt','AMT','others',0);
  assert.equal(p0.contents.type,'carousel');assert.equal(p0.contents.contents.length,PAGE_BUBBLES);
  const size=Buffer.byteLength(JSON.stringify(p0));assert.ok(size<40000,`carousel too large: ${size}`);
  assert.match(JSON.stringify(p0),/หน้าถัดไป/);
  const p2=listCarousel(rows,'amt','AMT','others',2);
  assert.match(JSON.stringify(p2),/หน้า 3 \/ 3/);assert.doesNotMatch(JSON.stringify(p2),/หน้าถัดไป/);
  const g=listCarousel(rows,'amt','AMT','gloves',0);
  assert.equal(g.contents.contents.length,1);
  const first=g.contents.contents[0].body.contents[1];
  assert.equal(first.action.type,'postback');
  assert.deepEqual(decodePostback(first.action.data),{a:'item',c:'amt',id:id(900)});
  const item=itemCard(rows[108],'amt','AMT',{transaction_type:'stock_out',quantity:3,transaction_date:'2026-09-15'});
  const is=JSON.stringify(item);assert.match(is,/คู่/);assert.match(is,/เบิก 3 · 15 ก\.ย\. 2569/);assert.match(is,/หมด/);
  assert.match(JSON.stringify(itemCard(rows[109],'amt','AMT',null)),/ไม่ได้ตั้ง/);
  assert.deepEqual(decodePostback(encodePostback({a:'list',c:'amt',t:'gloves',p:1})),{a:'list',c:'amt',t:'gloves',p:1});
  assert.equal(decodePostback('a=item&c=amt&id=not-a-uuid'),null);
  assert.equal(decodePostback("a=list&c=amt';drop&t=x&p=0"),null);
  assert.equal(decodePostback('a=list&c=amt&t=gloves&p=-1'),null);
  assert.equal(decodePostback('a=other&c=amt'),null);
  assert.match(JSON.stringify(companyPickerCard(rows,{amt:'AMT'})),/AMT/);
  for(const m of [cats,p0,item]) for(const s of JSON.stringify(m).matchAll(/"label":"([^"]*)"/g)) assert.ok([...s[1]].length<=20,`label too long: ${s[1]}`);
});

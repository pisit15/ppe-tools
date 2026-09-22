// Local browser QA only. Every API response is synthetic; no cookies reach the dev server.
const http = require('node:http');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m,file) => m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {blankProfile}=require('../../src/lib/team-management.ts');
const {assignmentsFor,validateAssignments}=require('../../src/lib/team-assignments.ts');
const uid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const companies=['aab','amt','ea-hq','ea-kabin','ebi','esl','eslo','esm','esn','esp','ewhk','gtr','hnm','wmp'].map(id=>({company_id:id,company_name:id.toUpperCase().replace('EA-','EA ')}));
const names=['กิตติ วิริยะกุล','ณัฐชา พัฒนกิจ','วรินทร์ ธนาภรณ์','สุภาวดี ชาญกิจ','ธีรภัทร วงศ์ไพบูลย์','ปรียา ศิริวัฒนา','ชยุตม์ พรประเสริฐ','ธนพร อมรวิทย์','วรพจน์ ศรีสกุล','กานต์พิชชา วิริยะ','สราวุธ พิพัฒน์','มนัสวี เจริญผล','พรทิพย์ รัตนกุล','ณัฐวุฒิ วิชัย','อภิญญา ธนโชติ','ภัทรพล ศิริพงศ์','จิราพร ชัยวัฒน์'];
const people=Array.from({length:34},(_,i)=>({id:uid(i+1),full_name:names[i%names.length]+(i>=names.length?' (ทดสอบ)':''),nick_name:'',company_id:companies[Math.floor(i/3)%companies.length].company_id,position:['HSE Manager','เจ้าหน้าที่ความปลอดภัยวิชาชีพ','วิศวกรสิ่งแวดล้อม','ISO / DCC Officer'][i%4],bu:'',department:'SHE',responsibility:'',phone:'',email:'',is_active:true,is_she_team:true,employment_type:'permanent',updated_at:'2026-09-22T00:00:00.000Z'}));
// // Include a large company to catch excessive overview card height.
let companyOffset=0;
[2,3,2,12,5,1,1,1,1,1,1,2,1,1].forEach((count,index)=>{for(let n=0;n<count;n++)people[companyOffset++].company_id=companies[index].company_id;});
const profiles=people.map((p,i)=>({...blankProfile(p),teams:i%4===3?['ISO','DCC']:['SHE'],direct_manager:[1,2,4,5].includes(i)?uid(i<3?1:4):'',functional_manager:i===2?uid(7):'',company_ids:i===6?[p.company_id,'aab']:[p.company_id]}));
profiles[2].assignment_version=1;
profiles[2].assignments=[...assignmentsFor(people[2],profiles[2]),...['ea-kabin','esm','ebi'].map((company_id,i)=>({id:uid(100+i),company_id,position:'ผู้จัดการ HSE (ทดสอบ)',kind:'acting',start_date:'2026-01-01',end_date:'2026-12-31',direct_manager:people[0].id,functional_manager:'',x:null,y:null}))];
profiles[2].company_ids=['amt','ea-kabin','esm','ebi'];
profiles[7].assignment_version=1;
profiles[7].assignments=[{...assignmentsFor(people[7],profiles[7])[0],direct_manager:uid(100)}];
let writes=0, failNext=false;
const respond=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3111');
  if(url.pathname==='/__qa/state')return respond(res,{writes,positions:profiles.filter(p=>p.x!=null).map(p=>({id:p.person_id,x:p.x,y:p.y})),assignments:profiles.filter(p=>p.assignments).map(p=>({person_id:p.person_id,roles:p.assignments}))});
  if(url.pathname==='/__qa/fail-next'){failNext=true;return respond(res,{ok:true});}
  if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/superadmin/auth/me')return respond(res,{user:{username:'qa',displayName:'บัญชีทดสอบ',role:'super_admin',lastLoginAt:null}});
    if(url.pathname==='/api/superadmin/team/management'){
      if(req.method==='POST'){
        let raw='';for await(const chunk of req)raw+=chunk;
        const data=JSON.parse(raw);if(failNext){failNext=false;return respond(res,{error:'จำลองการบันทึกล้มเหลว'},503);}
        if(data.action==='member'){
          const index=profiles.findIndex(p=>p.person_id===data.profile.person_id);
          const error=validateAssignments(data.member,data.profile,people,profiles,companies.map(c=>c.company_id));
          if(error)return respond(res,{error},400);
          if(index>=0){if(data.profile.revision!==profiles[index].revision||data.member.updated_at!==people[index].updated_at)return respond(res,{error:'ข้อมูลถูกแก้ไขจากหน้าต่างอื่น'},409);profiles[index]={...data.profile,revision:profiles[index].revision+1};people[index]={...data.member,updated_at:new Date().toISOString()};writes++;}
        }
        return respond(res,{success:true});
      }
      return respond(res,{people,profiles,companies,reviews:[],users:[],licenses:[]});
    }
    return respond(res,{error:'Unknown fixture API'},404);
  }
  const headers={...req.headers,host:'127.0.0.1:3110'};delete headers.cookie;delete headers.authorization;
  const upstream=http.request({hostname:'127.0.0.1',port:3110,path:req.url,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  upstream.on('error',()=>respond(res,{error:'Start dev server on 3110'},502));req.pipe(upstream);
}).listen(3111,'127.0.0.1',()=>console.log('Org chart QA: http://127.0.0.1:3111/superadmin/team/org-chart'));

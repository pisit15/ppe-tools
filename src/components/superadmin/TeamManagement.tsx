'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSuperAdmin } from './SuperAdminShell';
import { Button, Card, Field, Modal, PageHeader, Spinner, inputClass, saFetch } from './ui';
import { FAMILIES, WEIGHTS, STATUS, blankProfile, licenseStatus, parseRoster, proposedGrade, scoreReview, type Family, type ImportRow, type License, type Member, type Profile, type Review } from '@/lib/team-management';
import { assignmentsFor, validateAssignments, withAssignments } from '@/lib/team-assignments';
import AssignmentEditor from './AssignmentEditor';

type Data = { people: Member[]; profiles: Profile[]; reviews: Review[]; companies: {company_id:string;company_name:string}[]; users: {id:string;username:string;display_name:string;company_id:string;source:Profile['user_source']}[]; licenses: License[] };
type View = 'people' | 'org' | 'performance' | 'matrix';
const OrgWorkspace=dynamic(()=>import('./OrgWorkspace'));
const API='/api/superadmin/team/management';
const TABS: [View,string,string][]=[['people','บุคลากร SHE / ISO','/team/manage'],['org','ORG chart','/team/org-chart'],['matrix','License Matrix','/team/license-matrix'],['performance','ผลงานและ IDP','/team/performance']];
const emptyData:Data={people:[],profiles:[],reviews:[],companies:[],users:[],licenses:[]};
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
function cleanMember(p:Member):Member { return {...p,nick_name:p.nick_name||'',position:p.position||'',bu:p.bu||'',department:p.department||'',responsibility:p.responsibility||'',phone:p.phone||'',email:p.email||'',employment_type:p.employment_type||'permanent'}; }
function newMember(company:string):Member { return {id:crypto.randomUUID(),full_name:'',nick_name:'',company_id:company,position:'',bu:'',department:'',responsibility:'',phone:'',email:'',employment_type:'permanent',is_active:true,is_she_team:true}; }

export default function TeamManagement({view}:{view:View}) {
  const {href,user}=useSuperAdmin();
  const [data,setData]=useState<Data>(emptyData);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');const [company,setCompany]=useState('');const [team,setTeam]=useState('');const [activeOnly,setActiveOnly]=useState(true);
  const [includeOutside,setIncludeOutside]=useState(false);
  const [edit,setEdit]=useState<{member:Member;profile:Profile}|null>(null);
  const [memberTab,setMemberTab]=useState<'profile'|'assignments'>('profile');
  const [review,setReview]=useState<Review|null>(null);const [cycle,setCycle]=useState('2026');const [familyFilter,setFamilyFilter]=useState('');
  const [imports,setImports]=useState<ImportRow[]>([]); const [importTarget,setImportTarget]=useState<Record<number,string>>({});
  const load=useCallback(async()=>{setError('');try {const result=await saFetch<Data>(API);setData({...result,people:result.people.map(cleanMember)});}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const profiles=useMemo(()=>new Map(data.profiles.map(p=>[p.person_id,p])),[data.profiles]);
  const profileFor=(p:Member)=>{
    const saved=profiles.get(p.id); if(!saved)return blankProfile(p);
    // Workforce remains the authority for employment status when edited elsewhere.
    return {...saved,status:p.is_active?'working' as const:saved.status==='working'?'inactive' as const:saved.status};
  };
  const filtered=data.people.filter(p=>{
    const pr=profileFor(p);
    if(!includeOutside&&pr.in_scope===false)return false;
    return (!activeOnly||pr.status==='working')&&(!company||pr.company_ids.includes(company))&&(!team||pr.teams.includes(team))&&(!familyFilter||pr.family===familyFilter)&&[p.full_name,p.nick_name,p.company_id,p.position,p.email].join(' ').toLowerCase().includes(search.toLowerCase());
  });
  const saveMember=async(member:Member,profile:Profile)=>saFetch(API,{method:'POST',body:JSON.stringify({action:'member',member,profile})});
  const commitMember=async()=>{if(!edit)return;setBusy(true);setError('');try{
    const profile=withAssignments(edit.member,edit.profile,assignmentsFor(edit.member,edit.profile),data.people,profiles);
    const validation=validateAssignments(edit.member,profile,data.people,data.profiles,data.companies.map(c=>c.company_id));
    if(validation)throw new Error(validation);
    await saveMember(edit.member,profile);setEdit(null);setNotice('บันทึกบุคลากรและการมอบหมายงานแล้ว');await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const commitReview=async()=>{if(!review)return;setBusy(true);setError('');try{await saFetch(API,{method:'POST',body:JSON.stringify({action:'review',review})});setReview(null);setNotice('บันทึกผลการประเมินแล้ว');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const openMember=(member:Member)=>{setError('');setMemberTab(view==='org'?'assignments':'profile');setEdit({member:{...member},profile:structuredClone(profileFor(member))});};
  const openReview=(p:Member)=>{
    const current=data.reviews.find(r=>r.person_id===p.id&&r.cycle===cycle.trim());if(current){setReview(structuredClone(current));return;}
    const family=profileFor(p).family;if(!family){setError('กำหนดกลุ่มงาน F1–F6 ในประวัติบุคคลก่อนเริ่มประเมิน');return;}
    if(!cycle.trim()){setError('กรุณาระบุรอบประเมิน');return;}
    setReview({id:crypto.randomUUID(),person_id:p.id,cycle:cycle.trim(),revision:0,family,weights:[...WEIGHTS[family]],scores:[null,null,null,null],evidence:['','','',''],reviewer:user?.displayName||'',final_grade:'',adjustment_reason:'',goals:'',check_in:'',employee_notes:'',manager_notes:'',idp:'',next_check_in:'',state:'draft'});
  };
  const importFile=async(file:File)=>{setError('');try{
    if(file.size>10*1024*1024)throw new Error('รองรับไฟล์ขนาดไม่เกิน 10 MB');
    const XLSX=await import('xlsx');const workbook=XLSX.read(await file.arrayBuffer());const sheet=workbook.Sheets['01-รายชื่อและครอบครัวงาน'];
    if(!sheet)throw new Error('ไม่พบชีต 01-รายชื่อและครอบครัวงาน');
    const rows=parseRoster(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:''}),data.people);
    setImports(rows);setImportTarget(Object.fromEntries(rows.map(r=>[r.sourceRow,r.matchedIds.length===1?r.matchedIds[0]:''])));setNotice(`อ่าน ${rows.length} แถวแล้ว เลือกบุคคลและตรวจแบบร่างก่อนบันทึก`);
  }catch(e){setError((e as Error).message);}};
  const draftImport=(row:ImportRow)=>{
    const target=importTarget[row.sourceRow];if(!target){setError('เลือกบุคคลเดิม หรือเลือกสร้างคนใหม่ก่อน');return;}
    const current=data.people.find(p=>p.id===target);
    const m=current?{...current}:{...newMember(row.company_id),full_name:row.full_name,nick_name:row.nick_name,bu:row.bu,position:row.position};
    const pr=current?structuredClone(profileFor(current)):blankProfile(m);
    pr.family=row.family;pr.tier=row.tier;pr.province=row.province;pr.license_claims=row.license_claims;
    pr.notes=`${pr.notes}\nExcel แถว ${row.sourceRow}: ${row.notes}`.trim();
    if(row.family==='F6')pr.teams=[...new Set([...pr.teams,'ISO','DCC'])];
    if(row.notes.includes('ESM / EMN / AEA'))pr.notes+='\nตรวจบริษัทที่รับผิดชอบ ESM/EMN/AEA ก่อนบันทึก';
    if(row.company_id==='esn')pr.company_ids=[...new Set([...pr.company_ids,'esn','eslo'])];
    setMemberTab('profile');setEdit({member:m,profile:pr});
  };
  const licenseNames=[...new Set(data.licenses.map(l=>l.legal_requirement_types?.name||'ไม่ระบุประเภท'))].sort();
  const reviewRows=filtered.map(p=>({p,r:data.reviews.find(r=>r.person_id===p.id&&r.cycle===cycle.trim())}));
  if(loading)return <Spinner/>;
  return <div className="text-slate-800">
    {view!=='org'&&<>
    <PageHeader title={TABS.find(t=>t[0]===view)?.[1]||'ทีม SHE / ISO'} description="บุคลากรหนึ่งคนดูแลหลายไซต์ได้ และเพิ่มประวัติได้โดยไม่ต้องมีบัญชีผู้ใช้" actions={<Button variant="secondary" onClick={()=>void load()}>โหลดใหม่</Button>}/>
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="การจัดการทีม">{TABS.map(([id,label,path])=><Link key={id} href={href(path)} className={`rounded-lg px-4 py-2 text-sm ${id===view?'bg-blue-700 text-white':'bg-white border text-gray-700'}`}>{label}</Link>)}</nav>
    {error&&<div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">{error}</div>}
    {notice&&<div role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-blue-900">{notice}</div>}
    <Card><div className="flex flex-wrap items-end gap-3">
      <Field label="ค้นหา"><input className={inputClass} value={search} onChange={e=>setSearch(e.target.value)} placeholder="ชื่อ ชื่อเล่น ตำแหน่ง"/></Field>
      <Field label="บริษัทที่รับผิดชอบ"><select className={inputClass} value={company} onChange={e=>setCompany(e.target.value)}><option value="">ทุกบริษัท</option>{data.companies.map(c=><option key={c.company_id} value={c.company_id}>{c.company_name||c.company_id}</option>)}</select></Field>
      <Field label="ทีม"><select className={inputClass} value={team} onChange={e=>setTeam(e.target.value)}><option value="">ทุกทีม</option>{['SHE','ISO','DCC','Environment'].map(t=><option key={t}>{t}</option>)}</select></Field>
      <Field label="กลุ่มงาน"><select className={inputClass} value={familyFilter} onChange={e=>setFamilyFilter(e.target.value)}><option value="">ทุกกลุ่ม</option>{Object.entries(FAMILIES).map(([k,v])=><option key={k} value={k}>{k} · {v}</option>)}</select></Field>
      <label className="py-2 text-sm"><input type="checkbox" checked={activeOnly} onChange={e=>setActiveOnly(e.target.checked)}/> ทำงานอยู่</label>
      <label className="py-2 text-sm"><input type="checkbox" checked={includeOutside} onChange={e=>setIncludeOutside(e.target.checked)}/> รวมคนนอกขอบเขตความรับผิดชอบ</label>
    </div><p className="mt-3 text-sm text-gray-600">แสดง {filtered.length} ระเบียนจากทั้งหมด {data.people.length} · คนที่มีหลายระเบียนเดิมยังต้องกระทบยอดก่อนสรุปจำนวนคนไม่ซ้ำ</p></Card>

    </>}
    {view==='org'&&<>
      {error&&<div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-900">{error}</div>}
      {notice&&<div role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-900">{notice}</div>}
      <OrgWorkspace people={data.people} profiles={profiles} companies={data.companies} onEdit={openMember} onReload={load} onSavePositions={async(points,onSaved)=>{
        const pending=new Set(Object.keys(points));
        for(const person of data.people){
          const pr=profileFor(person);const roles=assignmentsFor(person,pr);const changed=roles.filter(a=>pending.has(a.id));
          if(!changed.length)continue;
          await saveMember(person,withAssignments(person,pr,roles.map(a=>points[a.id]?{...a,...points[a.id]}:a),data.people,profiles));
          const ids=changed.map(a=>a.id);ids.forEach(id=>pending.delete(id));onSaved(ids);
        }
        if(pending.size)throw new Error('ไม่พบบทบาทบางรายการ กรุณาโหลดใหม่');
      }}/>
    </>}
    {view==='people'&&<div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-3"><Button onClick={()=>{const m=newMember(data.companies[0]?.company_id||'');setMemberTab('profile');setEdit({member:m,profile:blankProfile(m)});}}>เพิ่มบุคลากร</Button><label className="cursor-pointer rounded-lg border bg-white px-4 py-2 text-sm">อ่าน Excel เพื่อเตรียมนำเข้า<input className="sr-only" type="file" accept=".xlsx" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/></label></div>
      {imports.length>0&&<Card><h2 className="font-semibold">ตรวจรายชื่อจาก Excel ก่อนบันทึก</h2><p className="my-2 text-sm text-gray-600">ข้อมูลคนเดิมคงค่าในระบบไว้ กลุ่มงานและหมายเหตุจาก Excel จะเข้าแบบร่าง ใบอนุญาตเป็นข้อมูลรอตรวจ ไม่ยืนยันว่ามีใบโดยอัตโนมัติ</p><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>แถว</th><th>ชื่อในไฟล์</th><th>เชื่อมกับบุคคล</th><th>ดำเนินการ</th></tr></thead><tbody>{imports.map(r=><tr key={r.sourceRow} className="border-t"><td className="py-2">{r.sourceRow}</td><td>{r.full_name} · {r.family}</td><td><select aria-label={`จับคู่ ${r.full_name}`} className={inputClass} value={importTarget[r.sourceRow]||''} onChange={e=>setImportTarget({...importTarget,[r.sourceRow]:e.target.value})}><option value="">เลือกเพื่อตรวจสอบ</option><option value="new">สร้างบุคคลใหม่</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.company_id}</option>)}</select></td><td><Button variant="secondary" onClick={()=>draftImport(r)}>เปิดแบบร่าง</Button></td></tr>)}</tbody></table></div></Card>}
      <Card><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['บุคลากร','บริษัท / ทีม','กลุ่มงาน','บัญชีผู้ใช้','สถานะ',''].map((s,i)=><th key={i} className="p-3">{s}</th>)}</tr></thead><tbody>{filtered.map(p=>{const pr=profileFor(p);const account=data.users.find(u=>u.id===pr.user_id&&u.source===pr.user_source);return <tr key={p.id} className="border-t"><td className="p-3"><strong>{p.full_name}</strong><div className="text-gray-500">{p.nick_name} · {p.position||'ยังไม่ระบุตำแหน่ง'}</div></td><td className="p-3">{pr.company_ids.join(', ')}<div className="text-gray-500">{pr.teams.join(' / ')||'ยังไม่จัดทีม'}</div></td><td>{pr.family||'ยังไม่กำหนด'}</td><td>{account?`${account.username} (${account.source==='company_users'?'eashe.org':'tools'})`:'ยังไม่เชื่อมบัญชี'}</td><td>{STATUS[pr.status]}</td><td><Button variant="secondary" onClick={()=>openMember(p)}>รายละเอียด / แก้ไข</Button></td></tr>;})}</tbody></table>{!filtered.length&&<p className="p-8 text-gray-500">ไม่พบบุคลากรตามตัวกรอง</p>}</div></Card>
    </div>}

    {view==='matrix'&&<Card className="mt-5"><div className="mb-4 flex justify-between"><p className="text-sm text-gray-600">ทะเบียนใบอนุญาตเดิม ณ {today()} · ช่องว่างหมายถึงยังไม่มีรายการ</p><Link className="text-blue-700 underline" href={href('/team/licenses')}>เพิ่ม / แก้ไขใบอนุญาต</Link></div><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="min-w-52 p-3">บุคลากร</th>{licenseNames.map(n=><th key={n} className="min-w-44 p-3">{n}</th>)}<th className="min-w-64">ข้อมูลจาก Excel ที่รอตรวจ</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id} className="border-t"><th className="p-3">{p.full_name}<div className="font-normal text-gray-500">{p.company_id}</div></th>{licenseNames.map(n=>{const ls=data.licenses.filter(l=>l.personnel_id===p.id&&(l.legal_requirement_types?.name||'ไม่ระบุประเภท')===n);return <td className="p-3 align-top" key={n}>{ls.length?ls.map(l=><div key={l.id} className="mb-2"><span className={licenseStatus(l,today())==='หมดอายุ'?'text-red-700':'text-gray-700'}>{licenseStatus(l,today())}</span><div className="text-xs text-gray-500">{l.license_no||'ยังไม่ระบุเลขใบ'}{l.expiry_date?` · ${l.expiry_date}`:''}</div></div>):<span className="text-gray-400">ยังไม่มีข้อมูล</span>}</td>;})}<td className="p-3 text-gray-600">{profileFor(p).license_claims||'—'}</td></tr>)}</tbody></table></div></Card>}

    {view==='performance'&&<Card className="mt-5"><div className="mb-4 flex flex-wrap items-end gap-4"><Field label="รอบประเมิน"><input className={inputClass} value={cycle} maxLength={100} onChange={e=>setCycle(e.target.value)}/></Field><p className="py-2 text-sm text-gray-600">สรุปแล้ว {reviewRows.filter(({r})=>r?.state==='final').length} / {filtered.length} คนตามตัวกรอง · ยังไม่เริ่ม {reviewRows.filter(({r})=>!r).length}</p></div><p className="mb-4 text-sm text-gray-600">P1 ผลลัพธ์ · P2 นำเชิงรุก · P3 ความสามารถ · P4 พฤติกรรม — Site Tier ใช้เป็นบริบท ไม่มีตัวคูณคะแนน</p><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['บุคลากร','กลุ่ม / Tier','คะแนน','เกรดเสนอ','เกรดสุดท้าย','สถานะ',''].map((s,i)=><th key={i} className="p-3">{s}</th>)}</tr></thead><tbody>{reviewRows.sort((a,b)=>(a.r?.family||profileFor(a.p).family).localeCompare(b.r?.family||profileFor(b.p).family)).map(({p,r})=>{const score=r?scoreReview(r.scores,r.weights):null;return <tr key={p.id} className="border-t"><th className="p-3">{p.full_name}</th><td>{r?.family||profileFor(p).family||'ยังไม่กำหนด'} / {profileFor(p).tier||'—'}</td><td>{score===null?'ยังไม่ครบ':score.toFixed(2)}</td><td>{proposedGrade(score)||'—'}</td><td>{r?.final_grade||'—'}</td><td>{r?.state==='final'?'สรุปแล้ว':r?.state==='calibration'?'รอ Calibration':r?'แบบร่าง':'ยังไม่เริ่ม'}</td><td><Button variant="secondary" onClick={()=>openReview(p)}>เปิดแบบประเมิน</Button></td></tr>;})}</tbody></table></div></Card>}

    <Modal open={!!edit} title={edit?.member.updated_at?'แก้ไขประวัติและหน้าที่':'เพิ่มบุคลากร'} onClose={()=>{if(!busy)setEdit(null);}} width="max-w-4xl" footer={<><Button variant="secondary" disabled={busy} onClick={()=>setEdit(null)}>ยกเลิก</Button><Button disabled={busy} onClick={()=>void commitMember()}>{busy?'กำลังบันทึก…':'บันทึกบุคลากร'}</Button></>}>
      {edit&&<div className="space-y-5">{error&&<p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4" role="group" aria-label="ส่วนแก้ไขบุคลากร"><Button variant={memberTab==='profile'?'primary':'secondary'} onClick={()=>setMemberTab('profile')}>ข้อมูลบุคลากร</Button><Button variant={memberTab==='assignments'?'primary':'secondary'} onClick={()=>setMemberTab('assignments')}>การมอบหมายงาน ({assignmentsFor(edit.member,edit.profile).length})</Button><span className="ml-auto text-sm text-slate-500">{edit.member.full_name} · สังกัดหลัก {edit.member.company_id.toUpperCase()}</span></div>
      {memberTab==='profile'&&<><label className="block rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" checked={edit.profile.in_scope!==false} onChange={e=>setEdit({...edit,profile:{...edit.profile,in_scope:e.target.checked}})}/> อยู่ในขอบเขตความรับผิดชอบ <span className="block pt-1 text-slate-500">นำออกจากขอบเขตได้โดยไม่เปลี่ยนสถานะการทำงานหรือบัญชีผู้ใช้</span></label><div className="grid gap-4 sm:grid-cols-2">{([['full_name','ชื่อ-นามสกุล'],['nick_name','ชื่อเล่น'],['position','ตำแหน่ง'],['bu','BU'],['department','แผนก'],['responsibility','หน้าที่รับผิดชอบ'],['phone','โทรศัพท์'],['email','อีเมล']] as const).map(([key,label])=><Field label={label} key={key}><input className={inputClass} value={edit.member[key]} onChange={e=>setEdit({...edit,member:{...edit.member,[key]:e.target.value}})}/></Field>)}
      <Field label="บริษัทหลัก"><select className={inputClass} value={edit.member.company_id} onChange={e=>setEdit({...edit,member:{...edit.member,company_id:e.target.value},profile:{...edit.profile,company_ids:[...new Set([...edit.profile.company_ids,e.target.value])]}})}>{data.companies.map(c=><option key={c.company_id} value={c.company_id}>{c.company_name||c.company_id}</option>)}</select></Field>
      <Field label="จังหวัด"><input className={inputClass} value={edit.profile.province} onChange={e=>setEdit({...edit,profile:{...edit.profile,province:e.target.value}})}/></Field>
      <Field label="กลุ่มงาน"><select className={inputClass} value={edit.profile.family} onChange={e=>setEdit({...edit,profile:{...edit.profile,family:e.target.value as Family}})}><option value="">ยังไม่กำหนด</option>{Object.entries(FAMILIES).map(([k,v])=><option key={k} value={k}>{k} · {v}</option>)}</select></Field>
      <Field label="Site Tier"><select className={inputClass} value={edit.profile.tier} onChange={e=>setEdit({...edit,profile:{...edit.profile,tier:e.target.value}})}>{['','A','B','C','-'].map(t=><option key={t} value={t}>{t||'ยังไม่กำหนด'}</option>)}</select></Field>
      <Field label="สถานะ"><select className={inputClass} value={edit.profile.status} onChange={e=>setEdit({...edit,profile:{...edit.profile,status:e.target.value as Profile['status']}})}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="วันที่สถานะมีผล"><input type="date" max={today()} className={inputClass} value={edit.profile.effective_date} onChange={e=>setEdit({...edit,profile:{...edit.profile,effective_date:e.target.value}})}/></Field>
      <Field label="เชื่อมบัญชีเดิม (ไม่จำเป็น)"><select className={inputClass} value={edit.profile.user_source?`${edit.profile.user_source}:${edit.profile.user_id}`:''} onChange={e=>{const [source,id]=e.target.value.split(':');setEdit({...edit,profile:{...edit.profile,user_source:(source||'') as Profile['user_source'],user_id:id||''}});}}><option value="">ไม่มี / ยังไม่เชื่อมบัญชี</option>{data.users.map(u=><option key={`${u.source}:${u.id}`} value={`${u.source}:${u.id}`}>{u.display_name||u.username} · {u.company_id} · {u.source==='company_users'?'eashe.org':'tools'}</option>)}</select></Field>
      </div><fieldset><legend className="mb-2 text-sm font-medium">ทีมที่อยู่</legend><div className="flex flex-wrap gap-4">{['SHE','ISO','DCC','Environment'].map(t=><label key={t}><input type="checkbox" checked={edit.profile.teams.includes(t)} onChange={e=>setEdit({...edit,profile:{...edit.profile,teams:e.target.checked?[...edit.profile.teams,t]:edit.profile.teams.filter(v=>v!==t)}})}/> {t}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">บริษัทที่รับผิดชอบ (เลือกได้หลายบริษัท)</legend><div className="grid gap-2 sm:grid-cols-3">{data.companies.map(c=><label key={c.company_id} className="text-sm"><input type="checkbox" checked={edit.profile.company_ids.includes(c.company_id)} onChange={e=>setEdit({...edit,profile:{...edit.profile,company_ids:e.target.checked?[...edit.profile.company_ids,c.company_id]:edit.profile.company_ids.filter(v=>v!==c.company_id)}})}/> {c.company_name||c.company_id}</label>)}</div></fieldset>
      <Field label="ข้อมูลใบอนุญาตที่รอตรวจจาก Excel"><textarea className={inputClass} rows={2} value={edit.profile.license_claims} onChange={e=>setEdit({...edit,profile:{...edit.profile,license_claims:e.target.value}})}/></Field>
      <Field label="หมายเหตุ / ภาระงาน / ที่มาข้อมูล"><textarea className={inputClass} rows={4} value={edit.profile.notes} onChange={e=>setEdit({...edit,profile:{...edit.profile,notes:e.target.value}})}/></Field>
      <p className="text-sm text-gray-500">ประวัติหลักและสถานะทำงานใช้ร่วมกับ SHE Workforce ส่วนข้อมูลประเมินจำกัดใน Super Admin Console การเชื่อมบัญชีไม่เปลี่ยนสิทธิ์บัญชี</p></>}
      {memberTab==='assignments'&&<AssignmentEditor key={edit.member.id} member={edit.member} profile={edit.profile} people={data.people} profiles={profiles} companies={data.companies} disabled={busy} onChange={profile=>setEdit({...edit,profile})}/>}
      </div>}
    </Modal>

    <Modal open={!!review} title={`ประเมิน ${data.people.find(p=>p.id===review?.person_id)?.full_name||''} · ${review?.cycle||''}`} onClose={()=>{if(!busy)setReview(null);}} width="max-w-4xl" footer={<><Button variant="secondary" disabled={busy} onClick={()=>setReview(null)}>ปิด</Button><Button disabled={busy||review?.state==='final'&&data.reviews.some(r=>r.id===review.id&&r.state==='final')} onClick={()=>void commitReview()}>บันทึกแบบประเมิน</Button></>}>
      {review&&<fieldset disabled={busy||data.reviews.some(r=>r.id===review.id&&r.state==='final')} className="space-y-5">{error&&<p role="alert" className="text-red-700">{error}</p>}
      <p className="text-sm text-gray-600">{review.family} · น้ำหนัก {review.weights.join(' / ')}% · คะแนน {scoreReview(review.scores,review.weights)?.toFixed(2)||'ยังไม่ครบ'} · เกรดเสนอ {proposedGrade(scoreReview(review.scores,review.weights))||'—'}</p>
      <Field label="ผู้ประเมิน"><input className={inputClass} value={review.reviewer} onChange={e=>setReview({...review,reviewer:e.target.value})}/></Field>
      <Field label="เป้าหมายที่ตกลงร่วมกัน"><textarea className={inputClass} rows={3} value={review.goals} onChange={e=>setReview({...review,goals:e.target.value})}/></Field>
      {['P1 ผลลัพธ์ระบบ','P2 การนำเชิงรุก','P3 ความสามารถและการถ่ายทอด','P4 พฤติกรรมและความร่วมมือ'].map((label,i)=><div key={i} className="grid gap-3 sm:grid-cols-[150px_1fr]"><Field label={`${label} (1–5)`}><input type="number" min="1" max="5" step="0.1" className={inputClass} value={review.scores[i]??''} onChange={e=>{const scores=[...review.scores];scores[i]=e.target.value===''?null:Number(e.target.value);setReview({...review,scores});}}/></Field><Field label="หลักฐาน / เหตุการณ์เฉพาะ"><textarea className={inputClass} rows={2} value={review.evidence[i]} onChange={e=>{const evidence=[...review.evidence];evidence[i]=e.target.value;setReview({...review,evidence});}}/></Field></div>)}
      {([['employee_notes','ข้อมูลจากพนักงาน / ผลงานและอุปสรรค'],['manager_notes','บันทึกของหัวหน้า'],['check_in','บันทึก Check-in (ระบุวันที่ทุกครั้ง)'],['idp','IDP / วิธี 70–20–10 / D1–D4 / S1–S4 / สิ่งที่หัวหน้ารับปาก']] as const).map(([key,label])=><Field key={key} label={label}><textarea className={inputClass} rows={3} value={review[key]} onChange={e=>setReview({...review,[key]:e.target.value})}/></Field>)}
      <div className="grid gap-3 sm:grid-cols-3"><Field label="นัด Check-in ถัดไป"><input type="date" className={inputClass} value={review.next_check_in} onChange={e=>setReview({...review,next_check_in:e.target.value})}/></Field><Field label="เกรดสุดท้าย"><select className={inputClass} value={review.final_grade} onChange={e=>setReview({...review,final_grade:e.target.value})}>{['','A','B','C','D','E'].map(g=><option key={g} value={g}>{g||'ยังไม่สรุป'}</option>)}</select></Field><Field label="สถานะ"><select className={inputClass} value={review.state} onChange={e=>setReview({...review,state:e.target.value as Review['state']})}><option value="draft">แบบร่าง</option><option value="calibration">รอ Calibration</option><option value="final">สรุปและล็อกผล</option></select></Field></div>
      <Field label="เหตุผลในการปรับเกรด"><textarea className={inputClass} value={review.adjustment_reason} onChange={e=>setReview({...review,adjustment_reason:e.target.value})}/></Field>
      {review.state==='final'&&<p className="text-amber-800">เมื่อบันทึกผลที่สรุปแล้ว ระบบจะล็อกแบบประเมินนี้เพื่อรักษาผลย้อนหลัง</p>}
      </fieldset>}
    </Modal>
  </div>;
}

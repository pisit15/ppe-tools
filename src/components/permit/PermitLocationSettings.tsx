"use client";
import {useEffect,useState} from 'react';
import {permitApi,type DirectoryEntry} from './api';
type Location={id:string;name:string;department:string;area_owner:string;safety:string;active:boolean};
export default function PermitLocationSettings({company,directory}:{company:string;directory:DirectoryEntry[]}) {
 const [rows,setRows]=useState<Location[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({name:'',department:'',area_owner:'',safety:''});
 const load=async()=>setRows((await permitApi<{data:Location[]}>('locations',company)).data);
 useEffect(()=>{let live=true;permitApi<{data:Location[]}>('locations',company).then(r=>{if(live)setRows(r.data)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[company]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await permitApi('locations',company,'POST',form);setForm({...form,name:'',department:''});await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="wp-stack"><div className="wp-page-title"><div><h2>พื้นที่และผู้รับผิดชอบ</h2><p>เลือกพื้นที่ครั้งเดียว ระบบจะส่งคำขอให้ผู้รับผิดชอบที่กำหนดไว้</p></div></div>
 {error&&<p className="wp-error" role="alert">{error}</p>}
 <form className="wp-panel wp-stack" onSubmit={save}><h3>เพิ่มพื้นที่มาตรฐาน</h3><div className="wp-form-grid">
 <label>ชื่อพื้นที่<input required maxLength={200} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
 <label>แผนกที่รับผิดชอบ<input maxLength={200} value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/></label>
 {(['area_owner','safety'] as const).map(role=><label key={role}>{role==='area_owner'?'เจ้าของพื้นที่':'ผู้ตรวจความปลอดภัย'}<select required value={form[role]} onChange={e=>setForm({...form,[role]:e.target.value})}><option value="">เลือกบัญชีที่ได้รับสิทธิ์แล้ว</option>{directory.filter(m=>m.role===role&&m.actor_key!==form[role==='area_owner'?'safety':'area_owner']).map(m=><option value={m.actor_key} key={m.actor_key}>{m.display_name}</option>)}</select></label>)}
 </div><button className="wp-primary" disabled={busy}>บันทึกพื้นที่</button></form>
 <section className="wp-panel"><h3>พื้นที่ของบริษัท ({rows.length})</h3>{!rows.length&&<p>ยังไม่มีพื้นที่มาตรฐาน กำหนดผู้ลงนามแล้วเพิ่มพื้นที่ได้ที่นี่</p>}{rows.map(r=><div className="wp-account-row" key={r.id}><div><strong>{r.name}</strong><p>{r.department} · {r.active?'เปิดใช้':'ปิดใช้'}</p><small>เจ้าของพื้นที่: {directory.find(m=>m.actor_key===r.area_owner)?.display_name||'บัญชีถูกถอนสิทธิ์'} · ผู้ตรวจ: {directory.find(m=>m.actor_key===r.safety)?.display_name||'บัญชีถูกถอนสิทธิ์'}</small></div><button className="wp-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await permitApi('locations',company,'PATCH',{id:r.id,active:!r.active});await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{r.active?'ปิดใช้':'เปิดใช้'}</button></div>)}</section></div>;
}

'use client';
import { useEffect, useState } from 'react';
import type { ChemCompanySettings, ChemEmergencyContact } from '@/lib/types';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { inputCls, labelCls, Toast } from '../components/ui';

const PRESETS: ChemEmergencyContact[] = [
  { label: 'ศูนย์พิษวิทยา รพ.รามาธิบดี', phone: '1367' },
  { label: 'ศูนย์พิษวิทยา รพ.ศิริราช', phone: '02 419 7007' },
  { label: 'เหตุด่วนเหตุร้าย', phone: '191' },
  { label: 'ดับเพลิง', phone: '199' },
  { label: 'การแพทย์ฉุกเฉิน', phone: '1669' },
];

export default function ChemSettingsPage() {
  const { companyName, isAll, canWrite, q } = useCompanyScope();
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useChemicalData<{data: ChemCompanySettings}>('/api/chemical/settings' + q, retry);
  return <div className="max-w-3xl space-y-5">
    <h1 className="text-2xl font-bold text-gray-900">ตั้งค่า Chemical Management</h1>
    <p className="text-gray-700">{isAll ? 'เลือกบริษัทก่อน — การตั้งค่าแยกตามบริษัท' : 'บริษัท ' + companyName}</p>
    {!isAll && (loading ? <p role="status">กำลังโหลดการตั้งค่า…</p> : error ? <p role="alert">{error} <button onClick={() => setRetry(v => v + 1)}>ลองใหม่</button></p> : data && <SettingsEditor key={data.data.company_id} initial={data.data} canWrite={canWrite} />)}
  </div>;
}
function SettingsEditor({initial, canWrite}: {initial: ChemCompanySettings; canWrite: boolean}) {
  const [baseline, setBaseline] = useState(initial);
  const [contacts, setContacts] = useState<ChemEmergencyContact[]>(initial.emergency_contacts);
  const [show, setShow] = useState(initial.show_emergency);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{type: 'success' | 'error'; msg: string} | null>(null);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if(dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const save = async () => {
    setSaving(true); setToast(null);
    try {
      const r = await fetch('/api/chemical/settings', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({company_id: initial.company_id, emergency_contacts: contacts, show_emergency: show})});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setBaseline(d.data); setContacts(d.data.emergency_contacts);
      setDirty(false); setToast({type: 'success', msg: 'บันทึกการตั้งค่าบริษัท ' + initial.company_id.toUpperCase() + ' แล้ว'});
    } catch(e) { setToast({type: 'error', msg: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'}); }
    finally { setSaving(false); }
  };
  const reset = () => { setContacts(baseline.emergency_contacts); setShow(baseline.show_emergency); setDirty(false); setToast(null); };
  const move = (i: number, step: number) => { setContacts(prev => { const next = [...prev]; [next[i], next[i + step]] = [next[i + step], next[i]]; return next; }); setDirty(true); };
  return <form className="space-y-5" onChange={() => setDirty(true)} onSubmit={e => { e.preventDefault(); void save(); }}>
    <fieldset disabled={!canWrite || saving} className="space-y-5">
      <section className="rounded-xl border bg-white p-5 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">เบอร์ฉุกเฉินบนโปสเตอร์ SDS</h2>
        <label className="flex gap-2 text-sm text-gray-800"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> แสดงเบอร์ฉุกเฉินบนโปสเตอร์</label>
        {contacts.map((c,i) => <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div><label htmlFor={'contact-name-' + i} className={labelCls}>ชื่อ / หน่วยงาน {i+1}</label><input id={'contact-name-' + i} className={inputCls} value={c.label} onChange={e => setContacts(prev => prev.map((x,j) => i === j ? {...x,label:e.target.value} : x))} /></div>
          <div><label htmlFor={'contact-phone-' + i} className={labelCls}>เบอร์โทร {i+1}</label><input id={'contact-phone-' + i} className={inputCls} type="tel" value={c.phone} onChange={e => setContacts(prev => prev.map((x,j) => i === j ? {...x,phone:e.target.value} : x))} /></div>
          <div className="flex gap-1">
          <button type="button" className="p-3 border rounded-lg disabled:opacity-30" disabled={i === 0} aria-label={'เลื่อนเบอร์รายการที่ ' + (i+1) + ' ขึ้น'} onClick={() => move(i,-1)}>▲</button>
          <button type="button" className="p-3 border rounded-lg disabled:opacity-30" disabled={i === contacts.length - 1} aria-label={'เลื่อนเบอร์รายการที่ ' + (i+1) + ' ลง'} onClick={() => move(i,1)}>▼</button>
          <button type="button" className="p-3 text-red-700 border rounded-lg" aria-label={'ลบเบอร์ฉุกเฉินรายการที่ ' + (i+1)} onClick={() => {setContacts(prev => prev.filter((_,j) => i !== j)); setDirty(true);}}>ลบ</button></div>
        </div>)}
        <button type="button" className="px-3 py-2 rounded border text-purple-800" disabled={contacts.length >= 10} onClick={() => {setContacts(prev => [...prev,{label:'',phone:''}]); setDirty(true);}}>+ เพิ่มเบอร์ ({contacts.length}/10)</button>
        <div className="flex flex-wrap gap-2">{PRESETS.filter(p => !contacts.some(c => c.phone === p.phone)).map(p => <button type="button" key={p.phone} disabled={contacts.length >= 10} className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-800 disabled:opacity-40" onClick={() => { setContacts(prev => [...prev,p]); setDirty(true); }}>{p.label} {p.phone}</button>)}</div>
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><p className="font-semibold mb-1">ตัวอย่างบนโปสเตอร์</p>{show ? contacts.filter(c => c.label || c.phone).map(c => [c.label,c.phone].filter(Boolean).join(' ')).join(' · ') || 'ตามแผนฉุกเฉินของบริษัท' : 'ซ่อนเบอร์ฉุกเฉินจากโปสเตอร์'}</div>
      </section>
      <button type="submit" disabled={!dirty || saving} className="px-5 py-3 rounded-lg bg-purple-700 text-white disabled:opacity-50">{saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button>
      {dirty && <button type="button" className="ml-3 px-3 py-2 text-gray-700" onClick={reset}>ยกเลิกการแก้ไข</button>}
    </fieldset>
    <Toast toast={toast} />
  </form>;
}

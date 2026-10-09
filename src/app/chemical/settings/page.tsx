'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Settings, Phone, Plus, Trash2, Save, Eye, EyeOff } from 'lucide-react';
import type { ChemCompanySettings, ChemEmergencyContact } from '@/lib/types';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { Toast, inputCls, labelCls } from '../components/ui';

const PRESETS: ChemEmergencyContact[] = [
  { label: 'ศูนย์พิษวิทยา รพ.รามาธิบดี', phone: '1367' },
  { label: 'ศูนย์พิษวิทยา รพ.ศิริราช', phone: '02 419 7007' },
  { label: 'เหตุด่วนเหตุร้าย', phone: '191' },
  { label: 'ดับเพลิง', phone: '199' },
  { label: 'การแพทย์ฉุกเฉิน', phone: '1669' },
];

export default function ChemSettingsPage() {
  const { companyId, isAll, canWrite } = useCompanyScope();
  const [s, setS] = useState<ChemCompanySettings | null>(null);
  const [contacts, setContacts] = useState<ChemEmergencyContact[]>([]);
  const [show, setShow] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/chemical/settings?company_id=${companyId}`).then(x => x.json());
    const d = (r.data || null) as ChemCompanySettings | null;
    setS(d); setContacts(d?.emergency_contacts || []); setShow(d?.show_emergency ?? true); setDirty(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const edit = (i: number, k: keyof ChemEmergencyContact, v: string) => { setContacts(prev => prev.map((c, j) => j === i ? { ...c, [k]: v } : c)); setDirty(true); };
  const add = (c: ChemEmergencyContact = { label: '', phone: '' }) => { if (contacts.length >= 10) return; setContacts(prev => [...prev, c]); setDirty(true); };
  const remove = (i: number) => { setContacts(prev => prev.filter((_, j) => j !== i)); setDirty(true); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= contacts.length) return;
    setContacts(prev => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; }); setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const r = await fetch('/api/chemical/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId, emergency_contacts: contacts, show_emergency: show }) });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setToast({ type: 'error', msg: d.error || 'บันทึกไม่สำเร็จ' }); return; }
    setS(d.data); setContacts(d.data.emergency_contacts); setDirty(false);
    setToast({ type: 'success', msg: 'บันทึกแล้ว — มีผลกับโปสเตอร์ทุกใบของบริษัททันที' });
  };

  const preview = contacts.filter(c => c.label || c.phone);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings className="text-purple-600" /> ตั้งค่า Chemical Management</h1>
        <p className="text-sm text-gray-500 mt-1">ข้อมูลที่ใช้ร่วมกันทุกสารเคมีของบริษัท {companyId !== 'all' && <b className="text-gray-700">{companyId.toUpperCase()}</b>}</p>
      </div>

      {isAll && <p className="text-sm rounded-xl px-4 py-3" style={{ background: '#fef3c7', color: '#92400e' }}>เลือกบริษัทที่แถบด้านซ้ายก่อน — การตั้งค่าแยกตามบริษัท</p>}

      {!isAll && s && (
        <>
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Phone size={16} className="text-red-600" /> เบอร์ฉุกเฉินบนโปสเตอร์ SDS</h2>
                <p className="text-xs text-gray-500 mt-1">แสดงเป็นบรรทัดแดงท้ายโปสเตอร์ทุกใบ เช่น ศูนย์พิษวิทยา, จป.วิชาชีพ, ห้องพยาบาล, เบอร์ภายใน</p>
              </div>
              <label className={`inline-flex items-center gap-2 text-sm font-semibold cursor-pointer px-3 py-1.5 rounded-lg border ${show ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                <input type="checkbox" className="sr-only" checked={show} disabled={!canWrite} onChange={e => { setShow(e.target.checked); setDirty(true); }} />
                {show ? <Eye size={15} /> : <EyeOff size={15} />} {show ? 'แสดงบนโปสเตอร์' : 'ซ่อนจากโปสเตอร์'}
              </label>
            </div>

            <div className="space-y-2">
              {contacts.length === 0 && <p className="text-sm text-gray-500 px-1">ยังไม่มีเบอร์ฉุกเฉิน — โปสเตอร์จะแสดง "ตามแผนฉุกเฉินของบริษัท"</p>}
              {contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col text-gray-300">
                    <button onClick={() => move(i, -1)} disabled={!canWrite || i === 0} className="leading-none hover:text-gray-600 disabled:opacity-30" title="เลื่อนขึ้น">▲</button>
                    <button onClick={() => move(i, 1)} disabled={!canWrite || i === contacts.length - 1} className="leading-none hover:text-gray-600 disabled:opacity-30" title="เลื่อนลง">▼</button>
                  </div>
                  <div className="flex-1"><label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>ชื่อ / หน่วยงาน</label><input className={inputCls} value={c.label} disabled={!canWrite} placeholder="เช่น จป.วิชาชีพ" onChange={e => edit(i, 'label', e.target.value)} /></div>
                  <div className="w-44"><label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>เบอร์โทร</label><input className={inputCls} value={c.phone} disabled={!canWrite} placeholder="เช่น ภายใน 1234" onChange={e => edit(i, 'phone', e.target.value)} /></div>
                  <button onClick={() => remove(i)} disabled={!canWrite} className={`p-2 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 ${i === 0 ? 'mt-5' : ''}`} title="ลบ"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            {canWrite && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => add()} disabled={contacts.length >= 10} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-40"><Plus size={14} /> เพิ่มเบอร์</button>
                <span className="text-xs text-gray-400">หรือเพิ่มจากรายการ:</span>
                {PRESETS.filter(p => !contacts.some(c => c.phone === p.phone)).map(p => (
                  <button key={p.phone} onClick={() => add(p)} disabled={contacts.length >= 10} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40">{p.label} {p.phone}</button>
                ))}
                <span className="ml-auto text-xs text-gray-400">{contacts.length}/10</span>
              </div>
            )}

            {/* preview */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">ตัวอย่างบนโปสเตอร์</div>
              {show ? (
                <div className="text-sm font-black" style={{ color: '#b91c1c' }}>
                  ☎ ฉุกเฉิน: {preview.length ? preview.map(c => [c.label, c.phone].filter(Boolean).join(' ')).join(' · ') : 'ตามแผนฉุกเฉินของบริษัท'}
                </div>
              ) : <div className="text-sm text-gray-400 italic">(ไม่แสดงบรรทัดฉุกเฉิน)</div>}
            </div>

            {canWrite && (
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40"><Save size={15} /> {saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
                {dirty && <button onClick={load} className="text-sm text-gray-500">ยกเลิกการแก้ไข</button>}
                {!dirty && s.updated_at && <span className="text-xs text-gray-400">บันทึกล่าสุด {new Date(s.updated_at).toLocaleString('th-TH')}</span>}
              </div>
            )}
          </section>
        </>
      )}
      <Toast toast={toast} />
    </div>
  );
}

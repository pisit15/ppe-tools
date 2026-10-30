'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Plus, Trash2, Users, Building2, CalendarDays, ClipboardList, Copy } from 'lucide-react';
import { HAS_PERMIT_LABEL, PURPOSE_OTHER, VISITOR_LIMITS, VISITOR_PURPOSES } from '@/lib/visitor/constants';
import type { CreateVisitorRequestInput, HasPermit, VisitorLinkInfo } from '@/lib/visitor/types';
import { useQr } from '../../../_components/useQr';
import { FetchError, ToastView, VIZ, cardClass, getJson, inputClass, labelClass, postJson, thaiDate, useToast } from '../../../_components/ui';

type LinkInfo = VisitorLinkInfo;
type Person = { name: string; detail: string };
type Done = { request_no: string; track_code: string };

const todayBangkok = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export default function VisitorRequestPage() {
  const { token } = useParams<{ token: string }>();
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [linkError, setLinkError] = useState('');
  const { toast, setToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const [informerName, setInformerName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [visitorCompany, setVisitorCompany] = useState('');
  const [arrivalDate, setArrivalDate] = useState(todayBangkok());
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('17:00');
  const [purpose, setPurpose] = useState('');
  const [purposeOther, setPurposeOther] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [areaDetail, setAreaDetail] = useState('');
  const [hasPermit, setHasPermit] = useState<HasPermit>('unknown');
  const [permitRef, setPermitRef] = useState('');
  const [note, setNote] = useState('');
  const [persons, setPersons] = useState<Person[]>([{ name: '', detail: '' }]);

  useEffect(() => {
    getJson<LinkInfo>(`/api/visitor/public/link/${encodeURIComponent(token)}`).then(setLink)
      .catch((e: unknown) => setLinkError(e instanceof FetchError ? e.message : 'โหลดลิงก์ไม่สำเร็จ'));
  }, [token]);

  const isContractor = /ผู้รับเหมา/.test(purpose);
  const trackUrl = done && typeof window !== 'undefined' ? `${window.location.origin}/visitor/track/${done.track_code}` : '';
  const trackQr = useQr(trackUrl || null, 220);
  const filledPersons = useMemo(() => persons.filter(p => p.name.trim() || p.detail.trim()), [persons]);

  function toggleArea(a: string) { setAreas(prev => (prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])); }
  function updatePerson(i: number, patch: Partial<Person>) { setPersons(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p))); }
  function addPerson() { if (persons.length < VISITOR_LIMITS.maxPersons) setPersons(prev => [...prev, { name: '', detail: '' }]); }
  function removePerson(i: number) { setPersons(prev => (prev.length === 1 ? [{ name: '', detail: '' }] : prev.filter((_, idx) => idx !== i))); }
  /** Paste "1. ชื่อ\n2. ชื่อ" from LINE/Email → one row per line. */
  function pasteList(text: string) {
    const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*\d+[.)]?\s*/, '').trim()).filter(Boolean);
    if (lines.length > 1) setPersons(lines.slice(0, VISITOR_LIMITS.maxPersons).map(name => ({ name, detail: '' })));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !link) return;
    if (filledPersons.length === 0) { setToast({ type: 'error', msg: 'กรุณากรอกรายชื่อผู้มาติดต่ออย่างน้อย 1 คน' }); return; }
    const body: CreateVisitorRequestInput = {
      token, informer_name: informerName, informer_employee_code: employeeCode, informer_phone: phone, informer_department: department,
      visitor_company: visitorCompany, arrival_date: arrivalDate, time_from: timeFrom, time_to: timeTo, purpose, purpose_other: purposeOther,
      work_areas: areas, work_area_detail: areaDetail, has_permit: hasPermit, permit_ref: permitRef, note,
      persons: filledPersons.map(p => ({ name: p.name.trim(), detail: p.detail.trim() })),
    };
    setBusy(true);
    try {
      const res = await postJson<{ data: Done }>('/api/visitor/public/requests', body);
      setDone(res.data);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof FetchError ? err.message : 'ส่งคำขอไม่สำเร็จ' });
    } finally { setBusy(false); }
  }

  if (linkError) return <Shell><div className={cardClass}><h1 className="text-xl font-semibold" style={{ color: VIZ.accent }}>ไม่สามารถเปิดแบบฟอร์มได้</h1><p className="mt-2 text-gray-600">{linkError}</p></div></Shell>;
  if (!link) return <Shell><p className="text-gray-500">กำลังโหลด…</p></Shell>;

  if (done) {
    return (
      <Shell company={link.company.name}>
        <div className={cardClass} style={{ borderLeft: `4px solid ${VIZ.positive}` }}>
          <div className="flex items-center gap-3"><CheckCircle2 size={32} style={{ color: VIZ.positive }} /><h1 className="text-2xl font-semibold" style={{ color: VIZ.text }}>ส่งคำขอแล้ว</h1></div>
          <p className="mt-4 text-gray-700">เลขที่คำขอ <span className="font-mono font-semibold text-lg" style={{ color: VIZ.primary }}>{done.request_no}</span></p>
          <p className="mt-1 text-gray-700">วันที่เข้าพื้นที่ {thaiDate(arrivalDate, true)} เวลา {timeFrom}–{timeTo} · {filledPersons.length} คน · {visitorCompany}</p>
          <p className="mt-4 text-sm text-gray-600">ทีม SHE จะคัดกรองและอนุมัติ ติดตามสถานะได้จากลิงก์นี้ (บันทึกไว้ หรือส่งต่อให้ผู้มาติดต่อ):</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {trackQr && <div className="mt-3 flex items-center gap-4"><img src={trackQr} alt="QR ลิงก์ติดตามสถานะ" width={110} height={110} className="rounded-lg border border-gray-200" /><p className="text-sm text-gray-600">ให้ผู้มาติดต่อสแกน QR นี้เพื่อดูสถานะ/เงื่อนไขการเข้าพื้นที่ด้วยตัวเอง</p></div>}
          <div className="mt-2 flex gap-2">
            <input readOnly value={trackUrl} className={`${inputClass} font-mono text-sm`} onFocus={e => e.currentTarget.select()} />
            <button type="button" className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-white text-sm" style={{ background: VIZ.primary }}
              onClick={() => { void navigator.clipboard?.writeText(trackUrl); setToast({ type: 'success', msg: 'คัดลอกลิงก์แล้ว' }); }}><Copy size={16} />คัดลอก</button>
          </div>
          <div className="mt-6 flex gap-3">
            <a href={trackUrl} className="rounded-lg px-4 py-2 text-white text-sm font-medium" style={{ background: VIZ.positive }}>ดูสถานะ</a>
            <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 bg-white" onClick={() => { setDone(null); setVisitorCompany(''); setPersons([{ name: '', detail: '' }]); setNote(''); }}>ส่งคำขอใหม่ (ผู้แจ้งคนเดิม)</button>
          </div>
        </div>
        <ToastView toast={toast} />
      </Shell>
    );
  }

  return (
    <Shell company={link.company.name}>
      <form onSubmit={submit} className="space-y-6" aria-busy={busy}>
        <section className={cardClass}>
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: VIZ.primary }}><Users size={20} />ผู้แจ้งข้อมูล (พนักงาน)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="informer">ชื่อ-นามสกุล *</label><input id="informer" className={inputClass} value={informerName} onChange={e => setInformerName(e.target.value)} required maxLength={120} autoComplete="name" /></div>
            <div><label className={labelClass} htmlFor="emp">รหัสพนักงาน *</label><input id="emp" className={inputClass} value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} required maxLength={40} inputMode="numeric" /></div>
            <div><label className={labelClass} htmlFor="phone">เบอร์โทรศัพท์ *</label><input id="phone" className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} required minLength={6} maxLength={30} inputMode="tel" autoComplete="tel" /></div>
            <div><label className={labelClass} htmlFor="dept">แผนก *</label>
              {link.departments.length > 0 ? (
                <select id="dept" className={inputClass} value={department} onChange={e => setDepartment(e.target.value)} required>
                  <option value="">— เลือกแผนก —</option>
                  {link.departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : <input id="dept" className={inputClass} value={department} onChange={e => setDepartment(e.target.value)} required maxLength={80} placeholder="ระบุแผนก" />}
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: VIZ.primary }}><Building2 size={20} />ผู้มาติดต่อ / ผู้รับเหมา</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={labelClass} htmlFor="vc">ชื่อบริษัท *</label><input id="vc" className={inputClass} value={visitorCompany} onChange={e => setVisitorCompany(e.target.value)} required maxLength={160} placeholder="เช่น บริษัท ABC จำกัด / นายสมชาย (บุคคล)" /></div>
            <div><label className={labelClass} htmlFor="purpose">วัตถุประสงค์ *</label>
              <select id="purpose" className={inputClass} value={purpose} onChange={e => setPurpose(e.target.value)} required>
                <option value="">— เลือก —</option>
                {VISITOR_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select></div>
            {purpose === PURPOSE_OTHER && <div><label className={labelClass} htmlFor="po">โปรดระบุวัตถุประสงค์ *</label><input id="po" className={inputClass} value={purposeOther} onChange={e => setPurposeOther(e.target.value)} required maxLength={200} /></div>}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass}>รายชื่อผู้มาติดต่อ * <span className="text-gray-500 font-normal">({filledPersons.length} คน — รปภ จะติ๊กมาถึงรายคน)</span></label>
              <button type="button" onClick={addPerson} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: VIZ.primary }}><Plus size={16} />เพิ่มแถว</button>
            </div>
            <div className="space-y-2">
              {persons.map((p, i) => (
                <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2.5rem] gap-2 items-center">
                  <span className="text-sm text-gray-500 text-right">{i + 1}.</span>
                  <input className={inputClass} placeholder="ชื่อ-นามสกุล" value={p.name} onChange={e => updatePerson(i, { name: e.target.value })} maxLength={120}
                    onPaste={i === 0 ? e => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); pasteList(t); } } : undefined} />
                  <input className={inputClass} placeholder="ตำแหน่ง / ทะเบียนรถ / เลขบัตร (ถ้ามี)" value={p.detail} onChange={e => updatePerson(i, { detail: e.target.value })} maxLength={120} />
                  <button type="button" onClick={() => removePerson(i)} aria-label="ลบแถว" className="text-gray-400 hover:text-red-500 flex justify-center"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">เคล็ดลับ: วางรายชื่อหลายบรรทัดลงในช่องแรก ระบบจะแยกเป็นแถวให้อัตโนมัติ</p>
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: VIZ.primary }}><CalendarDays size={20} />วัน-เวลา และพื้นที่</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className={labelClass} htmlFor="date">วันที่เข้าพื้นที่ *</label><input id="date" type="date" className={inputClass} value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} required /></div>
            <div><label className={labelClass} htmlFor="tf">เวลาเริ่ม *</label><input id="tf" type="time" className={inputClass} value={timeFrom} onChange={e => setTimeFrom(e.target.value)} required /></div>
            <div><label className={labelClass} htmlFor="tt">เวลาสิ้นสุด *</label><input id="tt" type="time" className={inputClass} value={timeTo} onChange={e => setTimeTo(e.target.value)} required /></div>
          </div>
          <div className="mt-5">
            <label className={labelClass}>พื้นที่ปฏิบัติงาน {isContractor && '*'} {link.areas.length === 0 && <span className="text-gray-500 font-normal">(ระบุในช่องรายละเอียดด้านล่าง)</span>}</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {link.areas.map(a => (
                <label key={a} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${areas.includes(a) ? 'border-[#4E79A7] bg-[#4E79A7]/10' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={areas.includes(a)} onChange={() => toggleArea(a)} className="accent-[#4E79A7]" />{a}
                </label>
              ))}
            </div>
            <div className="mt-3"><label className={labelClass} htmlFor="ad">{link.areas.length ? 'รายละเอียดพื้นที่ (ชื่อห้อง, กริดไลน์ ฯลฯ)' : 'พื้นที่ปฏิบัติงาน / อาคาร / ห้อง'}</label><input id="ad" className={inputClass} value={areaDetail} onChange={e => setAreaDetail(e.target.value)} maxLength={500} required={isContractor && link.areas.length === 0} /></div>
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-4" style={{ color: VIZ.primary }}><ClipboardList size={20} />ใบอนุญาตทำงาน และหมายเหตุ</h2>
          <label className={labelClass}>มีเอกสารขออนุญาตทำงาน (Permit to Work) ที่อนุมัติแล้วหรือไม่ {isContractor && '*'}</label>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(HAS_PERMIT_LABEL) as HasPermit[]).map(k => (
              <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${hasPermit === k ? 'border-[#4E79A7] bg-[#4E79A7]/10' : 'border-gray-200'}`}>
                <input type="radio" name="permit" checked={hasPermit === k} onChange={() => setHasPermit(k)} className="accent-[#4E79A7]" />{HAS_PERMIT_LABEL[k]}
              </label>
            ))}
          </div>
          {hasPermit === 'yes' && <div className="mt-3 max-w-sm"><label className={labelClass} htmlFor="pr">เลขที่ Permit (ถ้ามี)</label><input id="pr" className={inputClass} value={permitRef} onChange={e => setPermitRef(e.target.value)} maxLength={80} /></div>}
          <div className="mt-4"><label className={labelClass} htmlFor="note">หมายเหตุถึงทีม SHE</label><textarea id="note" className={inputClass} rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
          {isContractor && <p className="mt-3 text-sm rounded-lg px-3 py-2" style={{ background: `${VIZ.secondary}1A`, color: '#8a4b00' }}>ผู้รับเหมาปฏิบัติงานต้องสวม PPE ตามข้อกำหนดของพื้นที่ และต้องมี Permit to Work ก่อนเริ่มงานที่มีความเสี่ยง</p>}
        </section>

        <div className="flex justify-end gap-3">
          <button type="submit" disabled={busy} className="rounded-lg px-6 py-3 text-white font-medium disabled:opacity-60" style={{ background: VIZ.primary }}>{busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}</button>
        </div>
      </form>
      <ToastView toast={toast} />
    </Shell>
  );
}

function Shell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="min-h-screen" style={{ background: '#F5F6F8', color: VIZ.text }}>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ea-logo.svg" alt="EA" width={40} height={32} />
          <div><div className="font-semibold" style={{ color: VIZ.primary }}>แจ้งขออนุญาตบุคคลภายนอกเข้าพื้นที่</div><div className="text-xs text-gray-500">{company ? `${company} · ` : ''}Contractor / Supplier / Transportation / Visitor</div></div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

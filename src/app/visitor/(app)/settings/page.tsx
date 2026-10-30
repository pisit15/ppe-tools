'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, MonitorPlay, Plus, Ban, ExternalLink, QrCode, MapPin, Save } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import type { VisitorCompanyOptionsRow, VisitorLinkRow } from '@/lib/visitor/types';
import { useQr } from '../../_components/useQr';
import { FetchError, ToastView, VIZ, cardClass, getJson, inputClass, labelClass, postJson, thaiDateTime, useToast } from '../../_components/ui';

type Company = { company_id: string; company_name: string };

export default function VisitorSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState(isAdmin ? '' : (user?.companyId || ''));
  const [links, setLinks] = useState<VisitorLinkRow[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState('');
  const { toast, setToast } = useToast();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [areasText, setAreasText] = useState('');
  const [deptText, setDeptText] = useState('');
  const [optionsDirty, setOptionsDirty] = useState(false);
  const boardQr = useQr(company ? `${origin}/visitor/board/${company}` : null, 200);

  useEffect(() => {
    if (isAdmin) getJson<Company[]>('/api/companies').then(d => { const list = Array.isArray(d) ? d : []; setCompanies(list); if (!company && list[0]) setCompany(list.find(c => c.company_id === 'amt')?.company_id || list[0].company_id); }).catch(() => setCompanies([]));
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (user && !isAdmin) setCompany(user.companyId); }, [user, isAdmin]);

  const load = useCallback(() => {
    if (!company) return;
    getJson<{ data: VisitorLinkRow[] }>(`/api/visitor/links?company=${encodeURIComponent(company)}`).then(r => setLinks(r.data))
      .catch((e: unknown) => setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'โหลดลิงก์ไม่สำเร็จ' }));
    getJson<{ data: VisitorCompanyOptionsRow }>(`/api/visitor/options?company=${encodeURIComponent(company)}`)
      .then(r => { setAreasText(r.data.areas.join('\n')); setDeptText(r.data.departments.join('\n')); setOptionsDirty(false); })
      .catch((e: unknown) => setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'โหลดรายการพื้นที่ไม่สำเร็จ' }));
  }, [company, setToast]);

  async function saveOptions() {
    if (busy || !company) return;
    setBusy(true);
    try {
      const split = (t: string) => t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const r = await postJson<{ data: VisitorCompanyOptionsRow }>('/api/visitor/options', { company_id: company, areas: split(areasText), departments: split(deptText) }, 'PUT');
      setAreasText(r.data.areas.join('\n')); setDeptText(r.data.departments.join('\n')); setOptionsDirty(false);
      setToast({ type: 'success', msg: `บันทึกแล้ว: พื้นที่ ${r.data.areas.length} · แผนก ${r.data.departments.length}` });
    } catch (e) { setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'บันทึกไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (busy || !company) return;
    setBusy(true);
    try { await postJson('/api/visitor/links', { company_id: company, label: label.trim() }); setLabel(''); load(); setToast({ type: 'success', msg: 'สร้างลิงก์แล้ว' }); }
    catch (e) { setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'สร้างลิงก์ไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (confirmRevoke !== id) { setConfirmRevoke(id); return; }
    setBusy(true);
    try { await postJson('/api/visitor/links', { id }, 'PATCH'); setConfirmRevoke(''); load(); setToast({ type: 'success', msg: 'ยกเลิกลิงก์แล้ว' }); }
    catch (e) { setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'ยกเลิกไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  function copy(text: string) { void navigator.clipboard?.writeText(text); setToast({ type: 'success', msg: 'คัดลอกแล้ว' }); }

  const boardUrl = company ? `${origin}/visitor/board/${company}` : '';
  const active = links.filter(l => l.active);
  const revoked = links.filter(l => !l.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">ลิงก์ขอ & จอ รปภ</h1><p className="text-sm text-gray-500">ลิงก์ขอแจกให้พนักงานที่ได้รับมอบหมายเท่านั้น (ไม่ต้อง login) · จอ รปภ เปิดได้ทุกเครื่องโดยไม่ต้อง login</p></div>
        {isAdmin && <select className={`${inputClass} !w-64`} value={company} onChange={e => setCompany(e.target.value)}>{companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}</select>}
      </div>

      <section className={cardClass} style={{ borderLeft: `4px solid ${VIZ.positive}` }}>
        <h2 className="inline-flex items-center gap-2 font-semibold text-lg" style={{ color: VIZ.positive }}><MonitorPlay size={20} />จอป้อม รปภ</h2>
        <p className="text-sm text-gray-600 mt-1">เปิด URL นี้บนจอมอนิเตอร์ที่ป้อม แสดงเฉพาะคำขอที่อนุมัติแล้วของวันนี้–พรุ่งนี้ รปภ กด &quot;มาถึง / ออก&quot; รายคนได้ รีเฟรชเองทุก 30 วินาที</p>
        <div className="mt-3 flex gap-3 items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {boardQr && <img src={boardQr} alt="QR จอ รปภ" width={88} height={88} className="rounded-lg border border-gray-200 shrink-0" title="QR สำหรับเปิดจอบนแท็บเล็ต/มือถือ รปภ" />}
          <div className="flex-1 flex gap-2">
            <input readOnly value={boardUrl} className={`${inputClass} font-mono text-sm`} onFocus={e => e.currentTarget.select()} />
            <button type="button" onClick={() => copy(boardUrl)} className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-white text-sm" style={{ background: VIZ.primary }}><Copy size={16} />คัดลอก</button>
            <a href={boardUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm border border-gray-300 bg-white"><ExternalLink size={16} />เปิด</a>
          </div>
        </div>
      </section>

      <section className={cardClass} style={{ borderLeft: `4px solid ${VIZ.primary}` }}>
        <h2 className="inline-flex items-center gap-2 font-semibold text-lg" style={{ color: VIZ.primary }}><Link2 size={20} />ลิงก์สำหรับพนักงานยื่นคำขอ</h2>
        <p className="text-sm text-gray-600 mt-1">สร้างได้หลายลิงก์ (เช่น แยกตามแผนก/ผู้ประสานงาน) เพื่อยกเลิกเฉพาะคนเมื่อจำเป็น ลิงก์ที่ยกเลิกแล้วจะเปิดฟอร์มไม่ได้ทันที คำขอเดิมไม่หาย</p>
        <div className="mt-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-60"><label className={labelClass} htmlFor="lbl">ชื่อลิงก์ (เพื่อให้จำได้ว่าแจกใคร)</label><input id="lbl" className={inputClass} value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="เช่น แผนก Facility – คุณสมชาย" /></div>
          <button type="button" disabled={busy || !company} onClick={() => void create()} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50" style={{ background: VIZ.primary }}><Plus size={16} />สร้างลิงก์</button>
        </div>
        <ul className="mt-5 divide-y divide-gray-100">
          {active.length === 0 && <li className="py-6 text-sm text-gray-400 text-center">ยังไม่มีลิงก์ — สร้างลิงก์แรกแล้วส่งให้ผู้ประสานงาน</li>}
          {active.map(l => {
            const url = `${origin}/visitor/request/${l.token}`;
            return (
              <li key={l.id} className="py-3 flex flex-wrap items-center gap-3">
                <LinkQr url={url} />
                <div className="flex-1 min-w-60">
                  <div className="font-medium">{l.label || <span className="text-gray-400">ไม่มีชื่อ</span>}</div>
                  <div className="text-xs text-gray-500">สร้างโดย {l.created_by} · {thaiDateTime(l.created_at)}</div>
                  <input readOnly value={url} className="mt-1 w-full font-mono text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 border border-gray-100" onFocus={e => e.currentTarget.select()} />
                </div>
                <a href={`/visitor/poster/${l.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-white" style={{ background: VIZ.positive }}><QrCode size={14} />โปสเตอร์ QR</a>
                <button type="button" onClick={() => copy(url)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm border border-gray-300 bg-white"><Copy size={14} />คัดลอก</button>
                <button type="button" disabled={busy} onClick={() => void revoke(l.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${VIZ.accent}`, color: confirmRevoke === l.id ? 'white' : VIZ.accent, background: confirmRevoke === l.id ? VIZ.accent : 'white' }}><Ban size={14} />{confirmRevoke === l.id ? 'ยืนยันยกเลิก' : 'ยกเลิก'}</button>
              </li>
            );
          })}
        </ul>
        {revoked.length > 0 && <details className="mt-4 text-sm text-gray-500"><summary className="cursor-pointer">ลิงก์ที่ยกเลิกแล้ว ({revoked.length})</summary><ul className="mt-2 space-y-1">{revoked.map(l => <li key={l.id}>{l.label || '(ไม่มีชื่อ)'} · ยกเลิกโดย {l.revoked_by} {thaiDateTime(l.revoked_at)}</li>)}</ul></details>}
      </section>
      <section className={cardClass} style={{ borderLeft: `4px solid ${VIZ.secondary}` }}>
        <h2 className="inline-flex items-center gap-2 font-semibold text-lg" style={{ color: VIZ.secondary }}><MapPin size={20} />พื้นที่ปฏิบัติงาน & แผนก ของบริษัทนี้</h2>
        <p className="text-sm text-gray-600 mt-1">รายการตัวเลือกในแบบฟอร์มของแต่ละบริษัทไม่เหมือนกัน พิมพ์บรรทัดละ 1 รายการ · ถ้าเว้นว่าง แบบฟอร์มจะให้พนักงานพิมพ์เอง · คำขอเดิมไม่เปลี่ยน</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><label className={labelClass} htmlFor="areas">พื้นที่ปฏิบัติงาน ({areasText.split(/\r?\n/).filter(x => x.trim()).length} รายการ)</label>
            <textarea id="areas" className={`${inputClass} font-mono text-sm`} rows={10} value={areasText} onChange={e => { setAreasText(e.target.value); setOptionsDirty(true); }} placeholder={'อาคาร A ชั้น 1\nห้อง Workshop\nพื้นที่รอบนอกอาคาร\nอื่น ๆ'} /></div>
          <div><label className={labelClass} htmlFor="depts">แผนกผู้แจ้ง ({deptText.split(/\r?\n/).filter(x => x.trim()).length} รายการ)</label>
            <textarea id="depts" className={`${inputClass} font-mono text-sm`} rows={10} value={deptText} onChange={e => { setDeptText(e.target.value); setOptionsDirty(true); }} placeholder={'Safety & Environment\nProduction\nMaintenance\nOthers (อื่นๆ)'} /></div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={busy || !optionsDirty || !company} onClick={() => void saveOptions()} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50" style={{ background: VIZ.secondary }}><Save size={16} />บันทึกรายการ</button>
          {optionsDirty && <span className="text-sm text-gray-500">มีการแก้ไขที่ยังไม่บันทึก</span>}
        </div>
      </section>
      <ToastView toast={toast} />
    </div>
  );
}

function LinkQr({ url }: { url: string }) {
  const qr = useQr(url, 160);
  if (!qr) return <div className="w-20 h-20 rounded-lg bg-gray-100 shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={qr} alt="QR ลิงก์ขอ" width={80} height={80} className="rounded-lg border border-gray-200 shrink-0" />;
}

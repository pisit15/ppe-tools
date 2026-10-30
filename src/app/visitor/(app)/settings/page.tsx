'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, MonitorPlay, Plus, Ban, ExternalLink, QrCode, MapPin, Save, ImagePlus, Trash2, Image as ImageIcon, Bell, Send, RefreshCw } from 'lucide-react';
import { fileToBoundedDataUrl } from '../../_components/image';
import { useAuth } from '@/components/AuthProvider';
import type { LineGroupOption, NotifyLogRow, VisitorCompanyOptionsRow, VisitorLinkRow } from '@/lib/visitor/types';
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
  const [bg, setBg] = useState<string | null>(null);
  const [bgDim, setBgDim] = useState(75);
  const [bgDirty, setBgDirty] = useState(false);
  const [lineGroup, setLineGroup] = useState<string>('');
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyDecision, setNotifyDecision] = useState(true);
  const [lineDirty, setLineDirty] = useState(false);
  const [lineInfo, setLineInfo] = useState<{ groups: LineGroupOption[]; log: NotifyLogRow[]; sent_this_month_all_companies: number; configured: boolean } | null>(null);
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
      .then(r => { setAreasText(r.data.areas.join('\n')); setDeptText(r.data.departments.join('\n')); setOptionsDirty(false); setBg(r.data.form_background); setBgDim(r.data.form_background_dim ?? 75); setBgDirty(false); setLineGroup(r.data.line_group_id || ''); setNotifyNew(r.data.notify_new ?? true); setNotifyDecision(r.data.notify_decision ?? true); setLineDirty(false); })
      .catch((e: unknown) => setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'โหลดรายการพื้นที่ไม่สำเร็จ' }));
    loadLine();
  }, [company, setToast]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadLine() {
    if (!company) return;
    getJson<{ data: { groups: LineGroupOption[]; log: NotifyLogRow[]; sent_this_month_all_companies: number; configured: boolean } }>(`/api/visitor/line?company=${encodeURIComponent(company)}`)
      .then(r => setLineInfo(r.data)).catch(() => setLineInfo(null));
  }
  async function sendTest(digest = false) {
    if (busy || !company) return;
    setBusy(true);
    try { const r = await postJson<{ data: { count: number } }>('/api/visitor/line', { company_id: company, ...(digest ? { action: 'digest' } : {}) }); setToast({ type: 'success', msg: digest ? `ส่งสรุปค้างอนุมัติ ${r.data.count} รายการเข้ากลุ่มแล้ว` : 'ส่งข้อความทดสอบเข้ากลุ่มแล้ว' }); loadLine(); }
    catch (e) { setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'ส่งไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }

  const split = (t: string) => t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  async function saveOptions(extra: Record<string, unknown> = {}, okMsg?: string) {
    if (busy || !company) return;
    setBusy(true);
    try {
      const r = await postJson<{ data: VisitorCompanyOptionsRow }>('/api/visitor/options', { company_id: company, areas: split(areasText), departments: split(deptText), ...extra }, 'PUT');
      setAreasText(r.data.areas.join('\n')); setDeptText(r.data.departments.join('\n')); setOptionsDirty(false);
      setBg(r.data.form_background); setBgDim(r.data.form_background_dim ?? 75); setBgDirty(false);
      setLineGroup(r.data.line_group_id || ''); setNotifyNew(r.data.notify_new ?? true); setNotifyDecision(r.data.notify_decision ?? true); setLineDirty(false);
      setToast({ type: 'success', msg: okMsg || `บันทึกแล้ว: พื้นที่ ${r.data.areas.length} · แผนก ${r.data.departments.length}` });
    } catch (e) { setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'บันทึกไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  async function pickBackground(file: File | undefined) {
    if (!file) return;
    try { setBg(await fileToBoundedDataUrl(file, 800_000)); setBgDirty(true); }
    catch { setToast({ type: 'error', msg: 'ใช้ภาพนี้ไม่ได้ หรือภาพใหญ่เกินไป' }); }
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
      <section className={cardClass} style={{ borderLeft: `4px solid ${VIZ.positive}` }}>
        <h2 className="inline-flex items-center gap-2 font-semibold text-lg" style={{ color: VIZ.positive }}><Bell size={20} />การแจ้งเตือน LINE (ของบริษัทนี้)</h2>
        <p className="text-sm text-gray-600 mt-1">เชิญ LINE OA <strong>EA HSE Center</strong> เข้ากลุ่ม LINE ของบริษัท แล้วเลือกกลุ่มด้านล่าง ระบบจะส่งการ์ด 1 ข้อความต่อเหตุการณ์ (คำขอใหม่ / ผลการพิจารณา) ไม่ว่าในกลุ่มมีกี่คน</p>
        {lineInfo && !lineInfo.configured && <p className="mt-2 text-sm rounded-lg px-3 py-2" style={{ background: `${VIZ.accent}1A`, color: VIZ.accent }}>เซิร์ฟเวอร์ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN — ส่งข้อความไม่ได้</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="lg">กลุ่ม LINE ที่รับแจ้งเตือน</label>
            <div className="flex gap-2">
              <select id="lg" className={inputClass} value={lineGroup} onChange={e => { setLineGroup(e.target.value); setLineDirty(true); }}>
                <option value="">— ไม่แจ้งเตือน —</option>
                {(lineInfo?.groups || []).map(g => <option key={g.group_id} value={g.group_id} disabled={!g.active && g.group_id !== lineGroup}>{g.group_name || '(ไม่ทราบชื่อกลุ่ม)'}{g.active ? '' : ' — บอทออกจากกลุ่มแล้ว'} · {g.group_id.slice(0, 8)}…</option>)}
              </select>
              <button type="button" onClick={loadLine} className="shrink-0 rounded-lg border border-gray-300 bg-white px-3" aria-label="โหลดรายชื่อกลุ่มใหม่"><RefreshCw size={16} /></button>
            </div>
            <p className="mt-1 text-xs text-gray-500">{lineInfo && lineInfo.groups.length === 0 ? 'ยังไม่มีกลุ่มที่บอทเข้าไป — เชิญ EA HSE Center เข้ากลุ่มแล้วกดรีเฟรช' : 'เห็นเฉพาะกลุ่มที่บอทอยู่ ณ ตอนนี้'}</p>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={notifyNew} onChange={e => { setNotifyNew(e.target.checked); setLineDirty(true); }} className="accent-[#4E79A7]" />แจ้งเมื่อมี<strong>คำขอใหม่</strong> (ให้ผู้อนุมัติเห็นทันที)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={notifyDecision} onChange={e => { setNotifyDecision(e.target.checked); setLineDirty(true); }} className="accent-[#4E79A7]" />แจ้ง<strong>ผลการพิจารณา</strong> (อนุมัติ/ขอข้อมูลเพิ่ม/ไม่อนุมัติ/ยกเลิก)</label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !lineDirty || !company} onClick={() => void saveOptions({ line_group_id: lineGroup || null, notify_new: notifyNew, notify_decision: notifyDecision }, 'บันทึกการแจ้งเตือน LINE แล้ว')} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50" style={{ background: VIZ.positive }}><Save size={16} />บันทึก</button>
              <button type="button" disabled={busy || lineDirty || !lineGroup} onClick={() => void sendTest()} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-sm font-medium border border-gray-300 bg-white disabled:opacity-50" title={lineDirty ? 'บันทึกก่อนส่งทดสอบ' : ''}><Send size={16} />ส่งข้อความทดสอบ</button>
              <button type="button" disabled={busy || lineDirty || !lineGroup} onClick={() => void sendTest(true)} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-sm font-medium border bg-white disabled:opacity-50" style={{ borderColor: VIZ.secondary, color: VIZ.secondary }} title="ส่งรายการที่ยังรออนุมัติทั้งหมดเข้ากลุ่ม 1 ข้อความ"><Bell size={16} />ส่งสรุปค้างอนุมัติเข้ากลุ่ม</button>
            </div>
          </div>
          <div className="text-sm">
            <div className="text-xs text-gray-500 mb-1">ประวัติการส่งล่าสุดของบริษัทนี้ · ส่งสำเร็จเดือนนี้ทุกบริษัทรวม <strong>{lineInfo?.sent_this_month_all_companies ?? '–'}</strong> ข้อความ (โควตาฟรี 200/เดือน)</div>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 max-h-56 overflow-y-auto">
              {(lineInfo?.log || []).length === 0 && <li className="px-3 py-3 text-gray-400">ยังไม่เคยส่ง</li>}
              {(lineInfo?.log || []).map(l => <li key={l.id} className="px-3 py-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.http_status && l.http_status < 300 ? VIZ.positive : VIZ.accent }} /><span className="text-gray-500 whitespace-nowrap">{thaiDateTime(l.sent_at)}</span><span>{l.kind === 'new_request' ? 'คำขอใหม่' : l.kind === 'decision' ? 'ผลพิจารณา' : 'ทดสอบ/สรุป'}</span>{l.error && <span className="text-xs truncate" style={{ color: VIZ.accent }} title={l.error}>{l.http_status} {l.error}</span>}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className={cardClass} style={{ borderLeft: `4px solid ${VIZ.neutral}` }}>
        <h2 className="inline-flex items-center gap-2 font-semibold text-lg" style={{ color: VIZ.lightText }}><ImageIcon size={20} />ภาพพื้นหลังแบบฟอร์ม (ของบริษัทนี้)</h2>
        <p className="text-sm text-gray-600 mt-1">แสดงหลังแบบฟอร์มขอเข้าพื้นที่ของทุกลิงก์ในบริษัทนี้ และเป็นค่าเริ่มต้นของจอ รปภ (ถ้าจอยังไม่ได้เลือกภาพเอง) แนะนำภาพแนวนอน เช่น ภาพโรงงาน ระบบย่อขนาดให้อัตโนมัติ</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr] items-start">
          <div className="rounded-lg overflow-hidden border border-gray-200 aspect-video relative" style={{ background: '#F5F6F8' }}>
            {bg ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bg} alt="ตัวอย่างพื้นหลัง" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: `rgba(245,246,248,${bgDim / 100})` }} />
              <div className="absolute inset-4 rounded-lg bg-white shadow-sm border border-gray-100 flex items-center justify-center text-xs text-gray-500">ตัวอย่างการ์ดฟอร์ม</div>
            </> : <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">ยังไม่มีภาพ (พื้นเทาเรียบ)</div>}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-white cursor-pointer" style={{ background: VIZ.primary }}><ImagePlus size={16} />{bg ? 'เปลี่ยนภาพ' : 'เลือกภาพ'}<input type="file" accept="image/*" className="hidden" onChange={e => { void pickBackground(e.target.files?.[0]); e.target.value = ''; }} /></label>
              {bg && <button type="button" onClick={() => { setBg(null); setBgDirty(true); }} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm border" style={{ borderColor: VIZ.accent, color: VIZ.accent }}><Trash2 size={16} />ลบภาพ</button>}
            </div>
            <label className="block text-sm text-gray-700">ความทึบของชั้นสีขาวทับภาพ (ยิ่งมาก ฟอร์มยิ่งอ่านง่าย): <strong>{bgDim}%</strong>
              <input type="range" min={0} max={95} value={bgDim} onChange={e => { setBgDim(Number(e.target.value)); setBgDirty(true); }} className="block w-full mt-1" disabled={!bg} /></label>
            <button type="button" disabled={busy || !bgDirty || !company} onClick={() => void saveOptions({ form_background: bg ?? '', form_background_dim: bgDim }, 'บันทึกภาพพื้นหลังแล้ว')} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50" style={{ background: VIZ.primary }}><Save size={16} />บันทึกพื้นหลัง</button>
          </div>
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

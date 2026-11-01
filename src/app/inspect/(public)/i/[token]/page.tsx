'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, ChevronUp, History, ImagePlus, Info, LogIn, MapPin, Minus, ShieldCheck, Trash2, X } from 'lucide-react';
import type { InspItemDef, InspPublicAssetInfo, InspResultValue } from '@/lib/inspect/types';
import { INSPECT_LIMITS } from '@/lib/inspect/constants';
import { CategoryTile } from '../../../_components/icons';
import { compressImage, uploadPhoto, type Compressed } from '../../../_components/photo';
import { DueBadge, FetchError, PAGE_BG, ToastView, VIZ, bangkokToday, btnPrimary, btnSecondary, daysUntil, errMsg, getJson, inputClass, labelClass, postJson, relativeDays, thaiDate, useToast } from '../../../_components/ui';

type Done = { id: string; overall: 'pass' | 'fail'; fail_items: string[]; inspected_on: string; inspector_name: string };
type Photo = { id: string; path: string; preview: string; uploading: boolean; error?: string };
const CODE_KEY = 'insp.inspector';

export default function PublicInspectPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InspPublicAssetInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const { toast, setToast } = useToast();
  const [results, setResults] = useState<Record<string, InspResultValue>>({});
  const [note, setNote] = useState('');
  const [inspectorCode, setInspectorCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [repeatOk, setRepeatOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await getJson<{ data: InspPublicAssetInfo }>(`/api/inspect/public/asset/${encodeURIComponent(token)}`);
      setInfo(data);
      const init: Record<string, InspResultValue> = {};
      for (const it of data.template.items) init[it.key] = it.kind === 'number' ? null : 'pass';
      setResults(init);
    } catch (e) { setLoadError(e instanceof FetchError ? e.message : 'โหลดข้อมูลอุปกรณ์ไม่สำเร็จ'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CODE_KEY);
      if (raw) { const s = JSON.parse(raw) as { code: string; at: number }; if (Date.now() - s.at < INSPECT_LIMITS.rememberInspectorDays * 86400000) setInspectorCode(s.code); }
    } catch { /* ignore */ }
  }, []);

  const needsCode = !!info && info.mode === 'department' && !info.actor;
  const sheRequired = !!info && info.mode === 'she' && !info.actor;
  const fails = useMemo(() => (info?.template.items || []).filter(it => it.kind !== 'number' && results[it.key] === 'fail'), [info, results]);
  const overall: 'pass' | 'fail' = fails.length ? 'fail' : 'pass';
  const maxPhotos = info ? (overall === 'fail' ? info.settings.max_photos_fail : info.settings.max_photos_pass) : 1;
  const missing = useMemo(() => (info?.template.items || []).filter(it => it.required && (results[it.key] === null || results[it.key] === undefined)), [info, results]);
  const photoRequired = !!info && info.settings.require_photo && info.settings.max_photos_pass > 0;
  const readyPhotos = photos.filter(p => p.path && !p.uploading);
  const repeatWarn = !!info && info.inspected_this_period && info.last_inspection?.overall === 'pass';
  const canSubmit = !!info && !busy && !sheRequired && missing.length === 0 && (!needsCode || inspectorCode.trim().length >= 3) && (!photoRequired || readyPhotos.length > 0) && !photos.some(p => p.uploading) && (!repeatWarn || repeatOk);

  const setResult = (key: string, v: InspResultValue) => setResults(prev => ({ ...prev, [key]: v }));

  async function addPhotos(files: FileList | null) {
    if (!files || !info) return;
    const room = maxPhotos - photos.length;
    if (room <= 0) { setToast({ type: 'info', msg: `แนบได้สูงสุด ${maxPhotos} รูป${overall === 'pass' ? ' (เพิ่มได้เมื่อมีข้อไม่ผ่าน)' : ''}` }); return; }
    const list = Array.from(files).slice(0, room);
    for (const file of list) {
      let c: Compressed;
      try { c = await compressImage(file); } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'ย่อรูปไม่สำเร็จ') }); continue; }
      const id = Math.random().toString(36).slice(2);
      setPhotos(prev => [...prev, { id, path: '', preview: c.previewUrl, uploading: true }]);
      try {
        const path = await uploadPhoto(c, { url: '/api/inspect/public/photos/sign', body: { token, inspector_code: inspectorCode.trim() } }, { url: '/api/inspect/public/photos/confirm', body: { token } });
        setPhotos(prev => prev.map(p => (p.id === id ? { ...p, path, uploading: false } : p)));
        if (needsCode) setCodeVerified(true);
      } catch (e) {
        const msg = errMsg(e, 'อัปโหลดไม่สำเร็จ');
        setPhotos(prev => prev.map(p => (p.id === id ? { ...p, uploading: false, error: msg } : p)));
        setToast({ type: 'error', msg });
      }
    }
  }

  async function submit() {
    if (!info || !canSubmit) return;
    setBusy(true); setSubmitError('');
    try {
      const { data } = await postJson<{ data: Done }>('/api/inspect/public/inspections', { token, inspector_code: inspectorCode.trim(), results, note: note.trim(), photo_paths: readyPhotos.map(p => p.path), confirm_repeat: repeatOk });
      if (needsCode) try { window.localStorage.setItem(CODE_KEY, JSON.stringify({ code: inspectorCode.trim(), at: Date.now() })); } catch { /* ignore */ }
      setDone(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setSubmitError(errMsg(e)); }
    finally { setBusy(false); }
  }

  // ---------------------------------------------------------------- render
  if (loadError) return <Shell><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><AlertTriangle size={36} className="mx-auto mb-3" color={VIZ.accent} /><p className="font-medium text-gray-800">{loadError}</p><p className="text-sm text-gray-500 mt-2">ลองสแกน QR อีกครั้ง หรือแจ้งทีม SHE</p></div></Shell>;
  if (!info) return <Shell><div className="space-y-3"><div className="h-28 rounded-2xl bg-white animate-pulse" /><div className="h-64 rounded-2xl bg-white animate-pulse" /></div></Shell>;

  const c = info.category;
  const svcDays = daysUntil(info.status.next_service_due_on);
  const attrs = c.attributes.map(a => ({ label: a.label, value: info.asset.attributes?.[a.key] })).filter(a => a.value !== null && a.value !== undefined && a.value !== '');

  if (done) {
    const ok = done.overall === 'pass';
    return (
      <Shell>
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-8 text-center text-white" style={{ background: ok ? VIZ.positive : VIZ.accent }}>
            {ok ? <CheckCircle2 size={48} className="mx-auto mb-2" /> : <AlertTriangle size={48} className="mx-auto mb-2" />}
            <h1 className="text-2xl font-semibold">{ok ? 'บันทึกแล้ว — ผ่านทุกข้อ' : `บันทึกแล้ว — ไม่ผ่าน ${done.fail_items.length} ข้อ`}</h1>
            <p className="text-sm opacity-90 mt-1">{info.asset.code} · {thaiDate(done.inspected_on)} · {done.inspector_name}</p>
          </div>
          <div className="p-6 space-y-4">
            {!ok && <div className="rounded-xl p-4 text-sm" style={{ background: `${VIZ.accent}10` }}><p className="font-medium text-gray-800 mb-1">ข้อที่ไม่ผ่าน</p><ul className="list-disc pl-5 text-gray-700">{done.fail_items.map(k => <li key={k}>{info.template.items.find(i => i.key === k)?.label || k}</li>)}</ul><p className="text-xs text-gray-500 mt-2">ทีม SHE จะเห็นรายการนี้ในหน้า “ไม่ผ่าน รอแก้ไข” และปิดงานเมื่อแก้ไขแล้ว</p></div>}
            <p className="text-sm text-gray-600 text-center">สแกน QR ที่อุปกรณ์ชิ้นถัดไปเพื่อตรวจต่อได้เลย</p>
            {info.actor && <Link href={`/inspect/assets/${info.asset.id}`} className={`${btnSecondary} w-full`}><History size={16} />ดูประวัติอุปกรณ์นี้</Link>}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* asset header */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="h-1.5" style={{ background: c.color }} />
        <div className="p-5">
          <div className="flex items-start gap-3">
            <CategoryTile name={c.icon} color={c.color} size={48} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: c.color }}>{c.name}</p>
              <h1 className="text-2xl font-semibold text-gray-900 leading-tight">{info.asset.code}</h1>
              {info.asset.name && <p className="text-sm text-gray-600">{info.asset.name}</p>}
              <p className="text-sm text-gray-500 mt-1 inline-flex items-center gap-1"><MapPin size={14} />{[info.asset.department, info.asset.building, info.asset.floor && `ชั้น ${info.asset.floor}`, info.asset.location].filter(Boolean).join(' · ') || info.company.name}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <DueBadge state={info.status.due_state} />
            {info.status.last_inspected_on ? <span className="text-gray-500">ตรวจล่าสุด {thaiDate(info.status.last_inspected_on)} โดย {info.last_inspection?.inspector_name}</span> : <span className="text-gray-500">ยังไม่มีประวัติการตรวจ</span>}
          </div>
          {repeatWarn ? (
            <div className="mt-3 rounded-xl px-3 py-2.5 text-sm" style={{ background: `${VIZ.secondary}14`, color: '#9A5B00' }}>
              <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><b>ตรวจผ่านแล้วในรอบนี้</b> — {thaiDate(info.last_inspection!.inspected_on)} โดย {info.last_inspection!.inspector_name} ปกติไม่ต้องตรวจซ้ำ</span></div>
              <label className="mt-2 flex items-center gap-2 text-gray-800"><input type="checkbox" checked={repeatOk} onChange={e => setRepeatOk(e.target.checked)} />ต้องการบันทึกซ้ำ (ตรวจเพิ่ม / แก้ไขผลเดิม)</label>
            </div>
          ) : info.inspected_this_period && <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: `${VIZ.primary}10`, color: VIZ.primary }}><Info size={16} className="mt-0.5 shrink-0" /><span>รอบนี้เคยตรวจแล้วแต่ไม่ผ่าน — บันทึกผลตรวจซ้ำหลังแก้ไขได้เลย</span></div>}
          {svcDays !== null && svcDays <= 90 && <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: svcDays < 0 ? `${VIZ.accent}12` : `${VIZ.secondary}14`, color: svcDays < 0 ? VIZ.accent : '#9A5B00' }}><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><b>{c.service_label || 'ทดสอบตามรอบ'}</b> {svcDays < 0 ? `เลยกำหนดมาแล้ว ${-svcDays} วัน` : `ครบกำหนด ${thaiDate(info.status.next_service_due_on)} (${relativeDays(info.status.next_service_due_on)})`} — แจ้งทีม SHE</span></div>}
          {info.status.open_failures > 0 && <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: `${VIZ.secondary}14`, color: '#9A5B00' }}><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>มีรายการไม่ผ่านที่ยังไม่ปิดงาน {info.status.open_failures} รายการ{info.last_inspection?.overall === 'fail' ? `: ${info.last_inspection.fail_items.map(k => info.template.items.find(i => i.key === k)?.label || k).join(', ')}` : ''}</span></div>}
          {attrs.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowDetails(s => !s)} className="text-xs text-gray-500 inline-flex items-center gap-1">{showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}รายละเอียดอุปกรณ์</button>
              {showDetails && <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">{attrs.map(a => <div key={a.label}><dt className="text-xs text-gray-400">{a.label}</dt><dd className="text-gray-800">{String(a.value)}</dd></div>)}{info.asset.mfg_year && <div><dt className="text-xs text-gray-400">ผลิต</dt><dd className="text-gray-800">{info.asset.mfg_month ? `${info.asset.mfg_month}/` : ''}{info.asset.mfg_year}</dd></div>}</dl>}
            </div>
          )}
        </div>
      </div>

      {sheRequired ? (
        <div className="rounded-2xl bg-white shadow-sm p-6 text-center">
          <ShieldCheck size={36} className="mx-auto mb-2" color={VIZ.primary} />
          <p className="font-medium text-gray-800">{info.company.name} ให้ทีม SHE เป็นผู้ตรวจ</p>
          <p className="text-sm text-gray-500 mt-1">เข้าสู่ระบบด้วยบัญชี SHE แล้วสแกน QR นี้อีกครั้ง</p>
          <Link href={`/inspect?next=/inspect/i/${token}`} className={`${btnPrimary} mt-4`} style={{ background: VIZ.primary }}><LogIn size={16} />เข้าสู่ระบบ</Link>
        </div>
      ) : (
        <>
          {/* inspector */}
          <div className="rounded-2xl bg-white shadow-sm p-5">
            {info.actor ? (
              <p className="text-sm text-gray-700 inline-flex items-center gap-2"><ShieldCheck size={16} color={VIZ.positive} />ผู้ตรวจ: <b>{info.actor.name}</b> <span className="text-gray-400">(ทีม SHE)</span></p>
            ) : (
              <>
                <label className={labelClass} htmlFor="code">รหัสผู้ตรวจ (รหัสพนักงาน) *</label>
                <div className="relative">
                  <input id="code" className={`${inputClass} text-lg tracking-wider pr-10`} inputMode="text" autoComplete="off" value={inspectorCode} onChange={e => { setInspectorCode(e.target.value.toUpperCase()); setCodeVerified(false); }} placeholder="เช่น 0058" maxLength={20} />
                  {codeVerified && <Check size={18} className="absolute right-3 top-1/2 -translate-y-1/2" color={VIZ.positive} />}
                </div>
                <p className="text-xs text-gray-400 mt-1">ต้องเป็นรหัสที่ทีม SHE ลงทะเบียนไว้ · ระบบจำรหัสในเครื่องนี้ {INSPECT_LIMITS.rememberInspectorDays} วัน</p>
              </>
            )}
          </div>

          {/* checklist */}
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div><h2 className="font-semibold text-gray-900">รายการตรวจ</h2><p className="text-xs text-gray-500">{info.template.name} · วันนี้ {thaiDate(bangkokToday())}</p></div>
              <span className="text-xs text-gray-500">{info.template.items.length} ข้อ</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {info.template.items.map((it, i) => <ChecklistRow key={it.key} index={i + 1} item={it} value={results[it.key]} onChange={v => setResult(it.key, v)} />)}
            </ul>
            <div className="px-5 py-4 border-t border-gray-100" style={{ background: overall === 'fail' ? `${VIZ.accent}0D` : `${VIZ.positive}0D` }}>
              <div className="flex items-center justify-between"><span className="text-sm text-gray-600">ผลรวม</span><span className="font-semibold" style={{ color: overall === 'fail' ? VIZ.accent : VIZ.positive }}>{overall === 'fail' ? `ไม่ผ่าน ${fails.length} ข้อ` : 'ผ่านทุกข้อ'}</span></div>
              {missing.length > 0 && <p className="text-xs mt-1" style={{ color: VIZ.secondary }}>ยังไม่ได้กรอก: {missing.map(m => m.label).join(', ')}</p>}
            </div>
          </div>

          {/* photos */}
          <div className="rounded-2xl bg-white shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div><h2 className="font-semibold text-gray-900">รูปถ่าย{photoRequired ? ' *' : ''}</h2><p className="text-xs text-gray-500">{overall === 'fail' ? `ถ่ายจุดที่ไม่ผ่านให้เห็นชัด · สูงสุด ${maxPhotos} รูป` : `ถ่ายให้เห็นป้ายรหัสและสภาพรวม · ${maxPhotos} รูป`} · ย่อรูปอัตโนมัติ</p></div>
              <span className="text-xs text-gray-400">{readyPhotos.length}/{maxPhotos}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {photos.map(p => (
                <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.uploading ? 'opacity-50' : ''}`} />
                  {p.uploading && <span className="absolute inset-0 flex items-center justify-center"><span className="h-7 w-7 rounded-full border-2 border-white/60 border-t-white animate-spin" /></span>}
                  {p.error && <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">{p.error}</span>}
                  <button type="button" aria-label="ลบรูป" onClick={() => setPhotos(prev => prev.filter(x => x.id !== p.id))} className="absolute top-1 right-1 rounded-full bg-black/55 p-1 text-white"><Trash2 size={13} /></button>
                </div>
              ))}
              {photos.length < maxPhotos && (
                <button type="button" onClick={() => { if (needsCode && inspectorCode.trim().length < 3) { setToast({ type: 'info', msg: 'กรอกรหัสผู้ตรวจก่อนแนบรูป' }); return; } fileRef.current?.click(); }} className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-[#4E79A7] hover:text-[#4E79A7] transition">
                  <Camera size={24} /><span className="text-xs">ถ่ายรูป</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} />
            {photos.length === 0 && photos.length < maxPhotos && <button type="button" onClick={() => { if (needsCode && inspectorCode.trim().length < 3) { setToast({ type: 'info', msg: 'กรอกรหัสผู้ตรวจก่อนแนบรูป' }); return; } const el = document.getElementById('insp-gallery') as HTMLInputElement | null; el?.click(); }} className="mt-3 text-xs text-gray-500 inline-flex items-center gap-1"><ImagePlus size={14} />เลือกจากคลังรูปแทน</button>}
            <input id="insp-gallery" type="file" accept="image/*" multiple className="sr-only" onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} />
          </div>

          {/* note + submit */}
          <div className="rounded-2xl bg-white shadow-sm p-5 space-y-4">
            <div><label className={labelClass} htmlFor="note">หมายเหตุ {overall === 'fail' && <span className="font-normal text-gray-400">(อธิบายจุดที่ไม่ผ่าน)</span>}</label><textarea id="note" className={inputClass} rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={overall === 'fail' ? 'เช่น เกจตกเขตแดง ต้องส่งอัดใหม่' : 'ไม่บังคับ'} /></div>
            {submitError && <p role="alert" className="text-sm rounded-lg px-3 py-2" style={{ background: `${VIZ.accent}14`, color: VIZ.accent }}>{submitError}</p>}
            <button type="button" disabled={!canSubmit} onClick={submit} className={`${btnPrimary} w-full py-3.5 text-base`} style={{ background: overall === 'fail' ? VIZ.accent : VIZ.positive }}>
              {busy ? 'กำลังบันทึก…' : overall === 'fail' ? `บันทึกผล — ไม่ผ่าน ${fails.length} ข้อ` : 'บันทึกผล — ผ่านทุกข้อ'}
            </button>
            {!canSubmit && !busy && <p className="text-xs text-center text-gray-400">{needsCode && inspectorCode.trim().length < 3 ? 'กรอกรหัสผู้ตรวจ' : missing.length ? 'กรอกรายการที่ยังขาด' : photoRequired && readyPhotos.length === 0 ? 'แนบรูปอย่างน้อย 1 รูป' : photos.some(p => p.uploading) ? 'รอรูปอัปโหลดเสร็จ' : ''}</p>}
          </div>
        </>
      )}
      <ToastView toast={toast} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: PAGE_BG, color: VIZ.text }}>
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ea-logo.svg" alt="EA" width={28} height={22} /><span>EA SHE Tools · ตรวจอุปกรณ์ความปลอดภัย</span>
        </div>
        {children}
        <p className="text-center text-[11px] text-gray-400 pb-6">รูปถูกย่อในเครื่องก่อนส่ง และเก็บตามระยะเวลาที่บริษัทกำหนด · ผลตรวจเก็บถาวร</p>
      </div>
    </div>
  );
}

function ChecklistRow({ index, item, value, onChange }: { index: number; item: InspItemDef; value: InspResultValue | undefined; onChange: (v: InspResultValue) => void }) {
  if (item.kind === 'number') {
    return (
      <li className="px-5 py-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-gray-100 text-xs font-medium text-gray-500 inline-flex items-center justify-center">{index}</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">{item.label}{item.required && ' *'}</p>
            {item.hint && <p className="text-xs text-gray-500">{item.hint}</p>}
            <div className="mt-2 flex items-center gap-2"><input type="number" inputMode="decimal" step="0.01" className={`${inputClass} max-w-[160px] text-lg`} value={value === null || value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />{item.unit && <span className="text-sm text-gray-500">{item.unit}</span>}</div>
          </div>
        </div>
      </li>
    );
  }
  const v = value as 'pass' | 'fail' | 'na' | null | undefined;
  const opts: { v: 'pass' | 'fail' | 'na'; label: string; color: string; icon: React.ReactNode }[] = [
    { v: 'pass', label: 'ผ่าน', color: VIZ.positive, icon: <Check size={16} /> },
    { v: 'fail', label: 'ไม่ผ่าน', color: VIZ.accent, icon: <X size={16} /> },
  ];
  if (item.kind === 'pass_fail_na') opts.push({ v: 'na', label: 'ไม่มี', color: VIZ.neutral, icon: <Minus size={16} /> });
  return (
    <li className="px-5 py-3.5" style={v === 'fail' ? { background: `${VIZ.accent}08` } : undefined}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-xs font-medium inline-flex items-center justify-center" style={{ background: v === 'fail' ? `${VIZ.accent}1A` : '#F3F4F6', color: v === 'fail' ? VIZ.accent : '#6B7280' }}>{index}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">{item.label}{item.required && <span className="text-gray-400"> *</span>}</p>
          {item.hint && <p className="text-xs text-gray-500">{item.hint}</p>}
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
            {opts.map(o => {
              const active = v === o.v;
              return (
                <button key={o.v} type="button" aria-pressed={active} onClick={() => onChange(o.v)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-sm font-medium transition active:scale-[0.98] ${active ? 'border-transparent text-white shadow-sm' : 'border-gray-200 bg-white text-gray-600'}`}
                  style={active ? { background: o.color } : undefined}>
                  {o.icon}{o.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </li>
  );
}

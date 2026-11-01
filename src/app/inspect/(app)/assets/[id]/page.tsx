'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, ClipboardCheck, ExternalLink, FileText, ImageOff, MapPin, Pencil, Printer, RefreshCw, Trash2, Wrench, XCircle } from 'lucide-react';
import type { InspAssetView, InspCategoryRow, InspInspectionView, InspServiceEventRow, InspServiceKind, InspTemplateRow } from '@/lib/inspect/types';
import { SERVICE_KIND_LABEL } from '@/lib/inspect/constants';
import { AssetForm, type AssetFormValue } from '../../../_components/AssetForm';
import { CategoryTile } from '../../../_components/icons';
import { useQr } from '../../../_components/useQr';
import { compressImage, uploadPhoto } from '../../../_components/photo';
import { ConfirmButton, Drawer, DueBadge, Modal, OverallBadge, SectionTitle, Skeleton, ToastView, VIZ, bangkokToday, btnGhost, btnPrimary, btnSecondary, cardClass, daysUntil, errMsg, getJson, inputClass, labelClass, postJson, relativeDays, thaiDate, thaiDateTime, useToast } from '../../../_components/ui';

type Detail = { asset: InspAssetView; inspections: InspInspectionView[]; service_events: InspServiceEventRow[]; reference_photo_url: string | null };
type Catalog = { categories: InspCategoryRow[]; templates: InspTemplateRow[] };

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, setToast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], templates: [] });
  const [departments, setDepartments] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await getJson<{ data: Detail }>(`/api/inspect/assets/${id}`);
      setD(data);
      const [c, all] = await Promise.all([
        getJson<{ data: Catalog }>(`/api/inspect/categories?company=${encodeURIComponent(data.asset.company_id)}`),
        getJson<{ data: InspAssetView[] }>(`/api/inspect/assets?company=${encodeURIComponent(data.asset.company_id)}&all=1`),
      ]);
      setCatalog(c.data);
      setDepartments([...new Set(all.data.map(a => a.department).filter(Boolean))].sort());
    } catch (e) { setError(errMsg(e, 'โหลดข้อมูลไม่สำเร็จ')); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const a = d?.asset;
  const formUrl = a && origin ? `${origin}/inspect/i/${a.qr_token}` : '';
  const qr = useQr(formUrl || null, 200);
  const template = useMemo(() => a ? catalog.templates.find(t => t.id === a.template_id) || catalog.templates.find(t => t.category_id === a.category_id && t.is_default) || catalog.templates.find(t => t.category_id === a.category_id) : null, [a, catalog]);
  const itemLabel = useCallback((insp: InspInspectionView, key: string) => {
    const t = catalog.templates.find(x => x.id === insp.template_id) || template;
    return t?.items.find(i => i.key === key)?.label || key;
  }, [catalog, template]);

  async function save(v: AssetFormValue) {
    setBusy(true);
    try { await postJson(`/api/inspect/assets/${id}`, v, 'PATCH'); setToast({ type: 'success', msg: 'บันทึกแล้ว' }); setEdit(false); await load(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
    finally { setBusy(false); }
  }
  async function regenerateQr() {
    try { await postJson(`/api/inspect/assets/${id}`, { action: 'regenerate_qr' }, 'PATCH'); setToast({ type: 'success', msg: 'สร้าง QR ใหม่แล้ว — QR เดิมใช้ไม่ได้อีก' }); await load(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }
  async function remove() {
    try { await getJson(`/api/inspect/assets/${id}`, { method: 'DELETE' }); setToast({ type: 'success', msg: 'ลบแล้ว' }); router.push('/inspect/assets'); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }
  async function setReference(file: File) {
    if (!a) return;
    setBusy(true);
    try {
      const c = await compressImage(file, 1024, 0.8);
      const path = await uploadPhoto(c, { url: '/api/inspect/photos/sign', body: { asset_id: a.id } }, { url: '/api/inspect/photos/confirm', body: { asset_id: a.id } });
      await postJson(`/api/inspect/assets/${id}`, { reference_photo_path: path }, 'PATCH');
      setToast({ type: 'success', msg: 'อัปเดตรูปอ้างอิงแล้ว' }); await load();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
    finally { setBusy(false); }
  }
  async function resolve(inspId: string, note: string) {
    try { await postJson(`/api/inspect/inspections/${inspId}`, { action: 'resolve', resolved_note: note }, 'PATCH'); setToast({ type: 'success', msg: 'ปิดงานแล้ว' }); await load(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }
  async function deleteInspection(inspId: string) {
    try { await getJson(`/api/inspect/inspections/${inspId}`, { method: 'DELETE' }); setToast({ type: 'success', msg: 'ลบรายการตรวจแล้ว' }); await load(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }

  if (error) return <div className={`${cardClass} text-center`}><p style={{ color: VIZ.accent }}>{error}</p><Link href="/inspect/assets" className={`${btnSecondary} mt-4`}><ArrowLeft size={16} />กลับทะเบียน</Link></div>;
  if (!d || !a) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>;

  const s = a.status_info;
  const svcDays = daysUntil(s.next_service_due_on);
  const cat = catalog.categories.find(c => c.id === a.category_id);
  const attrs = (cat?.attributes || []).map(x => ({ label: x.label, value: a.attributes?.[x.key] })).filter(x => x.value !== null && x.value !== undefined && x.value !== '');
  const passCount = d.inspections.filter(i => i.overall === 'pass').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/inspect/assets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={16} />ทะเบียนอุปกรณ์</Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/inspect/labels?ids=${a.id}`} className={btnSecondary}><Printer size={16} />พิมพ์ QR</Link>
          <button type="button" className={btnSecondary} onClick={() => setServiceOpen(true)}><Wrench size={16} />บันทึกงานทดสอบ/ซ่อม</button>
          <button type="button" className={btnSecondary} onClick={() => setEdit(true)}><Pencil size={16} />แก้ไข</button>
          {a.status === 'active' && <Link href={`/inspect/i/${a.qr_token}`} className={btnPrimary} style={{ background: VIZ.primary }}><ClipboardCheck size={16} />ตรวจตอนนี้</Link>}
        </div>
      </div>

      {/* header card */}
      <div className={`${cardClass} !p-0 overflow-hidden`}>
        <div className="h-1.5" style={{ background: a.category.color }} />
        <div className="p-5 sm:p-6 grid lg:grid-cols-[1fr_auto] gap-6">
          <div className="flex gap-4">
            <div className="shrink-0">
              {d.reference_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.reference_photo_url} alt="" className="h-28 w-28 sm:h-36 sm:w-36 rounded-2xl object-cover bg-gray-100" />
              ) : <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-2xl flex items-center justify-center" style={{ background: `${a.category.color}12` }}><CategoryTile name={a.category.icon} color={a.category.color} size={56} /></div>}
              <label className={`${btnGhost} mt-1 w-full text-xs cursor-pointer`}><Camera size={14} />{d.reference_photo_url ? 'เปลี่ยนรูป' : 'เพิ่มรูปอ้างอิง'}<input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void setReference(f); e.target.value = ''; }} /></label>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium" style={{ color: a.category.color }}>{a.category.name}{template ? ` · ${template.name}` : ''}</p>
              <h1 className="text-3xl font-semibold text-gray-900 leading-tight">{a.code}</h1>
              {a.name && <p className="text-gray-600">{a.name}</p>}
              <p className="text-sm text-gray-500 mt-1 inline-flex items-center gap-1"><MapPin size={14} />{[a.department, a.building, a.floor && `ชั้น ${a.floor}`, a.location].filter(Boolean).join(' · ') || '—'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DueBadge state={s.due_state} large />
                {a.status !== 'active' && <span className="text-sm text-gray-500">สถานะ: {a.status === 'inactive' ? 'พักใช้งาน' : 'ปลดระวาง'}</span>}
                {s.open_failures > 0 && <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium" style={{ background: `${VIZ.secondary}1A`, color: '#9A5B00' }}>ไม่ผ่านค้างแก้ {s.open_failures}</span>}
              </div>
              {attrs.length > 0 && <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">{attrs.map(x => <div key={x.label}><dt className="text-xs text-gray-400">{x.label}</dt><dd className="text-gray-800">{String(x.value)}</dd></div>)}</dl>}
              {a.note && <p className="mt-3 text-sm text-gray-500 whitespace-pre-line">{a.note}</p>}
            </div>
          </div>
          <div className="flex lg:flex-col items-center gap-3 lg:border-l lg:pl-6 border-gray-100">
            {qr ? <QrImg src={qr} /> : <Skeleton className="h-[120px] w-[120px]" />}
            <div className="text-xs text-gray-500 space-y-1 lg:text-center">
              <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium" style={{ color: VIZ.primary }}>เปิดฟอร์มตรวจ <ExternalLink size={12} /></a>
              <ConfirmButton label={<><RefreshCw size={12} />สร้าง QR ใหม่</>} confirmLabel="ยืนยัน? QR เดิมจะใช้ไม่ได้" onConfirm={regenerateQr} className={`${btnGhost} text-xs`} />
            </div>
          </div>
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="ตรวจล่าสุด" value={s.last_inspected_on ? thaiDate(s.last_inspected_on) : '—'} sub={s.last_inspector_name || 'ยังไม่เคยตรวจ'} color={s.last_overall === 'fail' ? VIZ.accent : VIZ.positive} />
        <Tile label="รอบถัดไป" value={s.next_due_on ? thaiDate(s.next_due_on) : '—'} sub={s.next_due_on ? relativeDays(s.next_due_on) : `ทุก ${s.inspection_interval_days} วัน`} color={s.due_state === 'overdue' ? VIZ.accent : VIZ.primary} />
        <Tile label={cat?.service_label || 'ทดสอบตามรอบ'} value={s.next_service_due_on ? thaiDate(s.next_service_due_on) : '—'} sub={s.next_service_due_on ? `${relativeDays(s.next_service_due_on)} · ${a.last_service_on ? `ล่าสุด ${thaiDate(a.last_service_on)}` : a.mfg_year ? `นับจากผลิต ${a.mfg_month ? a.mfg_month + '/' : ''}${a.mfg_year}` : ''}` : 'ไม่มีรอบ / ไม่ทราบวันผลิต'} color={svcDays !== null && svcDays < 0 ? VIZ.accent : svcDays !== null && svcDays <= 90 ? VIZ.secondary : VIZ.primary} />
        <Tile label="ประวัติ" value={`${d.inspections.length} ครั้ง`} sub={`ผ่าน ${passCount} · ไม่ผ่าน ${d.inspections.length - passCount}`} color={VIZ.neutral} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${cardClass} lg:col-span-2`}>
          <SectionTitle title="ประวัติการตรวจ" hint="ล่าสุดอยู่บนสุด · รูปจะถูกลบตามระยะเวลาเก็บ แต่ผลตรวจเก็บถาวร" />
          {d.inspections.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">ยังไม่มีประวัติ — สแกน QR หรือกด “ตรวจตอนนี้”</p> : (
            <ol className="relative border-l border-gray-200 ml-3 space-y-6">
              {d.inspections.map(insp => <InspectionItem key={insp.id} insp={insp} itemLabel={k => itemLabel(insp, k)} onResolve={resolve} onDelete={deleteInspection} />)}
            </ol>
          )}
        </div>
        <div className={cardClass}>
          <SectionTitle title="งานทดสอบ / ซ่อมบำรุง" hint="hydrostatic test, เติมสาร, เปลี่ยนใหม่" right={<button type="button" className={btnGhost} onClick={() => setServiceOpen(true)}><Wrench size={14} />บันทึก</button>} />
          {d.service_events.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">ยังไม่มีบันทึก</p> : (
            <ul className="divide-y divide-gray-100">
              {d.service_events.map(ev => (
                <li key={ev.id} className="py-3">
                  <div className="flex items-center justify-between"><span className="font-medium text-gray-800 text-sm">{SERVICE_KIND_LABEL[ev.kind]}</span><span className="text-sm text-gray-500">{thaiDate(ev.done_on)}</span></div>
                  <p className="text-xs text-gray-500 mt-0.5">{[ev.provider, ev.certificate_no && `ใบรับรอง ${ev.certificate_no}`].filter(Boolean).join(' · ')}</p>
                  {ev.note && <p className="text-xs text-gray-600 mt-1">{ev.note}</p>}
                  {ev.file_path && <FileLink path={ev.file_path} />}
                  <p className="text-[11px] text-gray-400 mt-1">บันทึกโดย {ev.created_by || '—'} · {thaiDateTime(ev.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <ConfirmButton label={<><Trash2 size={14} />ลบอุปกรณ์</>} confirmLabel="ยืนยันลบ? (เฉพาะที่ไม่มีประวัติ)" onConfirm={remove} className={`${btnGhost} text-xs`} danger />
      </div>

      <Drawer open={edit} onClose={() => setEdit(false)} title={`แก้ไข ${a.code}`} wide>
        <AssetForm asset={a} categories={catalog.categories} templates={catalog.templates} departments={departments} busy={busy} onSubmit={save} onCancel={() => setEdit(false)} />
      </Drawer>
      <ServiceModal open={serviceOpen} onClose={() => setServiceOpen(false)} asset={a} serviceLabel={cat?.service_label || ''} onSaved={() => { setServiceOpen(false); void load(); }} setToast={setToast} />
      <ToastView toast={toast} />
    </div>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return <div className={`${cardClass} !p-4`} style={{ borderLeft: `4px solid ${color}` }}><p className="text-xs text-gray-500 truncate">{label}</p><p className="text-lg font-semibold text-gray-900 mt-1 truncate">{value}</p>{sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}</div>;
}

function InspectionItem({ insp, itemLabel, onResolve, onDelete }: { insp: InspInspectionView; itemLabel: (k: string) => string; onResolve: (id: string, note: string) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(insp.overall === 'fail' && !insp.resolved_at);
  const [note, setNote] = useState('');
  const fail = insp.overall === 'fail';
  const livePhotos = insp.photos.filter(p => !p.deleted_at);
  const removedPhotos = insp.photos.length - livePhotos.length;
  const numbers = Object.entries(insp.results).filter(([, v]) => typeof v === 'number');
  return (
    <li className="ml-5">
      <span className="absolute -left-[9px] mt-1 h-4 w-4 rounded-full border-2 border-white" style={{ background: fail ? VIZ.accent : VIZ.positive }} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900">{thaiDate(insp.inspected_on, { withDay: true })}</span>
        <OverallBadge overall={insp.overall} />
        {fail && (insp.resolved_at ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: VIZ.positive }}><CheckCircle2 size={12} />ปิดงานแล้ว {thaiDate(insp.resolved_at.slice(0, 10))} โดย {insp.resolved_by}</span> : <span className="text-xs font-medium" style={{ color: VIZ.secondary }}>รอแก้ไข</span>)}
        <span className="text-xs text-gray-400">· {insp.inspector_name}{insp.source === 'qr' ? ' · QR' : insp.source === 'app' ? ' · SHE' : ''}</span>
        <button type="button" onClick={() => setOpen(o => !o)} className="ml-auto text-xs text-gray-500 hover:text-gray-800">{open ? 'ย่อ' : 'รายละเอียด'}</button>
      </div>
      {fail && <p className="text-sm text-gray-700 mt-1">ไม่ผ่าน: {insp.fail_items.map(itemLabel).join(', ')}</p>}
      {insp.note && <p className="text-sm text-gray-500 mt-0.5">“{insp.note}”</p>}
      {open && (
        <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
          {numbers.length > 0 && <p className="text-sm text-gray-700">{numbers.map(([k, v]) => `${itemLabel(k)}: ${v}`).join(' · ')}</p>}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(insp.results).filter(([, v]) => v === 'pass' || v === 'fail' || v === 'na').map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs" style={{ background: v === 'fail' ? `${VIZ.accent}1A` : v === 'na' ? '#F3F4F6' : `${VIZ.positive}14`, color: v === 'fail' ? VIZ.accent : v === 'na' ? '#6B7280' : '#3E7A36' }}>
                {v === 'fail' ? <XCircle size={11} /> : v === 'na' ? null : <CheckCircle2 size={11} />}{itemLabel(k)}{v === 'na' ? ' (ไม่มี)' : ''}
              </span>
            ))}
          </div>
          {(livePhotos.length > 0 || removedPhotos > 0) && (
            <div className="flex flex-wrap gap-2">
              {livePhotos.map(p => <Thumb key={p.id} path={p.storage_path} />)}
              {removedPhotos > 0 && <span className="inline-flex items-center gap-1 text-xs text-gray-400 self-center"><ImageOff size={13} />ลบตามระยะเวลาเก็บแล้ว {removedPhotos} รูป</span>}
            </div>
          )}
          {fail && insp.resolved_at && insp.resolved_note && <p className="text-sm text-gray-700">บันทึกการแก้ไข: {insp.resolved_note}</p>}
          {fail && !insp.resolved_at && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input className={`${inputClass} py-2`} placeholder="สิ่งที่แก้ไข เช่น ส่งอัดใหม่แล้ว / เปลี่ยนถังใหม่" value={note} onChange={e => setNote(e.target.value)} />
              <button type="button" className={btnPrimary} style={{ background: VIZ.positive }} onClick={() => onResolve(insp.id, note)}><CheckCircle2 size={16} />ปิดงาน</button>
            </div>
          )}
          <div className="flex justify-end"><ConfirmButton label={<><Trash2 size={12} />ลบรายการตรวจนี้</>} confirmLabel="ยืนยันลบ?" onConfirm={() => onDelete(insp.id)} className={`${btnGhost} text-xs`} danger /></div>
        </div>
      )}
    </li>
  );
}

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  const [full, setFull] = useState('');
  useEffect(() => { getJson<{ url: string }>(`/api/inspect/photos/url?path=${encodeURIComponent(path)}&thumb=1`).then(r => setUrl(r.url)).catch(() => setUrl('')); }, [path]);
  async function openFull() { try { const r = await getJson<{ url: string }>(`/api/inspect/photos/url?path=${encodeURIComponent(path)}`); setFull(r.url); } catch { /* ignore */ } }
  return (
    <>
      <button type="button" onClick={openFull} className="h-20 w-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse" />}
      </button>
      {full && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setFull('')} role="dialog">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={full} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

function FileLink({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  async function open() { setBusy(true); try { const r = await getJson<{ url: string }>(`/api/inspect/photos/url?path=${encodeURIComponent(path)}`); window.open(r.url, '_blank', 'noopener'); } catch { /* ignore */ } finally { setBusy(false); } }
  return <button type="button" onClick={open} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-xs font-medium" style={{ color: VIZ.primary }}><FileText size={12} />เปิดไฟล์แนบ</button>;
}

function ServiceModal({ open, onClose, asset, serviceLabel, onSaved, setToast }: { open: boolean; onClose: () => void; asset: InspAssetView; serviceLabel: string; onSaved: () => void; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const [kind, setKind] = useState<InspServiceKind>('legal_test');
  const [doneOn, setDoneOn] = useState(bangkokToday());
  const [provider, setProvider] = useState('');
  const [cert, setCert] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setKind('legal_test'); setDoneOn(bangkokToday()); setProvider(''); setCert(''); setNote(''); setFile(null); } }, [open]);
  async function save() {
    setBusy(true);
    try {
      let file_path: string | null = null;
      if (file) {
        if (file.type === 'application/pdf') {
          if (file.size > 1.4 * 1024 * 1024) throw new Error('ไฟล์ PDF ต้องไม่เกิน 1.4 MB');
          const { data } = await postJson<{ data: { path: string; signedUrl: string } }>('/api/inspect/photos/sign', { asset_id: asset.id, ext: 'pdf' });
          const put = await fetch(data.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' }, body: file });
          if (!put.ok) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
          await postJson('/api/inspect/photos/confirm', { asset_id: asset.id, path: data.path, width: 0, height: 0 });
          file_path = data.path;
        } else {
          const c = await compressImage(file, 1600, 0.8);
          file_path = await uploadPhoto(c, { url: '/api/inspect/photos/sign', body: { asset_id: asset.id } }, { url: '/api/inspect/photos/confirm', body: { asset_id: asset.id } });
        }
      }
      await postJson(`/api/inspect/assets/${asset.id}/service`, { kind, done_on: doneOn, provider, certificate_no: cert, note, file_path });
      setToast({ type: 'success', msg: 'บันทึกแล้ว' }); onSaved();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`บันทึกงานทดสอบ / ซ่อมบำรุง — ${asset.code}`} footer={<div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>}>
      <div className="space-y-4">
        <div><span className={labelClass}>ประเภทงาน</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{(Object.keys(SERVICE_KIND_LABEL) as InspServiceKind[]).map(k => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg border px-3 py-2 text-sm text-left ${kind === k ? 'border-transparent text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`} style={kind === k ? { background: VIZ.primary } : undefined}>{k === 'legal_test' && serviceLabel ? serviceLabel : SERVICE_KIND_LABEL[k]}</button>)}</div>
          {kind === 'legal_test' && <p className="text-xs text-gray-500 mt-1">จะอัปเดต “ทดสอบล่าสุด” ของอุปกรณ์ และนับรอบถัดไปจากวันนี้</p>}
          {kind === 'dispose' && <p className="text-xs mt-1" style={{ color: VIZ.accent }}>อุปกรณ์จะถูกเปลี่ยนสถานะเป็น “ปลดระวาง”</p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={labelClass} htmlFor="sv-date">วันที่ดำเนินการ</label><input id="sv-date" type="date" className={inputClass} value={doneOn} max={bangkokToday()} onChange={e => setDoneOn(e.target.value)} /></div>
          <div><label className={labelClass} htmlFor="sv-prov">ผู้ให้บริการ</label><input id="sv-prov" className={inputClass} value={provider} onChange={e => setProvider(e.target.value)} maxLength={160} /></div>
          <div><label className={labelClass} htmlFor="sv-cert">เลขที่ใบรับรอง</label><input id="sv-cert" className={inputClass} value={cert} onChange={e => setCert(e.target.value)} maxLength={80} /></div>
          <div><label className={labelClass} htmlFor="sv-file">ไฟล์แนบ (รูป/PDF ≤ 1.4 MB)</label><input id="sv-file" type="file" accept="image/*,application/pdf" className={`${inputClass} py-1.5 text-sm`} onChange={e => setFile(e.target.files?.[0] || null)} /></div>
        </div>
        <div><label className={labelClass} htmlFor="sv-note">หมายเหตุ</label><textarea id="sv-note" className={inputClass} rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></div>
        <p className="text-xs text-gray-400">ไฟล์ใบรับรองเก็บถาวร (ไม่เข้ากฎลบรูปตรวจ)</p>
      </div>
    </Modal>
  );
}

function QrImg({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR" width={120} height={120} className="rounded-lg border border-gray-100" />;
}

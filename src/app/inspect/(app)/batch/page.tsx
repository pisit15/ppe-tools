'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, ImagePlus, Loader2, Save, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import type { InspAssetView, InspCategoryRow, InspItemDef, InspResultValue, InspTemplateRow } from '@/lib/inspect/types';
import { CategoryIcon, CategoryTile } from '../../_components/icons';
import { compressImage, uploadPhoto, type Compressed } from '../../_components/photo';
import { decodeInspectToken } from '../../_components/qrDecode';
import { DueBadge, EmptyState, Skeleton, ToastView, VIZ, bangkokToday, btnGhost, btnPrimary, btnSecondary, cardClass, errMsg, getJson, inputClass, labelClass, postJson, relativeDays, selectCompact, thaiDate, useCompany, useToast } from '../../_components/ui';

type Catalog = { categories: InspCategoryRow[]; templates: InspTemplateRow[] };
type Verdict = 'pass' | 'fail' | 'skip';
type RowPhoto = { id: string; file: Compressed; name: string };
type RowState = { verdict: Verdict; fails: Set<string>; numbers: Record<string, string>; note: string; photos: RowPhoto[]; open: boolean; status: 'idle' | 'saving' | 'done' | 'error'; error?: string };

const MAX_PHOTOS = 3;

export default function BatchPage() {
  const { company, companyName } = useCompany();
  const { user } = useAuth();
  const { toast, setToast } = useToast();
  const [assets, setAssets] = useState<InspAssetView[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], templates: [] });
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(bangkokToday);
  const [inspector, setInspector] = useState('');
  const [inspectorCode, setInspectorCode] = useState('');
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const dropRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setAssets(null);
    try {
      const [a, c] = await Promise.all([
        getJson<{ data: InspAssetView[] }>(`/api/inspect/assets?company=${encodeURIComponent(company)}`),
        getJson<{ data: Catalog }>(`/api/inspect/categories?company=${encodeURIComponent(company)}`),
      ]);
      setAssets(a.data); setCatalog(c.data);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'โหลดทะเบียนไม่สำเร็จ') }); setAssets([]); }
  }, [company, setToast]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (user && !inspector) setInspector(user.nickname || user.displayName); }, [user, inspector]);

  const departments = useMemo(() => [...new Set((assets || []).filter(a => !category || a.category_id === category).map(a => a.department).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th', { numeric: true })), [assets, category]);
  const locations = useMemo(() => [...new Set((assets || []).filter(a => (!category || a.category_id === category) && (!department || a.department === department)).map(a => a.location).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th', { numeric: true })), [assets, category, department]);
  useEffect(() => { setLocation(''); }, [department, category]);

  const list = useMemo(() => {
    if (!assets || !department) return [];
    return assets.filter(a => a.department === department && (!category || a.category_id === category) && (!location || a.location === location)).sort((x, y) => x.code.localeCompare(y.code, 'th', { numeric: true }));
  }, [assets, department, category, location]);

  const period = date.slice(0, 7);
  const templateOf = useCallback((a: InspAssetView): InspTemplateRow | null => catalog.templates.find(t => t.id === a.template_id) || catalog.templates.find(t => t.category_id === a.category_id && t.is_default) || catalog.templates.find(t => t.category_id === a.category_id) || null, [catalog]);

  // Initialise row state when the list changes: not yet inspected this period → pass, inspected → skip
  useEffect(() => {
    setRows(prev => {
      const next: Record<string, RowState> = {};
      for (const a of list) {
        const inspected = !!a.status_info.last_inspected_on && (a.category.inspection_interval_days >= 28 ? a.status_info.last_inspected_on.slice(0, 7) === period : a.status_info.due_state === 'ok');
        next[a.id] = prev[a.id] || { verdict: inspected ? 'skip' : 'pass', fails: new Set(), numbers: {}, note: '', photos: [], open: false, status: 'idle' };
      }
      return next;
    });
  }, [list, period]);

  const update = (id: string, patch: Partial<RowState> | ((r: RowState) => Partial<RowState>)) => setRows(prev => ({ ...prev, [id]: { ...prev[id], ...(typeof patch === 'function' ? patch(prev[id]) : patch) } }));
  const counts = useMemo(() => { const v = Object.values(rows); return { pass: v.filter(r => r.verdict === 'pass').length, fail: v.filter(r => r.verdict === 'fail').length, skip: v.filter(r => r.verdict === 'skip').length, done: v.filter(r => r.status === 'done').length }; }, [rows]);
  const toSave = list.filter(a => rows[a.id] && rows[a.id].verdict !== 'skip' && rows[a.id].status !== 'done');

  async function addPhotos(id: string, files: FileList | File[]) {
    const arr = Array.from(files);
    for (const f of arr) {
      const cur = rows[id];
      if ((cur?.photos.length || 0) >= MAX_PHOTOS) { setToast({ type: 'info', msg: `แนบได้สูงสุด ${MAX_PHOTOS} รูปต่อรายการ` }); return; }
      try { const c = await compressImage(f); update(id, r => ({ photos: r.photos.length >= MAX_PHOTOS ? r.photos : [...r.photos, { id: Math.random().toString(36).slice(2), file: c, name: f.name }] })); }
      catch (e) { setToast({ type: 'error', msg: errMsg(e, 'ย่อรูปไม่สำเร็จ') }); }
    }
  }

  /**
   * Global drop. For each file, in order:
   *   1. asset code inside the file name (e.g. F1-COA-07.jpg)
   *   2. QR label visible in the photo (decoded in the browser)
   *   3. same asset as the previous photo (a 2nd/3rd shot of the same tank taken right after the QR shot)
   */
  async function dropMany(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const codes = [...list].sort((x, y) => y.code.length - x.code.length);
    const byToken = new Map(list.map(a => [a.qr_token, a]));
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '-');
    let byName = 0, byQr = 0, byFollow = 0; const unmatched: string[] = [];
    let last: InspAssetView | null = null;
    setScanning({ done: 0, total: arr.length });
    for (const f of arr) {
      const name = norm(f.name);
      let hit = codes.find(a => name.includes(norm(a.code))) || null;
      if (hit) byName++;
      else {
        const token = await decodeInspectToken(f).catch(() => null);
        const viaQr = token ? byToken.get(token) : undefined;
        if (viaQr) { hit = viaQr; byQr++; }
        else if (token) { unmatched.push(`${f.name} (QR ของถังนอกพื้นที่นี้)`); }
        else if (last && (rows[last.id]?.photos.length || 0) < MAX_PHOTOS) { hit = last; byFollow++; }
        else unmatched.push(f.name);
      }
      if (hit) { await addPhotos(hit.id, [f]); last = hit; }
      setScanning(p => (p ? { ...p, done: p.done + 1 } : p));
    }
    setScanning(null);
    const parts = [byName && `ชื่อไฟล์ ${byName}`, byQr && `อ่าน QR ${byQr}`, byFollow && `ต่อจากรูปก่อนหน้า ${byFollow}`].filter(Boolean).join(' · ');
    setToast({ type: byName + byQr + byFollow ? 'success' : 'error', msg: `จับคู่ได้ ${byName + byQr + byFollow}/${arr.length} ไฟล์${parts ? ` (${parts})` : ''}${unmatched.length ? ` · ไม่พบ ${unmatched.length}: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}` : ''}` });
  }

  function buildResults(a: InspAssetView, r: RowState): Record<string, InspResultValue> {
    const tpl = templateOf(a);
    const out: Record<string, InspResultValue> = {};
    for (const it of tpl?.items || []) {
      if (it.kind === 'number') { const v = r.numbers[it.key]; out[it.key] = v === undefined || v === '' ? null : Number(v); }
      else out[it.key] = r.verdict === 'fail' && r.fails.has(it.key) ? 'fail' : 'pass';
    }
    return out;
  }

  async function saveAll() {
    if (!toSave.length) return;
    const invalid = toSave.filter(a => rows[a.id].verdict === 'fail' && rows[a.id].fails.size === 0);
    if (invalid.length) { setToast({ type: 'error', msg: `เลือกข้อที่ไม่ผ่านของ ${invalid.map(a => a.code).slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}` }); return; }
    setSaving(true); setProgress({ done: 0, total: toSave.length });
    let ok = 0, failed = 0;
    const queue = [...toSave];
    const worker = async () => {
      while (queue.length) {
        const a = queue.shift()!;
        const r = rows[a.id];
        update(a.id, { status: 'saving', error: undefined });
        try {
          const paths: string[] = [];
          for (const p of r.photos) paths.push(await uploadPhoto(p.file, { url: '/api/inspect/photos/sign', body: { asset_id: a.id } }, { url: '/api/inspect/photos/confirm', body: { asset_id: a.id } }));
          await postJson('/api/inspect/inspections', { batch: true, asset_id: a.id, inspected_on: date, inspector_name: inspector.trim() || undefined, inspector_code: inspectorCode.trim() || 'BATCH', results: buildResults(a, r), note: r.note.trim(), photo_paths: paths });
          update(a.id, { status: 'done' }); ok++;
        } catch (e) { update(a.id, { status: 'error', error: errMsg(e) }); failed++; }
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setSaving(false);
    setToast({ type: failed ? 'error' : 'success', msg: `บันทึกแล้ว ${ok} รายการ${failed ? ` · ล้มเหลว ${failed} (ดูแถวสีแดง)` : ''}` });
    void load();
  }

  return (
    <div className="space-y-5" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void dropMany(e.dataTransfer.files); }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-gray-900">บันทึกผลหลายรายการ</h1><p className="text-sm text-gray-500 mt-1">{companyName} · สำหรับลงผลหลังเดินตรวจ (พื้นที่ไม่มีสัญญาณ) — เลือกพื้นที่ แล้วติ๊กเฉพาะรายการที่ไม่ผ่าน</p></div>
        <Link href="/inspect/assets" className={btnGhost}>ทะเบียนอุปกรณ์</Link>
      </div>

      {/* scope */}
      <div className={cardClass}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2"><label className={labelClass}>หมวด</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setCategory('')} className={`rounded-full border px-3 py-1.5 text-sm ${!category ? 'border-transparent bg-[#4E79A7]/10 text-[#4E79A7] font-medium' : 'border-gray-200 text-gray-600'}`}>ทุกหมวด</button>
              {catalog.categories.filter(c => (assets || []).some(a => a.category_id === c.id)).map(c => <button key={c.id} type="button" onClick={() => setCategory(category === c.id ? '' : c.id)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${category === c.id ? 'border-transparent font-medium' : 'border-gray-200 text-gray-600'}`} style={category === c.id ? { background: `${c.color}1A`, color: c.color } : undefined}><CategoryIcon name={c.icon} size={14} />{c.name}</button>)}
            </div>
          </div>
          <div><label className={labelClass} htmlFor="b-dept">แผนก / พื้นที่ *</label><select id="b-dept" className={`${selectCompact} w-full py-2.5`} value={department} onChange={e => setDepartment(e.target.value)}><option value="">— เลือก —</option>{departments.map(d => <option key={d} value={d}>{d} ({(assets || []).filter(a => a.department === d && (!category || a.category_id === category)).length})</option>)}</select></div>
          <div><label className={labelClass} htmlFor="b-loc">ตำแหน่ง</label><select id="b-loc" className={`${selectCompact} w-full py-2.5`} value={location} onChange={e => setLocation(e.target.value)} disabled={!department}><option value="">ทั้งแผนก</option>{locations.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          <div><label className={labelClass} htmlFor="b-date">วันที่ตรวจจริง *</label><input id="b-date" type="date" className={inputClass} value={date} max={bangkokToday()} onChange={e => setDate(e.target.value)} /></div>
          <div><label className={labelClass} htmlFor="b-insp">ผู้ตรวจ</label><input id="b-insp" className={inputClass} value={inspector} onChange={e => setInspector(e.target.value)} placeholder="ชื่อผู้เดินตรวจ" maxLength={120} /><input className={`${inputClass} mt-1 py-1.5 text-xs`} value={inspectorCode} onChange={e => setInspectorCode(e.target.value.toUpperCase())} placeholder="รหัสผู้ตรวจ (ไม่บังคับ)" maxLength={40} /></div>
        </div>
        <p className="text-xs text-gray-400 mt-3">ลากรูปทั้งชุดมาวางที่หน้านี้ได้เลย — ระบบจับคู่กับถังจาก <b>รหัสในชื่อไฟล์</b> (เช่น <code className="bg-gray-100 px-1 rounded">F1-COA-01.jpg</code>) หรือ <b>อ่าน QR ที่ติดถังในรูป</b> (ถ่ายให้ QR ใหญ่อย่างน้อย 1/8 ของเฟรม) · รูปที่อ่านไม่ได้จะนับเป็นรูปต่อของถังก่อนหน้า · รูปถูกย่อก่อนส่ง · บันทึกโดยไม่มีรูปได้</p>
        {scanning && <p className="text-xs mt-2 inline-flex items-center gap-1.5" style={{ color: VIZ.primary }}><Loader2 size={12} className="animate-spin" />กำลังอ่านรูป {scanning.done}/{scanning.total}…</p>}
      </div>

      {assets === null ? <Skeleton className="h-64" /> : !department ? (
        <div className={cardClass}><EmptyState icon={<Upload size={40} />} title="เลือกแผนก / พื้นที่ที่เดินตรวจมา" hint="ตารางจะแสดงอุปกรณ์ทั้งหมดในพื้นที่นั้น ค่าเริ่มต้นเป็น ผ่าน ทุกรายการที่ยังไม่ตรวจรอบนี้" /></div>
      ) : list.length === 0 ? <div className={cardClass}><EmptyState title="ไม่มีอุปกรณ์ในพื้นที่นี้" /></div> : (
        <div className={`${cardClass} !p-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
              <span><b className="text-gray-900">{list.length}</b> รายการ</span>
              <span style={{ color: VIZ.positive }}>ผ่าน {counts.pass}</span>
              <span style={{ color: VIZ.accent }}>ไม่ผ่าน {counts.fail}</span>
              <span className="text-gray-400">ข้าม {counts.skip}</span>
              {counts.done > 0 && <span style={{ color: VIZ.primary }}>บันทึกแล้ว {counts.done}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={btnGhost} onClick={() => setRows(prev => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, r.status === 'done' ? r : { ...r, verdict: 'pass' as Verdict }])))}>ตั้งทั้งหมด = ผ่าน</button>
              <button type="button" className={btnGhost} onClick={() => setRows(prev => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, r.status === 'done' ? r : { ...r, verdict: 'skip' as Verdict }])))}>ข้ามทั้งหมด</button>
              <button type="button" className={btnSecondary} onClick={() => dropRef.current?.click()}><ImagePlus size={16} />เลือกรูปหลายไฟล์</button>
              <input ref={dropRef} type="file" accept="image/*" multiple className="sr-only" onChange={e => { void dropMany(e.target.files); e.target.value = ''; }} />
              <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} disabled={saving || toSave.length === 0} onClick={saveAll}>{saving ? <><Loader2 size={16} className="animate-spin" />กำลังบันทึก {progress.done}/{progress.total}</> : <><Save size={16} />บันทึก {toSave.length} รายการ</>}</button>
            </div>
          </div>
          {saving && <div className="h-1 bg-gray-100"><div className="h-1 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: VIZ.primary }} /></div>}
          <ul className="divide-y divide-gray-100">
            {list.map(a => {
              const r = rows[a.id];
              if (!r) return null;
              const tpl = templateOf(a);
              const items = tpl?.items || [];
              const numberItems = items.filter(i => i.kind === 'number');
              const inspectedThisPeriod = r.verdict === 'skip' && !!a.status_info.last_inspected_on && a.status_info.last_inspected_on.slice(0, 7) === period;
              return (
                <li key={a.id} className={`px-4 py-3 ${r.status === 'done' ? 'bg-[#59A14F]/5' : r.status === 'error' ? 'bg-[#E15759]/5' : r.verdict === 'fail' ? 'bg-[#E15759]/[0.03]' : r.verdict === 'skip' ? 'opacity-60' : ''}`}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); void addPhotos(a.id, e.dataTransfer.files); }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <CategoryTile name={a.category.icon} color={a.category.color} size={34} />
                    <div className="min-w-[180px] flex-1">
                      <div className="flex items-center gap-2"><Link href={`/inspect/assets/${a.id}`} className="font-medium text-gray-900 hover:underline">{a.code}</Link>{r.status === 'done' && <CheckCircle2 size={16} color={VIZ.positive} />}{r.status === 'saving' && <Loader2 size={14} className="animate-spin text-gray-400" />}</div>
                      <p className="text-xs text-gray-500 truncate">{[a.name, a.location && `ตำแหน่ง ${a.location}`, a.floor && `ชั้น ${a.floor}`, Object.values(a.attributes || {}).filter(Boolean).slice(0, 2).join(' ')].filter(Boolean).join(' · ') || a.category.name}</p>
                      {r.status === 'error' && <p className="text-xs mt-0.5" style={{ color: VIZ.accent }}>{r.error}</p>}
                    </div>
                    <div className="hidden md:block w-40 text-xs text-gray-500"><DueBadge state={a.status_info.due_state} />{a.status_info.last_inspected_on && <span className="block mt-0.5">ล่าสุด {thaiDate(a.status_info.last_inspected_on)} ({relativeDays(a.status_info.last_inspected_on)})</span>}</div>
                    {r.status !== 'done' ? (
                      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                        {(['pass', 'fail', 'skip'] as Verdict[]).map(v => (
                          <button key={v} type="button" onClick={() => update(a.id, { verdict: v, open: v === 'fail' ? true : r.open })} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${r.verdict === v ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}`} style={r.verdict === v ? { background: v === 'pass' ? VIZ.positive : v === 'fail' ? VIZ.accent : VIZ.neutral } : undefined}>
                            {v === 'pass' ? 'ผ่าน' : v === 'fail' ? 'ไม่ผ่าน' : 'ข้าม'}
                          </button>
                        ))}
                      </div>
                    ) : <span className="text-sm font-medium" style={{ color: VIZ.positive }}>บันทึกแล้ว</span>}
                    {r.status !== 'done' && (
                      <div className="flex items-center gap-1.5">
                        {r.photos.map(p => (
                          <span key={p.id} className="relative h-9 w-9 rounded-md overflow-hidden bg-gray-100 border border-gray-200" title={p.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.file.previewUrl} alt="" className="h-full w-full object-cover" />
                            <button type="button" aria-label="ลบรูป" onClick={() => update(a.id, x => ({ photos: x.photos.filter(q => q.id !== p.id) }))} className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/50 text-white opacity-0 hover:opacity-100"><Trash2 size={12} /></button>
                          </span>
                        ))}
                        {r.photos.length < MAX_PHOTOS && <label className="h-9 w-9 rounded-md border border-dashed border-gray-300 inline-flex items-center justify-center text-gray-400 hover:text-[#4E79A7] hover:border-[#4E79A7] cursor-pointer" title="แนบรูป"><ImagePlus size={15} /><input type="file" accept="image/*" multiple className="sr-only" onChange={e => { if (e.target.files) void addPhotos(a.id, e.target.files); e.target.value = ''; }} /></label>}
                      </div>
                    )}
                    {r.status !== 'done' && (numberItems.length > 0 || items.length > 0) && <button type="button" onClick={() => update(a.id, { open: !r.open })} className={`${btnGhost} text-xs`}>{r.open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}รายละเอียด</button>}
                  </div>
                  {inspectedThisPeriod && r.status !== 'done' && <p className="text-xs text-gray-400 mt-1 ml-[46px]">ตรวจในรอบนี้แล้ว — ตั้งเป็นข้าม (เลือก ผ่าน/ไม่ผ่าน ถ้าต้องการบันทึกเพิ่ม)</p>}
                  {r.open && r.status !== 'done' && (
                    <div className="mt-3 ml-[46px] rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
                      {r.verdict === 'fail' && (
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1.5">ข้อที่ไม่ผ่าน * <span className="font-normal text-gray-400">({tpl?.name})</span></p>
                          <div className="flex flex-wrap gap-1.5">
                            {items.filter(i => i.kind !== 'number').map(it => {
                              const on = r.fails.has(it.key);
                              return <button key={it.key} type="button" onClick={() => update(a.id, x => { const f = new Set(x.fails); if (f.has(it.key)) f.delete(it.key); else f.add(it.key); return { fails: f }; })} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition ${on ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`} style={on ? { background: VIZ.accent } : undefined}>{on ? <X size={12} /> : <Check size={12} className="opacity-30" />}{it.label}</button>;
                            })}
                          </div>
                        </div>
                      )}
                      {numberItems.length > 0 && (
                        <div className="flex flex-wrap gap-3">
                          {numberItems.map((it: InspItemDef) => <label key={it.key} className="text-xs text-gray-700">{it.label}<input type="number" inputMode="decimal" step="0.01" className={`${inputClass} mt-1 py-1.5 w-32`} value={r.numbers[it.key] ?? ''} onChange={e => update(a.id, x => ({ numbers: { ...x.numbers, [it.key]: e.target.value } }))} placeholder={it.unit || ''} /></label>)}
                        </div>
                      )}
                      <input className={`${inputClass} py-1.5 text-sm`} placeholder="หมายเหตุ" value={r.note} onChange={e => update(a.id, { note: e.target.value })} maxLength={1000} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5"><AlertTriangle size={14} />ผลจะบันทึกด้วยวันที่ {thaiDate(date)} ในชื่อ {inspector || '—'} · รายการ “ข้าม” ไม่ถูกบันทึก</span>
            <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} disabled={saving || toSave.length === 0} onClick={saveAll}><Save size={16} />บันทึก {toSave.length} รายการ</button>
          </div>
        </div>
      )}
      <ToastView toast={toast} />
    </div>
  );
}

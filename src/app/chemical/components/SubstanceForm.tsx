'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Upload, Link2, FileText, Trash2, Wand2, AlertTriangle } from 'lucide-react';
import type { ChemSubstance, ChemStorageArea, CreateChemSubstanceInput, SdsExtraction, StorageClassCode } from '@/lib/types';
import { GHS_PICTOGRAMS, SIGNAL_WORDS, PHYSICAL_STATES, PPE_OPTIONS, UNIT_OPTIONS, hText, pText, suggestStorageClass } from '@/lib/chemical/ghs';
import { STORAGE_CLASSES } from '@/lib/chemical/storage-classes';
import { StorageClassChip, inputCls, labelCls } from './ui';

type Props = {
  companyId: string;
  areas: ChemStorageArea[];
  initial: ChemSubstance | null;
  createdBy: string;
  onClose: () => void;
  onSaved: (s: ChemSubstance) => void;
  onToast: (t: { type: 'success' | 'error'; msg: string }) => void;
};

type FormState = Omit<CreateChemSubstanceInput, 'company_id' | 'is_active' | 'created_by'>;

const empty = (): FormState => ({
  name: '', chemical_name: null, cas_no: null, un_no: null, supplier: null, physical_state: null,
  ghs_pictograms: [], signal_word: null, hazard_classes: [], h_codes: [], p_codes: [],
  flash_point_c: null, boiling_point_c: null,
  storage_class: null, storage_class_suggested: null, storage_area_id: null, storage_location: null, storage_conditions: null,
  quantity: null, unit: null, container: null,
  ppe_required: [], first_aid: {}, fire_fighting: null, spill_response: null, emergency_contact: null,
  sds_url: null, sds_file_path: null, sds_file_name: null, sds_revision_date: null, sds_language: null,
  usage_purpose: null, notes: null,
});

const fromSubstance = (s: ChemSubstance): FormState => {
  const { id: _id, company_id: _c, is_active: _a, created_by: _b, created_at: _ca, updated_at: _ua, chem_storage_areas: _j, ...rest } = s;
  void _id; void _c; void _a; void _b; void _ca; void _ua; void _j;
  return { ...empty(), ...rest };
};

// กำหนดนอก component — ถ้าประกาศข้างในจะถูกสร้างใหม่ทุก render ทำให้ input เสีย focus ทุกตัวอักษร
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-gray-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      {children}
    </section>
  );
}

/** แปลงข้อความ "H225, H319" → ['H225','H319'] */
const parseCodes = (text: string, prefix: 'H' | 'P'): string[] =>
  Array.from(new Set(text.toUpperCase().split(/[\s,;/]+/).map(t => t.trim()).filter(t => t.startsWith(prefix) && /^[HP]\d{3}/.test(t))));

export default function SubstanceForm({ companyId, areas, initial, createdBy, onClose, onSaved, onToast }: Props) {
  const [f, setF] = useState<FormState>(initial ? fromSubstance(initial) : empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hText_, setHText] = useState((initial?.h_codes || []).join(', '));
  const [pText_, setPText] = useState((initial?.p_codes || []).join(', '));
  const [hazardText, setHazardText] = useState((initial?.hazard_classes || []).join('\n'));
  const [sdsMode, setSdsMode] = useState<'file' | 'link'>(initial?.sds_file_path ? 'file' : initial?.sds_url ? 'link' : 'file');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractNotes, setExtractNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    fetch('/api/chemical/extract').then(r => r.json()).then(d => setAiAvailable(!!d.available)).catch(() => setAiAvailable(false));
  }, []);

  // sync text fields → arrays
  useEffect(() => { set('h_codes', parseCodes(hText_, 'H')); }, [hText_]);
  useEffect(() => { set('p_codes', parseCodes(pText_, 'P')); }, [pText_]);
  useEffect(() => { set('hazard_classes', hazardText.split('\n').map(s => s.trim()).filter(Boolean)); }, [hazardText]);

  const suggestion = useMemo(() => suggestStorageClass({
    physical_state: f.physical_state, ghs_pictograms: f.ghs_pictograms, h_codes: f.h_codes, flash_point_c: f.flash_point_c,
  }), [f.physical_state, f.ghs_pictograms, f.h_codes, f.flash_point_c]);
  useEffect(() => { set('storage_class_suggested', suggestion?.code || null); }, [suggestion]);

  const togglePictogram = (code: string) => {
    const cur = f.ghs_pictograms as string[];
    set('ghs_pictograms', (cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code]) as FormState['ghs_pictograms']);
  };
  const togglePpe = (item: string) => {
    const cur = f.ppe_required;
    set('ppe_required', cur.includes(item) ? cur.filter(c => c !== item) : [...cur, item]);
  };

  const applyExtraction = (d: SdsExtraction) => {
    setF(prev => {
      const next = { ...prev };
      const keys: (keyof SdsExtraction)[] = ['name', 'chemical_name', 'cas_no', 'un_no', 'supplier', 'physical_state', 'ghs_pictograms', 'signal_word',
        'hazard_classes', 'h_codes', 'p_codes', 'flash_point_c', 'boiling_point_c', 'storage_conditions', 'ppe_required', 'first_aid',
        'fire_fighting', 'spill_response', 'emergency_contact', 'sds_revision_date', 'sds_language'];
      keys.forEach(k => {
        const v = d[k];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
        // ไม่ทับชื่อที่ผู้ใช้พิมพ์ไว้แล้ว
        if (k === 'name' && prev.name.trim()) return;
        (next as Record<string, unknown>)[k] = v;
      });
      return next;
    });
    if (d.h_codes?.length) setHText(d.h_codes.join(', '));
    if (d.p_codes?.length) setPText(d.p_codes.join(', '));
    if (d.hazard_classes?.length) setHazardText(d.hazard_classes.join('\n'));
    setExtractNotes(d.extraction_notes || '');
  };

  const runExtract = async () => {
    setExtracting(true); setError('');
    try {
      let res: Response;
      if (pendingFile) {
        const fd = new FormData(); fd.append('file', pendingFile);
        res = await fetch('/api/chemical/extract', { method: 'POST', body: fd });
      } else if (f.sds_file_path) {
        res = await fetch('/api/chemical/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: f.sds_file_path }) });
      } else if (f.sds_url) {
        res = await fetch('/api/chemical/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: f.sds_url }) });
      } else {
        setError('เลือกไฟล์ SDS หรือใส่ลิงก์ก่อน แล้วจึงกดสกัดข้อมูล'); setExtracting(false); return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'สกัดไม่สำเร็จ');
      applyExtraction(data.data as SdsExtraction);
      onToast({ type: 'success', msg: 'สกัดข้อมูลจาก SDS แล้ว — กรุณาตรวจทานทุกช่องก่อนบันทึก' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สกัดไม่สำเร็จ');
    }
    setExtracting(false);
  };

  const uploadPending = async (): Promise<{ path: string; file_name: string } | null> => {
    if (!pendingFile) return null;
    const fd = new FormData(); fd.append('file', pendingFile); fd.append('company_id', companyId);
    const res = await fetch('/api/chemical/sds', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'อัปโหลดไม่สำเร็จ');
    return { path: data.path, file_name: data.file_name };
  };

  const save = async () => {
    if (!f.name.trim()) { setError('กรุณาระบุชื่อสารเคมี'); return; }
    setSaving(true); setError('');
    try {
      let payload: FormState & { company_id: string; created_by?: string } = { ...f, company_id: companyId };
      if (sdsMode === 'file') {
        setUploading(true);
        const up = await uploadPending();
        setUploading(false);
        if (up) payload = { ...payload, sds_file_path: up.path, sds_file_name: up.file_name, sds_url: null };
      } else {
        payload = { ...payload, sds_file_path: null, sds_file_name: null };
      }
      if (!initial) payload.created_by = createdBy;
      const res = await fetch(initial ? `/api/chemical/substances/${initial.id}` : '/api/chemical/substances', {
        method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'บันทึกไม่สำเร็จ');
      onSaved(data.data as ChemSubstance);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
    setSaving(false); setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'แก้ไขสารเคมี' : 'เพิ่มสารเคมีใหม่'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="ปิด"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* SDS source + AI */}
          <Section title="เอกสาร SDS (Safety Data Sheet)">
            <div className="flex gap-2 mb-2">
              {([['file', 'แนบไฟล์'], ['link', 'ใส่ลิงก์']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSdsMode(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${sdsMode === k ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                  {k === 'file' ? <Upload size={12} className="inline mr-1" /> : <Link2 size={12} className="inline mr-1" />}{l}
                </button>
              ))}
            </div>
            {sdsMode === 'file' ? (
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
                  onChange={e => setPendingFile(e.target.files?.[0] || null)} />
                <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg border border-dashed border-gray-400 text-sm text-gray-700 hover:bg-gray-50">
                  เลือกไฟล์ PDF (≤ 25 MB)
                </button>
                {pendingFile ? (
                  <span className="text-sm text-gray-800 inline-flex items-center gap-1"><FileText size={14} />{pendingFile.name}
                    <button type="button" onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-gray-400 hover:text-red-600" aria-label="เอาไฟล์ออก"><Trash2 size={14} /></button>
                  </span>
                ) : f.sds_file_name ? (
                  <span className="text-sm text-gray-700 inline-flex items-center gap-1"><FileText size={14} />ไฟล์ปัจจุบัน: {f.sds_file_name}
                    <button type="button" onClick={() => { set('sds_file_path', null); set('sds_file_name', null); }} className="text-gray-400 hover:text-red-600" aria-label="เอาไฟล์ออก"><Trash2 size={14} /></button>
                  </span>
                ) : <span className="text-xs text-gray-400">ยังไม่มีไฟล์</span>}
              </div>
            ) : (
              <input className={inputCls} placeholder="https://… ลิงก์ SDS จากผู้ผลิต" value={f.sds_url || ''} onChange={e => set('sds_url', e.target.value || null)} />
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={runExtract} disabled={extracting || aiAvailable === false}
                title={aiAvailable === false ? 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์' : 'อ่าน SDS แล้วกรอกช่องด้านล่างให้อัตโนมัติ'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
                <Sparkles size={15} />{extracting ? 'กำลังอ่าน SDS…' : 'สกัดข้อมูลจาก SDS ด้วย AI'}
              </button>
              <span className="text-xs text-gray-500">
                {aiAvailable === false ? 'ฟีเจอร์นี้ยังไม่เปิดใช้ (ต้องตั้งค่า API key) — กรอกเองได้' : 'AI กรอกให้เป็นค่าตั้งต้น ผู้ใช้ต้องตรวจทานกับ SDS จริงก่อนบันทึก'}
              </span>
            </div>
            {extractNotes && <p className="text-xs rounded-lg px-3 py-2" style={{ background: '#fef3c7', color: '#92400e' }}><AlertTriangle size={12} className="inline mr-1" />ข้อสังเกตจาก AI: {extractNotes}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={labelCls}>วันที่ปรับปรุง SDS</label><input type="date" className={inputCls} value={f.sds_revision_date || ''} onChange={e => set('sds_revision_date', e.target.value || null)} /></div>
              <div><label className={labelCls}>ภาษาของ SDS</label>
                <select className={inputCls} value={f.sds_language || ''} onChange={e => set('sds_language', e.target.value || null)}>
                  <option value="">—</option><option value="th">ไทย</option><option value="en">อังกฤษ</option><option value="other">อื่น ๆ</option>
                </select></div>
            </div>
          </Section>

          {/* Identity */}
          <Section title="ข้อมูลสาร (SDS ข้อ 1, 3, 9)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className={labelCls}>ชื่อสารเคมี / ชื่อทางการค้า *</label><input className={inputCls} value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Acetone, Hydrochloric acid 35%" /></div>
              <div><label className={labelCls}>ชื่อทางเคมี</label><input className={inputCls} value={f.chemical_name || ''} onChange={e => set('chemical_name', e.target.value || null)} /></div>
              <div><label className={labelCls}>ผู้ผลิต / ผู้จำหน่าย</label><input className={inputCls} value={f.supplier || ''} onChange={e => set('supplier', e.target.value || null)} /></div>
              <div><label className={labelCls}>CAS No.</label><input className={inputCls} value={f.cas_no || ''} onChange={e => set('cas_no', e.target.value || null)} placeholder="67-64-1" /></div>
              <div><label className={labelCls}>UN No.</label><input className={inputCls} value={f.un_no || ''} onChange={e => set('un_no', e.target.value || null)} placeholder="1090" /></div>
              <div><label className={labelCls}>สถานะทางกายภาพ</label>
                <select className={inputCls} value={f.physical_state || ''} onChange={e => set('physical_state', (e.target.value || null) as FormState['physical_state'])}>
                  <option value="">—</option>{PHYSICAL_STATES.map(s => <option key={s.value} value={s.value}>{s.labelTh}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>จุดวาบไฟ (°C)</label><input type="number" step="0.1" className={inputCls} value={f.flash_point_c ?? ''} onChange={e => set('flash_point_c', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label className={labelCls}>จุดเดือด (°C)</label><input type="number" step="0.1" className={inputCls} value={f.boiling_point_c ?? ''} onChange={e => set('boiling_point_c', e.target.value === '' ? null : Number(e.target.value))} /></div>
              </div>
              <div><label className={labelCls}>ใช้ทำอะไร / แผนกที่ใช้</label><input className={inputCls} value={f.usage_purpose || ''} onChange={e => set('usage_purpose', e.target.value || null)} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className={labelCls}>ปริมาณ</label><input type="number" step="0.01" className={inputCls} value={f.quantity ?? ''} onChange={e => set('quantity', e.target.value === '' ? null : Number(e.target.value))} /></div>
                <div><label className={labelCls}>หน่วย</label><input className={inputCls} list="chem-units" value={f.unit || ''} onChange={e => set('unit', e.target.value || null)} /><datalist id="chem-units">{UNIT_OPTIONS.map(u => <option key={u} value={u} />)}</datalist></div>
                <div><label className={labelCls}>ภาชนะ</label><input className={inputCls} value={f.container || ''} onChange={e => set('container', e.target.value || null)} placeholder="ถัง 200 L" /></div>
              </div>
            </div>
          </Section>

          {/* GHS */}
          <Section title="การจำแนกความเป็นอันตราย GHS (SDS ข้อ 2)">
            <label className={labelCls}>รูปสัญลักษณ์ (คลิกเลือก)</label>
            <div className="flex flex-wrap gap-2">
              {GHS_PICTOGRAMS.map(p => {
                const on = (f.ghs_pictograms as string[]).includes(p.code);
                return (
                  <button key={p.code} type="button" onClick={() => togglePictogram(p.code)} title={p.nameEn}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 w-[84px] ${on ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white opacity-60 hover:opacity-100'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.file} alt={p.nameTh} width={40} height={40} />
                    <span className="text-[10px] text-gray-700 text-center leading-tight">{p.nameTh}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>คำสัญญาณ</label>
                <select className={inputCls} value={f.signal_word || ''} onChange={e => set('signal_word', (e.target.value || null) as FormState['signal_word'])}>
                  <option value="">—</option>{SIGNAL_WORDS.map(s => <option key={s.value} value={s.value}>{s.labelTh}</option>)}
                </select></div>
              <div><label className={labelCls}>Hazard class (บรรทัดละ 1 รายการ)</label><textarea className={inputCls} rows={2} value={hazardText} onChange={e => setHazardText(e.target.value)} placeholder="Flammable liquids, Category 2&#10;Eye irritation, Category 2" /></div>
              <div><label className={labelCls}>รหัส H (คั่นด้วยจุลภาค)</label><input className={inputCls} value={hText_} onChange={e => setHText(e.target.value)} placeholder="H225, H319, H336" />
                <ul className="mt-1 space-y-0.5">{f.h_codes.map(c => <li key={c} className="text-[11px] text-gray-600"><b>{c}</b> {hText(c) || <span className="text-gray-400">(ไม่มีคำแปลในระบบ)</span>}</li>)}</ul></div>
              <div><label className={labelCls}>รหัส P (คั่นด้วยจุลภาค)</label><input className={inputCls} value={pText_} onChange={e => setPText(e.target.value)} placeholder="P210, P280, P305+P351+P338" />
                <ul className="mt-1 space-y-0.5">{f.p_codes.map(c => <li key={c} className="text-[11px] text-gray-600"><b>{c}</b> {pText(c) || <span className="text-gray-400">(ไม่มีคำแปลในระบบ)</span>}</li>)}</ul></div>
            </div>
          </Section>

          {/* Storage */}
          <Section title="การจัดเก็บ (SDS ข้อ 7 + ประเภทการจัดเก็บตามคู่มือ กรอ.)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>ประเภทการจัดเก็บ (กรอ.)</label>
                <select className={inputCls} value={f.storage_class || ''} onChange={e => set('storage_class', (e.target.value || null) as StorageClassCode | null)}>
                  <option value="">— ยังไม่ระบุ —</option>
                  {STORAGE_CLASSES.map(c => <option key={c.code} value={c.code}>{c.code} · {c.nameTh}</option>)}
                </select>
                {suggestion && (
                  <div className="mt-2 text-xs rounded-lg px-3 py-2 flex flex-wrap items-center gap-2" style={{ background: '#f5f3ff', color: '#4c1d95' }}>
                    <Wand2 size={12} /> ระบบแนะนำ <StorageClassChip code={suggestion.code} showName /> <span className="text-gray-600">({suggestion.reason})</span>
                    {f.storage_class !== suggestion.code && (
                      <button type="button" onClick={() => set('storage_class', suggestion.code)} className="ml-auto px-2 py-1 rounded bg-purple-600 text-white text-[11px] font-semibold">ใช้ค่าแนะนำ</button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>พื้นที่จัดเก็บ</label>
                <select className={inputCls} value={f.storage_area_id || ''} onChange={e => set('storage_area_id', e.target.value || null)}>
                  <option value="">—</option>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input className={`${inputCls} mt-2`} placeholder="ตำแหน่ง/ชั้น/ตู้ (ถ้ามี)" value={f.storage_location || ''} onChange={e => set('storage_location', e.target.value || null)} />
              </div>
              <div className="sm:col-span-2"><label className={labelCls}>เงื่อนไขการเก็บจาก SDS</label><textarea className={inputCls} rows={2} value={f.storage_conditions || ''} onChange={e => set('storage_conditions', e.target.value || null)} placeholder="เก็บในที่เย็น แห้ง ระบายอากาศดี ห่างจากแหล่งความร้อน ปิดภาชนะให้สนิท" /></div>
            </div>
          </Section>

          {/* Safety */}
          <Section title="ความปลอดภัยสำหรับโปสเตอร์ (SDS ข้อ 4, 5, 6, 8)">
            <label className={labelCls}>PPE ที่ต้องใช้</label>
            <div className="flex flex-wrap gap-2">
              {PPE_OPTIONS.map(p => {
                const on = f.ppe_required.includes(p);
                return <button key={p} type="button" onClick={() => togglePpe(p)} className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'}`}>{p}</button>;
              })}
            </div>
            <input className={inputCls} placeholder="PPE อื่น ๆ (คั่นด้วยจุลภาค) — จะรวมเข้ากับรายการด้านบน"
              value={f.ppe_required.filter(p => !PPE_OPTIONS.includes(p)).join(', ')}
              onChange={e => set('ppe_required', [...f.ppe_required.filter(p => PPE_OPTIONS.includes(p)), ...e.target.value.split(',').map(s => s.trim()).filter(Boolean)])} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([['inhalation', 'ปฐมพยาบาล — สูดดม'], ['skin', 'ปฐมพยาบาล — สัมผัสผิวหนัง'], ['eye', 'ปฐมพยาบาล — เข้าตา'], ['ingestion', 'ปฐมพยาบาล — กลืนกิน']] as const).map(([k, l]) => (
                <div key={k}><label className={labelCls}>{l}</label><textarea className={inputCls} rows={2} value={f.first_aid[k] || ''} onChange={e => set('first_aid', { ...f.first_aid, [k]: e.target.value || undefined })} /></div>
              ))}
              <div><label className={labelCls}>การดับเพลิง (สารดับเพลิงที่เหมาะสม / ข้อควรระวัง)</label><textarea className={inputCls} rows={2} value={f.fire_fighting || ''} onChange={e => set('fire_fighting', e.target.value || null)} /></div>
              <div><label className={labelCls}>กรณีหกรั่วไหล</label><textarea className={inputCls} rows={2} value={f.spill_response || ''} onChange={e => set('spill_response', e.target.value || null)} /></div>
              <div><label className={labelCls}>เบอร์ฉุกเฉินผู้ผลิต (จาก SDS) <span className="font-normal text-gray-400">— เบอร์ของบริษัทตั้งที่เมนู &quot;ตั้งค่า&quot;</span></label><input className={inputCls} value={f.emergency_contact || ''} onChange={e => set('emergency_contact', e.target.value || null)} /></div>
              <div><label className={labelCls}>หมายเหตุ</label><input className={inputCls} value={f.notes || ''} onChange={e => set('notes', e.target.value || null)} /></div>
            </div>
          </Section>

          {error && <p className="text-sm rounded-lg px-3 py-2" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200">ยกเลิก</button>
          <button type="button" onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
            {uploading ? 'กำลังอัปโหลด SDS…' : saving ? 'กำลังบันทึก…' : initial ? 'บันทึกการแก้ไข' : 'บันทึกสารเคมี'}
          </button>
        </div>
      </div>
    </div>
  );
}

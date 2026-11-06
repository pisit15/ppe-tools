'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Link2, Trash2 } from 'lucide-react';
import { compressImage } from '@/app/inspect/_components/photo';
import { FA_ICONS, type FaIcon, type FaItem } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, Modal, Pictogram, VIZ, btnPrimary, btnSecondary, errMsg, inputClass, labelClass, manage, useFa } from './fa';

type ImageResult = { ok: true; imageUrl: string | null; hasImage: boolean; imageSource: string };

/** Picture controls for one item: take/upload a photo, paste a link, or remove. Updates are saved immediately. */
export function ImageField({ item, onChanged, compact = false }: { item: FaItem; onChanged: (next: Partial<FaItem>) => void; compact?: boolean }) {
  const { company } = useFa();
  const [busy, setBusy] = useState(''); const [url, setUrl] = useState(''); const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  async function upload(f: File) {
    setBusy('กำลังย่อและอัปโหลด…'); setErr('');
    try {
      const c = await compressImage(f, 600, 0.8);
      const signed = await manage<{ ok: true; path: string; signedUrl: string }>(company, { action: 'image-sign', itemId: item.id, ext: c.ext });
      const put = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'content-type': c.blob.type, 'x-upsert': 'false' }, body: c.blob });
      if (!put.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ');
      const r = await manage<ImageResult>(company, { action: 'image-from-url', itemId: item.id, path: signed.path, source: 'upload' });
      onChanged({ imageUrl: r.imageUrl, hasImage: r.hasImage, imageSource: r.imageSource });
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(''); if (file.current) file.current.value = ''; }
  }
  async function fromUrl() {
    if (!url.trim()) return;
    setBusy('กำลังดาวน์โหลดรูปจากลิงก์…'); setErr('');
    try { const r = await manage<ImageResult>(company, { action: 'image-from-url', itemId: item.id, url: url.trim() }); onChanged({ imageUrl: r.imageUrl, hasImage: r.hasImage, imageSource: r.imageSource }); setUrl(''); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(''); }
  }
  async function clear() {
    setBusy('กำลังลบ…'); setErr('');
    try { const r = await manage<ImageResult>(company, { action: 'image-clear', itemId: item.id }); onChanged({ imageUrl: r.imageUrl, hasImage: r.hasImage, imageSource: r.imageSource }); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(''); }
  }
  return (
    <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col gap-3'}`}>
      {!compact && <ItemImage item={item} size={160} rounded={12} />}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => file.current?.click()}><Camera size={15} />ถ่าย / อัปโหลด</button>
          {item.hasImage && <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => void clear()}><Trash2 size={15} />ลบรูป</button>}
          <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </div>
        <div className="flex gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void fromUrl(); } }} placeholder="หรือวางลิงก์รูป (https://…jpg)" aria-label="ลิงก์รูป" className={inputClass} disabled={!!busy} />
          <button type="button" className={`${btnSecondary} whitespace-nowrap`} disabled={!!busy || !url.trim()} onClick={() => void fromUrl()}><Link2 size={15} />ใช้ลิงก์</button>
        </div>
        {busy && <p className="text-xs text-gray-500">{busy}</p>}
        {err && <p className="text-xs" style={{ color: VIZ.accent }}>{err}</p>}
        {!busy && item.imageSource && item.imageSource !== 'upload' && <p className="text-[11px] text-gray-400 truncate" title={item.imageSource}>ที่มา: {item.imageSource}</p>}
      </div>
    </div>
  );
}

export function IconPicker({ value, onChange }: { value: FaIcon; onChange: (v: FaIcon) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FA_ICONS.map(ic => (
        <button key={ic.id} type="button" title={ic.label} aria-label={ic.label} aria-pressed={value === ic.id} onClick={() => onChange(ic.id)} className="rounded-lg border p-1" style={{ borderColor: value === ic.id ? FA_GREEN : '#E5E7EB', background: value === ic.id ? `${FA_GREEN}14` : '#fff' }}>
          <Pictogram icon={ic.id} size={30} />
        </button>
      ))}
    </div>
  );
}

/** Create / edit one medicine. `item` null = new. */
export function ItemFormModal({ open, item, onClose, onSaved }: { open: boolean; item: FaItem | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { company, state, refresh } = useFa();
  const categories = useMemo(() => Array.from(new Set((state?.items || []).map(i => i.category))).sort((a, b) => a.localeCompare(b, 'th')), [state]);
  const units = useMemo(() => Array.from(new Set((state?.items || []).map(i => i.unit))).sort((a, b) => a.localeCompare(b, 'th')), [state]);
  const [form, setForm] = useState({ name: '', generic: '', description: '', category: 'ยา', unit: 'เม็ด', min: 0, trackExpiry: true, icon: '' as FaIcon });
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  const [draft, setDraft] = useState<FaItem | null>(item);
  const createId = useMemo(() => (typeof crypto !== 'undefined' ? crypto.randomUUID() : ''), []);
  useEffect(() => {
    if (!open) return;
    setDraft(item); setErr('');
    setForm(item ? { name: item.name, generic: item.generic, description: item.description, category: item.category, unit: item.unit, min: item.min, trackExpiry: item.trackExpiry, icon: item.icon } : { name: '', generic: '', description: '', category: 'ยา', unit: 'เม็ด', min: 0, trackExpiry: true, icon: '' });
  }, [open, item]);
  async function save() {
    if (!form.name.trim()) { setErr('กรุณาระบุชื่อยา'); return; }
    setSaving(true); setErr('');
    try {
      const r = await manage<{ ok: true; id: string }>(company, { action: 'item', ...(item ? { id: item.id } : { createId }), name: form.name.trim(), generic: form.generic.trim(), description: form.description.trim(), category: form.category.trim() || 'ยา', unit: form.unit.trim() || 'ชิ้น', min: Number(form.min) || 0, trackExpiry: form.trackExpiry, icon: form.icon });
      await refresh(); onSaved(r.id);
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }
  const locked = !!item && (state?.lots.some(l => l.itemId === item.id) || state?.events.some(e => e.itemId === item.id));
  return (
    <Modal open={open} onClose={onClose} title={item ? `แก้ไข · ${item.name}` : 'เพิ่มยา / เวชภัณฑ์'} footer={<div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose}>ปิด</button><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} disabled={saving} onClick={() => void save()}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>}>
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div><label className={labelClass} htmlFor="if-name">ชื่อยา / เวชภัณฑ์ *</label><input id="if-name" className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
          <div><label className={labelClass} htmlFor="if-desc">คำอธิบายสั้น <span className="text-gray-400 font-normal">(แสดงใต้ชื่อ เช่น แก้ปวด ลดไข้)</span></label><input id="if-desc" className={inputClass} maxLength={160} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div><label className={labelClass} htmlFor="if-gen">ชื่อสามัญ / รายละเอียด</label><input id="if-gen" className={inputClass} maxLength={200} value={form.generic} onChange={e => setForm(f => ({ ...f, generic: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={labelClass} htmlFor="if-cat">หมวด</label><input id="if-cat" list="fa-cats" className={inputClass} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /><datalist id="fa-cats">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
            <div><label className={labelClass} htmlFor="if-unit">หน่วย</label><input id="if-unit" list="fa-units" className={inputClass} value={form.unit} disabled={locked} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /><datalist id="fa-units">{units.map(c => <option key={c} value={c} />)}</datalist></div>
            <div><label className={labelClass} htmlFor="if-min">ขั้นต่ำ</label><input id="if-min" type="number" min={0} className={inputClass} value={form.min} onChange={e => setForm(f => ({ ...f, min: Number(e.target.value) }))} /></div>
          </div>
          {locked && <p className="text-xs text-gray-500">รายการนี้มีสต็อก/ประวัติแล้ว จึงเปลี่ยนหน่วยไม่ได้</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.trackExpiry} onChange={e => setForm(f => ({ ...f, trackExpiry: e.target.checked }))} className="h-4 w-4" />ติดตามวันหมดอายุ (ปิดสำหรับอุปกรณ์ เช่น กรรไกร ปรอท)</label>
          <div><span className={labelClass}>ไอคอนสำรอง (ใช้เมื่อไม่มีรูป · เว้นว่าง = ระบบเลือกให้)</span><IconPicker value={form.icon} onChange={v => setForm(f => ({ ...f, icon: f.icon === v ? '' : v }))} /></div>
          {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
        </div>
        <div>
          <span className={labelClass}>รูป</span>
          {draft ? <ImageField item={draft} onChanged={next => { setDraft(d => (d ? { ...d, ...next } : d)); void refresh(); }} /> : <p className="text-xs text-gray-500">บันทึกรายการก่อน แล้วค่อยเพิ่มรูปได้</p>}
        </div>
      </div>
    </Modal>
  );
}

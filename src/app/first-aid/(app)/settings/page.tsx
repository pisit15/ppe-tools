'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Plus, QrCode } from 'lucide-react';
import type { FaLocation } from '@/lib/first-aid/types';
import { ConfirmButton, FA_GREEN, ItemImage, Modal, Spinner, ToastView, VIZ, balance, btnPrimary, btnSecondary, errMsg, fmtInt, inputClass, labelClass, manage, thaiDate, useFa, useToast } from '../../_components/fa';

const TYPES = ['ตู้ปฐมพยาบาล', 'ห้องพยาบาล', 'กระเป๋าปฐมพยาบาล', 'คลังสำรอง'];

export default function SettingsPage() {
  const { state, loading, company, refresh, isAdmin } = useFa();
  const { toast, setToast } = useToast();
  const [edit, setEdit] = useState<{ open: boolean; loc: FaLocation | null }>({ open: false, loc: null });
  const [thresholdsFor, setThresholdsFor] = useState<FaLocation | null>(null);
  const [qr, setQr] = useState<{ loc: FaLocation; url: string; svg: string } | null>(null);
  const [busy, setBusy] = useState('');
  if (loading || !state) return <Spinner />;
  const locations = state.locations.filter(l => !l.isRegister);
  async function makeLink(loc: FaLocation) {
    setBusy(loc.id);
    try { const r = await manage<{ ok: true; url: string; qrSvg: string }>(company, { action: 'rotate-token', locationId: loc.id }); await refresh(); setQr({ loc, url: r.url, svg: r.qrSvg }); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setBusy(''); }
  }
  function posterItems(q: { loc: FaLocation }) {
    const ids = new Set([...state!.thresholds.filter(t => t.locationId === q.loc.id).map(t => t.itemId), ...state!.lots.filter(l => l.locationId === q.loc.id && l.quantity > 0).map(l => l.itemId)]);
    return state!.items.filter(i => ids.has(i.id)).sort((a, b) => (b.hasImage ? 1 : 0) - (a.hasImage ? 1 : 0) || a.name.localeCompare(b.name, 'th')).slice(0, 12).map(i => ({ name: i.name, unit: i.unit, icon: i.icon, imageUrl: i.imageUrl, description: i.description }));
  }
  async function toggleInfirmary(on: boolean) {
    try { await manage(company, { action: 'settings', infirmary: on }); await refresh(); setToast({ type: 'success', msg: 'บันทึกแล้ว' }); } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }
  return (
    <div className="space-y-6 max-w-5xl">
      <section>
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-gray-900">จุดปฐมพยาบาล</h2><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} onClick={() => setEdit({ open: true, loc: null })}><Plus size={15} />เพิ่มจุด</button></div>
        <div className="grid gap-3 md:grid-cols-2">
          {locations.map(loc => { const assigned = state.thresholds.filter(t => t.locationId === loc.id).length; const stocked = new Set(state.lots.filter(l => l.locationId === loc.id && l.quantity > 0).map(l => l.itemId)).size; return (
            <div key={loc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-gray-900">{loc.name}</div><div className="text-xs text-gray-500">{loc.type}{loc.area ? ` · ${loc.area}` : ''}</div></div><span className="text-xs rounded-md px-2 py-0.5" style={{ background: loc.issueMode === 'self_service' ? `${VIZ.primary}1A` : '#F3F4F6', color: loc.issueMode === 'self_service' ? VIZ.primary : VIZ.lightText }}>{loc.issueMode === 'self_service' ? 'หยิบเองผ่าน QR' : 'เจ้าหน้าที่จ่าย'}{loc.requireRequester ? ' · ต้องระบุชื่อ' : ''}</span></div>
              <div className="text-xs text-gray-500">รายการประจำจุด {assigned} · มีของ {stocked} รายการ · ตรวจล่าสุด {loc.lastChecked ? thaiDate(loc.lastChecked) : 'ยังไม่เคย'}{loc.inspectionIssue && <span style={{ color: VIZ.accent }}> · มีปัญหาค้าง</span>}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className={btnSecondary} onClick={() => setEdit({ open: true, loc })}>แก้ไข</button>
                <button type="button" className={btnSecondary} onClick={() => setThresholdsFor(loc)}>ขั้นต่ำประจำจุด</button>
                {loc.issueMode === 'self_service' && <button type="button" className={btnSecondary} disabled={busy === loc.id} onClick={() => void makeLink(loc)}><QrCode size={15} />{loc.hasPublicLink ? 'สร้าง QR ใหม่' : 'สร้าง QR'}</button>}
                <ConfirmButton label="ปิดใช้งาน" confirmLabel="ยืนยันปิด?" danger disabled={stocked > 0} onConfirm={() => manage(company, { action: 'archive-location', id: loc.id, active: false }).then(refresh).then(() => setToast({ type: 'success', msg: 'ปิดใช้งานจุดแล้ว' })).catch(e => setToast({ type: 'error', msg: errMsg(e) }))} />
              </div>
              {loc.issueMode === 'self_service' && loc.hasPublicLink && <p className="text-[11px] text-gray-400">มีลิงก์ QR ใช้งานอยู่ · การสร้างใหม่จะทำให้ QR เดิมใช้ไม่ได้</p>}
            </div>); })}
          {locations.length === 0 && <p className="text-sm text-gray-500">ยังไม่มีจุดปฐมพยาบาล — เริ่มจากตู้ยา กล่อง หรือห้องพยาบาล</p>}
        </div>
        {state.archivedLocations.filter(l => !l.isRegister).length > 0 && <p className="mt-2 text-xs text-gray-500">ปิดใช้งานแล้ว: {state.archivedLocations.filter(l => !l.isRegister).map(l => <button key={l.id} type="button" className="underline mr-2" onClick={() => manage(company, { action: 'archive-location', id: l.id, active: true }).then(refresh)}>{l.name} (เปิดใหม่)</button>)}</p>}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">ทะเบียนยา</h2>
        <p className="text-sm text-gray-600">เพิ่ม/แก้ไขยาได้ที่หน้า <b>รายการยา</b> (ปุ่ม “เพิ่มยา” หรือคลิกรายการ → แก้ไข) · ใส่รูปที่หน้า <b>รูปยา</b></p>
        {state.archivedItems.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-gray-600">ยาที่ปิดใช้งาน ({state.archivedItems.length})</summary><ul className="mt-2 space-y-1">{state.archivedItems.map(i => <li key={i.id} className="flex items-center gap-2"><ItemImage item={i} size={24} rounded={6} /><span>{i.name}</span><button type="button" className="text-xs underline" onClick={() => manage(company, { action: 'archive-item', id: i.id, active: true }).then(refresh)}>เปิดใช้ใหม่</button></li>)}</ul></details>}
        <ArchiveItemPicker />
      </section>

      {isAdmin && (
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <label className="flex items-center justify-between gap-4"><span><span className="font-semibold text-gray-900 block">บริการห้องพยาบาล</span><span className="text-sm text-gray-500">บันทึกผู้มาใช้บริการ อาการ และการส่งต่อ แยกจากสต็อก (เฉพาะผู้ดูแลระบบ)</span></span><input type="checkbox" className="h-5 w-5" checked={state.company.infirmary} onChange={e => void toggleInfirmary(e.target.checked)} /></label>
        </section>)}

      <LocationModal open={edit.open} loc={edit.loc} onClose={() => setEdit({ open: false, loc: null })} onSaved={() => { setEdit({ open: false, loc: null }); setToast({ type: 'success', msg: 'บันทึกจุดแล้ว' }); }} />
      <ThresholdsModal loc={thresholdsFor} onClose={() => setThresholdsFor(null)} onSaved={() => { setThresholdsFor(null); setToast({ type: 'success', msg: 'บันทึกขั้นต่ำแล้ว' }); }} />
      <Modal open={!!qr} onClose={() => setQr(null)} title={`QR หยิบเอง · ${qr?.loc.name || ''}`} size="sm" footer={<div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={() => { if (qr) void navigator.clipboard?.writeText(qr.url); setToast({ type: 'success', msg: 'คัดลอกลิงก์แล้ว' }); }}>คัดลอกลิงก์</button><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} onClick={() => { if (qr) openPoster(qr, posterItems(qr), state.company.short); }}>เปิดโปสเตอร์ A4</button></div>}>
        {qr && <div className="text-center"><div className="mx-auto w-56 [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: qr.svg }} /><p className="mt-2 text-xs text-gray-500 break-all">{qr.url}</p><p className="mt-2 text-xs" style={{ color: VIZ.secondary }}>ลิงก์นี้แสดงครั้งเดียว — พิมพ์หรือคัดลอกเก็บไว้ · สร้างใหม่ได้ตลอด (ของเดิมจะใช้ไม่ได้)</p></div>}
      </Modal>
      <ToastView toast={toast} />
    </div>
  );
}

function openPoster(qr: { loc: FaLocation; url: string; svg: string } | null, items: { name: string; unit: string; icon: string; imageUrl: string | null; description: string }[], company: string) {
  if (!qr) return;
  window.sessionStorage.setItem('fa.poster', JSON.stringify({ loc: qr.loc, url: qr.url, svg: qr.svg, items, company, at: Date.now() }));
  window.open('/first-aid/settings/poster', '_blank');
}

function LocationModal({ open, loc, onClose, onSaved }: { open: boolean; loc: FaLocation | null; onClose: () => void; onSaved: () => void }) {
  const { company, refresh } = useFa();
  const [form, setForm] = useState({ name: '', type: TYPES[0], area: '', issueMode: 'controlled' as 'controlled' | 'self_service', requireRequester: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const createId = useMemo(() => crypto.randomUUID(), []);
  useEffect(() => { if (open) { setErr(''); setForm(loc ? { name: loc.name, type: loc.type, area: loc.area, issueMode: loc.issueMode, requireRequester: loc.requireRequester } : { name: '', type: TYPES[0], area: '', issueMode: 'controlled', requireRequester: true }); } }, [open, loc]);
  async function save() {
    if (!form.name.trim()) { setErr('กรุณาระบุชื่อจุด'); return; }
    setBusy(true); setErr('');
    try { await manage(company, { action: 'location', ...(loc ? { id: loc.id } : { createId }), name: form.name.trim(), type: form.type.trim() || TYPES[0], area: form.area.trim(), issueMode: form.issueMode, requireRequester: form.requireRequester }); await refresh(); onSaved(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={loc ? `แก้ไข · ${loc.name}` : 'เพิ่มจุดปฐมพยาบาล'} size="sm" footer={<div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} disabled={busy} onClick={() => void save()}>บันทึก</button></div>}>
      <div className="space-y-3">
        <div><label className={labelClass} htmlFor="lf-name">ชื่อจุด *</label><input id="lf-name" className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น ตู้ปฐมพยาบาล สำนักงาน HSE" autoFocus /></div>
        <div className="grid grid-cols-2 gap-2"><div><label className={labelClass} htmlFor="lf-type">ประเภท</label><input id="lf-type" list="fa-loc-types" className={inputClass} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} /><datalist id="fa-loc-types">{TYPES.map(t => <option key={t} value={t} />)}</datalist></div><div><label className={labelClass} htmlFor="lf-area">พื้นที่ / ชั้น</label><input id="lf-area" className={inputClass} value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} /></div></div>
        <div><span className={labelClass}>ใครบันทึกการจ่าย</span>
          <label className="flex items-start gap-2 text-sm rounded-lg border border-gray-200 p-2.5 mb-2"><input type="radio" name="mode" className="mt-1" checked={form.issueMode === 'controlled'} onChange={() => setForm(f => ({ ...f, issueMode: 'controlled' }))} /><span><b>เจ้าหน้าที่จ่าย</b><span className="block text-xs text-gray-500">พยาบาล/จป. บันทึกจากหน้า จ่ายวันนี้ (ห้องพยาบาล)</span></span></label>
          <label className="flex items-start gap-2 text-sm rounded-lg border border-gray-200 p-2.5"><input type="radio" name="mode" className="mt-1" checked={form.issueMode === 'self_service'} onChange={() => setForm(f => ({ ...f, issueMode: 'self_service' }))} /><span><b>หยิบเองผ่าน QR</b><span className="block text-xs text-gray-500">พนักงานสแกน QR หน้าตู้ แตะของที่หยิบ บันทึกเอง ไม่ต้อง login (ตู้ยาตามพื้นที่)</span></span></label></div>
        <label className="flex items-start gap-2 text-sm rounded-lg border border-gray-200 p-2.5"><input type="checkbox" className="mt-1 h-4 w-4" checked={form.requireRequester} onChange={e => setForm(f => ({ ...f, requireRequester: e.target.checked }))} /><span><b>บังคับระบุชื่อผู้เบิกยา</b><span className="block text-xs text-gray-500">เปิด = บันทึกไม่ได้ถ้าไม่กรอกชื่อ (ทั้งหน้าจ่ายและหน้า QR) · ปิด = ไม่กรอกก็ได้ แต่ระบบยังเก็บเวลา จุด และผู้บันทึกเสมอ</span></span></label>
        {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      </div>
    </Modal>
  );
}

function ThresholdsModal({ loc, onClose, onSaved }: { loc: FaLocation | null; onClose: () => void; onSaved: () => void }) {
  const { state, company, refresh } = useFa();
  const [mins, setMins] = useState<Record<string, number>>({}); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (!loc || !state) return; const m: Record<string, number> = {}; state.thresholds.filter(t => t.locationId === loc.id).forEach(t => { m[t.itemId] = t.min; }); setMins(m); setQ(''); setErr(''); }, [loc, state]);
  if (!loc || !state) return null;
  const items = state.items.filter(i => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => ((mins[b.id] ?? -1) >= 0 ? 1 : 0) - ((mins[a.id] ?? -1) >= 0 ? 1 : 0) || a.name.localeCompare(b.name, 'th'));
  async function save() {
    const rows = Object.entries(mins).filter(([, v]) => Number.isFinite(v)).map(([itemId, min]) => ({ itemId, min: Math.max(0, Math.round(min)) }));
    if (!rows.length) { setErr('เลือกรายการประจำจุดอย่างน้อย 1 รายการ'); return; }
    setBusy(true); setErr('');
    try { await manage(company, { action: 'thresholds', locationId: loc!.id, thresholds: rows }); await refresh(); onSaved(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const assigned = Object.keys(mins).length;
  return (
    <Modal open={!!loc} onClose={onClose} title={`รายการประจำจุด + ขั้นต่ำ · ${loc.name}`} footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-gray-500">ประจำจุด {assigned} รายการ</span><div className="flex gap-2"><button type="button" className={btnSecondary} onClick={onClose}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} disabled={busy} onClick={() => void save()}>บันทึก</button></div></div>}>
      <p className="text-sm text-gray-600 mb-3">ติ๊กยาที่ควรมีประจำจุดนี้ และใส่จำนวนขั้นต่ำ — ใช้คำนวณ “ต้องเติม” และรายการตรวจนับ</p>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหายา" aria-label="ค้นหา" className={`${inputClass} mb-2`} />
      <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {items.map(i => { const on = mins[i.id] !== undefined; return (
          <label key={i.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={on} onChange={e => setMins(m => { const n = { ...m }; if (e.target.checked) n[i.id] = m[i.id] ?? i.min ?? 0; else delete n[i.id]; return n; })} />
            <ItemImage item={i} size={28} rounded={6} /><span className="flex-1 min-w-0 truncate">{i.name} <span className="text-xs text-gray-400">{i.unit} · มี {fmtInt(balance(state, i.id, loc.id))}</span></span>
            <input type="number" min={0} aria-label={`ขั้นต่ำ ${i.name}`} disabled={!on} value={on ? mins[i.id] : ''} onChange={e => setMins(m => ({ ...m, [i.id]: Number(e.target.value) || 0 }))} className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-gray-900 disabled:bg-gray-50" />
          </label>); })}
      </div>
      {err && <p className="mt-2 text-sm" style={{ color: VIZ.accent }}>{err}</p>}
    </Modal>
  );
}

function ArchiveItemPicker() {
  const { state, company, refresh } = useFa();
  const [q, setQ] = useState('');
  if (!state) return null;
  const hits = q.trim() ? state.items.filter(i => i.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <details className="text-sm"><summary className="cursor-pointer text-gray-600">ปิดใช้งานยาที่ไม่ใช้แล้ว</summary>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="พิมพ์ชื่อยา" aria-label="ค้นหา" className={`${inputClass} mt-2 max-w-sm`} />
      <ul className="mt-2 space-y-1">{hits.map(i => { const b = balance(state, i.id); return <li key={i.id} className="flex items-center gap-2"><ItemImage item={i} size={24} rounded={6} /><span className="flex-1">{i.name} <span className="text-xs text-gray-400">คงเหลือ {fmtInt(b)}</span></span>{b === 0 ? <ConfirmButton label="ปิดใช้งาน" confirmLabel="ยืนยัน?" danger onConfirm={() => manage(company, { action: 'archive-item', id: i.id, active: false }).then(refresh)} /> : <span className="text-xs text-gray-400">ต้องไม่มีสต็อก</span>}</li>; })}</ul>
    </details>
  );
}

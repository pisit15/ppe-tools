'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FaItem, FaLot } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, itemSub, Modal, Stepper, VIZ, balance, bangkokToday, btnPrimary, btnSecondary, errMsg, fmtInt, inputClass, labelClass, manage, postTransaction, thaiDate, useFa } from './fa';

const REASONS = ['ปวดหัว / ไข้', 'ปวดท้อง / ท้องเสีย', 'คลื่นไส้', 'แพ้ / คัน', 'ปวดเมื่อย', 'บาดแผล', 'อื่น ๆ'];
const WHO_KEY = 'fa.lastWho';

/** Quick dispense of one item (used from the item table and the phone layout). */
export function DispenseModal({ item, onClose, onDone, defaultLocation }: { item: FaItem | null; onClose: () => void; onDone: (msg: string) => void; defaultLocation?: string }) {
  const { state, company, scope, refresh } = useFa();
  const locations = useMemo(() => (state?.locations || []).filter(l => !l.isRegister), [state]);
  const [locationId, setLocationId] = useState('');
  const [qty, setQty] = useState(1); const [who, setWho] = useState(''); const [dept, setDept] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => {
    if (!item) return;
    setQty(1); setNote(''); setErr('');
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(WHO_KEY) : null;
    if (saved) { try { const v = JSON.parse(saved) as { who: string; dept: string }; setWho(v.who || ''); setDept(v.dept || ''); } catch { /* ignore */ } }
    const preferred = defaultLocation || (scope !== 'all' ? scope : '');
    const withStock = locations.filter(l => state && balance(state, item.id, l.id) > 0);
    setLocationId(preferred && withStock.some(l => l.id === preferred) ? preferred : withStock[0]?.id || preferred || locations[0]?.id || '');
  }, [item, locations, scope, state, defaultLocation]);
  if (!item || !state) return null;
  const avail = balance(state, item.id, locationId);
  async function save() {
    if (!item) return;
    if (qty > avail) { setErr(`คงเหลือที่จุดนี้ ${fmtInt(avail)} ${item.unit}`); return; }
    setBusy(true); setErr('');
    try {
      await postTransaction(company, { idempotencyKey: crypto.randomUUID(), kind: 'issue', locationId, date: bangkokToday(), lines: [{ itemId: item.id, quantity: qty }], note: note.trim(), ...(who.trim() ? { requesterId: 'manual', requesterPerson: { name: who.trim(), department: dept.trim() } } : {}) });
      window.localStorage.setItem(WHO_KEY, JSON.stringify({ who: '', dept: dept.trim() }));
      await refresh(); onDone(`จ่าย ${item.name} ${fmtInt(qty)} ${item.unit} แล้ว`); onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const after = avail - qty; const min = state.thresholds.find(t => t.itemId === item.id && t.locationId === locationId)?.min ?? item.min;
  return (
    <Modal open={!!item} onClose={onClose} title="จ่ายยา" size="sm" footer={<div className="flex gap-2"><button type="button" className={btnSecondary} onClick={onClose}>ยกเลิก</button><button type="button" className={`${btnPrimary} flex-1`} style={{ background: FA_GREEN }} disabled={busy || avail === 0} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : `บันทึก · จ่าย ${fmtInt(qty)} ${item.unit}`}</button></div>}>
      <div className="flex items-center gap-3 mb-4"><ItemImage item={item} size={56} rounded={12} /><div className="min-w-0"><div className="font-semibold text-lg text-gray-900 leading-tight">{item.name}</div><div className="text-sm text-gray-500">{itemSub(item)}</div></div></div>
      {locations.length > 1 && (
        <div className="mb-3"><label className={labelClass} htmlFor="dm-loc">จ่ายจากจุด</label>
          <select id="dm-loc" className={inputClass} value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name} · คงเหลือ {fmtInt(balance(state, item.id, l.id))}</option>)}</select></div>
      )}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">จำนวน</span>
        <div className="flex items-center gap-2"><Stepper value={qty} onChange={setQty} max={Math.max(1, avail)} size={44} /><span className="text-sm text-gray-500">{item.unit}</span></div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">{[1, 2, 4, 6, 10].map(n => <button key={n} type="button" onClick={() => setQty(Math.min(n, Math.max(1, avail)))} className={`rounded-full border px-3 py-1 text-sm ${qty === n ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-700'}`} style={qty === n ? { background: FA_GREEN } : undefined}>{n}</button>)}</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><label className={labelClass} htmlFor="dm-who">ผู้รับ <span className="font-normal text-gray-400">(ไม่บังคับ)</span></label><input id="dm-who" className={inputClass} value={who} onChange={e => setWho(e.target.value)} placeholder="ชื่อ หรือรหัส" /></div>
        <div><label className={labelClass} htmlFor="dm-dept">แผนก</label><input id="dm-dept" list="fa-depts" className={inputClass} value={dept} onChange={e => setDept(e.target.value)} placeholder="เช่น ผลิต" /><datalist id="fa-depts">{state.departments.map(d => <option key={d} value={d} />)}</datalist></div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">{REASONS.map(r => <button key={r} type="button" onClick={() => setNote(n => (n === r ? '' : r))} className={`rounded-full border px-3 py-1 text-sm ${note === r ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-700'}`} style={note === r ? { background: FA_GREEN } : undefined}>{r}</button>)}</div>
      <input className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="อาการ / หมายเหตุ (ไม่บังคับ)" aria-label="หมายเหตุ" />
      <p className="mt-3 text-xs" style={{ color: after < min ? VIZ.secondary : VIZ.lightText }}>{avail === 0 ? 'จุดนี้ไม่มีของพร้อมจ่าย' : `หลังจ่ายเหลือ ${fmtInt(after)} ${item.unit}${after < min ? ` · ต่ำกว่าขั้นต่ำ ${fmtInt(min)}` : ''}`}</p>
      {err && <p className="mt-2 text-sm" style={{ color: VIZ.accent }}>{err}</p>}
    </Modal>
  );
}

/** Confirm the expiry date of a lot imported without one. */
export function LotExpiryModal({ lot, item, onClose, onDone }: { lot: FaLot | null; item: FaItem | null; onClose: () => void; onDone: (msg: string) => void }) {
  const { company, refresh, state } = useFa();
  const [expiry, setExpiry] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { setExpiry(lot?.expiry || ''); setErr(''); }, [lot]);
  if (!lot || !item) return null;
  const location = state?.locations.find(l => l.id === lot.locationId);
  async function save(value: string | null) {
    setBusy(true); setErr('');
    try { await manage(company, { action: 'lot-expiry', lotId: lot!.id, expiry: value }); await refresh(); onDone(value ? `บันทึกวันหมดอายุ ${thaiDate(value)} แล้ว` : 'ลบวันหมดอายุแล้ว'); onClose(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!lot} onClose={onClose} title="ระบุวันหมดอายุ" size="sm" footer={<div className="flex gap-2 justify-end"><button type="button" className={btnSecondary} onClick={onClose}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} disabled={busy || !expiry} onClick={() => void save(expiry)}>บันทึก</button></div>}>
      <div className="flex items-center gap-3 mb-3"><ItemImage item={item} size={44} /><div><div className="font-semibold text-gray-900">{item.name}</div><div className="text-xs text-gray-500">{location?.name} · ล็อต {lot.code} · {fmtInt(lot.quantity)} {item.unit}</div></div></div>
      <label className={labelClass} htmlFor="le-date">วันหมดอายุตามบรรจุภัณฑ์</label>
      <input id="le-date" type="date" className={inputClass} value={expiry} onChange={e => setExpiry(e.target.value)} />
      <p className="mt-2 text-xs text-gray-500">ของที่ยังไม่มีวันหมดอายุจะจ่ายไม่ได้ จนกว่าจะยืนยัน · ถ้าเป็นอุปกรณ์ที่ไม่มีวันหมดอายุ ให้ปิด “ติดตามวันหมดอายุ” ในหน้าแก้ไขรายการ</p>
      {err && <p className="mt-2 text-sm" style={{ color: VIZ.accent }}>{err}</p>}
    </Modal>
  );
}

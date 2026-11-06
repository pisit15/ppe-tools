'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FaItem, FaPublicState } from '@/lib/first-aid/types';
import { SYMPTOMS, matchesSymptom } from '@/lib/first-aid/browse';
import { FA_GREEN, ItemImage, Stepper, VIZ, balance, bangkokToday, errMsg, fmtInt, getJson, postJson, thaiDateTime } from '../../_components/fa';

const WHO_KEY = 'fa.take.who';
const DEPTS = ['ผลิต', 'QC', 'คลัง', 'ซ่อมบำรุง', 'สำนักงาน', 'ผู้รับเหมา', 'อื่น ๆ'];
const REASONS = ['บาดแผลเล็ก', 'ปวดหัว / ไข้', 'ปวดท้อง', 'แพ้ / คัน', 'หยิบให้เพื่อน', 'เติมกล่องประจำทีม'];
const MAX_LINES = 6;

type Step = 'pick' | 'confirm' | 'done';

export default function TakeClient({ token }: { token: string }) {
  const [state, setState] = useState<FaPublicState | null>(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>('pick');
  const [q, setQ] = useState(''); const [cat, setCat] = useState('all');
  const [who, setWho] = useState(''); const [dept, setDept] = useState(''); const [reason, setReason] = useState(''); const [issue, setIssue] = useState(false); const [issueText, setIssueText] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState<{ lines: { name: string; qty: number; unit: string }[]; low: string[]; at: string } | null>(null);
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  useEffect(() => {
    getJson<FaPublicState>(`/api/first-aid/public/${token}`).then(setState).catch(e => setError(errMsg(e, 'ไม่พบลิงก์นี้')));
    try { const v = JSON.parse(window.localStorage.getItem(WHO_KEY) || '{}') as { who?: string; dept?: string }; setWho(v.who || ''); setDept(v.dept || ''); } catch { /* ignore */ }
  }, [token]);
  const location = state?.locations[0];
  const items = useMemo(() => (state?.items || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'th')), [state]);
  const tags = useMemo(() => SYMPTOMS.filter(t => items.some(i => matchesSymptom(t, i))), [items]);
  const visible = items.filter(i => { const t = tags.find(x => x.id === cat); return (cat === 'all' || !t || matchesSymptom(t, i)) && (!q.trim() || `${i.name} ${i.generic} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase())); });
  const cartLines = Object.entries(cart).map(([id, qty]) => ({ item: items.find(i => i.id === id)!, qty })).filter(l => l.item && l.qty > 0);
  const totalQty = cartLines.reduce((s, l) => s + l.qty, 0);
  const setQty = (id: string, qty: number) => setCart(c => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; });
  const avail = (i: FaItem) => (state ? balance(state, i.id, location?.id) : 0);

  async function submit() {
    if (!state || !location || !cartLines.length) return;
    setBusy(true); setErr('');
    const noteParts = [reason, issue ? `แจ้ง จป.: ของในตู้มีปัญหา${issueText.trim() ? ` — ${issueText.trim()}` : ''}` : ''].filter(Boolean);
    try {
      await postJson(`/api/first-aid/public/${token}`, { idempotencyKey: idem, kind: 'issue', locationId: location.id, date: bangkokToday(), lines: cartLines.map(l => ({ itemId: l.item.id, quantity: l.qty })), note: noteParts.join(' · ').slice(0, 500), requesterId: 'manual', requesterPerson: { name: who.trim(), department: dept.trim() } });
      window.localStorage.setItem(WHO_KEY, JSON.stringify({ who: who.trim(), dept: dept.trim() }));
      const low = cartLines.filter(l => { const min = state.thresholds.find(t => t.itemId === l.item.id)?.min ?? l.item.min; return avail(l.item) - l.qty < min; }).map(l => l.item.name);
      setReceipt({ lines: cartLines.map(l => ({ name: l.item.name, qty: l.qty, unit: l.item.unit })), low, at: new Date().toISOString() });
      setStep('done'); setCart({}); setReason(''); setIssue(false); setIssueText(''); setIdem(crypto.randomUUID());
      getJson<FaPublicState>(`/api/first-aid/public/${token}`).then(setState).catch(() => undefined);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (error) return <Shell><div className="p-6 text-center"><div className="text-4xl mb-3" style={{ color: VIZ.accent }}>!</div><p className="font-semibold text-gray-900">{error}</p><p className="text-sm text-gray-500 mt-2">ติดต่อ จป. หรือเจ้าหน้าที่ประจำจุดเพื่อขอ QR ใหม่</p></div></Shell>;
  if (!state || !location) return <Shell><p className="p-8 text-center text-sm text-gray-500">กำลังโหลด…</p></Shell>;

  if (step === 'done' && receipt) return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
        <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{ background: `${VIZ.positive}22` }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={VIZ.positive} strokeWidth="2.5" aria-hidden="true"><path d="M5 12l4 4L19 6" /></svg></div>
        <div className="text-2xl font-semibold text-gray-900">บันทึกแล้ว</div>
        <div className="text-sm text-gray-600">{receipt.lines.map(l => `${l.name} ${fmtInt(l.qty)} ${l.unit}`).join(' · ')}<br />{location.name} · {thaiDateTime(receipt.at)}</div>
        {receipt.low.length > 0 && <div className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: `${VIZ.secondary}1A`, color: '#9a5410' }}>{receipt.low.join(', ')} ใกล้หมด — ระบบบันทึกไว้ให้ จป. เติมแล้ว</div>}
        <div className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left text-sm leading-relaxed"><b>บาดแผลเล็ก:</b> ล้างด้วยน้ำสะอาด → ทายาฆ่าเชื้อ → ปิดพลาสเตอร์<br /><span className="text-xs text-gray-500">แผลลึก เลือดไม่หยุด หรือหมดสติ → แจ้งหัวหน้างาน / ห้องพยาบาล ทันที</span></div>
      </div>
      <div className="p-4 pb-6 space-y-2"><button type="button" onClick={() => setStep('pick')} className="w-full h-12 rounded-xl border border-gray-300 bg-white font-semibold" style={{ color: FA_GREEN }}>หยิบเพิ่ม</button><p className="text-center text-xs text-gray-400">ปิดหน้านี้ได้เลย · ไม่เก็บข้อมูลส่วนตัวนอกจากชื่อที่กรอก</p></div>
    </Shell>);

  if (step === 'confirm') return (
    <Shell>
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3"><button type="button" aria-label="ย้อนกลับ" onClick={() => setStep('pick')} className="h-11 w-11 rounded-xl border border-gray-300 text-xl">‹</button><div><div className="font-semibold text-gray-900">ยืนยันการหยิบ</div><div className="text-xs text-gray-500">{location.name}</div></div></header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white px-3 divide-y divide-gray-100">{cartLines.map(l => <div key={l.item.id} className="flex items-center gap-3 py-2.5"><ItemImage item={l.item} size={40} /><div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 truncate">{l.item.name}</div><div className="text-xs text-gray-500">{l.item.unit} · เหลือ {fmtInt(avail(l.item))}</div></div><Stepper value={l.qty} onChange={n => setQty(l.item.id, n)} min={0} max={avail(l.item)} size={40} /></div>)}</div>
        <div className="space-y-2"><label className="block text-sm font-medium text-gray-800" htmlFor="tk-who">ชื่อผู้หยิบ <span className="font-normal text-gray-400">(ไม่บังคับ · จำไว้ในเครื่องนี้)</span></label><input id="tk-who" value={who} onChange={e => setWho(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base text-gray-900" placeholder="ชื่อ-นามสกุล หรือรหัสพนักงาน" />
          <div className="flex gap-1.5 overflow-x-auto pb-1">{DEPTS.map(d => <button key={d} type="button" onClick={() => setDept(x => (x === d ? '' : d))} className={`shrink-0 rounded-full border px-3.5 py-2 text-sm ${dept === d ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-700'}`} style={dept === d ? { background: FA_GREEN } : undefined}>{d}</button>)}</div></div>
        <div className="space-y-2"><div className="text-sm font-medium text-gray-800">หยิบไปทำอะไร <span className="font-normal text-gray-400">(ไม่บังคับ)</span></div><div className="flex flex-wrap gap-1.5">{REASONS.map(r => <button key={r} type="button" onClick={() => setReason(x => (x === r ? '' : r))} className={`rounded-full border px-3.5 py-2 text-sm ${reason === r ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-700'}`} style={reason === r ? { background: FA_GREEN } : undefined}>{r}</button>)}</div></div>
        <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={issue} onChange={e => setIssue(e.target.checked)} />ของในตู้มีปัญหา (หมด / หมดอายุ / ชำรุด) — แจ้ง จป.</label>
        {issue && <input value={issueText} onChange={e => setIssueText(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base text-gray-900" placeholder="เช่น ผ้าก๊อซหมด / เบตาดีนหมดอายุ" aria-label="รายละเอียดปัญหา" />}
        {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      </div>
      <div className="bg-white border-t border-gray-200 p-4 pb-6"><button type="button" disabled={busy || !cartLines.length} onClick={() => void submit()} className="w-full h-14 rounded-xl text-white text-lg font-semibold disabled:opacity-50" style={{ background: FA_GREEN }}>{busy ? 'กำลังบันทึก…' : `บันทึกการหยิบ (${fmtInt(totalQty)} ชิ้น)`}</button></div>
    </Shell>);

  return (
    <Shell>
      <header className="text-white px-4 pt-4 pb-3" style={{ background: FA_GREEN }}><div className="text-xs opacity-80">{state.company.short} · {location.type}</div><div className="text-xl font-semibold leading-tight">{location.name}</div><div className="text-xs opacity-80 mt-1">หยิบแล้วบันทึกตรงนี้ ไม่ต้อง login · ใช้เวลา 20 วินาที</div></header>
      <div className="px-3 pt-3 pb-1"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา หรือเลือกจากรายการ" aria-label="ค้นหา" className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base text-gray-900 placeholder:text-gray-400" /></div>
      {tags.length > 1 && <div className="flex gap-1.5 overflow-x-auto px-3 pb-1">{[{ id: 'all', label: `ทั้งหมด ${items.length}` }, ...tags].map(t => <button key={t.id} type="button" onClick={() => setCat(t.id)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${cat === t.id ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-300 text-gray-700'}`}>{t.label}</button>)}</div>}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2.5 content-start">
        {visible.map(i => { const a = avail(i); const qty = cart[i.id] || 0; const out = a === 0; return (
          <div key={i.id} className={`rounded-xl border bg-white p-2.5 flex flex-col gap-2 ${qty ? 'border-[#246047]' : 'border-gray-200'} ${out ? 'opacity-50' : ''}`} style={qty ? { background: `${FA_GREEN}0D` } : undefined}>
            <ItemImage item={i} size="100%" rounded={10} className="w-full aspect-[4/3]" />
            <div><div className="font-semibold text-gray-900 leading-tight text-[15px]">{i.name}</div><div className="text-xs text-gray-500">{i.description ? `${i.description} · ` : ''}เหลือ <b style={{ color: out ? VIZ.accent : VIZ.text }}>{fmtInt(a)}</b> {i.unit}</div></div>
            {out ? <div className="h-10 flex items-center justify-center text-sm font-semibold" style={{ color: VIZ.accent }}>หมด</div>
              : qty ? <div className="flex items-center justify-between"><button type="button" aria-label="ลด" onClick={() => setQty(i.id, qty - 1)} className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-xl" style={{ color: FA_GREEN }}>−</button><b className="text-lg">{qty}</b><button type="button" aria-label="เพิ่ม" disabled={qty >= a} onClick={() => setQty(i.id, qty + 1)} className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-xl disabled:opacity-40" style={{ color: FA_GREEN }}>+</button></div>
              : <button type="button" disabled={cartLines.length >= MAX_LINES} aria-label={`หยิบ ${i.name}`} onClick={() => setQty(i.id, 1)} className="h-10 w-full rounded-lg text-white font-semibold disabled:opacity-40" style={{ background: FA_GREEN }}>+ หยิบ</button>}
          </div>); })}
        {visible.length === 0 && <p className="col-span-2 py-8 text-center text-sm text-gray-500">ไม่พบรายการ</p>}
      </div>
      <div className="bg-white border-t border-gray-200 p-3 pb-6 flex items-center gap-3">
        <div className="flex-1 min-w-0"><div className="font-semibold text-gray-900">{cartLines.length ? `หยิบ ${cartLines.length} รายการ · ${fmtInt(totalQty)} ชิ้น` : 'ยังไม่ได้เลือก'}</div><div className="text-xs text-gray-500 truncate">{cartLines.map(l => `${l.item.name} ${l.qty}`).join(', ') || 'แตะ + ที่ของที่หยิบ'}</div></div>
        <button type="button" disabled={!cartLines.length} onClick={() => setStep('confirm')} className="h-12 px-6 rounded-xl text-white font-semibold text-base disabled:opacity-40" style={{ background: FA_GREEN }}>ถัดไป ›</button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh flex flex-col max-w-md mx-auto bg-[#F4F6F4] text-gray-800" style={{ fontFamily: "'Noto Sans Thai', system-ui, sans-serif" }}>{children}</main>;
}

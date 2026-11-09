'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FaItem, FaPublicState } from '@/lib/first-aid/types';
import { FA_GREEN, VIZ, balance, bangkokToday, errMsg, fmtInt, getJson, postJson, thaiDateTime } from '../../_components/fa';
import { PickBoard, TicketPanel, rememberQty, type Cart } from '../../_components/PickBoard';

const WHO_KEY = 'fa.take.who';
type Step = 'pick' | 'confirm' | 'done';

export default function TakeClient({ token }: { token: string }) {
  const [state, setState] = useState<FaPublicState | null>(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<Cart>({});
  const [step, setStep] = useState<Step>('pick');
  const [who, setWho] = useState(''); const [dept, setDept] = useState(''); const [reason, setReason] = useState(''); const [issue, setIssue] = useState(false); const [issueText, setIssueText] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState<{ lines: { name: string; qty: number; unit: string }[]; low: string[]; at: string } | null>(null);
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  useEffect(() => {
    getJson<FaPublicState>(`/api/first-aid/public/${token}`).then(setState).catch(e => setError(errMsg(e, 'ไม่พบลิงก์นี้')));
    try { const v = JSON.parse(window.localStorage.getItem(WHO_KEY) || '{}') as { who?: string; dept?: string }; setWho(v.who || ''); setDept(v.dept || ''); } catch { /* ignore */ }
  }, [token]);
  const location = state?.locations[0];
  const items = useMemo(() => state?.items || [], [state]);
  const avail = useCallback((i: FaItem) => (state ? balance(state, i.id, location?.id) : 0), [state, location]);
  const setQty = (id: string, qty: number) => { setErr(''); setCart(c => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; }); };
  const cartLines = items.filter(i => (cart[i.id] || 0) > 0);
  const totalQty = cartLines.reduce((s, i) => s + cart[i.id], 0);

  async function submit() {
    if (!state || !location || !cartLines.length) return;
    if (location.requireRequester && !who.trim()) { setErr('จุดนี้ต้องระบุชื่อผู้เบิกยา'); return; }
    setBusy(true); setErr('');
    const noteParts = [reason, issue ? `แจ้ง จป.: ของในตู้มีปัญหา${issueText.trim() ? ` — ${issueText.trim()}` : ''}` : ''].filter(Boolean);
    try {
      await postJson(`/api/first-aid/public/${token}`, { idempotencyKey: idem, kind: 'issue', locationId: location.id, date: bangkokToday(), lines: cartLines.map(i => ({ itemId: i.id, quantity: cart[i.id] })), note: noteParts.join(' · ').slice(0, 500), requesterId: 'manual', requesterPerson: { name: who.trim(), department: dept.trim() } });
      window.localStorage.setItem(WHO_KEY, JSON.stringify({ who: who.trim(), dept: dept.trim() })); rememberQty(cart);
      const low = cartLines.filter(i => { const min = state.thresholds.find(t => t.itemId === i.id)?.min ?? i.min; return avail(i) - cart[i.id] < min; }).map(i => i.name);
      setReceipt({ lines: cartLines.map(i => ({ name: i.name, qty: cart[i.id], unit: i.unit })), low, at: new Date().toISOString() });
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
      <div className="flex-1 overflow-y-auto p-4">
        <TicketPanel items={items} cart={cart} avail={avail} onQty={setQty} who={who} setWho={setWho} dept={dept} setDept={setDept} departments={state.departments || []} reason={reason} setReason={setReason} requireName={location.requireRequester} onSubmit={() => void submit()} busy={busy} err={err} submitLabel="บันทึกการหยิบ" hint="ชื่อและแผนกจะจำไว้ในเครื่องนี้สำหรับครั้งต่อไป">
          <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={issue} onChange={e => setIssue(e.target.checked)} />ของในตู้มีปัญหา (หมด / หมดอายุ / ชำรุด) — แจ้ง จป.</label>
          {issue && <input value={issueText} onChange={e => setIssueText(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-3 text-base text-gray-900" placeholder="เช่น ผ้าก๊อซหมด / เบตาดีนหมดอายุ" aria-label="รายละเอียดปัญหา" />}
        </TicketPanel>
      </div>
    </Shell>);

  return (
    <Shell>
      <header className="text-white px-4 pt-4 pb-3" style={{ background: FA_GREEN }}><div className="text-xs opacity-80">{state.company.short} · {location.type}</div><div className="text-xl font-semibold leading-tight">{location.name}</div><div className="text-xs opacity-80 mt-1">หยิบแล้วบันทึกตรงนี้ ไม่ต้อง login · ใช้เวลา 20 วินาที</div></header>
      <div className="flex-1 overflow-y-auto p-3"><PickBoard items={items} avail={avail} cart={cart} onChange={setQty} columns="grid-cols-2" compact /></div>
      <div className="bg-white border-t border-gray-200 p-3 pb-6 flex items-center gap-3">
        <div className="flex-1 min-w-0"><div className="font-semibold text-gray-900">{cartLines.length ? `หยิบ ${cartLines.length} รายการ · ${fmtInt(totalQty)} ชิ้น` : 'ยังไม่ได้เลือก'}</div><div className="text-xs text-gray-500 truncate">{cartLines.map(i => `${i.name} ${cart[i.id]}`).join(', ') || 'แตะ “+ เลือก” ที่ของที่หยิบ'}</div></div>
        <button type="button" disabled={!cartLines.length} onClick={() => setStep('confirm')} className="h-12 px-6 rounded-xl text-white font-semibold text-base disabled:opacity-40" style={{ background: FA_GREEN }}>ถัดไป ›</button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh flex flex-col max-w-md mx-auto bg-[#F4F6F4] text-gray-800" style={{ fontFamily: "'Noto Sans Thai', system-ui, sans-serif" }}>{children}</main>;
}

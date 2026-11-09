'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FaEvent, FaItem } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, KIND_LABEL, Spinner, ToastView, VIZ, balance, bangkokToday, openedContainers, btnSecondary, currentPeriod, errMsg, fmtInt, loadHistory, personLabel, postTransaction, shiftPeriod, thaiDate, thaiDateTime, useFa, useToast } from '../../_components/fa';
import { PickBoard, TicketPanel, cartLines, rememberQty, toTransactionLines, type Cart } from '../../_components/PickBoard';

const DEPT_KEY = 'fa.lastDept';

export default function DispensePage() {
  const { state, loading, scope, company, refresh } = useFa();
  const { toast, setToast } = useToast();
  const locations = useMemo(() => (state?.locations || []).filter(l => !l.isRegister), [state]);
  const [chosen, setChosen] = useState('');
  const locationId = locations.some(l => l.id === chosen) ? chosen : scope !== 'all' && locations.some(l => l.id === scope) ? scope : locations[0]?.id || '';
  const loc = locations.find(l => l.id === locationId);
  const [cart, setCart] = useState<Cart>({});
  const [who, setWho] = useState(''); const [dept, setDept] = useState(''); const [reason, setReason] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [date, setDate] = useState(bangkokToday());
  const [log, setLog] = useState<FaEvent[] | null>(null);
  const [recent, setRecent] = useState<FaEvent[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setDept(window.localStorage.getItem(DEPT_KEY) || ''); }, []);
  const loadLog = useCallback(async () => {
    try { const [day, past] = await Promise.all([loadHistory(company, date, date), loadHistory(company, `${shiftPeriod(currentPeriod(), -3)}-01`, bangkokToday())]); setLog(day.events); setRecent(past.events); }
    catch { setLog([]); }
  }, [company, date]);
  useEffect(() => { if (state) void loadLog(); }, [state, loadLog]);

  const frequent = useMemo(() => { const t = new Map<string, number>(); for (const e of recent) if (e.kind === 'issue') t.set(e.itemId, (t.get(e.itemId) || 0) + 1); return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id); }, [recent]);
  const avail = useCallback((i: FaItem) => (state ? balance(state, i.id, locationId) : 0), [state, locationId]);
  const opened = useCallback((i: FaItem) => (state ? openedContainers(state, i.id, locationId)[0] || null : null), [state, locationId]);
  const setQty = (id: string, qty: number) => { setErr(''); setCart(c => { const n = { ...c }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; }); };

  async function save() {
    if (!state || !loc) return;
    const picked = cartLines(state.items, cart); const lines = toTransactionLines(picked);
    if (!lines.length) return;
    if (loc.requireRequester && !who.trim()) { setErr('จุดนี้ต้องระบุชื่อผู้เบิกยา'); return; }
    const short = picked.find(l => l.usage !== 'use' && l.qty > avail(l.item));
    if (short) { setErr(`${short.item.name}: คงเหลือ ${fmtInt(avail(short.item))} ${short.item.unit}`); return; }
    setBusy(true); setErr('');
    const noteText = [reason, note.trim()].filter(Boolean).join(' · ').slice(0, 500);
    try {
      await postTransaction(company, { idempotencyKey: crypto.randomUUID(), kind: 'issue', locationId, date: bangkokToday(), lines, note: noteText, ...(who.trim() ? { requesterId: 'manual', requesterPerson: { name: who.trim(), department: dept.trim() } } : {}) });
      rememberQty(cart); window.localStorage.setItem(DEPT_KEY, dept.trim());
      setToast({ type: 'success', msg: `บันทึกการจ่าย ${lines.length} รายการ${who.trim() ? ` · ${who.trim()}` : ''} แล้ว` });
      setCart({}); setWho(''); setReason(''); setNote(''); setDate(bangkokToday());
      await Promise.all([refresh(), loadLog()]);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (loading || !state) return <Spinner />;
  if (!loc) return <p className="text-sm text-gray-500">ยังไม่มีจุดปฐมพยาบาล — สร้างได้ที่หน้า ตั้งค่า</p>;
  const isToday = date === bangkokToday();
  const dayLog = (log || []).filter(e => e.locationId === loc.id);
  const issuesToday = dayLog.filter(e => e.kind === 'issue');
  const tickets = new Set(issuesToday.map(e => e.documentId)).size;
  const visibleLog = showAll ? dayLog : dayLog.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">จ่ายยา</h1>
        {locations.length > 1 && <select aria-label="จุดที่จ่าย" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900" value={locationId} onChange={e => { setChosen(e.target.value); setCart({}); }}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
        <span className="text-sm text-gray-500">{thaiDate(bangkokToday(), { withDay: true })} · วันนี้ {fmtInt(tickets)} ใบ / {fmtInt(issuesToday.length)} รายการ</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 min-w-0">
          <PickBoard items={state.items} avail={avail} opened={opened} cart={cart} onChange={setQty} frequent={frequent} />
        </section>
        <aside className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 lg:sticky lg:top-20">
          <h2 className="font-semibold text-gray-900 mb-3">ใบจ่ายยา</h2>
          <TicketPanel items={state.items} cart={cart} avail={avail} onQty={setQty} who={who} setWho={setWho} dept={dept} setDept={setDept} departments={state.departments} reason={reason} setReason={setReason} requireName={loc.requireRequester} onSubmit={() => void save()} busy={busy} err={err} submitLabel="บันทึกการจ่าย" hint={<>ผู้บันทึก {state.session.name} · เวลาเก็บอัตโนมัติ · จ่ายจากล็อตที่หมดอายุก่อน · ยาแบ่งใช้ (ล้างตา ยานวด) กด “ใช้ 1 ครั้ง” ไม่ตัดสต๊อก</>}>
            <input value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)" aria-label="หมายเหตุ" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} />
          </TicketPanel>
        </aside>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายการ{isToday ? 'วันนี้' : thaiDate(date, { withDay: true })} · {loc.name}</h2>
          <div className="flex items-center gap-1.5"><button type="button" className={btnSecondary} onClick={() => setDate(d => new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10))}>‹</button><input type="date" aria-label="วันที่" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" value={date} max={bangkokToday()} onChange={e => setDate(e.target.value || bangkokToday())} /><button type="button" className={btnSecondary} disabled={isToday} onClick={() => setDate(d => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10))}>›</button></div>
        </div>
        {log === null ? <Spinner /> : dayLog.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-500">ยังไม่มีรายการ{isToday ? 'วันนี้' : ''}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2">เวลา</th><th className="text-left font-medium px-2 py-2">ยา</th><th className="text-right font-medium px-2 py-2">จำนวน</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell">ผู้เบิกยา</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">อาการ / หมายเหตุ</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">ผู้บันทึก</th></tr></thead>
            <tbody>{visibleLog.map(e => { const it = state.items.find(i => i.id === e.itemId); return (
              <tr key={e.id} className="border-t border-gray-50"><td className="px-3 py-2 text-gray-500 whitespace-nowrap">{e.recordingMode === 'legacy' ? '—' : thaiDateTime(e.recordedAt).split(' ').pop()}</td>
                <td className="px-2 py-2"><div className="flex items-center gap-2">{it && <ItemImage item={it} size={28} rounded={6} />}<span className={e.kind === 'issue' ? 'font-medium text-gray-900' : 'text-gray-600'}>{e.kind !== 'issue' && <span className="text-xs mr-1" style={{ color: e.kind === 'receive' ? VIZ.positive : VIZ.accent }}>{KIND_LABEL[e.kind]}</span>}{it?.name || '?'}</span></div></td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{e.usage === 'use' ? `ใช้ ${fmtInt(e.quantity)} ครั้ง` : e.usage === 'open' ? `เปิดใหม่ ${fmtInt(e.quantity)} ${it?.unit}` : `${fmtInt(e.quantity)} ${it?.unit}`}</td>
                <td className="px-2 py-2 hidden sm:table-cell">{personLabel(e.requester) || <span className="text-gray-400">—{e.recordingMode === 'self_service' ? ' (QR)' : ''}</span>}</td>
                <td className="px-2 py-2 text-gray-500 hidden md:table-cell truncate max-w-[260px]">{e.note}</td>
                <td className="px-2 py-2 text-gray-500 hidden md:table-cell">{e.recordingMode === 'self_service' ? 'หยิบเอง (QR)' : e.recordedBy.name}</td></tr>); })}
            </tbody></table></div>)}
        <div className="flex flex-wrap justify-between gap-2 px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          <span>{dayLog.length > 6 && <button type="button" className="underline mr-3" onClick={() => setShowAll(s => !s)}>{showAll ? 'ย่อ' : `แสดงทั้งหมด ${dayLog.length} รายการ`}</button>}บันทึกผิด → แก้ยอดได้ที่หน้า ตรวจนับ</span>
          <Link href="/first-aid/report" className="underline" style={{ color: FA_GREEN }}>ดูตารางทั้งเดือน →</Link>
        </div>
      </section>
      <ToastView toast={toast} />
    </div>
  );
}

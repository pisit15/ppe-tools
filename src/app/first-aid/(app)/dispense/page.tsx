'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { VOID_WINDOW_DAYS, type FaEvent, type FaItem } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, KIND_LABEL, Spinner, ToastView, VIZ, addDays, balance, bangkokToday, openedContainers, btnSecondary, currentPeriod, errMsg, fmtInt, loadHistory, personLabel, postTransaction, shiftPeriod, thaiDate, thaiDateTime, useFa, useToast } from '../../_components/fa';
import { ThaiDateInput } from '../../_components/ThaiDateInput';
import { VoidTicketModal } from '../../_components/actions';
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
  const [who, setWho] = useState(''); const [whoId, setWhoId] = useState(''); const [dept, setDept] = useState(''); const [reason, setReason] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [date, setDate] = useState(bangkokToday());
  const [log, setLog] = useState<FaEvent[] | null>(null);
  const [recent, setRecent] = useState<FaEvent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [voidDoc, setVoidDoc] = useState('');
  useEffect(() => { setDept(window.localStorage.getItem(DEPT_KEY) || ''); }, []);
  const loadLog = useCallback(async () => {
    try { const [day, past] = await Promise.all([loadHistory(company, date, date, { voided: '1' }), loadHistory(company, `${shiftPeriod(currentPeriod(), -3)}-01`, bangkokToday())]); setLog(day.events); setRecent(past.events); }
    catch { setLog([]); }
  }, [company, date]);
  useEffect(() => { if (state) void loadLog(); }, [state, loadLog]);

  const frequent = useMemo(() => { const t = new Map<string, number>(); for (const e of recent) if (e.kind === 'issue') t.set(e.itemId, (t.get(e.itemId) || 0) + 1); return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id); }, [recent]);
  const avail = useCallback((i: FaItem) => (state ? balance(state, i.id, locationId) : 0), [state, locationId]);
  const opened = useCallback((i: FaItem) => (state ? openedContainers(state, i.id, locationId)[0] || null : null), [state, locationId]);
  // Items this point has ever held (any lot, even one used up, or a shared container opened here).
  const everHere = useMemo(() => { const ids = new Set<string>(); for (const l of state?.lots || []) if (l.locationId === locationId) ids.add(l.itemId); for (const t of state?.thresholds || []) if (t.locationId === locationId && t.openedAt) ids.add(t.itemId); return ids; }, [state, locationId]);
  const stocked = useCallback((i: FaItem) => everHere.has(i.id), [everHere]);
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
      await postTransaction(company, { idempotencyKey: crypto.randomUUID(), kind: 'issue', locationId, date: bangkokToday(), lines, note: noteText, ...(whoId ? { requesterId: whoId } : who.trim() || dept.trim() ? { requesterId: 'manual', requesterPerson: { name: who.trim(), department: dept.trim() } } : {}) });
      rememberQty(cart); window.localStorage.setItem(DEPT_KEY, dept.trim());
      setToast({ type: 'success', msg: `บันทึกการจ่าย ${lines.length} รายการ${who.trim() ? ` · ${who.trim()}` : ''} แล้ว` });
      setCart({}); setWho(''); setWhoId(''); setReason(''); setNote(''); setDate(bangkokToday());
      await Promise.all([refresh(), loadLog()]);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (loading || !state) return <Spinner />;
  if (!loc) return <div className="mx-auto max-w-md rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm"><p className="font-semibold text-gray-900">ยังไม่มีจุดปฐมพยาบาล</p><p className="mt-1 text-sm text-gray-600">สร้างตู้ กระเป๋า หรือห้องพยาบาลก่อน แล้วจึงลงของและจ่ายยาได้</p><Link href="/first-aid/settings" className="mt-4 inline-flex h-11 items-center rounded-xl px-5 font-semibold text-white" style={{ background: FA_GREEN }}>ไปหน้า ตั้งค่า เพื่อสร้างจุด</Link></div>;
  const isToday = date === bangkokToday();
  const dayLog = (log || []).filter(e => e.locationId === loc.id);
  const issuesToday = dayLog.filter(e => e.kind === 'issue' && !e.voided);
  // A ticket can be cancelled for a week, unless it was imported or it opened a new shared container (the database enforces the same).
  const voidable = (e: FaEvent) => e.kind === 'issue' && !e.voided && e.recordingMode !== 'legacy' && e.date >= addDays(bangkokToday(), -VOID_WINDOW_DAYS) && !dayLog.some(x => x.documentId === e.documentId && x.usage === 'open');
  const tickets = new Set(issuesToday.map(e => e.documentId)).size;
  const visibleLog = showAll ? dayLog : dayLog.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">จ่ายยา</h1>
        {locations.length > 1 && <select aria-label="จุดที่จ่าย" className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900" value={locationId} onChange={e => { setChosen(e.target.value); setCart({}); }}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
        <span className="text-sm text-gray-500">{thaiDate(bangkokToday(), { withDay: true })} · วันนี้ {fmtInt(tickets)} ใบ / {fmtInt(issuesToday.length)} รายการ</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 min-w-0">
          <PickBoard items={state.items} avail={avail} opened={opened} cart={cart} onChange={setQty} frequent={frequent} stocked={stocked}
            emptyHint={<div className="mx-auto max-w-md py-10 text-center"><p className="font-semibold text-gray-900">จุดนี้ยังไม่มีของในระบบ</p><p className="mt-1 text-sm text-gray-600">ลงของที่มีอยู่ในตู้ก่อน แล้วจึงจ่ายยาจากหน้านี้ได้</p><Link href="/first-aid/count?mode=receive" className="mt-4 inline-flex h-11 items-center rounded-xl px-5 font-semibold text-white" style={{ background: FA_GREEN }}>ไปหน้า รับเข้า</Link></div>} />
        </section>
        <aside className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 lg:sticky lg:top-20">
          <h2 className="font-semibold text-gray-900 mb-3">ใบจ่ายยา</h2>
          <TicketPanel items={state.items} cart={cart} avail={avail} onQty={setQty} who={who} setWho={setWho} dept={dept} setDept={setDept} departments={state.departments} reason={reason} setReason={setReason} requireName={loc.requireRequester} employees={state.employees} whoId={whoId} setWhoId={setWhoId} onSubmit={() => void save()} busy={busy} err={err} submitLabel="บันทึกการจ่าย" hint={<>ผู้บันทึก {state.session.name} · เวลาเก็บอัตโนมัติ · จ่ายจากล็อตที่หมดอายุก่อน · ยาแบ่งใช้ (ล้างตา ยานวด) กด “ใช้ 1 ครั้ง” ไม่ตัดสต๊อก</>}>
            <input value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)" aria-label="หมายเหตุ" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} />
          </TicketPanel>
        </aside>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายการ{isToday ? 'วันนี้' : thaiDate(date, { withDay: true })} · {loc.name}</h2>
          <div className="flex items-center gap-1.5"><button type="button" className={btnSecondary} onClick={() => setDate(d => new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10))}>‹</button><ThaiDateInput compact ariaLabel="วันที่ของรายการที่แสดง" value={date} max={bangkokToday()} onChange={v => { if (v) setDate(v); }} /><button type="button" className={btnSecondary} disabled={isToday} onClick={() => setDate(d => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10))}>›</button></div>
        </div>
        {log === null ? <Spinner /> : dayLog.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-500">ยังไม่มีรายการ{isToday ? 'วันนี้' : ''}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2">เวลา</th><th className="text-left font-medium px-2 py-2">ยา</th><th className="text-right font-medium px-2 py-2">จำนวน</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell">ผู้เบิกยา</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">อาการ / หมายเหตุ</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">ผู้บันทึก</th><th className="px-2 py-2"><span className="sr-only">ยกเลิก</span></th></tr></thead>
            <tbody>{visibleLog.map((e, index) => { const it = state.items.find(i => i.id === e.itemId); const v = e.voided; const firstOfTicket = index === 0 || visibleLog[index - 1].documentId !== e.documentId; return (
              <tr key={e.id} className={`border-t border-gray-50 ${v ? 'bg-gray-50' : ''}`}><td className="px-3 py-2 text-gray-500 whitespace-nowrap">{e.recordingMode === 'legacy' ? '—' : thaiDateTime(e.recordedAt).split(' ').pop()}</td>
                <td className="px-2 py-2"><div className="flex items-center gap-2">{it && <ItemImage item={it} size={28} rounded={6} />}<span className={v ? 'text-gray-500 line-through' : e.kind === 'issue' ? 'font-medium text-gray-900' : 'text-gray-600'}>{e.kind !== 'issue' && <span className="text-xs mr-1" style={{ color: e.kind === 'receive' ? VIZ.positive : VIZ.accent }}>{KIND_LABEL[e.kind]}</span>}{it?.name || '?'}</span></div></td>
                <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${v ? 'text-gray-500 line-through' : ''}`}>{e.usage === 'use' ? `ใช้ ${fmtInt(e.quantity)} ครั้ง` : e.usage === 'open' ? `เปิดใหม่ ${fmtInt(e.quantity)} ${it?.unit}` : `${fmtInt(e.quantity)} ${it?.unit}`}</td>
                <td className="px-2 py-2 hidden sm:table-cell">{personLabel(e.requester) || <span className="text-gray-500">—{e.recordingMode === 'self_service' ? ' (QR)' : ''}</span>}</td>
                <td className="px-2 py-2 text-gray-500 hidden md:table-cell truncate max-w-[260px]">{v ? <span style={{ color: VIZ.accent }} title={`${v.reason}${v.by ? ` · โดย ${v.by}` : ''}`}>ยกเลิก: {v.reason}{v.by ? ` · ${v.by}` : ''}</span> : e.note}</td>
                <td className="px-2 py-2 text-gray-500 hidden md:table-cell">{e.recordingMode === 'self_service' ? 'หยิบเอง (QR)' : e.recordedBy.name}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{v ? firstOfTicket && <span className="text-xs font-medium" style={{ color: VIZ.accent }}>ยกเลิกแล้ว</span> : firstOfTicket && voidable(e) && <button type="button" onClick={() => setVoidDoc(e.documentId)} className="inline-flex min-h-9 items-center rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50" aria-label={`ยกเลิกใบจ่ายยา ${it?.name || ''}`}>ยกเลิก</button>}</td></tr>); })}
            </tbody></table></div>)}
        <div className="flex flex-wrap justify-between gap-2 px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          <span>{dayLog.length > 6 && <button type="button" className="underline mr-3" onClick={() => setShowAll(s => !s)}>{showAll ? 'ย่อ' : `แสดงทั้งหมด ${dayLog.length} รายการ`}</button>}บันทึกผิด → กด “ยกเลิก” ท้ายรายการ (ภายใน {VOID_WINDOW_DAYS} วัน) ยอดจะกลับเข้าสต๊อก · เกินกว่านั้นแก้ยอดที่หน้า ตรวจนับ</span>
          <Link href="/first-aid/report" className="underline" style={{ color: FA_GREEN }}>ดูตารางทั้งเดือน →</Link>
        </div>
      </section>
      <VoidTicketModal events={voidDoc ? dayLog.filter(e => e.documentId === voidDoc) : null} onClose={() => setVoidDoc('')} onDone={msg => { setToast({ type: 'success', msg }); void loadLog(); }} />
      <ToastView toast={toast} />
    </div>
  );
}

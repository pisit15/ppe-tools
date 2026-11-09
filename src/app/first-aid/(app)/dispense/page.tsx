'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FaEvent, FaItem } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, ItemPicker, KIND_LABEL, Spinner, Stat, Stepper, ToastView, VIZ, balance, bangkokToday, btnPrimary, btnSecondary, currentPeriod, errMsg, fmtInt, inputClass, labelClass, loadHistory, personLabel, postTransaction, shiftPeriod, thaiDate, thaiDateTime, useFa, useToast } from '../../_components/fa';

const REASONS = ['ปวดหัว / ไข้', 'ปวดท้อง / ท้องเสีย', 'คลื่นไส้', 'แพ้ / คัน', 'ปวดเมื่อย', 'บาดแผล'];
const DEPT_KEY = 'fa.lastDept';

export default function DispensePage() {
  const { state, loading, scope, company, refresh } = useFa();
  const { toast, setToast } = useToast();
  const locations = useMemo(() => (state?.locations || []).filter(l => !l.isRegister), [state]);
  const [locationId, setLocationId] = useState('');
  const [item, setItem] = useState<FaItem | null>(null); const [qty, setQty] = useState(1);
  const [who, setWho] = useState(''); const [dept, setDept] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [date, setDate] = useState(bangkokToday());
  const [log, setLog] = useState<FaEvent[] | null>(null);
  const [month, setMonth] = useState<FaEvent[] | null>(null);
  const [recent, setRecent] = useState<FaEvent[]>([]);
  useEffect(() => { if (!locationId && locations.length) setLocationId(scope !== 'all' && locations.some(l => l.id === scope) ? scope : locations[0].id); }, [locations, scope, locationId]);
  useEffect(() => { setDept(window.localStorage.getItem(DEPT_KEY) || ''); }, []);
  const loadLog = useCallback(async () => {
    try { const [day, mon, past] = await Promise.all([loadHistory(company, date, date), loadHistory(company, `${currentPeriod()}-01`, bangkokToday()), loadHistory(company, `${shiftPeriod(currentPeriod(), -3)}-01`, bangkokToday())]); setLog(day.events); setMonth(mon.events); setRecent(past.events); }
    catch { setLog([]); setMonth([]); }
  }, [company, date]);
  useEffect(() => { if (state) void loadLog(); }, [state, loadLog]);

  const frequent = useMemo(() => {
    if (!state) return [];
    const tally = new Map<string, number>();
    for (const e of recent) if (e.kind === 'issue') tally.set(e.itemId, (tally.get(e.itemId) || 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([id]) => state.items.find(i => i.id === id)).filter((i): i is FaItem => !!i);
    return top.length ? top : state.items.slice(0, 9);
  }, [state, recent]);

  async function save(target: FaItem | null = item, quantity = qty) {
    if (!state || !target || !locationId) return;
    const avail = balance(state, target.id, locationId);
    if (quantity > avail) { setErr(`คงเหลือที่จุดนี้ ${fmtInt(avail)} ${target.unit}`); return; }
    if (locations.find(l => l.id === locationId)?.requireRequester && !who.trim()) { setErr('จุดนี้ต้องระบุชื่อผู้เบิกยา'); return; }
    setBusy(true); setErr('');
    try {
      await postTransaction(company, { idempotencyKey: crypto.randomUUID(), kind: 'issue', locationId, date: bangkokToday(), lines: [{ itemId: target.id, quantity }], note: note.trim(), ...(who.trim() ? { requesterId: 'manual', requesterPerson: { name: who.trim(), department: dept.trim() } } : {}) });
      window.localStorage.setItem(DEPT_KEY, dept.trim());
      setToast({ type: 'success', msg: `จ่าย ${target.name} ${fmtInt(quantity)} ${target.unit} แล้ว` });
      setItem(null); setQty(1); setNote(''); setDate(bangkokToday());
      await Promise.all([refresh(), loadLog()]);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (loading || !state) return <Spinner />;
  const loc = locations.find(l => l.id === locationId);
  const avail = item ? balance(state, item.id, locationId) : 0;
  const issuesToday = (log || []).filter(e => e.kind === 'issue');
  const people = new Set(issuesToday.map(e => personLabel(e.requester)).filter(Boolean)).size;
  const monthIssues = (month || []).filter(e => e.kind === 'issue');
  const topMonth = (() => { const t = new Map<string, number>(); monthIssues.forEach(e => t.set(e.itemId, (t.get(e.itemId) || 0) + e.quantity)); return [...t.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, n]) => `${state.items.find(i => i.id === id)?.name || ''} ${fmtInt(n)}`); })();
  const lowAfter = state.items.filter(i => { const b = balance(state, i.id, locationId); const min = state.thresholds.find(t => t.itemId === i.id && t.locationId === locationId)?.min ?? i.min; return b < min && monthIssues.some(e => e.itemId === i.id); });
  const isToday = date === bangkokToday();

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] items-start">
      <div className="space-y-4">
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold text-gray-900">จ่ายยา</h2><span className="text-xs text-gray-500">{thaiDate(bangkokToday(), { withDay: true })}</span></div>
          {locations.length > 1 && <div><label className={labelClass} htmlFor="dp-loc">จุดที่จ่าย</label><select id="dp-loc" className={inputClass} value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
          <div><span className={labelClass}>ยา <span style={{ color: VIZ.accent }}>*</span></span><ItemPicker items={state.items} state={state} locationId={locationId} value={item} onPick={i => { setItem(i); setQty(1); setErr(''); }} autoFocus /></div>
          {item && (
            <>
              <div className="flex flex-wrap items-end gap-4">
                <div><span className={labelClass}>จำนวน</span><div className="flex items-center gap-2"><Stepper value={qty} onChange={setQty} max={Math.max(1, avail)} size={44} /><span className="text-sm text-gray-500">{item.unit}</span></div></div>
                <div className="text-xs" style={{ color: avail === 0 ? VIZ.accent : VIZ.lightText }}>{avail === 0 ? 'จุดนี้ไม่มีของพร้อมจ่าย' : `คงเหลือ ${fmtInt(avail)} → ${fmtInt(avail - qty)}`}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelClass} htmlFor="dp-who">ผู้เบิกยา {loc?.requireRequester ? <span style={{ color: VIZ.accent }}>*</span> : <span className="font-normal text-gray-400">(ไม่บังคับ)</span>}</label><input id="dp-who" className={inputClass} value={who} onChange={e => setWho(e.target.value)} placeholder="ชื่อ หรือรหัส" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} /></div>
                <div><label className={labelClass} htmlFor="dp-dept">แผนก</label><input id="dp-dept" list="fa-depts" className={inputClass} value={dept} onChange={e => setDept(e.target.value)} placeholder="เช่น ผลิต" /><datalist id="fa-depts">{state.departments.map(d => <option key={d} value={d} />)}</datalist></div>
              </div>
              <div className="flex flex-wrap gap-1.5">{REASONS.map(r => <button key={r} type="button" onClick={() => setNote(n => (n === r ? '' : r))} className={`rounded-full border px-3 py-1 text-sm ${note === r ? 'text-white border-transparent' : 'bg-white border-gray-300 text-gray-700'}`} style={note === r ? { background: FA_GREEN } : undefined}>{r}</button>)}</div>
              <input className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="อาการ / หมายเหตุ (ไม่บังคับ)" aria-label="หมายเหตุ" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} />
              {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
              <div className="flex gap-2"><button type="button" className={`${btnPrimary} flex-1 h-11 text-base`} style={{ background: FA_GREEN }} disabled={busy || avail === 0} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก  ↵'}</button><button type="button" className={btnSecondary} onClick={() => { setItem(null); setQty(1); setNote(''); setErr(''); }}>ล้าง</button></div>
            </>
          )}
          <p className="text-xs text-gray-400">ผู้บันทึก {state.session.name} · เวลาเก็บอัตโนมัติ · จ่ายจากล็อตที่หมดอายุก่อน</p>
        </section>
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3"><h2 className="font-semibold text-gray-900 text-sm">จ่ายบ่อย</h2><span className="text-xs text-gray-500">แตะ = จ่าย 1 ทันที</span></div>
          <div className="grid grid-cols-3 gap-2">
            {frequent.map(f => { const b = balance(state, f.id, locationId); return (
              <button key={f.id} type="button" disabled={busy || b === 0} onClick={() => void save(f, 1)} className="rounded-xl border border-gray-200 bg-white p-2 text-left hover:bg-gray-50 disabled:opacity-50 min-h-[44px]">
                <ItemImage item={f} size="100%" rounded={8} className="mb-1.5" />
                <div className="text-sm font-semibold text-gray-900 leading-tight truncate">{f.name}</div>
                <div className="text-xs" style={{ color: b === 0 ? VIZ.accent : VIZ.lightText }}>{b === 0 ? 'หมด' : `${fmtInt(b)} ${f.unit}`}</div>
              </button>); })}
          </div>
        </section>
      </div>

      <div className="space-y-4 min-w-0">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Stat label="วันนี้" value={log ? fmtInt(issuesToday.length) : '…'} color={FA_GREEN} sub={`รายการ${people ? ` · ${people} คน` : ''}`} />
          <Stat label={`เดือนนี้ (1–${Number(bangkokToday().slice(8))} ${thaiDate(bangkokToday()).split(' ')[1]})`} value={month ? fmtInt(monthIssues.length) : '…'} color={FA_GREEN} sub="รายการ" />
          <Stat label="จ่ายมากสุดเดือนนี้" value={<span className="text-base">{topMonth[0] || '—'}</span>} sub={topMonth[1]} />
          <Stat label="จ่ายแล้วต่ำกว่าขั้นต่ำ" value={fmtInt(lowAfter.length)} color={VIZ.secondary} sub={lowAfter.slice(0, 2).map(i => i.name).join(' · ') || '—'} />
        </section>
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">รายการ{isToday ? 'วันนี้' : 'วันที่เลือก'}{loc && locations.length > 1 ? ` · ${loc.name}` : ''}</h2>
            <div className="flex items-center gap-1.5"><button type="button" className={btnSecondary} onClick={() => setDate(d => new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10))}>‹</button><input type="date" aria-label="วันที่" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" value={date} max={bangkokToday()} onChange={e => setDate(e.target.value || bangkokToday())} /><button type="button" className={btnSecondary} disabled={isToday} onClick={() => setDate(d => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10))}>›</button></div>
          </div>
          {log === null ? <Spinner /> : log.filter(e => locations.length <= 1 || !loc || e.locationId === loc.id).length === 0 ? <p className="px-4 py-10 text-center text-sm text-gray-500">ยังไม่มีรายการ{isToday ? 'วันนี้' : ''}</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2">เวลา</th><th className="text-left font-medium px-2 py-2">ยา</th><th className="text-right font-medium px-2 py-2">จำนวน</th><th className="text-left font-medium px-2 py-2 hidden sm:table-cell">ผู้เบิกยา</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">หมายเหตุ</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">ผู้บันทึก</th></tr></thead>
              <tbody>{log.filter(e => locations.length <= 1 || !loc || e.locationId === loc.id).map(e => { const it = state.items.find(i => i.id === e.itemId); return (
                <tr key={e.id} className="border-t border-gray-50"><td className="px-3 py-2 text-gray-500 whitespace-nowrap">{e.recordingMode === 'legacy' ? '—' : thaiDateTime(e.recordedAt).split(' ').pop()}</td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2">{it && <ItemImage item={it} size={28} rounded={6} />}<span className={e.kind === 'issue' ? 'font-medium text-gray-900' : 'text-gray-600'}>{e.kind !== 'issue' && <span className="text-xs mr-1" style={{ color: e.kind === 'receive' ? VIZ.positive : VIZ.accent }}>{KIND_LABEL[e.kind]}</span>}{it?.name || '?'}</span></div></td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtInt(e.quantity)} {it?.unit}</td>
                  <td className="px-2 py-2 hidden sm:table-cell">{personLabel(e.requester) || <span className="text-gray-400">—{e.recordingMode === 'self_service' ? ' (QR)' : ''}</span>}</td>
                  <td className="px-2 py-2 text-gray-500 hidden md:table-cell truncate max-w-[220px]">{e.note}</td>
                  <td className="px-2 py-2 text-gray-500 hidden md:table-cell">{e.recordingMode === 'self_service' ? 'หยิบเอง (QR)' : e.recordedBy.name}</td></tr>); })}
              </tbody></table></div>)}
          <div className="flex flex-wrap justify-between gap-2 px-4 py-2 text-xs text-gray-500 border-t border-gray-100"><span>บันทึกผิด → แก้ยอดได้ที่หน้า ตรวจนับ</span><Link href="/first-aid/report" className="underline">ดูตารางทั้งเดือน →</Link></div>
        </section>
      </div>
      <ToastView toast={toast} />
    </div>
  );
}

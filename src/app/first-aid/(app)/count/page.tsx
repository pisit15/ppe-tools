'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FaItem } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, ItemPicker, Spinner, ToastView, VIZ, balance, bangkokToday, btnPrimary, btnSecondary, daysUntil, errMsg, expiryDays, fmtInt, inputClass, labelClass, manage, postTransaction, thaiDate, useFa, useToast } from '../../_components/fa';

type Mode = 'count' | 'receive' | 'transfer';

export default function CountPageWrapper() { return <Suspense fallback={<Spinner />}><CountPage /></Suspense>; }

function CountPage() {
  const params = useSearchParams();
  const { state, loading, scope } = useFa();
  const { toast, setToast } = useToast();
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'count');
  const locations = useMemo(() => (state?.locations || []).filter(l => !l.isRegister), [state]);
  const [chosen, setLocationId] = useState('');
  const locationId = locations.some(l => l.id === chosen) ? chosen : scope !== 'all' && locations.some(l => l.id === scope) ? scope : locations[0]?.id || '';
  if (loading || !state) return <Spinner />;
  const loc = locations.find(l => l.id === locationId);
  const seg = (m: Mode, label: string) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`px-4 py-2 text-sm ${mode === m ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>;
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden" role="tablist" aria-label="โหมด">{seg('count', 'ตรวจนับประจำเดือน')}{seg('receive', 'รับเข้า (ซื้อ / เติม)')}{seg('transfer', 'โอนระหว่างจุด')}</div>
        {mode !== 'transfer' && locations.length > 1 && <label className="flex items-center gap-2 text-sm text-gray-600">จุด<select aria-label="จุดปฐมพยาบาล" className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900" value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
        <div className="flex-1" />
        {mode === 'count' && loc && <span className="text-xs text-gray-500">ตรวจล่าสุด <b className="text-gray-800">{loc.lastChecked ? thaiDate(loc.lastChecked) : 'ยังไม่เคย'}</b>{loc.lastChecked && (daysUntil(loc.lastChecked) ?? 0) < -30 && <span style={{ color: VIZ.secondary }}> · เกิน 30 วัน</span>}</span>}
      </section>
      {mode === 'count' && loc && <StockCount key={loc.id} locationId={loc.id} onDone={msg => setToast({ type: 'success', msg })} />}
      {mode === 'receive' && loc && <Receive locationId={loc.id} presetItem={params.get('item')} onDone={msg => setToast({ type: 'success', msg })} />}
      {mode === 'transfer' && <Transfer onDone={msg => setToast({ type: 'success', msg })} />}
      {!loc && mode !== 'transfer' && <p className="text-sm text-gray-500">ยังไม่มีจุดปฐมพยาบาล — สร้างได้ที่หน้า ตั้งค่า</p>}
      <ToastView toast={toast} />
    </div>
  );
}

// ---------------- stock take ----------------
type Row = { item: FaItem; system: number; counted: string; expiry: string };
function StockCount({ locationId, onDone }: { locationId: string; onDone: (msg: string) => void }) {
  const { state, company, refresh } = useFa();
  const draftKey = `fa.count.${company}.${locationId}`;
  const [rows, setRows] = useState<Row[]>([]);
  const [dispose, setDispose] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState(''); const [cabinetOk, setCabinetOk] = useState(true); const [date, setDate] = useState(bangkokToday());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [createId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!state) return;
    const ids = new Set<string>([...state.thresholds.filter(t => t.locationId === locationId).map(t => t.itemId), ...state.lots.filter(l => l.locationId === locationId && l.quantity > 0).map(l => l.itemId)]);
    let draft: Record<string, { counted: string; expiry: string }> = {};
    try { draft = JSON.parse(window.localStorage.getItem(draftKey) || '{}'); } catch { /* ignore */ }
    const next = state.items.filter(i => ids.has(i.id)).sort((a, b) => a.name.localeCompare(b.name, 'th')).map(item => ({ item, system: balance(state, item.id, locationId), counted: draft[item.id]?.counted ?? '', expiry: draft[item.id]?.expiry ?? '' }));
    setRows(next);
    const expired = state.lots.filter(l => l.locationId === locationId && l.quantity > 0 && l.expiry && (expiryDays(l.expiry, state.asOf) ?? 0) < 0).map(l => l.id);
    setDispose(new Set(expired));
  }, [state, locationId, draftKey]);
  useEffect(() => { const d: Record<string, { counted: string; expiry: string }> = {}; rows.forEach(r => { if (r.counted !== '' || r.expiry) d[r.item.id] = { counted: r.counted, expiry: r.expiry }; }); window.localStorage.setItem(draftKey, JSON.stringify(d)); }, [rows, draftKey]);
  if (!state) return null;
  const expiredLotsHere = state.lots.filter(l => l.locationId === locationId && l.quantity > 0 && l.expiry && (expiryDays(l.expiry, state.asOf) ?? 0) < 0);
  const set = (id: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.item.id === id ? { ...r, ...patch } : r)));
  const parsed = rows.map(r => { const n = r.counted.trim() === '' ? null : Number(r.counted); const delta = n === null || !Number.isFinite(n) ? 0 : Math.round(n) - r.system; return { ...r, n, delta }; });
  const counted = parsed.filter(r => r.n !== null).length; const diffs = parsed.filter(r => r.delta !== 0);
  const minOf = (item: FaItem) => state.thresholds.find(t => t.itemId === item.id && t.locationId === locationId)?.min ?? item.min;
  const lowAfter = parsed.filter(r => (r.n ?? r.system) < minOf(r.item));
  const needsExpiry = parsed.filter(r => r.delta > 0 && r.item.trackExpiry && !r.expiry && !state.lots.some(l => l.locationId === locationId && l.itemId === r.item.id && l.quantity > 0 && l.expiry));
  async function save() {
    if (needsExpiry.length) { setErr(`ระบุวันหมดอายุของจำนวนที่นับได้เกินระบบ: ${needsExpiry.map(r => r.item.name).join(', ')}`); return; }
    setBusy(true); setErr('');
    try {
      const r = await manage<{ ok: true; adjustments: { itemId: string; delta: number }[]; disposedExpired: number }>(company, { action: 'count', createId, locationId, date, lines: parsed.filter(p => p.n !== null).map(p => ({ itemId: p.item.id, counted: Math.max(0, Math.round(p.n!)), expiry: p.expiry || null })), disposeLotIds: [...dispose], notes, hasIssue: !cabinetOk });
      window.localStorage.removeItem(draftKey);
      await refresh();
      onDone(`บันทึกผลตรวจนับแล้ว · ปรับยอด ${r.adjustments.length} รายการ · ตัดทิ้งหมดอายุ ${r.disposedExpired} ล็อต`);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const inputStyle = (r: typeof parsed[number]) => r.n === null ? {} : r.delta === 0 ? { borderColor: VIZ.positive, background: `${VIZ.positive}14` } : { borderColor: VIZ.secondary, background: `${VIZ.secondary}14` };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div><h2 className="font-semibold text-gray-900">ตรวจนับ · {state.locations.find(l => l.id === locationId)?.name}</h2><p className="text-xs text-gray-500">{rows.length} รายการประจำจุด · พิมพ์ยอดที่นับได้จริง กด Tab ไปช่องถัดไป · ว่าง = ตรงตามระบบ</p></div>
          <div className="flex items-center gap-2 text-xs text-gray-500"><div className="w-32 h-2 rounded bg-gray-100 overflow-hidden"><div className="h-full" style={{ width: `${rows.length ? (counted / rows.length) * 100 : 0}%`, background: FA_GREEN }} /></div>นับแล้ว {counted} / {rows.length}</div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500 bg-gray-50/80"><th className="text-left font-medium px-3 py-2">รายการ</th><th className="text-right font-medium px-2 py-2">ในระบบ</th><th className="text-right font-medium px-2 py-2">นับได้จริง</th><th className="text-right font-medium px-2 py-2">ต่าง</th><th className="text-left font-medium px-2 py-2 hidden md:table-cell">ล็อต / หมดอายุ</th><th className="text-right font-medium px-2 py-2 hidden sm:table-cell">ขั้นต่ำ</th><th className="text-left font-medium px-2 py-2">ผล</th></tr></thead>
          <tbody>{parsed.map(r => { const lots = state.lots.filter(l => l.locationId === locationId && l.itemId === r.item.id && l.quantity > 0); const low = (r.n ?? r.system) < minOf(r.item); return (
            <tr key={r.item.id} className={`border-t border-gray-50 ${r.n === null ? '' : 'bg-white'}`}>
              <td className="px-3 py-1.5"><div className="flex items-center gap-2"><ItemImage item={r.item} size={32} rounded={8} /><div><div className="font-medium text-gray-900">{r.item.name}</div><div className="text-xs text-gray-500">{r.item.unit}</div></div></div></td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.system)}</td>
              <td className="px-2 py-1.5 text-right"><input type="number" inputMode="numeric" min={0} aria-label={`นับได้จริง ${r.item.name}`} placeholder={String(r.system)} value={r.counted} onChange={e => set(r.item.id, { counted: e.target.value })} onFocus={e => e.target.select()} className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-gray-900" style={inputStyle(r)} /></td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium" style={{ color: r.delta === 0 ? VIZ.positive : r.delta > 0 ? VIZ.secondary : VIZ.accent }}>{r.n === null ? <span className="text-gray-300">—</span> : r.delta === 0 ? '0' : r.delta > 0 ? `+${fmtInt(r.delta)}` : fmtInt(r.delta)}</td>
              <td className="px-2 py-1.5 hidden md:table-cell"><div className="flex flex-wrap gap-1 items-center">
                {lots.map(l => { const d = expiryDays(l.expiry, state.asOf); const exp = d !== null && d < 0; return <span key={l.id} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]" style={exp ? { borderColor: VIZ.accent, color: VIZ.accent, background: `${VIZ.accent}14` } : !l.expiry && r.item.trackExpiry ? { borderStyle: 'dashed', color: VIZ.lightText } : { borderColor: '#E5E7EB', color: VIZ.lightText }}>{l.expiry ? thaiDate(l.expiry, { short: true }) : r.item.trackExpiry ? 'ไม่ระบุวันหมดอายุ' : 'ไม่ติดตาม'} · {fmtInt(l.quantity)}{exp && <label className="ml-1 inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={dispose.has(l.id)} onChange={e => setDispose(s => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} />ตัดทิ้ง</label>}</span>; })}
                {r.delta > 0 && r.item.trackExpiry && <input type="date" aria-label="วันหมดอายุของที่นับได้เกิน" value={r.expiry} onChange={e => set(r.item.id, { expiry: e.target.value })} className="rounded-md border px-1.5 py-0.5 text-xs text-gray-900" style={{ borderColor: r.expiry || !needsExpiry.some(x => x.item.id === r.item.id) ? '#D1D5DB' : VIZ.accent }} title="วันหมดอายุของจำนวนที่นับได้เกินระบบ" />}
              </div></td>
              <td className="px-2 py-1.5 text-right tabular-nums text-gray-500 hidden sm:table-cell">{minOf(r.item) || '—'}</td>
              <td className="px-2 py-1.5 text-xs whitespace-nowrap" style={{ color: r.n === null ? VIZ.neutral : r.delta === 0 && !low ? VIZ.positive : low ? VIZ.secondary : VIZ.text }}>{r.n === null ? 'ยังไม่นับ' : r.delta === 0 ? (low ? 'ตรง · ต่ำกว่าขั้นต่ำ' : 'ตรง') : r.delta > 0 ? `เกินระบบ · รับเข้า ${fmtInt(r.delta)}` : `ตัด ${fmtInt(-r.delta)} (ใช้ไปไม่ได้บันทึก)`}{low && r.delta !== 0 ? ' · ต้องเติม' : ''}</td>
            </tr>); })}</tbody>
        </table></div>
      </section>
      <aside className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 lg:sticky lg:top-20">
        <h3 className="font-semibold text-gray-900">สรุปก่อนบันทึก</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-gray-50 p-2.5"><div className="text-xs text-gray-500">ตรง</div><div className="text-xl font-semibold" style={{ color: VIZ.positive }}>{parsed.filter(r => r.n !== null && r.delta === 0).length}</div></div>
          <div className="rounded-lg bg-gray-50 p-2.5"><div className="text-xs text-gray-500">ยอดต่าง</div><div className="text-xl font-semibold" style={{ color: VIZ.secondary }}>{diffs.length}</div></div>
          <div className="rounded-lg bg-gray-50 p-2.5"><div className="text-xs text-gray-500">ตัดทิ้ง (หมดอายุ)</div><div className="text-xl font-semibold" style={{ color: VIZ.accent }}>{dispose.size}<span className="text-xs text-gray-400 font-normal"> / {expiredLotsHere.length} ล็อต</span></div></div>
          <div className="rounded-lg bg-gray-50 p-2.5"><div className="text-xs text-gray-500">ต้องเติมหลังตรวจ</div><div className="text-xl font-semibold" style={{ color: VIZ.secondary }}>{lowAfter.length}</div></div>
        </div>
        {(diffs.length > 0 || dispose.size > 0) && <div className="text-xs text-gray-700 space-y-0.5"><div className="font-medium">ระบบจะบันทึกให้อัตโนมัติ</div>{diffs.map(r => <div key={r.item.id}>· {r.item.name} {r.delta > 0 ? `รับเข้า +${fmtInt(r.delta)}` : `ตัด ${fmtInt(r.delta)}`}</div>)}{dispose.size > 0 && <div>· ตัดทิ้งของหมดอายุ {dispose.size} ล็อต</div>}</div>}
        {lowAfter.length > 0 && <div className="text-xs text-gray-700"><span className="font-medium">ต้องเติม:</span> {lowAfter.map(r => `${r.item.name} ${fmtInt(Math.max(0, minOf(r.item) - (r.n ?? r.system)))}`).join(' · ')}</div>}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={cabinetOk} onChange={e => setCabinetOk(e.target.checked)} />สภาพตู้ ความสะอาด การเข้าถึง ปกติ</label>
          <div><label className={labelClass} htmlFor="sc-note">หมายเหตุ</label><textarea id="sc-note" rows={2} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} placeholder="เช่น ป้ายหน้าตู้ชำรุด" /></div>
          <div><label className={labelClass} htmlFor="sc-date">วันที่ตรวจ</label><input id="sc-date" type="date" className={inputClass} value={date} max={bangkokToday()} onChange={e => setDate(e.target.value)} /></div>
        </div>
        {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
        <button type="button" className={`${btnPrimary} w-full h-11 text-base`} style={{ background: FA_GREEN }} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกผลตรวจนับ'}</button>
        <p className="text-xs text-gray-400">ยอดที่พิมพ์ไว้เก็บเป็นร่างในเครื่องนี้ มาต่อได้ · รายการที่ไม่ได้นับถือว่าตรงตามระบบ</p>
      </aside>
    </div>
  );
}

// ---------------- receive ----------------
type RLine = { key: string; item: FaItem | null; qty: number; lot: string; expiry: string };
function Receive({ locationId, presetItem, onDone }: { locationId: string; presetItem: string | null; onDone: (msg: string) => void }) {
  const { state, company, refresh } = useFa();
  const blank = (): RLine => ({ key: crypto.randomUUID(), item: null, qty: 1, lot: '', expiry: '' });
  const [lines, setLines] = useState<RLine[]>(() => [blank()]);
  const [date, setDate] = useState(bangkokToday()); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<string[]>([]);
  useEffect(() => { if (presetItem && state) { const it = state.items.find(i => i.id === presetItem); if (it) setLines([{ ...blank(), item: it }]); } }, [presetItem, state]);
  if (!state) return null;
  const set = (k: string, patch: Partial<RLine>) => setLines(ls => ls.map(l => (l.key === k ? { ...l, ...patch } : l)));
  async function save() {
    const ready = lines.filter(l => l.item && l.qty > 0);
    if (!ready.length) { setErr('เลือกยาอย่างน้อย 1 รายการ'); return; }
    const missing = ready.filter(l => l.item!.trackExpiry && !l.expiry);
    if (missing.length) { setErr(`ระบุวันหมดอายุ: ${missing.map(l => l.item!.name).join(', ')}`); return; }
    setBusy(true); setErr(''); const ok: string[] = [];
    try {
      for (const l of ready) {
        await postTransaction(company, { idempotencyKey: crypto.randomUUID(), kind: 'receive', locationId, date, lines: [{ itemId: l.item!.id, quantity: l.qty }], expiry: l.expiry || null, lotCode: l.lot.trim(), note: note.trim() });
        ok.push(`${l.item!.name} ${fmtInt(l.qty)} ${l.item!.unit}`); setDone([...ok]);
      }
      await refresh(); onDone(`รับเข้า ${ok.length} รายการแล้ว`); setLines([blank()]); setNote(''); setDone([]);
    } catch (e) { setErr(`${errMsg(e)}${ok.length ? ` (บันทึกไปแล้ว ${ok.length} รายการ: ${ok.join(', ')})` : ''}`); setLines(ls => ls.filter(l => !ok.some(o => o.startsWith(l.item?.name || '\u0000')))); } finally { setBusy(false); }
  }
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-3 max-w-4xl">
      <div className="flex flex-wrap items-end gap-3"><h2 className="font-semibold text-gray-900 flex-1">รับเข้า · {state.locations.find(l => l.id === locationId)?.name}</h2><div><label className={labelClass} htmlFor="rc-date">วันที่รับ</label><input id="rc-date" type="date" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" value={date} max={bangkokToday()} onChange={e => setDate(e.target.value)} /></div></div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={l.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_130px_150px_36px] items-end rounded-lg border border-gray-100 p-2">
            <div>{i === 0 && <span className={labelClass}>ยา</span>}<ItemPicker items={state.items} state={state} locationId={locationId} value={l.item} onPick={it => set(l.key, { item: it, expiry: it && !it.trackExpiry ? '' : l.expiry })} autoFocus={i === lines.length - 1 && !l.item} placeholder="พิมพ์ชื่อยาที่รับเข้า" /></div>
            <div>{i === 0 && <span className={labelClass}>จำนวน</span>}<input type="number" inputMode="numeric" min={1} aria-label="จำนวน" className={inputClass} value={l.qty} onChange={e => set(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} onFocus={e => e.target.select()} /></div>
            <div>{i === 0 && <span className={labelClass}>เลขล็อต</span>}<input aria-label="เลขล็อต" className={inputClass} value={l.lot} onChange={e => set(l.key, { lot: e.target.value })} placeholder="ไม่บังคับ" /></div>
            <div>{i === 0 && <span className={labelClass}>วันหมดอายุ</span>}<input type="date" aria-label="วันหมดอายุ" className={inputClass} value={l.expiry} min={bangkokToday()} disabled={!!l.item && !l.item.trackExpiry} onChange={e => set(l.key, { expiry: e.target.value })} /></div>
            <button type="button" aria-label="ลบแถว" className="h-10 w-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center"><button type="button" className={btnSecondary} onClick={() => setLines(ls => [...ls, blank()])}><Plus size={15} />เพิ่มแถว</button><input className={`${inputClass} flex-1 min-w-[200px]`} value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ เช่น ซื้อจาก… / ใบส่งของเลขที่…" aria-label="หมายเหตุ" /></div>
      {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      {done.length > 0 && busy && <p className="text-xs text-gray-500">บันทึกแล้ว {done.length}…</p>}
      <button type="button" className={`${btnPrimary} h-11`} style={{ background: FA_GREEN }} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : `บันทึกรับเข้า ${lines.filter(l => l.item).length} รายการ`}</button>
      <p className="text-xs text-gray-400">ยาที่ติดตามวันหมดอายุต้องระบุวันที่ · ของรุ่นเดียวกันที่มีล็อตและวันหมดอายุเดิมจะรวมเป็นล็อตเดียว</p>
    </section>
  );
}

// ---------------- transfer ----------------
function Transfer({ onDone }: { onDone: (msg: string) => void }) {
  const { state, company, refresh } = useFa();
  const locations = useMemo(() => (state?.locations || []).filter(l => !l.isRegister), [state]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [lines, setLines] = useState<{ key: string; item: FaItem | null; qty: number }[]>(() => [{ key: crypto.randomUUID(), item: null, qty: 1 }]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (locations.length && !from) { setFrom(locations[0].id); setTo(locations[1]?.id || ''); } }, [locations, from]);
  if (!state) return null;
  if (locations.length < 2) return <p className="text-sm text-gray-500">ต้องมีจุดปฐมพยาบาลอย่างน้อย 2 จุดจึงโอนได้</p>;
  async function save() {
    const ready = lines.filter(l => l.item && l.qty > 0);
    if (!ready.length || !from || !to || from === to) { setErr('เลือกต้นทาง ปลายทาง และยาอย่างน้อย 1 รายการ'); return; }
    const short = ready.find(l => balance(state!, l.item!.id, from) < l.qty);
    if (short) { setErr(`${short.item!.name}: ต้นทางมี ${fmtInt(balance(state!, short.item!.id, from))} ${short.item!.unit}`); return; }
    setBusy(true); setErr('');
    try { await postTransaction(company, { idempotencyKey: crypto.randomUUID(), kind: 'transfer', locationId: from, destinationId: to, date: bangkokToday(), lines: ready.slice(0, 8).map(l => ({ itemId: l.item!.id, quantity: l.qty })) }); await refresh(); onDone(`โอน ${ready.length} รายการแล้ว`); setLines([{ key: crypto.randomUUID(), item: null, qty: 1 }]); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  const sel = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 w-full';
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-3 max-w-3xl">
      <h2 className="font-semibold text-gray-900">โอนเติมของระหว่างจุด</h2>
      <div className="grid sm:grid-cols-2 gap-3"><div><label className={labelClass} htmlFor="tf-from">จากจุด</label><select id="tf-from" className={sel} value={from} onChange={e => setFrom(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div><label className={labelClass} htmlFor="tf-to">ไปจุด</label><select id="tf-to" className={sel} value={to} onChange={e => setTo(e.target.value)}>{locations.filter(l => l.id !== from).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div></div>
      <div className="space-y-2">{lines.map((l, i) => (
        <div key={l.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_36px] items-end">
          <div>{i === 0 && <span className={labelClass}>ยา</span>}<ItemPicker items={state.items} state={state} locationId={from} value={l.item} onPick={it => setLines(ls => ls.map(x => (x.key === l.key ? { ...x, item: it } : x)))} placeholder="พิมพ์ชื่อยาที่จะโอน" /></div>
          <div>{i === 0 && <span className={labelClass}>จำนวน</span>}<input type="number" inputMode="numeric" min={1} aria-label="จำนวน" className={inputClass} value={l.qty} onChange={e => setLines(ls => ls.map(x => (x.key === l.key ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} onFocus={e => e.target.select()} /></div>
          <button type="button" aria-label="ลบแถว" className="h-10 w-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}><Trash2 size={16} /></button>
        </div>))}</div>
      <div className="flex gap-2"><button type="button" className={btnSecondary} disabled={lines.length >= 8} onClick={() => setLines(ls => [...ls, { key: crypto.randomUUID(), item: null, qty: 1 }])}><Plus size={15} />เพิ่มแถว</button></div>
      {err && <p className="text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      <button type="button" className={`${btnPrimary} h-11`} style={{ background: FA_GREEN }} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกการโอน'}</button>
      <p className="text-xs text-gray-400">โอนล็อตที่หมดอายุก่อนไปก่อน · เลขล็อตและวันหมดอายุเดิมติดไปกับของ</p>
    </section>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Share2, Trash2 } from 'lucide-react';
import type { FaItem } from '@/lib/first-aid/types';
import { parseKeywords, pickDefault } from '@/lib/first-aid/default-images';
import { Chip, FA_GREEN, ItemImage, cleanGeneric, Spinner, Stat, ToastView, VIZ, btnSecondary, currentPeriod, errMsg, fmtInt, inputClass, manage, shiftPeriod, useFa, useToast } from '../../_components/fa';
import { ImageField } from '../../_components/ItemForm';

type Filter = 'missing' | 'default' | 'done' | 'all';

export default function ImagesPage() {
  const { state, loading, refresh, isAdmin } = useFa();
  const { toast, setToast } = useToast();
  const [filter, setFilter] = useState<Filter>('missing');
  const [q, setQ] = useState('');
  const [patch, setPatch] = useState<Record<string, Partial<FaItem>>>({});
  const ranked = useMemo(() => {
    if (!state) return [];
    const from = `${shiftPeriod(currentPeriod(), -3)}-01`; const t = new Map<string, number>();
    for (const e of state.events) if (e.kind === 'issue' && e.date >= from) t.set(e.itemId, (t.get(e.itemId) || 0) + 1);
    return state.items.map(i => ({ ...i, ...patch[i.id] })).map(i => ({ item: i, uses: t.get(i.id) || 0 })).sort((a, b) => b.uses - a.uses || a.item.name.localeCompare(b.item.name, 'th'));
  }, [state, patch]);
  if (loading || !state) return <Spinner />;
  // An item is "own" when the company uploaded a picture, "default" when it shows the shared one, otherwise it still has a pictogram.
  const kind = (i: FaItem): Exclude<Filter, 'all'> => (i.hasImage ? 'done' : i.imageDefault ? 'default' : 'missing');
  const count = (k: Exclude<Filter, 'all'>) => ranked.filter(r => kind(r.item) === k).length;
  const own = count('done'); const viaDefault = count('default'); const missing = count('missing');
  const list = ranked.filter(r => (filter === 'all' || kind(r.item) === filter) && (!q.trim() || `${r.item.name} ${r.item.generic}`.toLowerCase().includes(q.trim().toLowerCase())));
  const search = (i: FaItem) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${i.name} ${cleanGeneric(i.generic).split('/')[0]} ยา`.trim())}`;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Stat label="มีรูปแล้ว" value={<>{fmtInt(own + viaDefault)} <span className="text-base text-gray-400">/ {fmtInt(ranked.length)}</span></>} color={FA_GREEN} sub={`รูปของบริษัทเอง ${fmtInt(own)} · รูปเริ่มต้น ${fmtInt(viaDefault)}`} />
        <Stat label="ยังไม่มีรูป" value={fmtInt(missing)} color={VIZ.secondary} sub="ใช้ไอคอนไปก่อน" />
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 text-xs text-gray-600 leading-relaxed">เรียงตามยาที่จ่ายบ่อย 3 เดือนล่าสุดก่อน · กด <b>ค้นหารูป</b> → คลิกขวารูปที่ตรงยี่ห้อ → “คัดลอกที่อยู่รูปภาพ” → วางในช่องแล้วกด <b>ใช้ลิงก์</b> หรือถ่ายรูปกล่องจริงจากมือถือ · ระบบย่อรูปเหลือ ≈ 600 px และเก็บที่มาไว้</div>
      </section>
      {isAdmin && <DefaultLibrary notify={setToast} />}
      <section className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อยา" aria-label="ค้นหา" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 w-full max-w-xs" />
        <Chip active={filter === 'missing'} onClick={() => setFilter('missing')}>ยังไม่มีรูป {missing}</Chip>
        <Chip active={filter === 'default'} onClick={() => setFilter('default')}>ใช้รูปเริ่มต้น {viaDefault}</Chip>
        <Chip active={filter === 'done'} onClick={() => setFilter('done')}>รูปของบริษัทเอง {own}</Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด</Chip>
      </section>
      <section className="space-y-2">
        {list.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">ไม่มีรายการ</p>}
        {list.map(({ item, uses }) => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 grid gap-3 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start">
            <div className="flex items-center gap-3">
              <ItemImage item={item} size={64} rounded={12} />
              <div className="min-w-0"><div className="font-semibold text-gray-900 truncate">{item.name}</div><div className="text-xs text-gray-500 truncate">{cleanGeneric(item.generic) || item.category} · {item.unit}{uses ? ` · จ่าย ${uses} ครั้ง/3 เดือน` : ''}</div>
                <a href={search(item)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs underline" style={{ color: VIZ.primary }}><ExternalLink size={12} />ค้นหารูป</a></div>
            </div>
            <ImageField compact item={item} onChanged={next => { setPatch(p => ({ ...p, [item.id]: { ...p[item.id], ...next } })); if (next.hasImage !== undefined) setToast({ type: 'success', msg: next.hasImage ? `บันทึกรูป ${item.name} แล้ว` : `ลบรูป ${item.name} แล้ว` }); void refresh(); }} />
          </div>
        ))}
      </section>
      <ToastView toast={toast} />
    </div>
  );
}

/** Admin only: the shared default pictures. Each one covers every company's items whose name matches a keyword and that have no picture of their own. */
function DefaultLibrary({ notify }: { notify: (t: { type: 'success' | 'error'; msg: string }) => void }) {
  const { state, company, refresh } = useFa();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(''); const [confirmId, setConfirmId] = useState('');
  const defaults = useMemo(() => state?.defaultImages || [], [state]);
  // How many of this company's items each default would cover, with keywords as currently typed.
  const coverage = useMemo(() => {
    const rules = defaults.map(d => ({ id: d.id, keywords: edits[d.id] !== undefined ? parseKeywords(edits[d.id]) : d.keywords }));
    const m = new Map<string, string[]>();
    for (const i of state?.items || []) { const d = pickDefault(i.name, rules); if (d) m.set(d.id, [...(m.get(d.id) || []), i.name]); }
    return m;
  }, [defaults, edits, state]);
  if (!state) return null;
  const ownPictures = state.items.filter(i => i.hasImage).length;
  async function run(key: string, body: Record<string, unknown>, done: (r: Record<string, unknown>) => string) {
    setBusy(key);
    try { const r = await manage<Record<string, unknown>>(company, body); await refresh(); notify({ type: 'success', msg: done(r) }); return true; }
    catch (e) { notify({ type: 'error', msg: errMsg(e) }); return false; } finally { setBusy(''); }
  }
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button type="button" className="w-full flex items-center gap-2 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<Share2 size={15} style={{ color: FA_GREEN }} />
        <span className="font-semibold text-gray-900">รูปเริ่มต้น · ใช้ร่วมทุกบริษัท</span><span className="text-xs text-gray-500">{fmtInt(defaults.length)} รูป · เฉพาะผู้ดูแลระบบ</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">ยาของทุกบริษัทที่<b>ชื่อตรงกับคำค้น</b>และยังไม่มีรูปของตัวเอง จะแสดงรูปเริ่มต้นนี้ทันที (รูปที่บริษัทใส่เองมาก่อนเสมอ) · <b>วิธีเพิ่ม:</b> ใส่รูปให้ยาตามปกติ แล้วกด “ใช้เป็นรูปเริ่มต้นทุกบริษัท” ที่รายการนั้น · คำค้นคั่นด้วยจุลภาค เช่น <code>paracetamol, พารา, sara</code> — ใส่ชื่อยี่ห้อเพื่อไม่ให้ไปขึ้นกับยี่ห้ออื่น</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnSecondary} disabled={!!busy || ownPictures === 0} onClick={() => void run('all', { action: 'default-image-add-all' }, r => `เพิ่มรูปเริ่มต้น ${r.added} รูป${Number(r.skipped) ? ` · ข้าม ${r.skipped} (มีชื่อนี้อยู่แล้ว)` : ''}`)}><Share2 size={15} />{busy === 'all' ? 'กำลังคัดลอก…' : `ตั้งรูปทั้งหมดของ ${state.company.short} เป็นค่าเริ่มต้น (${fmtInt(ownPictures)} รูป)`}</button>
            <span className="text-xs text-gray-500">ชื่อที่มีรูปเริ่มต้นอยู่แล้วจะไม่ถูกทับ</span>
          </div>
          {defaults.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">ยังไม่มีรูปเริ่มต้น</p> : (
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {defaults.map(d => { const value = edits[d.id] ?? d.keywords.join(', '); const changed = edits[d.id] !== undefined && parseKeywords(edits[d.id]).join(',') !== d.keywords.join(','); const covered = coverage.get(d.id) || []; return (
                <li key={d.id} className="py-2.5 grid gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex items-center gap-3 min-w-0"><ItemImage item={{ name: d.title, icon: 'other', imageUrl: d.imageUrl }} size={52} rounded={10} /><div className="min-w-0"><div className="font-medium text-gray-900 truncate">{d.title}</div><div className="text-xs truncate" style={{ color: covered.length ? VIZ.lightText : VIZ.secondary }} title={covered.join(' · ')}>{covered.length ? `ตรงกับ ${fmtInt(covered.length)} รายการของ ${state.company.short}` : `ไม่ตรงกับยาของ ${state.company.short}`}</div></div></div>
                  <div className="flex gap-2"><input className={inputClass} aria-label={`คำค้นของ ${d.title}`} value={value} onChange={e => setEdits(x => ({ ...x, [d.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && changed) void run(d.id, { action: 'default-image-update', id: d.id, keywords: parseKeywords(value) }, () => `บันทึกคำค้นของ ${d.title} แล้ว`).then(ok => { if (ok) setEdits(x => { const n = { ...x }; delete n[d.id]; return n; }); }); }} placeholder="คำค้น คั่นด้วยจุลภาค" />
                    {changed && <button type="button" className={`${btnSecondary} whitespace-nowrap`} disabled={!!busy || parseKeywords(value).length === 0} onClick={() => void run(d.id, { action: 'default-image-update', id: d.id, keywords: parseKeywords(value) }, () => `บันทึกคำค้นของ ${d.title} แล้ว`).then(ok => { if (ok) setEdits(x => { const n = { ...x }; delete n[d.id]; return n; }); })}>บันทึก</button>}</div>
                  <div className="flex items-center gap-2 justify-end">
                    {confirmId === d.id ? <><span className="text-xs" style={{ color: VIZ.accent }}>ลบจากทุกบริษัท?</span><button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white" style={{ background: VIZ.accent }} disabled={!!busy} onClick={() => void run(d.id, { action: 'default-image-delete', id: d.id }, () => `ลบรูปเริ่มต้น ${d.title} แล้ว`).then(() => setConfirmId(''))}>ลบ</button><button type="button" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600" onClick={() => setConfirmId('')}>ยกเลิก</button></>
                      : <button type="button" aria-label={`ลบรูปเริ่มต้น ${d.title}`} className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" onClick={() => setConfirmId(d.id)}><Trash2 size={16} /></button>}
                  </div>
                </li>); })}
            </ul>)}
        </div>)}
    </section>
  );
}

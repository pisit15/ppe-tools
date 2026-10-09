'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, Search, XCircle } from 'lucide-react';
import type { ChemStorageArea, ChemSubstance, StorageClassCode } from '@/lib/types';
import { STORAGE_CONDITIONS, compat, describeCompat } from '@/lib/chemical/storage-classes';
import type { CompatCell } from '@/lib/chemical/storage-classes';
import { StorageClassChip, inputCls } from './ui';

/**
 * ตารางสาร × สาร — เอาสารเคมีที่มีอยู่จริงในทะเบียนมาวางทั้งแนวตั้ง/แนวนอน
 * แต่ละช่องแสดงผลการเก็บร่วมตามตาราง 23×23 ของ กรอ. (ผ่าน storage_class ของสารแต่ละตัว)
 * - ค่าเริ่มต้นเลือกทุกสาร; ติ๊กออกได้, ค้นหา, กรองตามพื้นที่จัดเก็บ
 * - สารที่ยังไม่จำแนกประเภท: แสดงเป็นช่องเทาและมีแถบเตือน (ไม่ซ่อน)
 * - กรองตามพื้นที่แล้วพบคู่ "ต้องแยกบริเวณ" ในพื้นที่เดียวกัน → แสดงเป็นรายการข้อค้นพบ
 */

const CELL_STYLE: Record<'ok' | 'cond' | 'no' | 'na', { bg: string; fg: string }> = {
  ok: { bg: '#59A14F', fg: '#fff' },
  cond: { bg: '#F7D154', fg: '#333' },
  no: { bg: '#E15759', fg: '#fff' },
  na: { bg: '#E5E7EB', fg: '#9CA3AF' },
};
const toneOf = (c: CompatCell): 'ok' | 'cond' | 'no' => c === '+' ? 'ok' : c === '-' ? 'no' : 'cond';
const MAX_READABLE = 40;

type Pair = { a: ChemSubstance; b: ChemSubstance };

export function SubstanceMatrix({ items, areas, isAll, q }: { items: ChemSubstance[]; areas: ChemStorageArea[]; isAll: boolean; q: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = useState('');
  const [search, setSearch] = useState('');
  const [hover, setHover] = useState<Pair | null>(null);
  const [pinned, setPinned] = useState<Pair | null>(null);
  const [showLower, setShowLower] = useState(false);

  // ค่าเริ่มต้น: เลือกทุกสาร (ภาพรวมคือเป้าหมายหลัก)
  useEffect(() => { setSelected(new Set(items.map(i => i.id))); }, [items]);

  // รายการในกล่องเลือก = กรองตามพื้นที่ + คำค้น
  const pickList = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(i => (!areaFilter || i.storage_area_id === areaFilter)
      && (!s || i.name.toLowerCase().includes(s) || (i.chemical_name || '').toLowerCase().includes(s) || (i.cas_no || '').includes(s)));
  }, [items, areaFilter, search]);

  // สารที่อยู่ในตาราง = ถูกติ๊ก และอยู่ในพื้นที่ที่กรอง (คำค้นไม่กระทบตาราง)
  const inMatrix = useMemo(() => items.filter(i => selected.has(i.id) && (!areaFilter || i.storage_area_id === areaFilter)), [items, selected, areaFilter]);
  const unclassified = inMatrix.filter(i => !i.storage_class);

  const cellOf = (a: ChemSubstance, b: ChemSubstance): CompatCell | null =>
    a.storage_class && b.storage_class ? compat(a.storage_class as StorageClassCode, b.storage_class as StorageClassCode) : null;

  // สรุปคู่ (นับครึ่งบนของตารางเท่านั้น ไม่นับคู่ซ้ำ/ตัวเอง)
  const stats = useMemo(() => {
    const s = { ok: 0, cond: 0, no: 0, na: 0 };
    const conflicts: { a: ChemSubstance; b: ChemSubstance; areaName: string }[] = [];
    const conds = new Set<number>();
    for (let i = 0; i < inMatrix.length; i++) for (let j = i + 1; j < inMatrix.length; j++) {
      const a = inMatrix[i], b = inMatrix[j];
      const c = cellOf(a, b);
      if (c === null) { s.na++; continue; }
      if (c === '+') s.ok++;
      else if (c === '-') {
        s.no++;
        // คู่ที่ต้องแยกแต่บันทึกว่าอยู่พื้นที่เดียวกัน = ขัดกับคู่มือ
        if (a.storage_area_id && a.storage_area_id === b.storage_area_id) {
          conflicts.push({ a, b, areaName: a.chem_storage_areas?.name || areas.find(x => x.id === a.storage_area_id)?.name || 'พื้นที่เดียวกัน' });
        }
      } else { s.cond++; conds.add(c); }
    }
    return { ...s, conflicts, conds: Array.from(conds).sort((x, y) => x - y) };
  }, [inMatrix, areas]);

  const active = pinned || hover;
  const activeCell = active ? cellOf(active.a, active.b) : null;

  const toggle = (id: string, on: boolean) => { const n = new Set(selected); if (on) n.add(id); else n.delete(id); setSelected(n); };
  const selectAllVisible = () => { const n = new Set(selected); pickList.forEach(i => n.add(i.id)); setSelected(n); };
  const clearVisible = () => { const n = new Set(selected); pickList.forEach(i => n.delete(i.id)); setSelected(n); };

  const areaFilterName = areaFilter ? (areas.find(a => a.id === areaFilter)?.name || '') : '';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
      {/* ─── picker ─── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 self-start">
        <h2 className="text-sm font-bold text-gray-800">เลือกสารที่จะแสดงในตาราง</h2>
        {areas.length > 0 && (
          <select className={inputCls} value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
            <option value="">ทุกพื้นที่จัดเก็บ</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input className={`${inputCls} pl-8`} placeholder="ค้นหาชื่อ / CAS" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={selectAllVisible} className="text-purple-700 font-semibold">เลือกทั้งหมด</button>
          <button onClick={clearVisible} className="text-gray-500">ล้าง</button>
          <span className="ml-auto text-gray-500">ในตาราง {inMatrix.length} / {items.length}</span>
        </div>
        <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {items.length === 0 && <p className="p-4 text-xs text-gray-500">{isAll ? 'เลือกบริษัทที่แถบด้านซ้ายก่อน' : 'ยังไม่มีสารเคมีในทะเบียน'}</p>}
          {items.length > 0 && pickList.length === 0 && <p className="p-4 text-xs text-gray-500">ไม่พบสารที่ตรงกับคำค้น</p>}
          {pickList.map(i => (
            <label key={i.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-purple-50/50">
              <input type="checkbox" checked={selected.has(i.id)} onChange={e => toggle(i.id, e.target.checked)} />
              <span className="flex-1 min-w-0 truncate text-gray-900" title={i.name}>{i.name}</span>
              <StorageClassChip code={i.storage_class} />
            </label>
          ))}
        </div>
      </div>

      {/* ─── matrix ─── */}
      <div className="space-y-4 min-w-0">
        {inMatrix.length < 2 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-500">เลือกสารเคมีอย่างน้อย 2 รายการ</div>
        ) : (
          <>
            {/* summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'ต้องแยกบริเวณ', n: stats.no, tone: 'no' as const, icon: <XCircle size={18} /> },
                { label: 'เก็บคละได้โดยมีเงื่อนไข', n: stats.cond, tone: 'cond' as const, icon: <AlertTriangle size={18} /> },
                { label: 'เก็บร่วมกันได้', n: stats.ok, tone: 'ok' as const, icon: <CheckCircle2 size={18} /> },
                { label: 'ยังตรวจไม่ได้ (ไม่จำแนก)', n: stats.na, tone: 'na' as const, icon: <Info size={18} /> },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3" style={{ borderLeft: `4px solid ${CELL_STYLE[k.tone].bg}` }}>
                  <div className="flex items-center justify-between text-[11px] text-gray-500"><span>{k.label}</span><span style={{ color: k.tone === 'na' ? '#9CA3AF' : CELL_STYLE[k.tone].bg }}>{k.icon}</span></div>
                  <div className="text-xl font-bold mt-0.5" style={{ color: k.tone === 'cond' ? '#b45309' : k.tone === 'na' ? '#6b7280' : CELL_STYLE[k.tone].bg }}>{k.n} <span className="text-xs font-normal text-gray-500">คู่</span></div>
                </div>
              ))}
            </div>

            {/* conflicts: red pairs recorded in the same storage area */}
            {stats.conflicts.length > 0 && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
                <div className="font-bold mb-1"><XCircle size={14} className="inline mr-1" />พบ {stats.conflicts.length} คู่ที่บันทึกว่าอยู่พื้นที่จัดเก็บเดียวกัน แต่คู่มือกำหนดให้แยกบริเวณ</div>
                <ul className="text-xs space-y-0.5">
                  {stats.conflicts.slice(0, 10).map(c => (
                    <li key={c.a.id + c.b.id}>• <b>{c.a.name}</b> <StorageClassChip code={c.a.storage_class} /> กับ <b>{c.b.name}</b> <StorageClassChip code={c.b.storage_class} /> — {c.areaName}</li>
                  ))}
                  {stats.conflicts.length > 10 && <li className="text-red-700/70">…และอีก {stats.conflicts.length - 10} คู่</li>}
                </ul>
              </div>
            )}

            {unclassified.length > 0 && (
              <p className="text-xs rounded-xl px-4 py-2" style={{ background: '#fef3c7', color: '#92400e' }}>
                <Info size={12} className="inline mr-1" />
                {unclassified.length} สารยังไม่ระบุประเภทการจัดเก็บ จึงแสดงเป็นช่องสีเทา: {unclassified.slice(0, 6).map(u => u.name).join(', ')}{unclassified.length > 6 ? ` และอีก ${unclassified.length - 6} รายการ` : ''}
                {' '}— <Link href={`/chemical${q}`} className="underline font-semibold">ไปกรอกที่ทะเบียน</Link>
              </p>
            )}

            {inMatrix.length > MAX_READABLE && (
              <p className="text-xs text-gray-500 px-1"><Info size={12} className="inline mr-1" />มีสารในตาราง {inMatrix.length} รายการ อาจอ่านยาก — แนะนำกรองตามพื้นที่จัดเก็บ หรือติ๊กออกบางรายการ</p>
            )}

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex flex-wrap items-center gap-4 text-xs mb-3">
                <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.ok.bg }} /> เก็บร่วมกันได้</span>
                <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.cond.bg }} /> ตัวเลข = มีเงื่อนไข (คลิกช่องเพื่อดู)</span>
                <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.no.bg }} /> ต้องแยกบริเวณ</span>
                <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.na.bg }} /> ยังไม่จำแนก</span>
                <label className="ml-auto inline-flex items-center gap-1 text-gray-500 cursor-pointer"><input type="checkbox" checked={showLower} onChange={e => setShowLower(e.target.checked)} /> แสดงครึ่งล่าง (ซ้ำ)</label>
              </div>
              {areaFilterName && <p className="text-xs text-gray-600 mb-2">พื้นที่จัดเก็บ: <b>{areaFilterName}</b></p>}
              <div className="overflow-auto" style={{ maxHeight: 640 }}>
                <table className="border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-20 bg-white px-2 py-1 text-left text-gray-600 font-semibold border border-gray-200" style={{ minWidth: 180 }}>สารเคมี</th>
                      {inMatrix.map(c => (
                        <th key={c.id} className="sticky top-0 z-10 bg-gray-50 border border-gray-200 font-semibold text-gray-700 align-bottom" style={{ width: 28, height: 120, padding: 0 }}>
                          <div className="flex items-end justify-center h-full pb-1">
                            <span className="whitespace-nowrap" title={c.name} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inMatrix.map((r, ri) => (
                      <tr key={r.id}>
                        <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-normal border border-gray-200 whitespace-nowrap">
                          <span className="text-gray-900 truncate inline-block align-middle" style={{ maxWidth: 150 }} title={r.name}>{r.name}</span>
                          <span className="ml-1 align-middle"><StorageClassChip code={r.storage_class} /></span>
                        </th>
                        {inMatrix.map((c, ci) => {
                          if (ri === ci) return <td key={c.id} className="border border-gray-200" style={{ background: '#F3F4F6', height: 26 }} />;
                          const lower = ci < ri;
                          if (lower && !showLower) return <td key={c.id} className="border border-gray-100" style={{ background: '#FAFAFA', height: 26 }} />;
                          const cell = cellOf(r, c);
                          const st = cell === null ? CELL_STYLE.na : CELL_STYLE[toneOf(cell)];
                          const isActive = active && ((active.a.id === r.id && active.b.id === c.id) || (active.a.id === c.id && active.b.id === r.id));
                          return (
                            <td key={c.id}
                              onMouseEnter={() => setHover({ a: r, b: c })} onMouseLeave={() => setHover(null)}
                              onClick={() => setPinned(pinned && pinned.a.id === r.id && pinned.b.id === c.id ? null : { a: r, b: c })}
                              className="border border-gray-200 text-center font-bold cursor-pointer"
                              title={`${r.name} × ${c.name}`}
                              style={{ background: st.bg, color: st.fg, height: 26, opacity: lower ? 0.55 : 1, outline: isActive ? '2px solid #111' : undefined, outlineOffset: -2 }}>
                              {cell === null ? '?' : cell === '+' ? '' : cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* detail */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-h-[88px]">
              {active ? (() => {
                if (activeCell === null) {
                  const missing = [active.a, active.b].filter(x => !x.storage_class).map(x => x.name);
                  return (
                    <div className="text-sm">
                      <div className="font-semibold text-gray-900 mb-1">{active.a.name} <span className="text-gray-400">×</span> {active.b.name}</div>
                      <p className="text-xs text-gray-600">ยังตรวจไม่ได้ — {missing.join(' และ ')} ยังไม่ระบุประเภทการจัดเก็บ <Link href={`/chemical${q}`} className="underline text-purple-700">ไปกรอก</Link></p>
                    </div>
                  );
                }
                const d = describeCompat(activeCell);
                return (
                  <div className="text-sm">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{active.a.name}</span><StorageClassChip code={active.a.storage_class} />
                      <span className="text-gray-400">×</span>
                      <span className="font-semibold text-gray-900">{active.b.name}</span><StorageClassChip code={active.b.storage_class} />
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: CELL_STYLE[d.tone].bg, color: CELL_STYLE[d.tone].fg }}>{d.label}</span>
                      {pinned && <button onClick={() => setPinned(null)} className="text-xs text-gray-500 ml-auto">ยกเลิกปักหมุด</button>}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{d.detail}</p>
                  </div>
                );
              })() : <p className="text-xs text-gray-500">ชี้หรือคลิกช่องในตารางเพื่อดูชื่อสารคู่นั้นและเงื่อนไข</p>}
            </div>

            {stats.conds.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-bold text-gray-800 mb-2">เงื่อนไขที่ปรากฏในตารางนี้</h3>
                <ol className="space-y-1.5 text-xs text-gray-700">{stats.conds.map(n => <li key={n}><b className="text-amber-700">ข้อ {n}</b> — {STORAGE_CONDITIONS[n]}</li>)}</ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

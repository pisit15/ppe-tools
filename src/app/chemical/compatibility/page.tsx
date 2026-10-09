'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Grid3x3, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import type { ChemStorageArea, ChemSubstance, StorageClassCode } from '@/lib/types';
import { STORAGE_CLASS_ORDER, STORAGE_CLASSES, STORAGE_CONDITIONS, SEPARATION_RULES, compat, describeCompat, storageClassDef } from '@/lib/chemical/storage-classes';
import type { CompatCell } from '@/lib/chemical/storage-classes';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { StorageClassChip, VIZ, inputCls } from '../components/ui';

const CELL_STYLE: Record<'ok' | 'cond' | 'no', { bg: string; fg: string }> = {
  ok: { bg: '#59A14F', fg: '#fff' },
  cond: { bg: '#F7D154', fg: '#333' },
  no: { bg: '#E15759', fg: '#fff' },
};
const toneOf = (c: CompatCell): 'ok' | 'cond' | 'no' => c === '+' ? 'ok' : c === '-' ? 'no' : 'cond';

export default function CompatibilityPage() {
  const { companyId, isAll, q } = useCompanyScope();
  const [items, setItems] = useState<ChemSubstance[]>([]);
  const [areas, setAreas] = useState<ChemStorageArea[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [areaPick, setAreaPick] = useState('');
  const [hover, setHover] = useState<{ a: StorageClassCode; b: StorageClassCode } | null>(null);
  const [pinned, setPinned] = useState<{ a: StorageClassCode; b: StorageClassCode } | null>(null);
  const [tab, setTab] = useState<'check' | 'matrix'>('check');

  useEffect(() => {
    Promise.all([
      fetch(`/api/chemical/substances?company_id=${companyId}`).then(r => r.json()),
      fetch(`/api/chemical/storage-areas?company_id=${companyId}`).then(r => r.json()),
    ]).then(([s, a]) => { setItems(s.data || []); setAreas(a.data || []); }).catch(() => {});
  }, [companyId]);

  // เลือกตามพื้นที่เก็บ → ติ๊กสารทั้งหมดในพื้นที่นั้น
  useEffect(() => {
    if (!areaPick) return;
    setSelected(new Set(items.filter(i => i.storage_area_id === areaPick).map(i => i.id)));
  }, [areaPick, items]);

  const chosen = items.filter(i => selected.has(i.id));
  const unclassified = chosen.filter(i => !i.storage_class);
  const pairs = useMemo(() => {
    const out: { a: ChemSubstance; b: ChemSubstance; cell: CompatCell }[] = [];
    const cls = chosen.filter(i => i.storage_class);
    for (let i = 0; i < cls.length; i++) for (let j = i + 1; j < cls.length; j++) {
      out.push({ a: cls[i], b: cls[j], cell: compat(cls[i].storage_class as StorageClassCode, cls[j].storage_class as StorageClassCode) });
    }
    const rank = (c: CompatCell) => c === '-' ? 0 : c === '+' ? 2 : 1;
    return out.sort((x, y) => rank(x.cell) - rank(y.cell));
  }, [chosen]);
  const summary = {
    no: pairs.filter(p => p.cell === '-').length,
    cond: pairs.filter(p => typeof p.cell === 'number').length,
    ok: pairs.filter(p => p.cell === '+').length,
  };
  const usedConditions = Array.from(new Set(pairs.filter(p => typeof p.cell === 'number').map(p => p.cell as number))).sort((a, b) => a - b);

  const active = pinned || hover;
  const activeCell = active ? compat(active.a, active.b) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Grid3x3 className="text-purple-600" /> ตารางการจัดเก็บ — เก็บร่วม / แยกบริเวณ</h1>
          <p className="text-sm text-gray-500 mt-1">อ้างอิงคู่มือการเก็บรักษาวัตถุอันตราย กรมโรงงานอุตสาหกรรม (ประเภทการจัดเก็บ 23 รหัส, เงื่อนไข 18 ข้อ)</p>
        </div>
        <Link href={`/chemical${q}`} className="text-sm text-purple-700 font-semibold">← ทะเบียนสารเคมี</Link>
      </div>

      <div className="flex gap-2">
        {([['check', 'ตรวจสอบสารที่เก็บด้วยกัน'], ['matrix', 'ตารางอ้างอิง 23 × 23']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === k ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'check' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* picker */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-800">เลือกสารเคมีที่จะเก็บในบริเวณเดียวกัน</h2>
            {areas.length > 0 && (
              <select className={inputCls} value={areaPick} onChange={e => setAreaPick(e.target.value)}>
                <option value="">— เลือกตามพื้นที่เก็บ (ไม่บังคับ) —</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <div className="flex gap-2 text-xs">
              <button onClick={() => setSelected(new Set(items.map(i => i.id)))} className="text-purple-700 font-semibold">เลือกทั้งหมด</button>
              <button onClick={() => { setSelected(new Set()); setAreaPick(''); }} className="text-gray-500">ล้าง</button>
              <span className="ml-auto text-gray-500">เลือกแล้ว {selected.size}</span>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {items.length === 0 && <p className="p-4 text-xs text-gray-500">{isAll ? 'เลือกบริษัทที่แถบด้านซ้ายก่อน' : 'ยังไม่มีสารเคมีในทะเบียน'}</p>}
              {items.map(i => (
                <label key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-purple-50/50">
                  <input type="checkbox" checked={selected.has(i.id)} onChange={e => { const n = new Set(selected); if (e.target.checked) n.add(i.id); else n.delete(i.id); setSelected(n); setAreaPick(''); }} />
                  <span className="flex-1 min-w-0 truncate text-gray-900">{i.name}</span>
                  <StorageClassChip code={i.storage_class} />
                </label>
              ))}
            </div>
          </div>

          {/* result */}
          <div className="space-y-4">
            {chosen.length < 2 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-500">เลือกสารเคมีอย่างน้อย 2 รายการเพื่อตรวจสอบการเก็บร่วมกัน</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'ต้องแยกบริเวณ', n: summary.no, tone: 'no' as const, icon: <XCircle size={18} /> },
                    { label: 'เก็บคละได้โดยมีเงื่อนไข', n: summary.cond, tone: 'cond' as const, icon: <AlertTriangle size={18} /> },
                    { label: 'เก็บร่วมกันได้', n: summary.ok, tone: 'ok' as const, icon: <CheckCircle2 size={18} /> },
                  ].map(k => (
                    <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${CELL_STYLE[k.tone].bg}` }}>
                      <div className="flex items-center justify-between text-xs text-gray-500"><span>{k.label}</span><span style={{ color: CELL_STYLE[k.tone].bg }}>{k.icon}</span></div>
                      <div className="text-2xl font-bold mt-1" style={{ color: k.tone === 'cond' ? '#b45309' : CELL_STYLE[k.tone].bg }}>{k.n} <span className="text-sm font-normal text-gray-500">คู่</span></div>
                    </div>
                  ))}
                </div>
                {summary.no > 0 && (
                  <p className="text-sm rounded-xl px-4 py-3 font-semibold" style={{ background: '#fee2e2', color: '#991b1b' }}>
                    มี {summary.no} คู่ที่ต้องจัดเก็บแยกบริเวณ — {SEPARATION_RULES.separate}
                  </p>
                )}
                {unclassified.length > 0 && (
                  <p className="text-xs rounded-xl px-4 py-2" style={{ background: '#fef3c7', color: '#92400e' }}>
                    <Info size={12} className="inline mr-1" />ยังไม่ได้ระบุประเภทการจัดเก็บ {unclassified.length} รายการ จึงไม่ถูกนำมาตรวจ: {unclassified.map(u => u.name).join(', ')}
                  </p>
                )}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">สาร A</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">สาร B</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">ผล</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">เงื่อนไข / วิธีจัดเก็บ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map(p => {
                        const d = describeCompat(p.cell);
                        const st = CELL_STYLE[d.tone];
                        return (
                          <tr key={p.a.id + p.b.id} className="border-b border-gray-100 align-top">
                            <td className="px-3 py-2"><div className="font-semibold text-gray-900">{p.a.name}</div><StorageClassChip code={p.a.storage_class} /></td>
                            <td className="px-3 py-2"><div className="font-semibold text-gray-900">{p.b.name}</div><StorageClassChip code={p.b.storage_class} /></td>
                            <td className="px-3 py-2"><span className="px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap" style={{ background: st.bg, color: st.fg }}>{d.label}</span></td>
                            <td className="px-3 py-2 text-xs text-gray-700 leading-relaxed">{d.detail}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {usedConditions.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-2">เงื่อนไขที่เกี่ยวข้อง</h3>
                    <ol className="space-y-1.5 text-xs text-gray-700">{usedConditions.map(n => <li key={n}><b className="text-amber-700">ข้อ {n}</b> — {STORAGE_CONDITIONS[n]}</li>)}</ol>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-4 text-xs mb-3">
              <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.ok.bg }} /> เก็บคละกันได้</span>
              <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.cond.bg }} /> ตัวเลข = เก็บคละได้โดยมีเงื่อนไข (คลิกช่องเพื่อดู)</span>
              <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded" style={{ background: CELL_STYLE.no.bg }} /> ต้องจัดเก็บแยกบริเวณ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-[11px]" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white px-2 py-1 text-left text-gray-600 font-semibold border border-gray-200" style={{ minWidth: 200 }}>ประเภทการจัดเก็บ</th>
                    {STORAGE_CLASS_ORDER.map(c => <th key={c} className="px-1 py-1 border border-gray-200 bg-gray-50 font-bold text-gray-700" style={{ width: 30 }}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {STORAGE_CLASS_ORDER.map(r => (
                    <tr key={r}>
                      <th className="sticky left-0 bg-white px-2 py-1 text-left font-normal border border-gray-200 whitespace-nowrap">
                        <b className="mr-1">{r}</b><span className="text-gray-600">{storageClassDef(r)?.nameTh}</span>
                      </th>
                      {STORAGE_CLASS_ORDER.map(c => {
                        const cell = compat(r, c);
                        const st = CELL_STYLE[toneOf(cell)];
                        const isActive = active && ((active.a === r && active.b === c) || (active.a === c && active.b === r));
                        return (
                          <td key={c} onMouseEnter={() => setHover({ a: r, b: c })} onMouseLeave={() => setHover(null)}
                            onClick={() => setPinned(pinned && pinned.a === r && pinned.b === c ? null : { a: r, b: c })}
                            className="border border-gray-200 text-center font-bold cursor-pointer"
                            style={{ background: st.bg, color: st.fg, height: 26, outline: isActive ? '2px solid #111' : undefined, outlineOffset: -2 }}>
                            {cell === '+' ? '' : cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-h-[88px]">
            {active && activeCell !== null ? (() => {
              const d = describeCompat(activeCell);
              return (
                <div className="text-sm">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <StorageClassChip code={active.a} showName /> <span className="text-gray-400">×</span> <StorageClassChip code={active.b} showName />
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: CELL_STYLE[d.tone].bg, color: CELL_STYLE[d.tone].fg }}>{d.label}</span>
                    {pinned && <button onClick={() => setPinned(null)} className="text-xs text-gray-500 ml-auto">ยกเลิกปักหมุด</button>}
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{d.detail}</p>
                </div>
              );
            })() : <p className="text-xs text-gray-500">ชี้หรือคลิกช่องในตารางเพื่อดูเงื่อนไข</p>}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">วิธีการจัดเก็บ</h3>
            <p className="text-xs text-gray-700">{SEPARATION_RULES.separate}</p>
            <p className="text-xs text-gray-700">{SEPARATION_RULES.segregate}</p>
            <p className="text-xs text-gray-700">{SEPARATION_RULES.smallQty}</p>
            <h3 className="text-sm font-bold text-gray-800 pt-2">เงื่อนไขทั้ง 18 ข้อ</h3>
            <ol className="space-y-1.5 text-xs text-gray-700">{Object.entries(STORAGE_CONDITIONS).map(([n, t]) => <li key={n}><b className="text-amber-700">ข้อ {n}</b> — {t}</li>)}</ol>
            <h3 className="text-sm font-bold text-gray-800 pt-2">ประเภทการจัดเก็บ 23 รหัส</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-gray-700">{STORAGE_CLASSES.map(c => <li key={c.code}><StorageClassChip code={c.code} /> <span className="ml-1">{c.nameTh}</span> <span className="text-gray-400">— {c.hint}</span></li>)}</ul>
            <p className="text-[11px] text-gray-400 pt-2">สี: เขียว {VIZ.positive} / เหลือง / แดง {VIZ.accent} ตามตารางต้นฉบับหน้า 24 ของคู่มือ กรอ.</p>
          </div>
        </div>
      )}
    </div>
  );
}

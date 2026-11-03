'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { DEFAULT_GATE_CHECK, VISITOR_PURPOSES } from '@/lib/visitor/constants';
import type { GateCheckAreaMode, GateCheckConfig, GateCheckRow } from '@/lib/visitor/types';
import { VIZ, inputClass } from './ui';

const AREA_MODE_LABEL: Record<GateCheckAreaMode, string> = {
  any: 'ทุกกรณี',
  with_area: 'เฉพาะเมื่อระบุพื้นที่ทำงาน',
  without_area: 'เฉพาะเมื่อไม่ระบุพื้นที่ทำงาน',
  areas: 'เฉพาะพื้นที่ที่เลือก',
};
const MAX_ITEMS = 12;
const MAX_ROWS = 30;
const newKey = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = (c: GateCheckConfig): GateCheckConfig => JSON.parse(JSON.stringify(c)) as GateCheckConfig;

type Props = {
  /** Stored value: null = company uses the built-in default. */
  value: GateCheckConfig | null;
  areas: string[];
  busy: boolean;
  onSave: (cfg: GateCheckConfig | null) => Promise<void> | void;
};

/** Editor for the per-company "ตรวจที่ทางเข้า โดย รปภ." matrix (columns = checks, rows = visitor types with a match rule). */
export function GateCheckEditor({ value, areas, busy, onSave }: Props) {
  const [cfg, setCfg] = useState<GateCheckConfig>(() => clone(value || DEFAULT_GATE_CHECK));
  const [dirty, setDirty] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  // Reset the draft when the stored value changes (company switch / after save) — state-from-props without an effect.
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setCfg(clone(value || DEFAULT_GATE_CHECK)); setDirty(false); }

  const update = (f: (c: GateCheckConfig) => void) => { setCfg(prev => { const c = clone(prev); f(c); return c; }); setDirty(true); };
  const setRow = (key: string, f: (r: GateCheckRow) => void) => update(c => { const r = c.rows.find(x => x.key === key); if (r) f(r); });
  const move = (i: number, d: -1 | 1) => update(c => { const j = i + d; if (j < 0 || j >= c.rows.length) return; [c.rows[i], c.rows[j]] = [c.rows[j], c.rows[i]]; });

  const isDefault = value === null;
  const hidden = cfg.rows.length === 0;
  const small = 'rounded-md px-2 py-1 text-xs border border-gray-300 bg-white inline-flex items-center gap-1 disabled:opacity-40';

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        {isDefault ? <>บริษัทนี้ใช้ <strong>ตารางค่าเริ่มต้น (AMT: หมวก / เสื้อสะท้อนแสง / รองเท้า)</strong> — แก้ด้านล่างแล้วบันทึกเพื่อใช้ตารางของตัวเอง</> : <>บริษัทนี้ใช้ตารางของตัวเอง</>}
        <span className="block text-xs text-gray-500 mt-0.5">คอลัมน์ = สิ่งที่ รปภ. ต้องตรวจ (PPE, บัตรประชาชน, แลกบัตร ฯลฯ) · แถว = ประเภทผู้มาติดต่อ · ระบบใช้ <strong>แถวแรกจากบน</strong> ที่เงื่อนไขตรงกับคำขอ</span>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหัวข้อที่แสดงบนฟอร์ม</label>
        <input className={inputClass} value={cfg.title} maxLength={120} onChange={e => update(c => { c.title = e.target.value; })} />
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 mb-1">รายการที่ต้องตรวจ (คอลัมน์)</div>
        <div className="flex flex-wrap gap-2">
          {cfg.items.map((it, k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white pl-2 pr-1 py-1">
              <input value={it} maxLength={40} onChange={e => update(c => { c.items[k] = e.target.value; })} className="text-sm w-36 outline-none bg-transparent text-gray-900" aria-label={`รายการตรวจ ${k + 1}`} />
              <button type="button" onClick={() => update(c => { c.items.splice(k, 1); c.rows.forEach(r => r.checks.splice(k, 1)); })} className="p-1 rounded hover:bg-gray-100" aria-label="ลบรายการ"><X size={14} style={{ color: VIZ.accent }} /></button>
            </span>
          ))}
          {cfg.items.length < MAX_ITEMS && <button type="button" onClick={() => update(c => { c.items.push(''); c.rows.forEach(r => r.checks.push(false)); })} className={small}><Plus size={14} />เพิ่มรายการตรวจ</button>}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 mb-1">ประเภทผู้มาติดต่อ (แถว)</div>
        {hidden && <p className="text-sm rounded-lg px-3 py-2 mb-2" style={{ background: `${VIZ.secondary}1A`, color: '#8a4b00' }}>ไม่มีแถว — ฟอร์มและจอ รปภ. จะไม่แสดงตารางนี้</p>}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead><tr className="text-gray-600 text-left" style={{ background: VIZ.bg }}>
              <th className="px-2 py-2 w-8"></th>
              <th className="px-2 py-2 min-w-56">ประเภท / เงื่อนไข</th>
              {cfg.items.map((it, k) => <th key={k} className="px-2 py-2 text-center font-medium whitespace-nowrap">{it || <span className="text-gray-400">(ว่าง)</span>}</th>)}
              <th className="px-2 py-2 w-28"></th>
            </tr></thead>
            <tbody>
              {cfg.rows.map((r, i) => {
                const open = openRow === r.key;
                const ruleText = `${r.purposes.length ? `${r.purposes.length} วัตถุประสงค์` : 'ทุกวัตถุประสงค์'} · ${AREA_MODE_LABEL[r.areaMode]}${r.areaMode === 'areas' && r.areas.length ? ` (${r.areas.length})` : ''}`;
                return (
                  <tr key={r.key} className="border-t border-gray-100 align-top">
                    <td className="px-2 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-2 py-2">
                      <input className={`${inputClass} !py-1.5`} value={r.label} maxLength={80} placeholder="ชื่อประเภท (ไทย)" onChange={e => setRow(r.key, x => { x.label = e.target.value; })} />
                      <input className={`${inputClass} !py-1 mt-1 text-xs`} value={r.en} maxLength={80} placeholder="English (optional)" onChange={e => setRow(r.key, x => { x.en = e.target.value; })} />
                      <button type="button" onClick={() => setOpenRow(open ? null : r.key)} className="mt-1 text-xs underline" style={{ color: VIZ.primary }}>{open ? 'ซ่อนเงื่อนไข' : `เงื่อนไข: ${ruleText}`}</button>
                      {open && (
                        <div className="mt-2 rounded-lg border border-gray-200 p-2 space-y-2 bg-gray-50">
                          <div>
                            <div className="text-xs text-gray-600 mb-1">ใช้กับวัตถุประสงค์ (ไม่เลือก = ทุกวัตถุประสงค์)</div>
                            <div className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                              {VISITOR_PURPOSES.map(p => (
                                <label key={p} className="inline-flex items-start gap-1.5 text-xs text-gray-700"><input type="checkbox" className="mt-0.5" checked={r.purposes.includes(p)} onChange={e => setRow(r.key, x => { x.purposes = e.target.checked ? [...x.purposes, p] : x.purposes.filter(q => q !== p); })} />{p}</label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-600 mb-1">เงื่อนไขพื้นที่ทำงาน</div>
                            <select className={`${inputClass} !py-1.5 !w-auto text-sm`} value={r.areaMode} onChange={e => setRow(r.key, x => { x.areaMode = e.target.value as GateCheckAreaMode; })}>
                              {(Object.keys(AREA_MODE_LABEL) as GateCheckAreaMode[]).map(m => <option key={m} value={m}>{AREA_MODE_LABEL[m]}</option>)}
                            </select>
                            {r.areaMode === 'areas' && (
                              <div className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
                                {areas.length === 0 && <span className="text-xs text-gray-400">ยังไม่มีรายการพื้นที่ของบริษัทนี้ — ตั้งค่าในหัวข้อ “พื้นที่ปฏิบัติงาน” ก่อน</span>}
                                {areas.map(a => (
                                  <label key={a} className="inline-flex items-start gap-1.5 text-xs text-gray-700"><input type="checkbox" className="mt-0.5" checked={r.areas.includes(a)} onChange={e => setRow(r.key, x => { x.areas = e.target.checked ? [...x.areas, a] : x.areas.filter(q => q !== a); })} />{a}</label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    {cfg.items.map((_, k) => (
                      <td key={k} className="px-2 py-2 text-center">
                        <button type="button" onClick={() => setRow(r.key, x => { x.checks[k] = !x.checks[k]; })} className="w-9 h-9 rounded-lg border inline-flex items-center justify-center" style={r.checks[k] ? { borderColor: VIZ.positive, background: `${VIZ.positive}1A` } : { borderColor: '#E5E7EB' }} aria-label={r.checks[k] ? 'ต้องมี' : 'ไม่ต้อง'}>
                          {r.checks[k] ? <Check size={18} style={{ color: VIZ.positive }} /> : <X size={18} style={{ color: VIZ.accent }} />}
                        </button>
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <div className="flex gap-1 justify-end">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={small} aria-label="เลื่อนขึ้น"><ArrowUp size={14} /></button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === cfg.rows.length - 1} className={small} aria-label="เลื่อนลง"><ArrowDown size={14} /></button>
                        <button type="button" onClick={() => update(c => { c.rows.splice(i, 1); })} className={small} aria-label="ลบแถว"><Trash2 size={14} style={{ color: VIZ.accent }} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cfg.rows.length < MAX_ROWS && <button type="button" onClick={() => update(c => { c.rows.push({ key: newKey(), label: '', en: '', purposes: [], areaMode: 'any', areas: [], checks: c.items.map(() => false) }); })} className={`${small} mt-2`}><Plus size={14} />เพิ่มประเภทผู้มาติดต่อ</button>}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" disabled={busy || !dirty} onClick={() => void onSave(cfg)} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50" style={{ background: VIZ.primary }}><Save size={16} />บันทึกตาราง</button>
        <button type="button" disabled={busy || isDefault} onClick={() => void onSave(null)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm border border-gray-300 bg-white disabled:opacity-50"><RotateCcw size={16} />กลับไปใช้ค่าเริ่มต้น</button>
        <button type="button" disabled={busy || hidden} onClick={() => update(c => { c.rows = []; })} className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm border border-gray-300 bg-white disabled:opacity-50"><Trash2 size={16} />ลบทุกแถว (ไม่แสดงตาราง)</button>
        {dirty && <span className="text-xs" style={{ color: VIZ.secondary }}>ยังไม่ได้บันทึก</span>}
      </div>
    </div>
  );
}

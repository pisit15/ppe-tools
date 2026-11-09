'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ChemicalComponent, ChemicalProductType } from '@/lib/types';
import type { RegisterLegalPart } from '@/lib/chemical/legal/product';
import { hasVerifiedLegalMatch } from '@/lib/chemical/legal/engine';
import { CATEGORY_LABELS, LEGAL_CATEGORIES, type LegalCategory, type LegalCheck } from '@/lib/chemical/legal/types';
import { SdsLink } from '../components/SdsLink';
import { inputCls } from '../components/ui';

export type RegisterRow = {
  product_type: ChemicalProductType; components: ChemicalComponent[]; component_count: number; checked_cas_count: number; incomplete: boolean;
  id: string; company_id: string; name: string; cas_no: string | null; has_sds: boolean; valid_cas: string | null; counts: LegalCheck['counts'] | null;
  parts?: RegisterLegalPart[];
};
type Hit = 'verified' | 'pending' | null;
/** A category "applies" when the current catalog lists the CAS: verified entry, or an entry still under review. */
export function categoryHit(counts: LegalCheck['counts'] | null | undefined, c: LegalCategory): Hit {
  if (!counts) return null;
  return counts[c]?.verified > 0 ? 'verified' : counts[c]?.pending > 0 ? 'pending' : null;
}
export function rowMatchesCategories(row: Pick<RegisterRow, 'counts'>, selected: LegalCategory[], mode: 'all' | 'any'): boolean {
  if (!selected.length) return true;
  const test = (c: LegalCategory) => categoryHit(row.counts, c) !== null;
  return mode === 'all' ? selected.every(test) : selected.some(test);
}

function CategoryCell({ counts, c, checkable }: { counts: LegalCheck['counts'] | null; c: LegalCategory; checkable: boolean }) {
  if (!checkable) return <span className="text-gray-500">ยังไม่มี CAS ที่ค้นหาได้</span>;
  const hit = categoryHit(counts, c);
  if (hit === 'verified') return <span className="text-purple-800">พบ {counts![c].verified} รายการ<br /><small>มีเงื่อนไขตามกฎหมาย</small></span>;
  if (hit === 'pending') return <span className="text-amber-900">ข้อมูลต้องตรวจเพิ่ม {counts![c].pending}</span>;
  return <span className="text-gray-600">{c === 'health' ? 'ตามกลุ่มสาร/งานที่สัมผัส' : 'ไม่พบในชุดข้อมูลนี้'}</span>;
}
function PartCell({ part, c, active }: { part: RegisterLegalPart; c: LegalCategory; active: boolean }) {
  if (!part.cas) return <span className="text-gray-400 text-xs">— ไม่มี CAS</span>;
  const hit = categoryHit(part.counts, c);
  if (hit === 'verified') return <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${active ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-900'}`}>✓ เข้าข่าย · {part.counts![c].verified}</span>;
  if (hit === 'pending') return <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-900">… ตรวจเพิ่ม · {part.counts![c].pending}</span>;
  return <span className="text-gray-400 text-xs">— ไม่พบ</span>;
}

export default function RegisterTable({ rows, isAll }: { rows: RegisterRow[]; isAll: boolean }) {
  const [search, setSearch] = useState('');
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [selected, setSelected] = useState<LegalCategory[]>([]);
  const [mode, setMode] = useState<'all' | 'any'>('all');
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const searched = useMemo(() => rows.filter(r => [r.name, r.cas_no || '', r.company_id, ...(r.components || []).flatMap(c => [c.name, c.cas_no || ''])].join(' ').toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const perCategory = useMemo(() => Object.fromEntries(LEGAL_CATEGORIES.map(c => [c, searched.filter(r => categoryHit(r.counts, c) !== null).length])) as Record<LegalCategory, number>, [searched]);
  const visible = searched.filter(r => (!onlyMatched || hasVerifiedLegalMatch(r.counts)) && rowMatchesCategories(r, selected, mode));
  const toggle = (c: LegalCategory) => setSelected(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c]);
  const columns: LegalCategory[] = selected.length && !showAllColumns ? LEGAL_CATEGORIES.filter(c => selected.includes(c)) : [...LEGAL_CATEGORIES];
  const componentParts = (row: RegisterRow) => (row.parts || []).filter(p => p.kind === 'component');
  const partHighlighted = (part: RegisterLegalPart) => selected.length > 0 && selected.some(c => categoryHit(part.counts, c) !== null);
  const isOpen = (id: string) => open[id] ?? defaultOpen;
  const toggleRow = (id: string) => setOpen(o => ({ ...o, [id]: !isOpen(id) }));
  const setAll = (value: boolean) => { setDefaultOpen(value); setOpen({}); };

  return <section className="legal-card">
    <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
      <h2 className="font-bold">ตรวจจากทะเบียนบริษัท</h2>
      <input aria-label="กรองทะเบียนเพื่อตรวจกฎหมาย" placeholder="ชื่อสาร / CAS / องค์ประกอบ / บริษัท" className={`${inputCls} sm:max-w-sm`} value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-700 mr-1">แสดงเฉพาะที่เข้าข่าย:</span>
        {LEGAL_CATEGORIES.map(c => <button key={c} type="button" aria-pressed={selected.includes(c)} onClick={() => toggle(c)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm min-h-9 ${selected.includes(c) ? 'bg-purple-700 border-purple-700 text-white' : 'bg-white border-gray-300 text-gray-800 hover:border-purple-400'}`}>
          {CATEGORY_LABELS[c]}<span className={`text-xs rounded-full px-1.5 py-0.5 ${selected.includes(c) ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{perCategory[c]}</span>
        </button>)}
        {selected.length > 0 && <button type="button" className="text-sm text-purple-700 underline ml-1 min-h-9" onClick={() => setSelected([])}>ล้างตัวกรอง</button>}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-sm">
        {selected.length > 1 && <div role="radiogroup" aria-label="เงื่อนไขการจับคู่หมวด" className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {([['all', 'ครบทุกหมวดที่เลือก'], ['any', 'หมวดใดหมวดหนึ่ง']] as const).map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={mode === key} onClick={() => setMode(key)} className={`px-3 py-1.5 ${mode === key ? 'bg-purple-700 text-white' : 'bg-white text-gray-700'}`}>{label}</button>)}
        </div>}
        <label className="flex items-center gap-2 min-h-9"><input type="checkbox" checked={onlyMatched} onChange={e => setOnlyMatched(e.target.checked)} className="h-4 w-4 accent-purple-700" />เฉพาะรายการที่พบเงื่อนไขตามกฎหมาย (ยืนยันแล้ว)</label>
        <span className="inline-flex items-center gap-1 text-gray-700">องค์ประกอบย่อย:<button type="button" className="text-purple-700 underline min-h-9 px-1" onClick={() => setAll(true)}>เปิดทั้งหมด</button>·<button type="button" className="text-purple-700 underline min-h-9 px-1" onClick={() => setAll(false)}>ปิดทั้งหมด</button></span>
        {selected.length > 0 && <label className="flex items-center gap-2 min-h-9"><input type="checkbox" checked={showAllColumns} onChange={e => setShowAllColumns(e.target.checked)} className="h-4 w-4 accent-purple-700" />แสดงทุกหมวด (ไม่ซ่อนคอลัมน์อื่น)</label>}
        <p role="status" className="text-gray-600 ml-auto">แสดง {visible.length} จาก {rows.length} รายการ</p>
      </div>
      <p className="text-xs text-gray-600 mt-2">นับว่า “เข้าข่าย” เมื่อ CAS ของสารหรือองค์ประกอบใดองค์ประกอบหนึ่งอยู่ในบัญชีของหมวดนั้น (รวมรายการที่ยังต้องตรวจเพิ่ม) · ต้องเทียบความเข้มข้นและเงื่อนไขในกฎหมายก่อนสรุปว่าผลิตภัณฑ์เข้าข่าย</p>
    </div>
    {visible.length === 0 ? <p className="text-gray-600">{rows.length ? 'ไม่พบรายการตรงกับตัวกรอง' : 'ยังไม่มีสารในทะเบียนใช้งานจริง สามารถค้นหาสารอื่นได้ทันที'}</p> : <div className="overflow-x-auto"><table className="legal-table min-w-[950px]"><caption className="sr-only">รายการกฎหมายของสารในทะเบียน</caption>
      <thead><tr><th>สารเคมี / CAS</th>{columns.map(c => <th key={c} className={selected.includes(c) ? 'text-purple-800' : ''}>{CATEGORY_LABELS[c]}</th>)}<th>รายละเอียด</th></tr></thead>
      <tbody>{visible.map(row => {
        const all = componentParts(row);
        const hits = selected.length ? all.filter(partHighlighted) : all;
        const hidden = all.length - hits.length;
        const opened = all.length > 0 && isOpen(row.id);
        return [
          <tr key={row.id} className={opened ? 'legal-row-parent' : ''}>
            <td><strong>{row.name}</strong><p className="text-gray-600 mt-1">{row.cas_no || (row.product_type === 'mixture' ? 'ดู CAS แยกตามองค์ประกอบ' : 'ยังไม่มี CAS')}{isAll ? ` · ${row.company_id.toUpperCase()}` : ''}</p>
              {(row.product_type === 'mixture' || row.component_count > 0) && <p className="text-xs text-purple-800 mt-1">{row.product_type === 'mixture' ? 'สารผสม · ' : ''}ค้นหาได้ {row.checked_cas_count} CAS · ผลรวมด้านขวานับทุกองค์ประกอบ</p>}
              {all.length > 0 && <button type="button" aria-expanded={opened} onClick={() => toggleRow(row.id)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-purple-800 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 hover:bg-purple-100 min-h-8">{opened ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{row.component_count} องค์ประกอบ{selected.length ? ` · เข้าข่าย ${hits.length}` : ''}</button>}
              {row.incomplete && <p className="text-xs text-amber-800 mt-1">ข้อมูลองค์ประกอบ / CAS ยังไม่ครบ</p>}{row.has_sds && <SdsLink id={row.id} name={row.name} compact />}</td>
            {columns.map(c => <td key={c} className={selected.includes(c) ? 'bg-purple-50/60' : ''}><CategoryCell counts={row.counts} c={c} checkable={row.checked_cas_count > 0} /></td>)}
            <td><Link className="legal-btn whitespace-nowrap" href={`/chemical/legal?company_id=${encodeURIComponent(row.company_id)}&substance_id=${row.id}`}>ดูข้อกฎหมาย</Link></td>
          </tr>,
          ...(opened ? hits.map(part => <tr key={`${row.id}:${part.key}`} className={`legal-row-part ${partHighlighted(part) ? 'legal-row-part-hit' : ''}`}>
            <td className="pl-8"><span className="text-gray-400 mr-1" aria-hidden>↳</span><span className="text-sm text-gray-900">{part.name}</span><span className="block text-xs text-gray-600 mt-0.5 pl-5">{part.cas ? `CAS ${part.cas}` : part.missingReason}{part.concentration ? ` · ${part.concentration}` : ''}</span></td>
            {columns.map(c => <td key={c} className={selected.includes(c) ? 'bg-purple-50/60' : ''}><PartCell part={part} c={c} active={selected.includes(c)} /></td>)}
            <td />
          </tr>) : []),
          ...(opened && hidden > 0 ? [<tr key={`${row.id}:hidden`} className="legal-row-part"><td colSpan={columns.length + 2} className="pl-8 text-xs text-gray-500">ซ่อน {hidden} องค์ประกอบที่ไม่เข้าข่ายหมวดที่เลือก — <button type="button" className="underline text-purple-700" onClick={() => setSelected([])}>ล้างตัวกรอง</button>เพื่อดูทั้งหมด</td></tr>] : []),
        ];
      })}</tbody></table></div>}
  </section>;
}

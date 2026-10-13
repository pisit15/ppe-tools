'use client';
import { Plus, Trash2 } from 'lucide-react';
import type { ChemicalComponent, ChemicalProductType } from '@/lib/types';
import { CAS_STATUSES, CONCENTRATION_BASES, MAX_COMPONENTS, PRODUCT_TYPES, emptyComponent } from '@/lib/chemical/components';
import { normalizeCas } from '@/lib/chemical/legal/engine';
import { inputCls, labelCls } from './ui';

export default function CompositionEditor({ productType, components, onTypeChange, onChange }: {
  productType: ChemicalProductType; components: ChemicalComponent[];
  onTypeChange: (value: ChemicalProductType) => void; onChange: (value: ChemicalComponent[]) => void;
}) {
  const update = (index: number, change: Partial<ChemicalComponent>) => onChange(components.map((c, i) => i === index ? { ...c, ...change } : c));
  return <div className="space-y-4">
    <div><label htmlFor="chemical-product-type" className={labelCls}>ประเภทผลิตภัณฑ์ตาม SDS</label>
      <select id="chemical-product-type" className={inputCls} value={productType} onChange={e => onTypeChange(e.target.value as ChemicalProductType)}>
        {Object.entries(PRODUCT_TYPES).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </div>
    <p className="text-sm text-gray-600">บันทึกทุกองค์ประกอบที่ SDS ข้อ 3 เปิดเผย แยก CAS และความเข้มข้นต่อสาร ไม่ต้องเติมสูตรให้ครบ 100% และไม่เลือก CAS ของสารหลักแทนผลิตภัณฑ์</p>
    {components.map((c, i) => <fieldset key={i} className="border border-purple-200 rounded-xl p-3 min-w-0" aria-label={`องค์ประกอบ ${i + 1}`}>
      <legend className="px-1 font-semibold text-sm">องค์ประกอบ {i + 1}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label htmlFor={`component-${i}-name`} className={labelCls}>ชื่อองค์ประกอบ {i + 1}</label><input id={`component-${i}-name`} className={inputCls} maxLength={300} value={c.name} onChange={e => update(i,{name:e.target.value})} /></div>
        <div><label htmlFor={`component-${i}-status`} className={labelCls}>สถานะ CAS องค์ประกอบ {i + 1}</label><select id={`component-${i}-status`} className={inputCls} value={c.cas_status} onChange={e => update(i,{cas_status:e.target.value as ChemicalComponent['cas_status'],cas_no:e.target.value === 'specified' ? c.cas_no : null})}>{Object.entries(CAS_STATUSES).map(([v,t]) => <option value={v} key={v}>{t}</option>)}</select></div>
        <div><label htmlFor={`component-${i}-cas`} className={labelCls}>CAS องค์ประกอบ {i + 1}</label><input id={`component-${i}-cas`} className={inputCls} maxLength={40} disabled={c.cas_status !== 'specified'} value={c.cas_no || ''} placeholder="เช่น 67-64-1" onChange={e => update(i,{cas_no:e.target.value || null})} aria-invalid={!!c.cas_no && !normalizeCas(c.cas_no)} />{!!c.cas_no && !normalizeCas(c.cas_no) && <p className="text-sm text-red-700 mt-1">รูปแบบหรือเลขตรวจสอบ CAS ไม่ถูกต้อง</p>}</div>
        <div><label htmlFor={`component-${i}-concentration`} className={labelCls}>ความเข้มข้นองค์ประกอบ {i + 1}</label><input id={`component-${i}-concentration`} className={inputCls} maxLength={120} value={c.concentration_text || ''} placeholder="เช่น 5–15%, &lt;1% หรือ ไม่เปิดเผย" onChange={e => update(i,{concentration_text:e.target.value || null})} /></div>
        <div><label htmlFor={`component-${i}-basis`} className={labelCls}>ฐานความเข้มข้นองค์ประกอบ {i + 1}</label><select id={`component-${i}-basis`} className={inputCls} value={c.concentration_basis} onChange={e => update(i,{concentration_basis:e.target.value as ChemicalComponent['concentration_basis']})}>{Object.entries(CONCENTRATION_BASES).map(([v,t]) => <option value={v} key={v}>{t}</option>)}</select></div>
        <div><label htmlFor={`component-${i}-page`} className={labelCls}>หน้า SDS องค์ประกอบ {i + 1}</label><input id={`component-${i}-page`} className={inputCls} maxLength={40} value={c.source_page || ''} placeholder="เช่น 2" onChange={e => update(i,{source_page:e.target.value || null})} /></div>
        <div className="flex items-end justify-end"><button type="button" className="inline-flex gap-2 items-center min-h-11 px-3 rounded-lg text-red-700 hover:bg-red-50" aria-label={`ลบองค์ประกอบ ${i + 1}`} onClick={() => onChange(components.filter((_,index) => index !== i))}><Trash2 size={16} />ลบแถว</button></div>
      </div>
    </fieldset>)}
    <button type="button" className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border border-purple-300 text-purple-700 disabled:opacity-50" disabled={components.length >= MAX_COMPONENTS} onClick={() => onChange([...components,emptyComponent()])}><Plus size={16} />เพิ่มองค์ประกอบ</button>
    {productType === 'mixture' && !components.length && <p className="text-sm text-amber-800">ยังไม่มีองค์ประกอบสำหรับตรวจข้อกฎหมาย เพิ่มข้อมูลจาก SDS ข้อ 3 หรือสกัดใหม่ด้วย AI</p>}
  </div>;
}

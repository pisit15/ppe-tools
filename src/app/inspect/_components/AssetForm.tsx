'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { InspAssetInput, InspAssetView, InspCategoryRow, InspTemplateRow } from '@/lib/inspect/types';
import { TH_MONTHS_SHORT } from '@/lib/inspect/constants';
import { CategoryIcon } from './icons';
import { VIZ, btnPrimary, btnSecondary, inputClass, labelClass, selectClass } from './ui';

export type AssetFormValue = Omit<InspAssetInput, 'company_id'>;

const thisYear = new Date().getFullYear();

function fromAsset(a: InspAssetView | null, categories: InspCategoryRow[]): AssetFormValue {
  if (a) return { category_id: a.category_id, template_id: a.template_id, code: a.code, name: a.name, department: a.department, building: a.building, floor: a.floor, location: a.location, attributes: { ...a.attributes }, mfg_year: a.mfg_year, mfg_month: a.mfg_month, last_service_on: a.last_service_on, service_interval_months: a.service_interval_months, status: a.status, note: a.note };
  return { category_id: categories[0]?.id || '', template_id: null, code: '', name: '', department: '', building: '', floor: '', location: '', attributes: {}, mfg_year: null, mfg_month: null, last_service_on: null, service_interval_months: null, status: 'active', note: '' };
}

export function AssetForm({ asset, categories, templates, departments, busy, onSubmit, onCancel, submitLabel = 'บันทึก' }: {
  asset: InspAssetView | null; categories: InspCategoryRow[]; templates: InspTemplateRow[]; departments: string[]; busy: boolean;
  onSubmit: (v: AssetFormValue) => void; onCancel: () => void; submitLabel?: string;
}) {
  const [v, setV] = useState<AssetFormValue>(() => fromAsset(asset, categories));
  useEffect(() => { setV(fromAsset(asset, categories)); }, [asset, categories]);
  const category = useMemo(() => categories.find(c => c.id === v.category_id) || null, [categories, v.category_id]);
  const catTemplates = useMemo(() => templates.filter(t => t.category_id === v.category_id && t.is_active), [templates, v.category_id]);
  const set = <K extends keyof AssetFormValue>(k: K, val: AssetFormValue[K]) => setV(prev => ({ ...prev, [k]: val }));
  const setAttr = (k: string, val: string) => setV(prev => ({ ...prev, attributes: { ...(prev.attributes || {}), [k]: val === '' ? null : val } }));

  function submit(e: FormEvent) { e.preventDefault(); onSubmit({ ...v, code: v.code.trim() }); }
  const serviceMonths = v.service_interval_months ?? category?.service_interval_months ?? null;

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <div>
        <span className={labelClass}>หมวดอุปกรณ์ *</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categories.map(c => {
            const active = c.id === v.category_id;
            return (
              <button key={c.id} type="button" onClick={() => setV(prev => ({ ...prev, category_id: c.id, template_id: null, attributes: prev.category_id === c.id ? prev.attributes : {} }))}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${active ? 'border-transparent ring-2' : 'border-gray-200 hover:bg-gray-50'}`}
                style={active ? { background: `${c.color}14`, color: c.color, ['--tw-ring-color' as string]: c.color } : undefined}>
                <CategoryIcon name={c.icon} size={18} color={active ? c.color : VIZ.lightText} /><span className="truncate font-medium">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className={labelClass} htmlFor="af-code">รหัสอุปกรณ์ * <span className="font-normal text-gray-400">(ตามป้ายที่ติด)</span></label><input id="af-code" className={inputClass} value={v.code} onChange={e => set('code', e.target.value)} placeholder="เช่น F1-4G-01" required maxLength={60} /></div>
        <div><label className={labelClass} htmlFor="af-name">ชื่อ / คำอธิบาย</label><input id="af-name" className={inputClass} value={v.name || ''} onChange={e => set('name', e.target.value)} placeholder="เช่น ถังหน้าห้องไฟฟ้า" maxLength={120} /></div>
      </div>

      {catTemplates.length > 1 && (
        <div>
          <label className={labelClass} htmlFor="af-tpl">รายการตรวจที่ใช้</label>
          <select id="af-tpl" className={selectClass} value={v.template_id || ''} onChange={e => set('template_id', e.target.value || null)}>
            <option value="">ค่าเริ่มต้นของหมวด ({catTemplates.find(t => t.is_default)?.name || catTemplates[0].name})</option>
            {catTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {category && category.attributes.length > 0 && (
        <div className="rounded-xl border border-gray-100 p-4" style={{ background: `${category.color}08` }}>
          <p className="text-sm font-medium text-gray-700 mb-3">ข้อมูลเฉพาะ{category.name}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {category.attributes.map(a => (
              <div key={a.key}>
                <label className={labelClass} htmlFor={`af-attr-${a.key}`}>{a.label}{a.unit ? ` (${a.unit})` : ''}</label>
                {a.type === 'select' ? (
                  <select id={`af-attr-${a.key}`} className={selectClass} value={String(v.attributes?.[a.key] ?? '')} onChange={e => setAttr(a.key, e.target.value)}>
                    <option value="">— เลือก —</option>{a.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={`af-attr-${a.key}`} className={inputClass} type={a.type === 'number' ? 'number' : a.type === 'month' ? 'month' : 'text'} value={String(v.attributes?.[a.key] ?? '')} onChange={e => setAttr(a.key, e.target.value)} placeholder={a.hint || ''} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="af-dept">แผนก / พื้นที่รับผิดชอบ</label>
          <input id="af-dept" className={inputClass} list="af-dept-list" value={v.department || ''} onChange={e => set('department', e.target.value)} placeholder="เช่น MMC, Warehouse" maxLength={80} />
          <datalist id="af-dept-list">{departments.map(d => <option key={d} value={d} />)}</datalist>
        </div>
        <div><label className={labelClass} htmlFor="af-loc">ตำแหน่งติดตั้ง</label><input id="af-loc" className={inputClass} value={v.location || ''} onChange={e => set('location', e.target.value)} placeholder="เช่น ทางเดินหน้าห้อง Lab" maxLength={200} /></div>
        <div><label className={labelClass} htmlFor="af-bld">อาคาร</label><input id="af-bld" className={inputClass} value={v.building || ''} onChange={e => set('building', e.target.value)} maxLength={80} /></div>
        <div><label className={labelClass} htmlFor="af-floor">ชั้น</label><input id="af-floor" className={inputClass} value={v.floor || ''} onChange={e => set('floor', e.target.value)} maxLength={40} /></div>
      </div>

      <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/60">
        <p className="text-sm font-medium text-gray-700">อายุอุปกรณ์และรอบทดสอบ</p>
        <p className="text-xs text-gray-500 mb-3">{category?.service_label ? `${category.service_label} ทุก ${category.service_interval_months} เดือน` : 'หมวดนี้ไม่มีรอบทดสอบตามกฎหมาย'}{category?.service_ref ? ` · ${category.service_ref}` : ''}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className={labelClass} htmlFor="af-my">ปีที่ผลิต (ค.ศ.)</label><input id="af-my" type="number" inputMode="numeric" className={inputClass} min={1980} max={thisYear + 1} value={v.mfg_year ?? ''} onChange={e => set('mfg_year', e.target.value ? Number(e.target.value) : null)} placeholder={String(thisYear)} /></div>
          <div><label className={labelClass} htmlFor="af-mm">เดือนที่ผลิต</label><select id="af-mm" className={selectClass} value={v.mfg_month ?? ''} onChange={e => set('mfg_month', e.target.value ? Number(e.target.value) : null)}><option value="">—</option>{TH_MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label className={labelClass} htmlFor="af-ls">ทดสอบล่าสุด</label><input id="af-ls" type="date" className={inputClass} value={v.last_service_on || ''} onChange={e => set('last_service_on', e.target.value || null)} /></div>
          <div><label className={labelClass} htmlFor="af-si">รอบทดสอบ (เดือน)</label><input id="af-si" type="number" inputMode="numeric" className={inputClass} min={1} max={600} value={v.service_interval_months ?? ''} onChange={e => set('service_interval_months', e.target.value ? Number(e.target.value) : null)} placeholder={serviceMonths ? String(serviceMonths) : '—'} /></div>
        </div>
        <p className="text-xs text-gray-400 mt-2">ถ้าไม่เคยทดสอบ ระบบนับรอบถัดไปจากเดือน/ปีที่ผลิต · ปล่อยรอบทดสอบว่างเพื่อใช้ค่าของหมวด</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {asset && (
          <div><label className={labelClass} htmlFor="af-status">สถานะ</label>
            <select id="af-status" className={selectClass} value={v.status || 'active'} onChange={e => set('status', e.target.value as AssetFormValue['status'])}><option value="active">ใช้งาน</option><option value="inactive">พักใช้งานชั่วคราว</option><option value="disposed">ปลดระวาง</option></select></div>
        )}
        <div className={asset ? '' : 'sm:col-span-2'}><label className={labelClass} htmlFor="af-note">หมายเหตุ</label><textarea id="af-note" className={inputClass} rows={2} value={v.note || ''} onChange={e => set('note', e.target.value)} maxLength={1000} /></div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>ยกเลิก</button>
        <button type="submit" className={btnPrimary} style={{ background: VIZ.primary }} disabled={busy || !v.category_id || !v.code.trim()}>{busy ? 'กำลังบันทึก…' : submitLabel}</button>
      </div>
    </form>
  );
}

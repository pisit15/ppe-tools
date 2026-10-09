'use client';
import { LABEL_PRESETS, labelLayout, applyLabelPreset, type LabelOptions } from '@/lib/chemical/label';
import { inputCls, labelCls } from './ui';

export function LabelFormatPicker({ options, onChange }: { options: LabelOptions; onChange: (next: LabelOptions) => void }) {
  const selected = options.layout === 'a4' ? LABEL_PRESETS.find(p => p.width === options.width && p.height === options.height && p.pageOrientation === options.pageOrientation) : undefined;
  const set = <K extends keyof LabelOptions>(key: K, value: LabelOptions[K]) => onChange({ ...options, [key]: value });
  return <div className="space-y-4">
    {(['landscape', 'portrait'] as const).map(orientation => <fieldset key={orientation}>
      <legend className="text-sm font-semibold text-gray-700 mb-2">ฉลาก{orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'}</legend>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {LABEL_PRESETS.filter(p => p.orientation === orientation).map(p => <button key={p.id} type="button" aria-pressed={selected?.id === p.id} aria-label={`ฉลาก${orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'} ${p.count} ดวงต่อ A4`} onClick={() => onChange(applyLabelPreset(options, p))} className={`rounded-xl border p-2 text-center transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 ${selected?.id === p.id ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-gray-200 hover:border-purple-300 text-gray-700'}`}>
          <div aria-hidden="true" className="mx-auto grid gap-[2px] mb-2 border border-gray-300 bg-white p-1 w-10" style={{ aspectRatio: p.pageOrientation === 'portrait' ? '210/297' : '297/210', gridTemplateColumns: `repeat(${p.columns}, 1fr)`, gridTemplateRows: `repeat(${p.rows}, 1fr)` }}>{Array.from({ length: p.count }, (_, i) => <span key={i} className={selected?.id === p.id ? 'bg-purple-300' : 'bg-slate-300'} />)}</div>
          <div className="font-bold text-sm">{p.count} ดวง / A4</div><div className="text-[10px] mt-1 whitespace-nowrap">{p.width} × {p.height} มม.</div>
        </button>)}
      </div>
    </fieldset>)}
    <p className="text-xs text-gray-600">เลือกแบบแล้วระบบกำหนดขนาดและแนวกระดาษให้เอง · เว้นขอบ 10 มม. ช่องตัด 4 มม.</p>
    <div className="grid grid-cols-2 gap-3">
      <div><label htmlFor="label-copies" className={labelCls}>จำนวนฉลาก (ดวง)</label><input id="label-copies" className={inputCls} type="number" min={1} max={100} value={options.copies || ''} onChange={e => set('copies', Number(e.target.value))} /></div>
      <div><label htmlFor="label-font" className={labelCls}>ขนาดข้อความ</label><select id="label-font" className={inputCls} value={options.fontSize} onChange={e => set('fontSize', Number(e.target.value))}>{[8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n} pt</option>)}</select></div>
    </div>
    <fieldset className="rounded-xl bg-slate-50 p-3">
      <legend className="text-sm font-semibold px-1">รายละเอียดบนฉลาก</legend>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex gap-2 items-center"><input name="label-content" type="radio" value="full" checked={options.content === 'full'} onChange={() => set('content', 'full')} className="accent-purple-700" /> รายละเอียดครบ</label>
        <label className="flex gap-2 items-center"><input name="label-content" type="radio" value="compact" checked={options.content === 'compact'} onChange={() => onChange({ ...options, content: 'compact', fontSize: 8 })} className="accent-purple-700" /> ฉลากย่อสำหรับภาชนะเล็ก</label>
      </div>
      {options.content === 'compact' && <p className="text-xs text-gray-600 mt-2">พิมพ์ชื่อ GHS คำสัญญาณ ข้อความอันตราย ปริมาณ เบอร์ฉุกเฉิน รูป PPE ที่เลือก และ QR SDS · ไม่พิมพ์ข้อควรระวัง P ผู้จำหน่าย และข้อมูลเพิ่มเติม</p>}
    </fieldset>
    <details className="text-sm" open={selected ? undefined : true}>
      <summary className="cursor-pointer text-purple-700 font-semibold">กำหนดขนาดเอง / รูปแบบไฟล์</summary>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div><label htmlFor="label-width" className={labelCls}>ความกว้าง (มม.)</label><input id="label-width" className={inputCls} type="number" step="0.1" min={50} max={277} value={options.width || ''} onChange={e => set('width', Number(e.target.value))} /></div>
        <div><label htmlFor="label-height" className={labelCls}>ความสูง (มม.)</label><input id="label-height" className={inputCls} type="number" step="0.1" min={50} max={277} value={options.height || ''} onChange={e => set('height', Number(e.target.value))} /></div>
      </div>
      <div className="mt-3"><label htmlFor="label-layout" className={labelCls}>รูปแบบไฟล์ PDF</label><select id="label-layout" className={inputCls} value={options.layout} onChange={e => set('layout', e.target.value as LabelOptions['layout'])}><option value="a4">A4 — จัดหลายดวงต่อหน้า สำหรับตัดติด</option><option value="single">หนึ่งดวงต่อหน้า — หน้ากระดาษเท่าขนาดฉลาก</option></select></div>
      {options.layout === 'a4' && <div className="mt-3"><label htmlFor="label-page-orientation" className={labelCls}>แนวกระดาษ A4</label><select id="label-page-orientation" className={inputCls} value={options.pageOrientation} onChange={e => set('pageOrientation', e.target.value as LabelOptions['pageOrientation'])}><option value="portrait">กระดาษแนวตั้ง</option><option value="landscape">กระดาษแนวนอน</option></select></div>}
    </details>
  </div>;
}

export function LabelSheetPreview({ options }: { options: LabelOptions }) {
  let grid: ReturnType<typeof labelLayout>;
  try { grid = labelLayout(options); } catch { return null; }
  if (options.layout !== 'a4') return null;
  return <div className="flex items-center gap-4 text-xs text-gray-600">
    <div role="img" aria-label={`ผัง A4 ${grid.columns} คอลัมน์ ${grid.rows} แถว รวม ${grid.perPage} ดวง`} className="grid gap-1 border border-gray-300 bg-white shadow-sm w-24 shrink-0 p-1.5" style={{ aspectRatio: `${grid.pageWidth}/${grid.pageHeight}`, gridTemplateColumns: `repeat(${grid.columns},1fr)`, gridTemplateRows: `repeat(${grid.rows},1fr)` }}>
      {Array.from({ length: grid.perPage }, (_, i) => <span key={i} className={`border rounded-[2px] ${i < options.copies ? 'border-purple-300 bg-purple-100' : 'border-gray-200'}`} />)}
    </div>
    <p>ผังจัดวางหน้าแรก<br />A4 {options.pageOrientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'}<br />{grid.columns} คอลัมน์ × {grid.rows} แถว</p>
  </div>;
}

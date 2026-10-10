'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, X } from 'lucide-react';
import { LABEL_PPE, ppeFile, type LabelPpeCode } from '@/lib/chemical/ppe';

export function LabelPpePicker({ value, onChange }: { value: LabelPpeCode[]; onChange: (value: LabelPpeCode[]) => void }) {
  const [expanded, setExpanded] = useState<typeof LABEL_PPE[number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);
  function close() { dialog.current?.close(); setExpanded(null); }
  return <fieldset className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
    <legend className="px-1 font-semibold text-sm text-gray-800">รูปอุปกรณ์ป้องกันส่วนบุคคล (PPE)</legend>
    <p className="text-xs text-gray-600 mb-3">เลือกตาม SDS ของผลิตภัณฑ์ เลือกได้หลายรูปหรือไม่เลือกเลย · บนฉลากมีรูป 10 มม. พร้อมคำกำกับ</p>
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {LABEL_PPE.map(p => <div key={p.code} className={`flex flex-col rounded-xl border text-center ${value.includes(p.code) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
        <label className="flex flex-1 flex-col items-center justify-between gap-2 cursor-pointer px-2 pt-3 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ppeFile(p.code)} alt="" width={52} height={52} className="shrink-0" />
          <span className="text-xs leading-5">{p.name}</span>
          <input type="checkbox" aria-label={`PPE ${p.name}`} checked={value.includes(p.code)} onChange={e => onChange(e.target.checked ? [...value, p.code] : value.filter(code => code !== p.code))} className="accent-blue-700 size-4" />
        </label>
        <button type="button" aria-label={`ดูภาพใหญ่ ${p.name}`} onClick={() => setExpanded(p)} className="flex min-h-9 items-center justify-center gap-1 rounded-b-xl border-t border-blue-50 text-xs text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600"><ZoomIn size={14} /> ขยาย</button>
      </div>)}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-gray-600">{value.length ? `เลือก ${value.length} รูป` : 'ไม่แสดง PPE บนฉลาก'}</span><button type="button" disabled={!value.length} onClick={() => onChange([])} className="text-blue-700 underline disabled:text-gray-400 disabled:no-underline">ล้างการเลือก PPE</button></div>
    <dialog ref={dialog} aria-labelledby="ppe-preview-title" onClose={() => setExpanded(null)} onClick={e => { if (e.target === e.currentTarget) close(); }} className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl p-0 shadow-xl backdrop:bg-slate-950/50">
      {expanded && <div className="p-6 text-center">
        <div className="flex justify-end"><button type="button" aria-label="ปิดภาพ PPE" onClick={close} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600"><X size={20} /></button></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ppeFile(expanded.code)} alt={expanded.name} width={180} height={180} className="mx-auto mb-5" />
        <h2 id="ppe-preview-title" className="font-bold text-lg text-gray-900">{expanded.name}</h2>
        <p className="mt-3 text-sm text-gray-600">เลือกชนิดและวัสดุของอุปกรณ์ให้ตรงกับ SDS ของผลิตภัณฑ์</p>
      </div>}
    </dialog>
  </fieldset>;
}

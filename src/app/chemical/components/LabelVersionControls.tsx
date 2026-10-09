'use client';
import { History, RotateCcw, Save } from 'lucide-react';
import type { useLabelVersions } from '@/lib/chemical/useLabelVersions';
import { inputCls, labelCls } from './ui';

const date = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
export function LabelVersionControls({ state }: { state: ReturnType<typeof useLabelVersions> }) {
  const { selected, versions, pending, dirty } = state;
  return <section aria-labelledby="label-history-heading" className="rounded-2xl border border-purple-200 bg-white p-5 mb-6">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 id="label-history-heading" className="font-bold flex gap-2 items-center"><History size={19} className="text-purple-700" /> ฉลากที่บันทึกไว้</h2>
      <span className={`text-sm rounded-full px-3 py-1 ${dirty || !selected ? 'bg-amber-50 text-amber-900' : 'bg-purple-50 text-purple-800'}`}>
        {dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : selected ? `กำลังใช้ V${selected.version}` : 'แบบเริ่มต้นจากทะเบียน — ยังไม่บันทึก'}
      </span>
    </div>
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="label-version" className={labelCls}>เลือกเวอร์ชันฉลาก</label>
          <select id="label-version" className={inputCls} value={selected?.version || ''} onChange={e => { if (e.target.value) void state.choose(Number(e.target.value)); }}>
            <option value="" disabled>แบบเริ่มต้นจากทะเบียน</option>
            {versions.map(v => <option key={v.id} value={v.version}>V{v.version}{v.title ? ` · ${v.title}` : ''} · {date(v.created_at)} · {v.created_by.displayName}</option>)}
          </select>
          {selected && <p className="text-xs text-gray-600 mt-2">บันทึกโดย {selected.created_by.displayName} · {date(selected.created_at)} น. (เวลาไทย)</p>}
          {state.hasMore && <button type="button" onClick={() => void state.loadMore()} className="text-sm text-purple-700 underline mt-2">โหลดเวอร์ชันก่อนหน้า</button>}
        </div>
        <div><label htmlFor="label-version-title" className={labelCls}>ชื่อแบบฉลาก / หมายเหตุ (ถ้ามี)</label><input id="label-version-title" className={inputCls} maxLength={120} value={state.title} onChange={e => state.setTitle(e.target.value)} placeholder="เช่น ขวด 500 มล. / ใช้ในห้องทดลอง" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!selected && !dirty} onClick={() => void state.save()} className="inline-flex gap-2 items-center rounded-xl bg-purple-700 px-4 py-2.5 font-semibold text-white hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed"><Save size={17} /> บันทึกเป็นเวอร์ชันใหม่</button>
        <button type="button" onClick={() => void state.reset()} className="inline-flex gap-2 items-center rounded-xl border border-gray-300 px-4 py-2.5 text-gray-700 hover:bg-gray-50"><RotateCcw size={17} /> เริ่มใหม่จากข้อมูลทะเบียน</button>
      </div>
    </fieldset>
    <p className="text-xs text-gray-600 mt-3">บันทึกข้อความและรูปแบบฉลากแยกตามสารเคมี ผู้ใช้ในบริษัทเดียวกันเรียกใช้ได้ · เปิดครั้งถัดไปใช้เวอร์ชันล่าสุด · เริ่มใหม่ไม่ลบประวัติ</p>
    {pending && <p role="status" className="text-sm text-purple-700 mt-2">กำลังดำเนินการ…</p>}
    {state.error && <p role="alert" className="text-sm text-red-700 mt-2">{state.error} — ข้อความที่แก้ยังอยู่ในหน้านี้</p>}
    {state.message && <p role="status" className="text-sm text-green-700 mt-2">{state.message}</p>}
  </section>;
}

'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import LegalSourceLinks from './LegalSourceLinks';
import { sourceReferenceUrl } from '@/lib/chemical/legal/library-sources';
import { CATEGORY_LABELS, LEGAL_CATEGORIES, type LegalCheck, type LegalEntry, type LegalRelease, type LegalSource } from '@/lib/chemical/legal/types';
import { inputCls } from '../components/ui';

const reviewLabels = { verified: '✓ ยืนยันข้อมูลต้นฉบับ', pending: '… ข้อมูลบางส่วนต้องตรวจเพิ่ม', conflict: '! ตัวตน/CAS ต้องตรวจเพิ่ม' };
const statusLabels = { active: 'มีผลตามเงื่อนไข', repealed: 'ยกเลิกเฉพาะรายการนี้', superseded: 'ข้อความเดิม — ถูกแทนที่' };
function SourceLink({ entry, sources }: { entry: LegalEntry; sources: LegalSource[] }) {
  const source = sources.find(s => s.id === entry.source_id);
  return source ? <LegalSourceLinks source={source} entry={entry} /> : <span className="text-red-800">ไม่พบแหล่งอ้างอิง</span>;
}
export function LegalEntryList({ entries, sources }: { entries: LegalEntry[]; sources: LegalSource[] }) {
  return <div className="space-y-3">{entries.map(entry => <details key={entry.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
    <summary className="cursor-pointer p-4 text-sm"><span className="font-semibold">{entry.name}</span><span className="block ml-4 mt-1 text-gray-600">{CATEGORY_LABELS[entry.category]} · {entry.list_ref} · {entry.revision}</span><span className={`block ml-4 mt-2 ${entry.review_state === 'verified' ? 'text-purple-800' : 'text-amber-900'}`}>{reviewLabels[entry.review_state]} · {statusLabels[entry.legal_status]}</span></summary>
    <div className="px-4 pb-4 pt-1 space-y-3 text-sm border-t border-gray-100">
      <dl className="grid sm:grid-cols-2 gap-3"><div><dt className="text-gray-600">หน่วยงานรับผิดชอบ</dt><dd>{entry.agency}</dd></div><div><dt className="text-gray-600">ชนิดวัตถุอันตราย</dt><dd>{entry.hazardous_type ? `ชนิดที่ ${entry.hazardous_type} ตามเงื่อนไขรายการ` : '— ไม่ใช่รายการระบุชนิด'}</dd></div><div><dt className="text-gray-600">CAS ตามเอกสาร</dt><dd>{entry.source_cas || 'ไม่ระบุ CAS'}</dd></div><div><dt className="text-gray-600">ช่วงเวลาที่มีหลักฐานยืนยัน</dt><dd>{entry.effective_from || 'ยังไม่ระบุวันเริ่ม'}{entry.effective_to ? ` ถึงก่อน ${entry.effective_to}` : ''}</dd></div></dl>
      <p className="bg-gray-50 rounded-lg p-3 leading-relaxed"><strong>เงื่อนไข:</strong> {entry.conditions}</p>
      {entry.details.note && <p className="text-amber-950">{entry.details.note}</p>}
      {entry.category === 'exposure' && <div className="rounded-lg border border-gray-200 p-3">
        <p className="font-semibold mb-2">{entry.review_state === 'verified' ? 'ค่าขีดจำกัดตามรายการ' : 'ข้อความสกัดจากตาราง — ยังห้ามใช้เป็นค่ามาตรฐานยืนยัน'}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><p>TWA<br /><strong>{entry.details.twa || '—'}</strong></p><p>ระยะสั้น/สูงสุด<br /><strong>{entry.details.short || '—'}</strong></p><p>ระยะเวลา<br /><strong>{entry.details.duration || '—'}</strong></p><p>เพดาน<br /><strong>{entry.details.ceiling || '—'}</strong></p></div>
        <p className="text-gray-600 mt-2">อ่านรูปสารและเชิงอรรถในต้นฉบับประกอบ ไม่แปลง ppm กับ mg/m³ หรือเหมาระยะสั้นเป็น 15 นาที</p>
      </div>}
      <SourceLink entry={entry} sources={sources} />
      <div className="flex flex-wrap gap-3">{entry.details.related_sources?.map(id => { const source = sources.find(s => s.id === id); return source ? <LegalSourceLinks key={id} source={source} /> : null; })}</div>
    </div>
  </details>)}</div>;
}
function exportCsv(check: LegalCheck, release: LegalRelease, sources: LegalSource[]) {
  // Prefix spreadsheet formula characters, including user-editable future source labels.
  const cell = (value: unknown) => { const str = String(value ?? ''); return '"' + (/^[\s]*[=+@-]/.test(str) ? "'" + str : str).replaceAll('"', '""') + '"'; };
  const rows = [['CAS','ชื่อสาร','เรื่อง','ชนิดตามเงื่อนไข','หน่วยงาน','บัญชี','ฉบับ','เงื่อนไข','สถานะรายการ','สถานะตรวจทาน','กฎหมายในคลัง EA SHE','หน้า PDF ที่ใช้ตรวจ','รุ่นข้อมูล','ข้อจำกัด'], ...check.entries.map(e => [check.cas,e.name,CATEGORY_LABELS[e.category],e.hazardous_type,e.agency,e.list_ref,e.revision,e.conditions,statusLabels[e.legal_status],reviewLabels[e.review_state],(() => { const source = sources.find(s => s.id === e.source_id); return source ? sourceReferenceUrl(source, e) : ''; })(),e.source_page,release.id,'ชุดข้อมูลยังไม่ครบ การไม่พบไม่ใช่ข้อยกเว้นกฎหมาย'])];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `chemical-legal-${check.cas}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LegalResult({ check, sources, release }: { check: LegalCheck; sources: LegalSource[]; release: LegalRelease }) {
  const [category, setCategory] = useState('');
  const [history, setHistory] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const rows = check.entries.filter(e => (!category || category === e.category) && (history || e.legal_status === 'active') && (!onlyVerified || e.review_state === 'verified'));
  return <div className="space-y-5">
    <section className="legal-card" aria-label="ผลการค้นหากฎหมาย">
      <div className="flex flex-wrap gap-3 items-start justify-between"><div><p className="text-sm text-purple-800 font-semibold">จับคู่ด้วย CAS {check.cas}</p><h2 className="text-xl font-bold mt-1">{check.entries.find(e => e.legal_status === 'active')?.name || 'ยังไม่พบรายการในชุดข้อมูล'}</h2><p className="text-sm text-gray-600 mt-2">ต้องยืนยันว่า CAS นี้ตรงกับสารหรือองค์ประกอบใน SDS ของคุณ</p></div><button className="legal-btn" onClick={() => exportCsv(check, release, sources)}><Download size={16} /> ส่งออกผล CSV</button></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mt-5">{LEGAL_CATEGORIES.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)} className={`p-4 rounded-xl border text-left ${category === c ? 'border-purple-600 bg-purple-50' : 'border-gray-200'}`}><strong className="block text-sm">{CATEGORY_LABELS[c]}</strong><span className="block mt-2 text-sm">{check.counts[c].verified ? `พบ ${check.counts[c].verified} รายการยืนยัน` : c === 'health' ? 'ตามกลุ่มสาร/งานที่สัมผัส' : 'ไม่พบในชุดข้อมูลนี้'}</span><small className="block text-amber-900 mt-1">{check.counts[c].pending ? `ข้อมูลต้องตรวจเพิ่ม ${check.counts[c].pending} รายการ` : 'มีเงื่อนไขตามกฎหมาย'}</small></button>)}</div>
    </section>
    <section className="legal-card">
      <div className="flex flex-wrap gap-4 items-center mb-4"><h2 className="font-bold mr-auto">รายการและเงื่อนไขกฎหมาย</h2><select aria-label="หมวดกฎหมาย" value={category} onChange={e => setCategory(e.target.value)} className={`${inputCls} sm:max-w-[200px]`}><option value="">ทุกเรื่อง</option>{LEGAL_CATEGORIES.map(c => <option value={c} key={c}>{CATEGORY_LABELS[c]}</option>)}</select><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /> รวมยกเลิก/ข้อความเดิม</label><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={onlyVerified} onChange={e => setOnlyVerified(e.target.checked)} /> เฉพาะที่ยืนยันแล้ว</label></div>
      <p className="text-sm text-gray-600 mb-3">{rows.length} รายการ · กดแต่ละรายการเพื่อดูชนิด หน่วยงาน เงื่อนไข ค่าขีดจำกัด และหน้าต้นฉบับ</p>
      {rows.length ? <LegalEntryList entries={rows} sources={sources} /> : <p className="rounded-lg bg-amber-50 p-4 text-amber-950">ยังไม่มีรายการตามตัวกรองนี้ ต้องตรวจต้นฉบับและกลุ่มสารเพิ่มเติม ห้ามสรุปว่า “ไม่ควบคุม”</p>}
    </section>
    <section className="legal-card"><h2 className="font-bold mb-2">ข้อกำหนดที่ต้องตรวจเพิ่ม แม้ไม่พบ CAS</h2><p className="text-sm text-gray-600 mb-3">รายการด้านล่างเป็นเกณฑ์ทั่วไป ไม่ใช่ผลจับคู่ยืนยันว่าสารนี้เข้าข่าย</p><LegalEntryList entries={check.general} sources={sources} /></section>
  </div>;
}

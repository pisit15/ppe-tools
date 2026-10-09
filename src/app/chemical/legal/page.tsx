'use client';
import LegalSourceLinks from './LegalSourceLinks';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, Search, Scale } from 'lucide-react';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { normalizeCas } from '@/lib/chemical/legal/engine';
import { CATEGORY_LABELS, LEGAL_CATEGORIES, type LegalCandidate, type LegalCheck, type LegalEntry, type LegalRelease, type LegalSource } from '@/lib/chemical/legal/types';
import { inputCls } from '../components/ui';
import { LegalResult, LegalEntryList } from './LegalResult';

type RegisterRow = { id: string; company_id: string; name: string; cas_no: string | null; valid_cas: string | null; counts: LegalCheck['counts'] | null };
type LegalResponse = {
  release: LegalRelease; sources: LegalSource[]; stats: { category: keyof typeof CATEGORY_LABELS; total: number; verified: number }[];
  register?: RegisterRow[]; candidates?: LegalCandidate[]; total?: number; invalidCas?: boolean; unmapped?: LegalEntry[];
  check?: LegalCheck | null; identityWarning?: string; substance?: { id: string; company_id: string; name: string; cas_no: string | null; updated_at: string };
};
export default function ChemicalLegalPage() {
  const { q } = useCompanyScope();
  const params = useSearchParams();
  return <LegalWorkspace key={q + (params.get('substance_id') || '')} substanceId={params.get('substance_id')} />;
}
function LegalWorkspace({ substanceId }: { substanceId: string | null }) {
  const { q, companyName, isAll } = useCompanyScope();
  const router = useRouter();
  const [mode, setMode] = useState<'register' | 'search' | 'sources'>('register');
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [cas, setCas] = useState('');
  const [registerSearch, setRegisterSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const suffix = substanceId ? '&substance_id=' + encodeURIComponent(substanceId) : mode === 'register' ? '&mode=register' : cas ? '&cas=' + encodeURIComponent(cas) : '&q=' + encodeURIComponent(submitted);
  const result = useChemicalData<LegalResponse>(`/api/chemical/legal${q}${suffix}`, refresh);
  const data = result.data;
  const changeMode = (next: typeof mode) => {
    if (substanceId) { router.push(`/chemical/legal${q}`); return; }
    setMode(next); setCas(''); setSubmitted('');
  };
  const runSearch = (query: string) => { setText(query); setSubmitted(query.trim()); setCas(normalizeCas(query) || ''); };
  const register = (data?.register || []).filter(r => [r.name, r.cas_no || '', r.company_id].join(' ').toLowerCase().includes(registerSearch.toLowerCase()));
  return <div className="max-w-[1500px] mx-auto space-y-5 pb-10 text-gray-800">
    <header className="flex flex-wrap gap-4 justify-between items-start">
      <div><div className="flex items-center gap-2"><Scale className="text-purple-700" size={28} /><h1 className="text-2xl font-bold text-gray-950">ตรวจสอบกฎหมายสารเคมี</h1></div><p className="text-sm text-gray-600 mt-2">{companyName} · ค้นหาบัญชีรายชื่อและเงื่อนไขที่เกี่ยวข้อง</p></div>
      <Link href={`/chemical${q}`} className="legal-btn"><ArrowLeft size={16} /> กลับทะเบียน</Link>
    </header>
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-950">
      <strong>ข้อมูลกฎหมายและเงื่อนไขการใช้</strong><p className="mt-1">ใช้ผลตรวจเทียบกับกฎหมายที่มีหลักฐานแล้ว พร้อมแสดงต้นฉบับและเงื่อนไขของแต่ละรายการ ส่วนที่ข้อมูลยังไม่ครบระบุแยกไว้ การไม่พบชื่อไม่ได้หมายความว่าไม่มีกฎหมายควบคุม</p>
    </div>
    {!substanceId && <nav aria-label="รูปแบบการตรวจ" className="flex flex-wrap gap-2">
      {([['register', 'สารในทะเบียน'], ['search', 'ค้นหาสารอื่น'], ['sources', 'แหล่งข้อมูลและความครอบคลุม']] as const).map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => changeMode(key)} className={`legal-btn ${mode === key ? 'legal-btn-primary' : ''}`}>{key === 'sources' ? <BookOpen size={17} /> : key === 'search' ? <Search size={17} /> : <Scale size={17} />}{label}</button>)}
    </nav>}
    {!substanceId && mode === 'search' && <section className="legal-card">
      <form onSubmit={e => { e.preventDefault(); runSearch(text); }} className="flex flex-col sm:flex-row items-end gap-3">
        <div className="flex-1 w-full"><label htmlFor="legal-search" className="legal-label">ชื่อสารภาษาไทย / อังกฤษ หรือเลข CAS</label><input id="legal-search" maxLength={200} className={inputCls} placeholder="เช่น Acetone หรือ 67-64-1" value={text} onChange={e => setText(e.target.value)} /></div>
        <button type="submit" className="legal-btn legal-btn-primary"><Search size={17} /> ค้นหา</button>
      </form>
      <p className="text-sm text-gray-600 mt-3">สารผสม: ตรวจองค์ประกอบจาก SDS ทีละสาร ไม่ใช้ชื่อทางการค้าหรือ CAS ของสารเดียวแทนทั้งผลิตภัณฑ์</p>
      <div className="flex flex-wrap items-center gap-2 mt-3 text-sm"><span className="text-gray-600">ลองค้นหา</span>{[['Acetone','67-64-1'],['Toluene','108-88-3'],['Sodium cyanide','143-33-9']].map(([name, number]) => <button key={number} className="text-purple-700 border border-purple-200 rounded-full px-3 py-1 hover:bg-purple-50" onClick={() => runSearch(number)}>{name}</button>)}</div>
    </section>}
    {result.loading ? <div className="legal-card" role="status">กำลังโหลดและตรวจชุดข้อมูลกฎหมาย…</div> : result.error ? <div className="legal-card text-red-800" role="alert">{result.error}<button className="legal-btn mt-3" onClick={() => setRefresh(v => v + 1)}>ลองโหลดใหม่</button></div> : data && <>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-gray-600"><span>{data.release.label} · {data.release.entry_count.toLocaleString()} รายการอ้างอิง (ไม่ใช่จำนวนสารไม่ซ้ำ)</span><span>ตรวจแหล่งข้อมูลถึง {new Date(data.release.checked_on).toLocaleDateString('th-TH', { timeZone: 'UTC' })}</span></div>
      {substanceId && <div className="legal-card"><Link className="text-purple-700 underline text-sm" href={`/chemical/legal${q}`}>← รายการในทะเบียน</Link><h2 className="text-xl font-bold mt-3">{data.substance?.name}</h2><p className="mt-1 text-sm">CAS ในทะเบียน: {data.substance?.cas_no || 'ยังไม่ระบุ'}</p>{data.identityWarning && <p role="status" className="mt-3 text-amber-900">{data.identityWarning} <Link href={`/chemical/legal${q}`} className="underline">กลับไปเลือกโหมดค้นหา</Link></p>}</div>}
      {!substanceId && mode === 'register' && <section className="legal-card">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-4"><h2 className="font-bold">ตรวจจากทะเบียนบริษัท</h2><input aria-label="กรองทะเบียนเพื่อตรวจกฎหมาย" placeholder="ชื่อสาร / CAS / บริษัท" className={`${inputCls} sm:max-w-sm`} value={registerSearch} onChange={e => setRegisterSearch(e.target.value)} /></div>
        {register.length === 0 ? <p className="text-gray-600">{data.register?.length ? 'ไม่พบรายการตรงกับตัวกรอง' : 'ยังไม่มีสารในทะเบียนใช้งานจริง สามารถค้นหาสารอื่นได้ทันที'}</p> : <div className="overflow-x-auto"><table className="legal-table min-w-[950px]"><caption className="sr-only">รายการกฎหมายของสารในทะเบียน</caption><thead><tr><th>สารเคมี / CAS</th>{LEGAL_CATEGORIES.map(c => <th key={c}>{CATEGORY_LABELS[c]}</th>)}<th>รายละเอียด</th></tr></thead><tbody>{register.map(row => <tr key={row.id}><td><strong>{row.name}</strong><p className="text-gray-600 mt-1">{row.cas_no || 'ยังไม่มี CAS'}{isAll ? ` · ${row.company_id.toUpperCase()}` : ''}</p></td>{LEGAL_CATEGORIES.map(c => <td key={c}>{!row.valid_cas ? 'ต้องตรวจ CAS' : row.counts?.[c].verified ? <span className="text-purple-800">พบ {row.counts[c].verified} รายการ<br /><small>มีเงื่อนไขตามกฎหมาย</small></span> : row.counts?.[c].pending ? <span className="text-amber-900">ข้อมูลต้องตรวจเพิ่ม {row.counts[c].pending}</span> : c === 'health' ? 'ตามกลุ่มสาร/งานที่สัมผัส' : 'ไม่พบในชุดข้อมูลนี้'}</td>)}<td><Link className="legal-btn whitespace-nowrap" href={`/chemical/legal?company_id=${encodeURIComponent(row.company_id)}&substance_id=${row.id}`}>ดูข้อกฎหมาย</Link></td></tr>)}</tbody></table></div>}
      </section>}
      {!substanceId && mode === 'search' && !cas && submitted && <section className="legal-card" aria-live="polite">
        <h2 className="font-bold mb-3">เลือกตัวตนของสารก่อนดูผลกฎหมาย</h2>
        {data.invalidCas ? <p className="text-red-800">เลข CAS ไม่ถูกต้อง กรุณาตรวจจาก SDS ระบบจะไม่เติมขีดหรือเดาตัวเลขที่ขาด</p> : <>
          <p className="text-sm text-gray-600 mb-3">พบ {data.total || 0} ตัวตนที่อาจตรงชื่อ · แสดงสูงสุด 40 รายการ ชื่อคล้ายกันยังไม่ถือว่าเป็นสารเดียวกัน</p>
          <div className="grid md:grid-cols-2 gap-3">{data.candidates?.map(candidate => <button key={candidate.cas} className="text-left border border-gray-300 rounded-xl p-4 hover:border-purple-500" onClick={() => setCas(candidate.cas)}><strong className="block">{candidate.name}</strong><span className="block text-purple-800 mt-1">CAS {candidate.cas}</span><span className="text-sm text-gray-600">{candidate.categories.map(c => CATEGORY_LABELS[c]).join(' · ')}</span></button>)}</div>
          {!data.candidates?.length && <p className="mt-3">ยังไม่พบชื่อในชุดข้อมูลนี้ ลองชื่อพ้องหรือ CAS และตรวจบัญชีกลุ่มสารจากต้นฉบับ</p>}
        </>}
        {!!data.unmapped?.length && <div className="mt-5"><h3 className="font-bold mb-2">รายการกลุ่มสาร / CAS ที่ยังจับคู่ไม่ได้</h3><LegalEntryList entries={data.unmapped} sources={data.sources} /></div>}
      </section>}
      {data.check && <LegalResult key={`${data.check.cas}:${substanceId || 'external'}`} check={data.check} sources={data.sources} release={data.release} />}
      {!substanceId && mode === 'sources' && <div className="space-y-4">
        <section className="legal-card"><h2 className="font-bold text-lg mb-4">ความครอบคลุมของฐานข้อมูลรุ่นนี้</h2><div className="overflow-x-auto"><table className="legal-table min-w-[650px]"><thead><tr><th>เรื่อง</th><th>ยืนยันจากต้นฉบับ / ทั้งหมด</th><th>ขอบเขต</th></tr></thead><tbody>{data.stats.map(s => <tr key={s.category}><td>{CATEGORY_LABELS[s.category]}</td><td>{s.verified} / {s.total}</td><td>{data.release.coverage[s.category]}</td></tr>)}</tbody></table></div><ul className="list-disc pl-5 mt-4 text-sm text-amber-950 space-y-2">{data.release.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></section>
        <section className="legal-card"><h2 className="font-bold text-lg mb-4">กฎหมายและเอกสารจากคลัง EA SHE</h2><div className="grid md:grid-cols-2 gap-3">{data.sources.map(source => <div key={source.id} className="border border-gray-200 p-4 rounded-xl"><h3 className="font-semibold mb-2">{source.title}</h3><LegalSourceLinks source={source} />{source.note && <p className="text-sm text-gray-600 mt-2">{source.note}</p>}</div>)}</div></section>
      </div>}
    </>}
  </div>;
}

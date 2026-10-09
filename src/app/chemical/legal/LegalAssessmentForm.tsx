'use client';
import { useState } from 'react';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { evaluateObligations } from '@/lib/chemical/legal/engine';
import { CATEGORY_LABELS, EMPTY_LEGAL_CONTEXT, type LegalAssessment, type LegalCheck, type LegalContext, type LegalRelease } from '@/lib/chemical/legal/types';
import { inputCls } from '../components/ui';

export function LegalAssessmentForm({ check, release, substance }: { check: LegalCheck; release: LegalRelease; substance?: { id: string; name: string; updated_at: string } }) {
  const { q, companyId, companyName, canWrite } = useCompanyScope();
  const [context, setContext] = useState<LegalContext>({ ...EMPTY_LEGAL_CONTEXT });
  const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const update = <K extends keyof LegalContext>(key: K, value: LegalContext[K]) => { setContext(current => ({ ...current, [key]: value })); setReviewed(false); setMessage(null); };
  const obligations = evaluateObligations(check, context);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/chemical/legal/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        company_id: companyId, substance_id: substance?.id || null, substance_updated_at: substance?.updated_at || null,
        cas: check.cas, release_id: release.id, context, review_status: reviewed ? 'reviewed' : 'pending', review_note: note,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setMessage({ error: false, text: `บันทึกผลคัดกรองของ ${companyName} แล้ว ${reviewed ? '(ตรวจทานบริบทแล้ว)' : '(รอตรวจทานบริบท)'}` });
      setRefresh(v => v + 1);
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ' }); }
    finally { setSaving(false); }
  };
  return <section className="legal-card">
    <h2 className="text-lg font-bold">บันทึกบริบทและผลคัดกรอง</h2>
    <p className="text-sm text-gray-600 mt-2">ผลนี้ผูกกับ {companyName}{substance ? ` · ${substance.name}` : ' · สารที่ค้นหานอกทะเบียน'} และกฎหมายรุ่น {release.id} การตรวจทานบริบทไม่เปลี่ยนรายการกฎหมายที่รอตรวจทานให้เป็นข้อมูลยืนยัน</p>
    <form onSubmit={save} className="space-y-4 mt-4">
      <fieldset disabled={saving} className="grid sm:grid-cols-2 gap-4 disabled:opacity-60">
        <legend className="sr-only">บริบทการใช้และการครอบครอง</legend>
        <div className="sm:col-span-2"><label htmlFor="legal-purpose" className="legal-label">ลักษณะการใช้ / ผลิตภัณฑ์ / งานที่สัมผัส</label><textarea id="legal-purpose" maxLength={1000} className={inputCls} rows={2} value={context.purpose} onChange={e => update('purpose', e.target.value)} placeholder="เช่น ตัวทำละลายล้างชิ้นงานในโรงงาน; อ้างอิง SDS ส่วนที่ 3" /></div>
        <div><label htmlFor="legal-concentration" className="legal-label">ความเข้มข้นตาม SDS (ถ้าทราบ)</label><input id="legal-concentration" type="number" min="0" max="100" step="any" className={inputCls} value={context.concentration} onChange={e => update('concentration', e.target.value)} /></div>
        <div><label htmlFor="legal-unit" className="legal-label">หน่วยความเข้มข้น</label><select id="legal-unit" className={inputCls} value={context.concentration_unit} onChange={e => update('concentration_unit', e.target.value as LegalContext['concentration_unit'])}><option value="">ยังไม่ทราบ</option><option value="%w/w">% โดยน้ำหนัก (w/w)</option><option value="%v/v">% โดยปริมาตร (v/v)</option></select></div>
        <div><label htmlFor="legal-period" className="legal-label">รอบ วอ./อก.7 (ปี พ.ศ.-ครึ่งปี)</label><input id="legal-period" className={inputCls} placeholder="เช่น 2569-1" pattern="(25|26)[0-9]{2}-[12]" maxLength={7} value={context.reporting_period} onChange={e => update('reporting_period', e.target.value)} /><p className="text-sm text-gray-600 mt-1">1 = ม.ค.–มิ.ย. · 2 = ก.ค.–ธ.ค.</p></div>
        <div><label htmlFor="legal-scope" className="legal-label">ตรวจเงื่อนไขรายการ วอ./อก.7 แล้ว</label><select id="legal-scope" className={inputCls} value={context.reporting_scope} onChange={e => update('reporting_scope', e.target.value as LegalContext['reporting_scope'])}><option value="unknown">ยังยืนยันไม่ได้</option><option value="in">การใช้งานและความเข้มข้นเข้าขอบเขตรายการ</option><option value="out">อยู่นอกขอบเขตรายการ (ระบุเหตุผลด้านล่าง)</option></select></div>
        <div><label htmlFor="legal-quantity" className="legal-label">มีหรือเคยมีในครอบครอง ≥100 กก. ต่อรายชื่อในรอบนั้น</label><select id="legal-quantity" className={inputCls} value={context.possessed_100kg} onChange={e => update('possessed_100kg', e.target.value as LegalContext['possessed_100kg'])}><option value="unknown">ยังไม่มีข้อมูลครบทั้งรอบ</option><option value="yes">ใช่ — ตรวจบันทึกปริมาณแล้ว</option><option value="no">ไม่ — ตรวจบันทึกครบทั้งรอบแล้ว</option></select><p className="text-sm text-gray-600 mt-1">ห้ามใช้สต็อกปัจจุบันอย่างเดียว หรือแปลงลิตรเป็นกิโลกรัมโดยไม่มีข้อมูลรองรับ</p></div>
        <div><label htmlFor="legal-exposure" className="legal-label">ข้อมูลการสัมผัสของลูกจ้าง</label><select id="legal-exposure" className={inputCls} value={context.workplace_exposure} onChange={e => update('workplace_exposure', e.target.value as LegalContext['workplace_exposure'])}><option value="unknown">ยังไม่ได้ประเมินงานที่สัมผัส</option><option value="yes">มีงานที่สัมผัส — ต้องวางแผนตรวจ</option><option value="no">ไม่พบการสัมผัสตามข้อมูลที่ประเมิน</option></select></div>
      </fieldset>
      <div className="grid md:grid-cols-2 gap-3" aria-label="ผลคัดกรองตามบริบท">{obligations.map(item => <div key={item.category} className={`rounded-lg p-3 text-sm border ${item.status === 'action' ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200'}`}><strong>{CATEGORY_LABELS[item.category]}</strong><p className="mt-1 leading-relaxed">{item.text}</p></div>)}</div>
      <div><label htmlFor="legal-note" className="legal-label">บันทึกเหตุผล / หลักฐาน / สิ่งที่ต้องตรวจเพิ่ม</label><textarea id="legal-note" rows={3} maxLength={3000} minLength={reviewed ? 10 : undefined} required={reviewed} className={inputCls} value={note} onChange={e => { setNote(e.target.value); setReviewed(false); }} /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>ฉันได้ตรวจทานบริบทและบันทึกเหตุผลแล้ว (ไม่ใช่การรับรองว่าปฏิบัติตามกฎหมายครบถ้วน)</span></label>
      {message && <p role={message.error ? 'alert' : 'status'} className={`p-3 rounded-lg ${message.error ? 'bg-red-50 text-red-800' : 'bg-purple-50 text-purple-900'}`}>{message.text}</p>}
      <div className="flex flex-wrap gap-3 items-center"><button className="legal-btn legal-btn-primary" disabled={!canWrite || saving} type="submit">{saving ? 'กำลังบันทึก…' : 'บันทึกผลคัดกรอง'}</button><span className="text-sm text-gray-600">{canWrite ? 'เก็บผลและข้อมูลอ้างอิงเป็นประวัติ เพิ่มบันทึกใหม่เมื่อตรวจซ้ำ' : 'เลือกบริษัทก่อนบันทึกผล'}</span></div>
    </form>
    {canWrite && <AssessmentHistory key={q + check.cas} url={`/api/chemical/legal/assessments${q}&cas=${encodeURIComponent(check.cas)}${substance ? `&substance_id=${substance.id}` : ''}`} refresh={refresh} />}
  </section>;
}
function AssessmentHistory({ url, refresh }: { url: string; refresh: number }) {
  const [retry, setRetry] = useState(0);
  const result = useChemicalData<{ data: LegalAssessment[] }>(url, refresh + retry);
  return <div className="mt-6 pt-5 border-t border-gray-200"><h3 className="font-bold mb-3">ประวัติการตรวจล่าสุด (สูงสุด 10 รายการ)</h3>
    {result.loading ? <p role="status" className="text-sm">กำลังโหลดประวัติ…</p> : result.error ? <p role="alert" className="text-sm text-red-800">{result.error} <button type="button" className="underline" onClick={() => setRetry(v => v + 1)}>ลองใหม่</button></p> : !result.data?.data.length ? <p className="text-sm text-gray-600">ยังไม่มีบันทึกสำหรับ CAS นี้ในบริษัทที่เลือก</p> : <div className="space-y-3">{result.data.data.map(record => <details key={record.id} className="border rounded-xl border-gray-200 p-3 text-sm"><summary className="cursor-pointer"><strong>{record.review_status === 'reviewed' ? 'ตรวจทานบริบทแล้ว' : 'รอตรวจทานบริบท'}</strong> · {new Date(record.created_at).toLocaleString('th-TH')} · {record.actor_name}<span className="block text-gray-600 mt-1">{record.snapshot.substance_name || 'ค้นหานอกทะเบียน'} · {record.release_id}</span></summary><div className="pt-3 space-y-2"><p className="whitespace-pre-wrap">{record.review_note || 'ไม่ได้ระบุหมายเหตุ'}</p><p>การใช้: {record.snapshot.context.purpose || 'ยังไม่ระบุ'} · ความเข้มข้น: {record.snapshot.context.concentration || 'ยังไม่ระบุ'} {record.snapshot.context.concentration_unit}</p><p>รอบรายงาน: {record.snapshot.context.reporting_period || 'ยังไม่ระบุ'} · ยืนยันขอบเขต: {record.snapshot.context.reporting_scope} · เคยครอบครอง ≥100 กก.: {record.snapshot.context.possessed_100kg}</p>{record.snapshot.obligations.map(item => <p key={item.category}><strong>{CATEGORY_LABELS[item.category]}:</strong> {item.text}</p>)}<p className="text-gray-600">ผลข้างต้นเป็นข้อมูลที่บันทึกไว้ ณ เวลาตรวจ ไม่เปลี่ยนตามฐานข้อมูลรุ่นใหม่</p></div></details>)}</div>}
  </div>;
}

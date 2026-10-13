'use client';
import { useState } from 'react';
import type { ProductLegalCheck } from '@/lib/chemical/legal/product';
import type { LegalRelease, LegalSource } from '@/lib/chemical/legal/types';
import { hasVerifiedLegalMatch } from '@/lib/chemical/legal/engine';
import { LegalResult, LegalEntryList } from './LegalResult';
import { inputCls } from '../components/ui';

export default function ProductLegalResults({ composition, release, sources }: { composition: ProductLegalCheck; release: LegalRelease; sources: LegalSource[] }) {
  const [selected, setSelected] = useState(composition.parts.find(p => p.check)?.key || composition.parts[0]?.key || '');
  const part = composition.parts.find(p => p.key === selected);
  return <div className="space-y-5">
    <section className="legal-card">
      <h2 className="font-bold text-lg">ผลค้นหาตามองค์ประกอบใน SDS</h2>
      <p className="text-sm text-gray-600 mt-2">ค้นหาได้ {composition.checked_cas_count} CAS · องค์ประกอบที่บันทึก {composition.component_count} รายการ · ผลรวมกฎหมายนับรายการอ้างอิงที่ไม่ซ้ำ</p>
      <p className="text-sm text-purple-900 bg-purple-50 rounded-lg p-3 my-3">ผลนี้แสดงการพบชื่อในบัญชี ต้องเทียบความเข้มข้น การใช้ และเงื่อนไขในกฎหมายก่อนสรุปว่าผลิตภัณฑ์เข้าข่าย ไม่ใช้ CAS ขององค์ประกอบเดียวแทนทั้งสารผสม</p>
      {composition.incomplete && <p role="status" className="text-sm text-amber-900 mb-3">ข้อมูลสำหรับค้นหายังไม่ครบ: {composition.missing_cas_count ? `${composition.missing_cas_count} รายการไม่มี CAS ที่ใช้ค้นหาได้` : 'ยังไม่ได้บันทึกองค์ประกอบของสารผสม'} การไม่พบรายการไม่ใช่ข้อสรุปว่าไม่มีกฎหมายควบคุม</p>}
      <div className="overflow-x-auto"><table className="legal-table min-w-[640px]"><caption className="sr-only">ผลค้นหาแยกตามองค์ประกอบ</caption><thead><tr><th>สาร / CAS</th><th>ความเข้มข้นตาม SDS</th><th>ผลค้นหา</th></tr></thead><tbody>{composition.parts.map(p => <tr key={p.key}><td><strong>{p.name}</strong><p className="text-sm text-gray-600">{p.kind === 'product' ? 'ระดับผลิตภัณฑ์' : 'องค์ประกอบ'} · {p.cas || p.missingReason}</p>{p.source_page && <p className="text-xs text-gray-600">SDS หน้า {p.source_page}</p>}</td><td>{p.kind === 'product' ? '—' : [p.concentration || 'SDS ไม่ระบุ', p.basis].filter(Boolean).join(' · ')}</td><td>{!p.check ? 'ยังค้นหาด้วย CAS ไม่ได้' : hasVerifiedLegalMatch(p.check.counts) ? 'พบรายการกฎหมายที่มีเงื่อนไข' : 'ไม่พบรายการยืนยันในชุดข้อมูลนี้'}{p.check && <button type="button" className="block text-purple-700 underline min-h-11 text-sm" onClick={() => setSelected(p.key)}>ดูผลของ {p.name}</button>}</td></tr>)}</tbody></table></div>
      {!!composition.parts.length && <div className="mt-4"><label htmlFor="legal-component" className="legal-label">สาร / องค์ประกอบที่แสดงผล</label><select id="legal-component" className={inputCls} value={selected} onChange={e => setSelected(e.target.value)}>{composition.parts.map(p => <option key={p.key} value={p.key}>{p.name} · {p.cas || 'ไม่ระบุ CAS'}{p.concentration ? ` · ${p.concentration}` : ''}</option>)}</select><p className="text-sm text-gray-600 mt-2">รายละเอียดและ CSV ด้านล่างเป็นของสารที่เลือก พร้อมเงื่อนไขและเอกสารกฎหมายต้นฉบับ</p></div>}
    </section>
    {part?.check ? <LegalResult key={part.key} check={part.check} release={release} sources={sources} /> : <section className="legal-card"><h2 className="font-bold mb-2">ข้อกำหนดที่ต้องตรวจเพิ่ม แม้ไม่พบ CAS</h2><p className="text-sm text-gray-600 mb-3">เกณฑ์ทั่วไป ไม่ใช่ผลยืนยันว่าผลิตภัณฑ์นี้เข้าข่าย</p><LegalEntryList entries={composition.general} sources={sources} /></section>}
  </div>;
}

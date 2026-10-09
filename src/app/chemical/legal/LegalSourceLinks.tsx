import { ExternalLink } from 'lucide-react';
import { sourceDocuments } from '@/lib/chemical/legal/library-sources';
import type { LegalEntry, LegalSource } from '@/lib/chemical/legal/types';

export default function LegalSourceLinks({ source, entry }: { source: LegalSource; entry?: LegalEntry }) {
  if (source.library_status === 'not_law' || source.id === 'nist') return <a className="text-purple-800 underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>;
  const documents = sourceDocuments(source, entry);
  return <div className="space-y-2">
    {documents.map(law => <div key={law.id} className="space-y-1">
      {law.document_url ? <a href={law.document_url} target="_blank" rel="noopener noreferrer" title="เปิดไฟล์ Google Drive" className="inline-flex items-center gap-1 text-purple-800 underline">{law.title} · {law.code} <ExternalLink size={13} className="shrink-0" /></a> : <><p>{law.title} · {law.code}</p><p className="text-sm text-amber-900">ยังไม่มีลิงก์ Google Drive ในคลัง</p></>}
    </div>)}
    {!documents.length && <div><p>{source.title}</p><p className="text-sm text-amber-900">{source.library_status === 'unavailable' ? 'โหลดลิงก์เอกสารจากคลังไม่สำเร็จ' : 'ยังไม่พบรายการเชื่อมโยงในคลัง'}</p></div>}
    {entry && <p className="text-xs text-gray-600">หลักฐานที่ใช้ตรวจ: {source.title} · หน้า PDF {entry.source_page} (เลขหน้าของไฟล์ที่ใช้ตรวจ อาจต่างจากไฟล์ในคลัง)</p>}
  </div>;
}

import { ExternalLink } from 'lucide-react';
import { sourceDocuments, sourceReferenceUrl } from '@/lib/chemical/legal/library-sources';
import type { LegalEntry, LegalSource } from '@/lib/chemical/legal/types';

export default function LegalSourceLinks({ source, entry }: { source: LegalSource; entry?: LegalEntry }) {
  if (source.library_status === 'not_law' || source.id === 'nist') return <a className="text-purple-800 underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>;
  const documents = sourceDocuments(source, entry);
  return <div className="space-y-2">
    {documents.map(law => <div key={law.id} className="space-y-1">
      <a href={law.library_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-purple-800 underline">{law.title} · {law.code} <ExternalLink size={13} className="shrink-0" /></a>
      {law.document_url && <div><a href={law.document_url} target="_blank" rel="noopener noreferrer" className="text-purple-800 underline">เปิดเอกสารจากคลัง EA SHE ({law.code}) ↗</a></div>}
    </div>)}
    {!documents.length && <div><a href={sourceReferenceUrl(source, entry)} target="_blank" rel="noopener noreferrer" className="text-purple-800 underline">ค้น {source.title} ในคลัง EA SHE ↗</a><p className="text-sm text-amber-900">{source.library_status === 'unavailable' ? 'โหลดลิงก์เอกสารจากคลังไม่สำเร็จ' : 'ยังไม่พบรายการเชื่อมโยงในคลัง'}</p></div>}
    {entry && <p className="text-xs text-gray-600">หลักฐานที่ใช้ตรวจ: {source.title} · หน้า PDF {entry.source_page} (เลขหน้าของไฟล์ที่ใช้ตรวจ อาจต่างจากไฟล์ในคลัง)</p>}
  </div>;
}

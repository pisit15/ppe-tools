import { FileText, ExternalLink } from 'lucide-react';

/** A native link keeps mobile navigation attached to the user's tap. */
export function SdsLink({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  return <a href={`/sds/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"
    aria-label={`เปิด SDS ฉบับจริงของ ${name} (แท็บใหม่)`}
    className={compact ? 'inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-purple-700 hover:underline focus-visible:outline-2 focus-visible:outline-purple-600' : 'legal-btn text-purple-700'}>
    <FileText size={16} aria-hidden="true" />{compact ? 'เปิด SDS' : 'เปิด SDS ฉบับจริง'}<ExternalLink size={13} aria-hidden="true" />
  </a>;
}

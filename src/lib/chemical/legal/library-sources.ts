import type { LegalEntry, LegalSource, LibraryLaw, LibraryDocument } from './types';

// Exact law identities matched against EA SHE's law_documents on 2026-10-09.
// Read titles and document URLs from that shared library at runtime.
export const SOURCE_LIBRARY_CODES: Record<string, string[]> = {
  hz: ['MIND-0370', 'MIND-0393', 'MIND-0616', 'MIND-0688', 'MIND-0795', 'MIND-0863', 'MIND-1038', 'MIND-1367'],
  no8: ['MIND-1367'], correction: ['MIND-0666'], reporting: ['MIND-0913'], baseReport: ['MIND-0233'],
  labour: ['MOL-0261'], reg: ['MOL-0260'], health: ['MOL-1157'], healthReg: ['MOL-1049'],
  limits: ['MOL-0597'], method: ['MOL-0527'], method2: ['MOL-1212'], form1: ['MOL-0262'],
  e1: ['MOL-1117'], e3: ['MOL-1116'], thirtytwo: ['MIND-1012'],
};
export const LIBRARY_CODES = [...new Set(Object.values(SOURCE_LIBRARY_CODES).flat())];

function safeDocumentUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname) ? value : null; }
  catch { return null; }
}
export function attachLibrarySources(sources: LegalSource[], laws: LibraryLaw[], unavailable = false): LegalSource[] {
  const byCode = new Map(laws.map(law => [law.code, law]));
  return sources.map(source => {
    const codes = SOURCE_LIBRARY_CODES[source.id] || [];
    const documents: LibraryDocument[] = codes.flatMap(code => {
      const law = byCode.get(code);
      return law ? [{
        id: law.id, code: law.code, title: law.title, status: law.status,
        document_url: safeDocumentUrl(law.file_url) || safeDocumentUrl(law.external_url) || safeDocumentUrl(law.gazette_url),
      }] : [];
    });
    return { ...source, library_documents: documents, library_status: source.id === 'nist' ? 'not_law' : unavailable ? 'unavailable' : documents.length === codes.length && codes.length ? 'linked' : 'missing' };
  });
}
export function sourceDocuments(source: LegalSource, entry?: LegalEntry): LibraryDocument[] {
  const documents = source.library_documents || [];
  if (source.id !== 'hz' || !entry) return documents;
  // The audited FDA compilation combines several laws. Link the entry's actual revision,
  // never attach a compilation's PDF page number to a different library document.
  const revision = Number(entry.revision.match(/ฉบับที่\s*(\d+)/)?.[1] || 1);
  const code = SOURCE_LIBRARY_CODES.hz[revision - 1];
  return code ? documents.filter(law => law.code === code) : documents;
}
export function sourceReferenceUrl(source: LegalSource, entry?: LegalEntry): string {
  if (source.id === 'nist') return source.url;
  const documents = sourceDocuments(source, entry);
  return documents.length === 1 ? documents[0].document_url || '' : '';
}

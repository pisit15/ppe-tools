import { getSupabaseServer } from '@/lib/supabase';
import { AccessError } from '@/lib/toolsSession';
import type { LegalCatalog, LegalEntry, LegalRelease, LegalSource, LibraryLaw } from './types';
import { attachLibrarySources, LIBRARY_CODES } from './library-sources';

// Releases are immutable to the service role. A short cache avoids reading the reference set per keystroke.
let cached: { expires: number; value: Promise<LegalCatalog> } | undefined;
async function readCatalog(): Promise<LegalCatalog> {
  const db = getSupabaseServer();
  const releaseResult = await db.from('chem_legal_releases').select('*').eq('is_current', true).single();
  if (releaseResult.error || !releaseResult.data) throw new AccessError('ฐานข้อมูลกฎหมายยังไม่พร้อม กรุณาติดต่อผู้ดูแลเพื่อติดตั้งชุดข้อมูล', 503);
  const release = releaseResult.data as LegalRelease;
  const entries: LegalEntry[] = [];
  // Do not mistake PostgREST's 1,000-row limit for the complete legal catalog.
  for (let offset = 0; offset < release.entry_count; offset += 500) {
    const result = await db.from('chem_legal_entries').select('*').eq('release_id', release.id).order('id').range(offset, offset + 499);
    if (result.error) throw result.error;
    entries.push(...(result.data || []) as LegalEntry[]);
  }
  if (entries.length !== release.entry_count) throw new AccessError('ชุดข้อมูลกฎหมายไม่ครบ จึงหยุดแสดงผลเพื่อป้องกันข้อสรุปคลาดเคลื่อน', 503);
  const sources = await db.from('chem_legal_sources').select('*').eq('release_id', release.id).order('id');
  if (sources.error) throw sources.error;
  const laws = await db.from('law_documents').select('id,code,title,status,file_url,external_url,gazette_url').in('code', LIBRARY_CODES);
  if (laws.error) console.error('[chemical/legal] EA SHE library links unavailable:', laws.error.code);
  return { release, entries, sources: attachLibrarySources(sources.data as LegalSource[], (laws.data || []) as LibraryLaw[], !!laws.error) };
}
export async function getLegalCatalog(fresh = false) {
  if (fresh || !cached || cached.expires <= Date.now()) {
    const value = readCatalog();
    cached = { expires: Date.now() + 60_000, value };
    value.catch(() => { if (cached?.value === value) cached = undefined; });
  }
  return cached.value;
}

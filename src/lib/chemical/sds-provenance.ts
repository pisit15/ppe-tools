import type { ChemSubstance, SdsImport } from '@/lib/types';
import type { ToolsActor } from '@/lib/toolsSession';

export function sdsSourceKey(source: Pick<ChemSubstance, 'sds_file_path' | 'sds_url'>): string | null {
  if (source.sds_file_path) return `file:${source.sds_file_path}`;
  if (source.sds_url) return `link:${source.sds_url}`;
  return null;
}

export function sdsImporter(actor: ToolsActor, method: SdsImport['method']): SdsImport {
  return {
    actor_id: actor.id,
    account_table: actor.accountTable,
    username: actor.username,
    display_name: actor.displayName,
    imported_at: new Date().toISOString(),
    method,
  };
}

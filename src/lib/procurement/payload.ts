// Import plan shared by the admin import page and the daily-sync payload builder (scripts/procurement):
// the same tables, order, batch limits and finalize keys, so both paths write identical data.
import { PROC_KEY, PROC_TABLES, type ProcRows, type ProcTable } from './types';

export const MAX_BATCH_ROWS = 1000; // must match MAX_ROWS in /api/procurement/import
export const MAX_BATCH_BYTES = 2_000_000; // UTF-8 bytes (Thai text is 3 bytes/char); well under Vercel's 4.5 MB request limit

export type UpsertBody = { action: 'upsert'; table: ProcTable; rows: object[] };
export type FinalizeBody = { action: 'finalize'; keys: Partial<Record<ProcTable, number[]>>; source: string; allow_shrink?: boolean };

const utf8 = new TextEncoder();

function batches<T>(rows: T[]) {
  const out: T[][] = [];
  let cur: T[] = [], size = 0;
  for (const r of rows) {
    const len = utf8.encode(JSON.stringify(r)).length;
    if (cur.length && (cur.length >= MAX_BATCH_ROWS || size + len > MAX_BATCH_BYTES)) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Tables to write: quotation tables only when a quotation file was supplied (otherwise existing quotations stay). */
export const importTables = (withQuotes: boolean) =>
  PROC_TABLES.filter(t => withQuotes || (t !== 'proc_quotes' && t !== 'proc_quote_items'));

/** Upsert bodies (parents before children) and the finalize body that removes rows missing from the new snapshot. */
export function importPlan(rows: ProcRows, withQuotes: boolean, source: string) {
  const tables = importTables(withQuotes);
  const upserts: UpsertBody[] = tables.flatMap(t => batches(rows[t] as object[]).map(b => ({ action: 'upsert' as const, table: t, rows: b })));
  const keys = Object.fromEntries(tables.map(t => [t, (rows[t] as unknown as Record<string, unknown>[]).map(r => Number(r[PROC_KEY[t]]))]));
  const finalize: FinalizeBody = { action: 'finalize', keys, source: source.slice(0, 200) };
  return { tables, upserts, finalize };
}

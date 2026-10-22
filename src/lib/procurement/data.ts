import { getSupabaseServer } from '@/lib/supabase';
import { pricePoints } from './analysis';
import type { PricePoint, ProcMeta, ProcPoLine, ProcPrSummary, ProcQuote, ProcQuoteItem, ProcTable } from './types';

// The whole dataset is a few thousand rows; load it once per instance and filter in memory.
const TTL_MS = 5 * 60 * 1000;
const PR_COLUMNS = 'odoo_id,pr_no,requester,request_date,company,operating_unit,request_type,state,title,estimated_cost,po_amount,po_count,po_list,vendors,n_lines,n_attachments,drive_folder_id';

type Dataset = {
  prs: ProcPrSummary[]; po: ProcPoLine[]; quotes: ProcQuote[]; items: ProcQuoteItem[];
  quoteById: Map<number, ProcQuote>; points: PricePoint[]; meta: ProcMeta; loadedAt: number;
};
let cache: Dataset | null = null;
let pending: Promise<Dataset> | null = null;

export async function fetchAll<T>(table: ProcTable, columns = '*', order = 'odoo_id'): Promise<T[]> {
  const db = getSupabaseServer();
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select(columns).order(order).range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

async function load(): Promise<Dataset> {
  const db = getSupabaseServer();
  const [prs, po, quotes, items, run] = await Promise.all([
    fetchAll<ProcPrSummary>('proc_pr', PR_COLUMNS),
    fetchAll<ProcPoLine>('proc_po_lines'),
    fetchAll<ProcQuote>('proc_quotes', '*', 'id'),
    fetchAll<ProcQuoteItem>('proc_quote_items', '*', 'id'),
    db.from('proc_sync_runs').select('imported_at,imported_by,counts').order('imported_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (run.error) throw run.error;
  const quoteById = new Map(quotes.map(q => [q.id, q]));
  return {
    prs, po, quotes, items, quoteById, points: pricePoints(po, items, quoteById), loadedAt: Date.now(),
    meta: { imported_at: run.data?.imported_at ?? null, imported_by: run.data?.imported_by ?? null, counts: (run.data?.counts ?? {}) as ProcMeta['counts'] },
  };
}

export async function getDataset(): Promise<Dataset> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (!pending) pending = load().then(d => (cache = d)).finally(() => { pending = null; });
  return pending;
}

export function invalidateDataset() {
  cache = null;
}

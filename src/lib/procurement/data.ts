import { getSupabaseServer } from '@/lib/supabase';
import { prKey, pricePoints, setVendorKeyer, vendorKeyer } from './analysis';
import { categorizePoLines, type SpendCat } from './categories';
import { dataYears, type Coverage } from './period';
import { prSites, type ActorScope } from './scope';
import type { ToolsActor } from '@/lib/toolsSession';
import type { PricePoint, ProcMeta, ProcPoLine, ProcPrSummary, ProcQuote, ProcQuoteItem, ProcTable } from './types';

// The whole dataset is a few thousand rows; load it once per instance and filter in memory.
const TTL_MS = 5 * 60 * 1000;
const PR_COLUMNS = 'odoo_id,pr_no,requester,request_date,company,operating_unit,request_type,state,title,estimated_cost,po_amount,po_count,po_list,vendors,n_lines,n_attachments,drive_folder_id';

export type Dataset = {
  prs: ProcPrSummary[]; po: ProcPoLine[]; quotes: ProcQuote[]; items: ProcQuoteItem[];
  quoteById: Map<number, ProcQuote>; points: PricePoint[]; meta: ProcMeta; loadedAt: number;
  /** odoo_id -> tools company ids (sites) the PR belongs to */
  sitesByPr: Map<number, string[]>;
  /** login accounts (lowercased username -> company ids) and username -> Odoo requester */
  accountSites: Map<string, string[]>; requesterOf: Map<string, string>;
  siteNames: Map<string, string>;
  /** prKey -> PR request date; PO line id -> spend category; prKey -> categories of its PO lines */
  prDate: Map<string, string | null>; poCat: Map<number, SpendCat>; prCats: Map<string, Set<SpendCat>>;
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
  const [prs, po, quotes, items, run, links, cu, tu, companies] = await Promise.all([
    fetchAll<ProcPrSummary>('proc_pr', PR_COLUMNS),
    fetchAll<ProcPoLine>('proc_po_lines'),
    fetchAll<ProcQuote>('proc_quotes', '*', 'id'),
    fetchAll<ProcQuoteItem>('proc_quote_items', '*', 'id'),
    db.from('proc_sync_runs').select('imported_at,imported_by,counts').order('imported_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('proc_requester_accounts').select('username,requester'),
    db.from('company_users').select('username,company_id').eq('is_active', true),
    db.from('tools_users').select('username,company_id').eq('is_active', true),
    db.from('company_settings').select('company_id,company_name'),
  ]);
  for (const r of [run, links, cu, tu, companies]) if (r.error) throw r.error;
  const accountSites = new Map<string, string[]>();
  for (const a of [...(cu.data ?? []), ...(tu.data ?? [])] as { username: string; company_id: string }[]) {
    const u = String(a.username).trim().toLowerCase();
    if (!a.company_id || a.company_id === 'admin') continue;
    accountSites.set(u, [...new Set([...(accountSites.get(u) ?? []), a.company_id])]);
  }
  const requesterOf = new Map(((links.data ?? []) as { username: string; requester: string }[]).map(l => [l.username, l.requester]));
  const requesterSites = new Map<string, string[]>();
  for (const [u, req] of requesterOf) requesterSites.set(req, [...new Set([...(requesterSites.get(req) ?? []), ...(accountSites.get(u) ?? [])])]);
  const sitesByPr = new Map(prs.map(p => [p.odoo_id, prSites(p, requesterSites)]));
  const siteNames = new Map(((companies.data ?? []) as { company_id: string; company_name: string }[]).map(c => [c.company_id, c.company_name]));
  const quoteById = new Map(quotes.map(q => [q.id, q]));
  const prDate = new Map(prs.map(p => [prKey(p.pr_no, p.requester), p.request_date]));
  const poCat = categorizePoLines(po);
  const prCats = new Map<string, Set<SpendCat>>();
  for (const l of po) {
    if (l.po_state === 'cancel') continue;
    const k = prKey(l.pr_no, l.requester);
    prCats.set(k, (prCats.get(k) ?? new Set<SpendCat>()).add(poCat.get(l.odoo_id) ?? 'other'));
  }
  // Vendors appear under several spellings (Thai/English, with or without brackets): learn the aliases first.
  setVendorKeyer(vendorKeyer([...po.map(l => l.vendor), ...quotes.flatMap(q => [q.vendor, q.vendor_group]), ...items.map(i => i.vendor_group)].filter(Boolean)));
  const points = pricePoints(po, items, quoteById, prDate);

  // Period facts: data as of the import day (Bangkok), years with PR/PO data, first date per measure.
  const livePo = po.filter(l => l.po_state !== 'cancel');
  const maxDate = [...prs.map(p => p.request_date), ...livePo.map(l => l.order_date)].reduce<string>((m, d) => (d && d.slice(0, 10) > m ? d.slice(0, 10) : m), '');
  const importedDay = run.data?.imported_at ? new Date(run.data.imported_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) : '';
  const as_of = [importedDay, maxDate].sort().pop() || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const years = dataYears([...prs.map(p => p.request_date), ...livePo.map(l => l.order_date)], as_of);
  const firstYear = years.length ? `${Math.min(...years)}-01-01` : '';
  const minDate = (ds: (string | null)[]) => ds.reduce<string | null>((m, d) => (d && d.slice(0, 10) >= firstYear && (!m || d.slice(0, 10) < m) ? d.slice(0, 10) : m), null);
  const coverage: Coverage = {
    pr: minDate(prs.map(p => p.request_date)),
    po: minDate(livePo.map(l => l.order_date)),
    quote: minDate(points.filter(p => p.source === 'quote').map(p => p.period_date)),
  };
  return {
    prs, po, quotes, items, quoteById, points, loadedAt: Date.now(),
    sitesByPr, accountSites, requesterOf, siteNames, prDate, poCat, prCats,
    meta: {
      imported_at: run.data?.imported_at ?? null, imported_by: run.data?.imported_by ?? null, counts: (run.data?.counts ?? {}) as ProcMeta['counts'],
      as_of, years, coverage,
    },
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

/**
 * Sites a login may see: admins see everything; others see the companies of every active account
 * with the same username, plus every account linked to the same Odoo requester (one person, several sites).
 */
export function actorScope(actor: ToolsActor, d: Pick<Dataset, 'accountSites' | 'requesterOf'>): ActorScope {
  if (actor.isAdmin) return { all: true, sites: [], requester: null };
  const me = actor.username.trim().toLowerCase();
  const sites = new Set<string>([actor.companyId, ...(d.accountSites.get(me) ?? [])]);
  const requester = d.requesterOf.get(me);
  if (requester) for (const [u, r] of d.requesterOf) if (r === requester) for (const s of d.accountSites.get(u) ?? []) sites.add(s);
  return { all: false, sites: [...sites].filter(s => s && s !== 'admin').sort(), requester: requester ?? null };
}

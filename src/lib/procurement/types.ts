// Procurement (PR / PO / quotation) analytics — rows mirror the proc_* tables.
import type { PeriodMeta, PeriodSel } from './period';
import type { SpendCat } from './categories';

export type PrState = 'draft' | 'to_approve' | 'approved' | 'rejected' | 'done';

export const PR_STATE_LABEL: Record<PrState, string> = {
  draft: 'ร่าง',
  to_approve: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว (รอ PO)',
  rejected: 'ไม่อนุมัติ / ยกเลิก',
  done: 'เสร็จสิ้น (ออก PO แล้ว)',
};
export const OPEN_PR_STATES: PrState[] = ['draft', 'to_approve', 'approved'];

export type ProcPr = {
  odoo_id: number; pr_no: string; requester: string; request_date: string | null;
  company: string; operating_unit: string; request_type: string; state: PrState;
  title: string; description: string; estimated_cost: number; po_amount: number;
  po_count: number; po_list: string; vendors: string; n_lines: number; n_attachments: number;
  drive_folder_id: string | null;
};
export type ProcPrSummary = Omit<ProcPr, 'description'>;

export type ProcPrLine = {
  odoo_id: number; pr_odoo_id: number; pr_no: string; name: string; product: string;
  qty: number; uom: string; est_unit_price: number; analytic_account: string;
  date_required: string | null; specifications: string;
};

export type ProcPoLine = {
  odoo_id: number; po_no: string; pr_odoo_id: number; pr_no: string; requester: string;
  vendor: string; product: string; item: string; qty: number; uom: string;
  unit_price: number; subtotal: number; currency: string; order_date: string | null; po_state: string;
};

/** What a quotation's total covers: a month of a recurring service, a year, or a one-off purchase/job. */
export type PriceBasis = 'month' | 'year' | 'once';
export const PRICE_BASES: PriceBasis[] = ['month', 'year', 'once'];
export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = { month: 'ราคาต่อเดือน', year: 'ราคาต่อปี', once: 'ครั้งเดียว' };

export type ProcQuote = {
  id: number; pr_no: string; requester: string; file_path: string; doc_type: string;
  vendor: string; vendor_group: string; quote_no: string | null; quote_date: string | null;
  customer: string | null; currency: string; subtotal: number | null; discount: number | null;
  vat: number | null; total: number | null; notes: string | null; n_items: number; duplicate_file: boolean;
  price_basis: PriceBasis | null;
};

export type ProcQuoteItem = {
  id: number; quote_id: number; pr_no: string; vendor_group: string; quote_date: string | null;
  name: string; spec: string | null; qty: number | null; unit: string | null;
  unit_price: number | null; amount: number | null; duplicate_file: boolean; check_note: string;
};

export type ProcRows = {
  proc_pr: ProcPr[]; proc_pr_lines: ProcPrLine[]; proc_po_lines: ProcPoLine[];
  proc_quotes: ProcQuote[]; proc_quote_items: ProcQuoteItem[];
};
export type ProcTable = keyof ProcRows;
export const PROC_TABLES: ProcTable[] = ['proc_pr', 'proc_pr_lines', 'proc_po_lines', 'proc_quotes', 'proc_quote_items'];
export const PROC_KEY: Record<ProcTable, 'odoo_id' | 'id'> = {
  proc_pr: 'odoo_id', proc_pr_lines: 'odoo_id', proc_po_lines: 'odoo_id', proc_quotes: 'id', proc_quote_items: 'id',
};

export type TaxBasis = 'ex_vat' | 'inc_vat' | 'unknown';
export type UnitPriceBasis = PriceBasis | 'unit' | 'unknown';

/** One price observation: a PO line (ordered) or a quotation line (offered). */
export type PricePoint = {
  source: 'po' | 'quote';
  id: number;
  pr_no: string;
  requester: string; // PR numbers repeat across companies; pr_no + requester identifies the PR
  vendor: string;
  /** one key per company (stripped name + Thai/English aliases learned from the data) */
  vendor_key: string;
  date: string | null;
  /** date used for period filters: the document date, or the PR's request date when the document has none */
  period_date: string | null;
  item: string;
  detail: string;
  qty: number | null;
  unit: string;
  /** Original unit is preserved above; canonical aliases are used only for grouping. */
  currency?: string;
  price_basis?: UnitPriceBasis;
  tax_basis?: TaxBasis;
  unit_price: number;
  ref: string; // PO number or quotation number
  duplicate: boolean;
};

export type VendorPriceStat = {
  vendor: string;
  po_count: number; quote_count: number;
  last_po_price: number | null; last_po_date: string | null;
  min_price: number; median_price: number;
  last_quote_price: number | null; last_quote_date: string | null;
};

export type SearchResult = {
  query: string;
  relaxed: boolean;
  units: { unit: string; count: number }[];
  points: PricePoint[];
  total: number; // matches before the display limit
  match_total: number; // all matches before selecting a comparison group
  groups: PriceGroup[];
  selected_group: string | null;
  comparison_ready: boolean;
  comparison_message: string;
  summary: PriceSearchSummary | null;
  vendors: VendorPriceStat[];
  truncated: boolean;
};

/** Matching recorded descriptions are a review aid, not verified technical equivalence. */
export type PriceGroup = {
  id: string; item: string; detail: string; unit: string; original_units: string[];
  currency: string; price_basis: UnitPriceBasis; tax_basis: TaxBasis;
  count: number; vendors: number; ready: boolean; issues: string[];
};
export type PriceSearchSummary = {
  po_count: number; quote_count: number; vendor_count: number;
  last_po: PricePoint | null; po_min: number | null; po_max: number | null; po_median: number | null;
};

export type VendorSummary = {
  vendor: string; po_lines: number; po_count: number; po_amount: number; pr_count: number;
  quote_count: number; quoted_prs: number; won_prs: number;
  first_date: string | null; last_date: string | null; top_items: string[];
};

export type ProcMeta = PeriodMeta & { imported_at: string | null; imported_by: string | null; counts: Partial<Record<ProcTable, number>> };

/** One vendor in a period, with the same span of the previous year and a per-year trend. */
export type VendorRow = VendorSummary & {
  /** Quoted PRs currently in a draft, approval or approved/waiting-for-PO state. */
  pending_prs: number;
  rank: number | null; // by PO value in the period (1 = largest); null when no PO
  prev_amount: number | null; // PO value in the same span last year; null when there is nothing to compare with
  prev_rank: number | null;
  first_po: string | null; // first PO ever (any category)
  is_new: boolean; // first PO ever falls in this period
  yearly: number[]; // PO value per year, aligned with VendorsResp.years (oldest first)
};
export type CatStat = { cat: SpendCat; amount: number; prev: number | null; vendors: number };
export type YearCats = { year: number; total: number; byCat: Partial<Record<SpendCat, number>> };
export type VendorTotals = {
  amount: number; prev: number | null; vendors: number; prev_vendors: number | null; new_vendors: number | null;
  quotes: number; quoted_prs: number; top10_share: number | null;
};
/** Number of PO lines omitted from THB value calculations, without converting other currencies. */
export type VendorCurrencyOmissions = {
  period: { foreign: number; unknown: number };
  all: { foreign: number; unknown: number };
};
export type VendorsResp = {
  meta: ProcMeta; sel: PeriodSel; cat: SpendCat | null; years: number[];
  currency_omissions: VendorCurrencyOmissions;
  totals: VendorTotals; vendors: VendorRow[]; cats: CatStat[]; matrix: YearCats[];
  /** cumulative PO value by month (selected year, previous year) and the previous year's value on the same day */
  monthly: { cur: number[]; prev: number[] | null; prevSame: number | null; lastMonth: number } | null;
};
export type VendorDetailResp = {
  meta: ProcMeta; sel: PeriodSel; years: number[]; summary: VendorRow | null; overall: VendorRow; names: string[];
  currency_omissions: VendorCurrencyOmissions;
  points: PricePoint[]; prs: ProcPrSummary[]; cats: CatStat[];
};

/* ---------- raw sync file shapes (D:\Odoo PR\_scripts) ---------- */
export type OdooRef = [number, string] | false | null;
export type RawPr = {
  id: number; name: string; date_start: string | false; title: string | false; description: string | false;
  company_id: OdooRef; operating_unit_id: OdooRef; request_type: OdooRef; state: PrState;
  estimated_cost: number | false; po_ids: number[]; line_count: number;
};
export type RawPrLine = {
  id: number; request_id: [number, string]; name: string | false; product_id: OdooRef; product_qty: number;
  product_uom_id: OdooRef; estimated_cost: number | false; analytic_account_id: OdooRef;
  date_required: string | false; specifications: string | false;
};
export type RawPo = { id: number; name: string; partner_id: OdooRef; amount_untaxed: number };
export type RawAttachment = { res_id: number };
export type RawSync = Record<string, { prs: RawPr[]; lines: RawPrLine[]; att: RawAttachment[]; pos: RawPo[] }>;
export type RawPoLine = {
  id: number; order_id: [number, string]; product_id: OdooRef; name: string | false; product_qty: number;
  product_uom: OdooRef; price_unit: number; price_subtotal: number; partner_id: OdooRef;
  date_order: string | false; currency_id: OdooRef; state: string | false;
};
export type RawQuote = {
  quote_id: number; file: string; person: string; pr: string; doc_type: string | null; vendor: string | null;
  vendor_group: string | null; quote_no: string | null; date: string | null; customer: string | null;
  currency: string | null; subtotal: number | null; discount: number | null; vat: number | null;
  total: number | null; notes: string | null; n_items: number | null; duplicate_file: boolean;
  price_basis?: string | null;
};
export type RawQuoteItem = {
  quote_id: number; pr: string; vendor: string | null; vendor_group: string | null; date: string | null;
  name: string | null; spec: string | null; qty: number | null; unit: string | null;
  unit_price: number | null; amount: number | null; duplicate_file: boolean; check: string | null;
};
export type RawQuotes = { quotes: RawQuote[]; items: RawQuoteItem[] };

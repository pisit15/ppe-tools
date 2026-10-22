// Procurement (PR / PO / quotation) analytics — rows mirror the proc_* tables.

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

export type ProcQuote = {
  id: number; pr_no: string; requester: string; file_path: string; doc_type: string;
  vendor: string; vendor_group: string; quote_no: string | null; quote_date: string | null;
  customer: string | null; currency: string; subtotal: number | null; discount: number | null;
  vat: number | null; total: number | null; notes: string | null; n_items: number; duplicate_file: boolean;
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

/** One price observation: a PO line (paid) or a quotation line (offered). */
export type PricePoint = {
  source: 'po' | 'quote';
  id: number;
  pr_no: string;
  requester: string; // PR numbers repeat across companies; pr_no + requester identifies the PR
  vendor: string;
  date: string | null;
  item: string;
  detail: string;
  qty: number | null;
  unit: string;
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
  vendors: VendorPriceStat[];
  truncated: boolean;
};

export type VendorSummary = {
  vendor: string; po_lines: number; po_count: number; po_amount: number; pr_count: number;
  quote_count: number; quoted_prs: number; won_prs: number;
  first_date: string | null; last_date: string | null; top_items: string[];
};

export type ProcMeta = { imported_at: string | null; imported_by: string | null; counts: Partial<Record<ProcTable, number>> };

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
};
export type RawQuoteItem = {
  quote_id: number; pr: string; vendor: string | null; vendor_group: string | null; date: string | null;
  name: string | null; spec: string | null; qty: number | null; unit: string | null;
  unit_price: number | null; amount: number | null; duplicate_file: boolean; check: string | null;
};
export type RawQuotes = { quotes: RawQuote[]; items: RawQuoteItem[] };

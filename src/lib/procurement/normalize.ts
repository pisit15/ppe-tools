// Turns the daily Odoo sync files into proc_* rows. Runs in the browser on the import page.
import { PRICE_BASES, type OdooRef, type PriceBasis, type ProcRows, type RawPoLine, type RawQuotes, type RawSync } from './types';

const ref = (x: OdooRef | undefined) => (Array.isArray(x) ? x[1] : '');
// Odoo partners carry a branch code suffix ("บริษัท … จำกัด 00001")
const partner = (x: OdooRef | undefined) => ref(x).replace(/\s\d{5}$/, '').trim();
const ws = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const day = (v: unknown) => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const basis = (v: unknown): PriceBasis | null => (PRICE_BASES as unknown[]).includes(v) ? (v as PriceBasis) : null;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeSync(sync: RawSync, poLines: RawPoLine[], quotes: RawQuotes | null): ProcRows {
  const rows: ProcRows = { proc_pr: [], proc_pr_lines: [], proc_po_lines: [], proc_quotes: [], proc_quote_items: [] };
  const poOwner = new Map<number, { prId: number; prNo: string; who: string }>();

  for (const [who, x] of Object.entries(sync)) {
    const pos = new Map(x.pos.map(p => [p.id, p]));
    const att = new Map<number, number>();
    for (const a of x.att) att.set(a.res_id, (att.get(a.res_id) || 0) + 1);
    for (const p of x.prs) {
      const linked = p.po_ids.flatMap(i => pos.get(i) ?? []);
      for (const i of p.po_ids) poOwner.set(i, { prId: p.id, prNo: p.name, who });
      rows.proc_pr.push({
        odoo_id: p.id, pr_no: p.name, requester: who, request_date: day(p.date_start),
        company: ref(p.company_id), operating_unit: ref(p.operating_unit_id), request_type: ref(p.request_type),
        state: p.state, title: ws(p.title), description: typeof p.description === 'string' ? p.description.trim() : '',
        estimated_cost: num(p.estimated_cost) ?? 0,
        po_amount: Math.round(linked.reduce((s, z) => s + z.amount_untaxed, 0) * 100) / 100,
        po_count: linked.length, po_list: linked.map(z => z.name).join(', '),
        vendors: [...new Set(linked.map(z => partner(z.partner_id)))].sort().join(', '),
        n_lines: p.line_count, n_attachments: att.get(p.id) || 0, drive_folder_id: null,
      });
    }
    for (const l of x.lines) {
      rows.proc_pr_lines.push({
        odoo_id: l.id, pr_odoo_id: l.request_id[0], pr_no: l.request_id[1], name: ws(l.name),
        product: ref(l.product_id), qty: l.product_qty || 0, uom: ref(l.product_uom_id),
        est_unit_price: num(l.estimated_cost) ?? 0, analytic_account: ref(l.analytic_account_id),
        date_required: day(l.date_required), specifications: ws(l.specifications),
      });
    }
  }

  for (const l of poLines) {
    const owner = poOwner.get(l.order_id[0]);
    if (!owner) continue;
    rows.proc_po_lines.push({
      odoo_id: l.id, po_no: l.order_id[1], pr_odoo_id: owner.prId, pr_no: owner.prNo, requester: owner.who,
      vendor: partner(l.partner_id), product: ref(l.product_id), item: ws(l.name).slice(0, 500), qty: l.product_qty || 0,
      uom: ref(l.product_uom), unit_price: l.price_unit || 0, subtotal: l.price_subtotal || 0,
      currency: ref(l.currency_id), order_date: day(l.date_order), po_state: l.state || '',
    });
  }

  if (quotes) {
    for (const q of quotes.quotes) {
      rows.proc_quotes.push({
        id: q.quote_id, pr_no: q.pr, requester: q.person, file_path: q.file, doc_type: q.doc_type || '',
        vendor: ws(q.vendor), vendor_group: ws(q.vendor_group || q.vendor), quote_no: q.quote_no, quote_date: day(q.date),
        customer: q.customer, currency: ws(q.currency), subtotal: num(q.subtotal), discount: num(q.discount),
        vat: num(q.vat), total: num(q.total), notes: q.notes, n_items: q.n_items || 0, duplicate_file: !!q.duplicate_file,
        price_basis: basis(q.price_basis),
      });
    }
    quotes.items.forEach((it, i) => {
      rows.proc_quote_items.push({
        id: i + 1, quote_id: it.quote_id, pr_no: it.pr, vendor_group: ws(it.vendor_group || it.vendor),
        quote_date: day(it.date), name: ws(it.name), spec: ws(it.spec) || null, qty: num(it.qty),
        unit: ws(it.unit) || null, unit_price: num(it.unit_price), amount: num(it.amount),
        duplicate_file: !!it.duplicate_file, check_note: it.check || '',
      });
    });
  }
  return rows;
}

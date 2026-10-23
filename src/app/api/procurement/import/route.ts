import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, apiError } from '@/lib/toolsSession';
import { requireProcurementImporter, spendImportTicket } from '@/lib/procurement/access';
import { fetchAll, invalidateDataset } from '@/lib/procurement/data';
import { PROC_KEY, PROC_TABLES, type ProcTable } from '@/lib/procurement/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COLUMNS: Record<ProcTable, string[]> = {
  proc_pr: ['odoo_id', 'pr_no', 'requester', 'request_date', 'company', 'operating_unit', 'request_type', 'state', 'title', 'description', 'estimated_cost', 'po_amount', 'po_count', 'po_list', 'vendors', 'n_lines', 'n_attachments', 'drive_folder_id'],
  proc_pr_lines: ['odoo_id', 'pr_odoo_id', 'pr_no', 'name', 'product', 'qty', 'uom', 'est_unit_price', 'analytic_account', 'date_required', 'specifications'],
  proc_po_lines: ['odoo_id', 'po_no', 'pr_odoo_id', 'pr_no', 'requester', 'vendor', 'product', 'item', 'qty', 'uom', 'unit_price', 'subtotal', 'currency', 'order_date', 'po_state'],
  proc_quotes: ['id', 'pr_no', 'requester', 'file_path', 'doc_type', 'vendor', 'vendor_group', 'quote_no', 'quote_date', 'customer', 'currency', 'subtotal', 'discount', 'vat', 'total', 'notes', 'n_items', 'duplicate_file'],
  proc_quote_items: ['id', 'quote_id', 'pr_no', 'vendor_group', 'quote_date', 'name', 'spec', 'qty', 'unit', 'unit_price', 'amount', 'duplicate_file', 'check_note'],
};
const MAX_ROWS = 1000;
/** A new snapshot may remove at most this share of a table's rows (a partial Odoo pull must not wipe data). */
const MAX_SHRINK = 0.1;
const MIN_ROWS_FOR_GUARD = 50;
const LABEL: Record<ProcTable, string> = {
  proc_pr: 'PR', proc_pr_lines: 'รายการใน PR', proc_po_lines: 'รายการใน PO', proc_quotes: 'ใบเสนอราคา', proc_quote_items: 'รายการในใบเสนอราคา',
};

const isTable = (t: unknown): t is ProcTable => typeof t === 'string' && (PROC_TABLES as string[]).includes(t);
const bad = (msg: string) => new AccessError(msg, 400);

function cleanRows(table: ProcTable, rows: unknown) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS) throw bad(`ส่งได้ครั้งละ 1–${MAX_ROWS} แถว`);
  const cols = COLUMNS[table];
  const key = PROC_KEY[table];
  return rows.map(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw bad('รูปแบบแถวข้อมูลไม่ถูกต้อง');
    const row = r as Record<string, unknown>;
    if (!Number.isSafeInteger(row[key])) throw bad(`แถวข้อมูลไม่มี ${key}`);
    const extra = Object.keys(row).filter(k => !cols.includes(k));
    if (extra.length) throw bad(`คอลัมน์ไม่รู้จัก: ${extra.slice(0, 3).join(', ')}`);
    return row;
  });
}

// Body: { action: 'upsert', table, rows }  — parents first (proc_pr, proc_quotes before their lines)
//       { action: 'finalize', keys: { [table]: number[] }, source, allow_shrink? } — removes rows not in the new snapshot.
//       Finalize refuses (409) to remove more than 10% of a table; only an admin session can confirm with allow_shrink,
//       a sync ticket never can — the scheduled job then stops and reports instead of deleting data.
export async function POST(request: NextRequest) {
  try {
    const actor = await requireProcurementImporter(request);
    const body = (await request.json()) as Record<string, unknown>;
    const db = getSupabaseServer();

    if (body.action === 'upsert') {
      if (!isTable(body.table)) throw bad('ตารางไม่ถูกต้อง');
      const rows = cleanRows(body.table, body.rows);
      const { error } = await db.from(body.table).upsert(rows, { onConflict: PROC_KEY[body.table] });
      if (error) throw error;
      return NextResponse.json({ ok: true, upserted: rows.length });
    }

    if (body.action === 'finalize') {
      const keys = body.keys as Record<string, unknown> | undefined;
      if (!keys || typeof keys !== 'object') throw bad('ไม่มีรายการคีย์');
      const tables = Object.keys(keys);
      if (!tables.length || !tables.every(isTable)) throw bad('ตารางไม่ถูกต้อง');
      const deleted: Record<string, number> = {};
      const counts: Record<string, number> = {};
      const allowShrink = body.allow_shrink === true && !actor.ticketId;
      // 1) work out what would be removed from every table, children before parents
      const plan: { table: ProcTable; key: 'odoo_id' | 'id'; stale: number[]; keep: number }[] = [];
      for (const table of [...PROC_TABLES].reverse().filter(t => tables.includes(t))) {
        const list = keys[table];
        if (!Array.isArray(list) || !list.every(Number.isSafeInteger)) throw bad(`คีย์ของ ${table} ไม่ถูกต้อง`);
        if (!list.length) throw bad(`ชุดข้อมูลใหม่ของ ${table} ว่าง — ยกเลิกเพื่อไม่ให้ลบข้อมูลทั้งหมด`);
        const keep = new Set(list as number[]);
        const key = PROC_KEY[table];
        const existing = await fetchAll<Record<string, number>>(table, key, key);
        const stale = existing.map(r => r[key]).filter(k => !keep.has(k));
        if (!allowShrink && existing.length >= MIN_ROWS_FOR_GUARD && stale.length > existing.length * MAX_SHRINK) {
          throw new AccessError(
            `ชุดข้อมูลใหม่จะลบ${LABEL[table]} ${stale.length.toLocaleString('th-TH')} จาก ${existing.length.toLocaleString('th-TH')} แถว (เกิน ${MAX_SHRINK * 100}%) — หยุดไว้ก่อนเพื่อป้องกันข้อมูลหาย`
            + (actor.ticketId ? ' ให้ผู้ดูแลระบบตรวจไฟล์แล้วนำเข้าผ่านหน้า "นำเข้าข้อมูล"' : ''),
            409,
          );
        }
        plan.push({ table, key, stale, keep: keep.size });
      }
      // 2) only then delete
      for (const { table, key, stale, keep } of plan) {
        for (let i = 0; i < stale.length; i += 200) {
          const { error } = await db.from(table).delete().in(key, stale.slice(i, i + 200));
          if (error) throw error;
        }
        deleted[table] = stale.length;
        counts[table] = keep;
      }
      const source = typeof body.source === 'string' ? body.source.slice(0, 200) : 'import';
      const { error } = await db.from('proc_sync_runs').insert({ source, counts, imported_by: actor.name });
      if (error) throw error;
      await spendImportTicket(actor.ticketId);
      invalidateDataset();
      return NextResponse.json({ ok: true, deleted, counts });
    }

    throw bad('action ไม่ถูกต้อง');
  } catch (error) {
    return apiError(error);
  }
}

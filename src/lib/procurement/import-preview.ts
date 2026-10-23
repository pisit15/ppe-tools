import { normalizeSync } from './normalize';
import { importTables } from './payload';
import { PROC_KEY, type ProcRows, type RawPoLine, type RawQuotes, type RawSync } from './types';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const parse = (text: string) => JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
const labels = { proc_pr: 'PR', proc_pr_lines: 'รายการใน PR', proc_po_lines: 'รายการใน PO', proc_quotes: 'ใบเสนอราคา', proc_quote_items: 'รายการในใบเสนอราคา' };

/** Validate before writing. The finalize API refuses empty tables, so reject them before any upsert. */
export function previewImport(syncText: string, poText: string, quoteText: string | null): { rows: ProcRows; hasQuotes: boolean } {
  const sync = parse(syncText);
  const po = parse(poText);
  const quotes = quoteText === null ? null : parse(quoteText);
  if (!record(sync) || !Object.keys(sync).length || !Object.values(sync).every(value =>
    record(value) && ['prs', 'lines', 'att', 'pos'].every(key => Array.isArray(value[key])))) {
    throw new Error('ไฟล์ PR ต้องมีข้อมูลผู้เปิด PR พร้อมรายการ prs, lines, att และ pos ครบถ้วน');
  }
  if (!Array.isArray(po)) throw new Error('ไฟล์ PO ต้องเป็นรายการข้อมูล');
  if (quoteText !== null && (!record(quotes) || !Array.isArray(quotes.quotes) || !Array.isArray(quotes.items))) {
    throw new Error('ไฟล์ใบเสนอราคาต้องมีทั้ง quotes และ items');
  }
  let rows: ProcRows;
  try { rows = normalizeSync(sync as RawSync, po as RawPoLine[], quotes as RawQuotes | null); }
  catch { throw new Error('รายละเอียดในไฟล์ไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาใช้ไฟล์ส่งออกจากระบบซิงก์'); }
  const hasQuotes = quoteText !== null;
  for (const table of importTables(hasQuotes)) {
    const list = rows[table] as unknown as Record<string, unknown>[];
    if (!list.length) throw new Error(`ชุดข้อมูล${labels[table]}ว่าง ระบบจะไม่เริ่มนำเข้าเพื่อป้องกันการแทนที่ด้วยข้อมูลไม่ครบ`);
    const keys = list.map(row => row[PROC_KEY[table]]);
    if (!keys.every(Number.isSafeInteger)) throw new Error(`พบรหัสรายการไม่ถูกต้องใน${labels[table]}`);
    if (new Set(keys).size !== keys.length) throw new Error(`พบรหัสรายการซ้ำใน${labels[table]} กรุณาตรวจไฟล์ก่อนนำเข้า`);
    if (list.some(row => Object.values(row).some(value => typeof value === 'number' && !Number.isFinite(value)))) {
      throw new Error(`พบค่าตัวเลขไม่ถูกต้องใน${labels[table]}`);
    }
  }
  const prIds = new Set(rows.proc_pr.map(row => row.odoo_id));
  if ([...rows.proc_pr_lines, ...rows.proc_po_lines].some(row => !prIds.has(row.pr_odoo_id))) {
    throw new Error('มีรายการที่อ้างถึง PR ซึ่งไม่อยู่ในไฟล์ กรุณาตรวจความครบถ้วนของชุดข้อมูล');
  }
  const quoteIds = new Set(rows.proc_quotes.map(row => row.id));
  if (rows.proc_quote_items.some(row => !quoteIds.has(row.quote_id))) {
    throw new Error('มีรายการที่อ้างถึงใบเสนอราคาซึ่งไม่อยู่ในไฟล์ กรุณาตรวจความครบถ้วนของชุดข้อมูล');
  }
  return { rows, hasQuotes };
}

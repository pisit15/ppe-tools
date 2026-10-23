// Spend categories, read from the Odoo product code on each PO line ("[OF02-Site] ค่ายามรักษาความปลอดภัย - Site").
// Labels use Odoo's own product names so every number can be traced back to Odoo.
// Pure (no I/O): shared by API routes, pages and tests.

export type SpendCat = 'guard' | 'waste' | 'safety' | 'hire' | 'goods' | 'training' | 'consult' | 'maint' | 'other';

export const SPEND_CATS: { id: SpendCat; label: string; codes: string }[] = [
  { id: 'guard', label: 'ค่ายามรักษาความปลอดภัย', codes: 'OF02' },
  { id: 'waste', label: 'ค่าบริการจัดการของเสีย', codes: 'OT06' },
  { id: 'safety', label: 'ค่าใช้จ่ายเกี่ยวกับ Safety', codes: 'OT42 (รวมค่าตรวจวัด)' },
  { id: 'hire', label: 'ค่าจ้างอื่น ๆ', codes: 'OT03' },
  { id: 'goods', label: 'สินค้า Safety / PPE', codes: 'รหัสสินค้า 05-S…, 07-S…' },
  { id: 'training', label: 'ค่าอบรมสัมมนา', codes: 'HR' },
  { id: 'consult', label: 'ค่าที่ปรึกษา', codes: 'OT08' },
  { id: 'maint', label: 'ซ่อมบำรุง / สอบเทียบ', codes: 'MA' },
  { id: 'other', label: 'อื่น ๆ', codes: 'รหัสอื่น หรือไม่มีรหัสสินค้า' },
];
export const SPEND_CAT_LABEL = Object.fromEntries(SPEND_CATS.map(c => [c.id, c.label])) as Record<SpendCat, string>;
export const isSpendCat = (v: string | null | undefined): v is SpendCat => !!v && SPEND_CATS.some(c => c.id === v);

export const productCode = (product: string) => /^\[([^\]]+)\]/.exec(product.trim())?.[1] ?? '';

/** Category of one PO line; null for note and discount lines, which take their PO's main category. */
export function lineCategory(product: string | null | undefined): SpendCat | null {
  const p = (product ?? '').trim();
  if (!p || /discount/i.test(p)) return null;
  const c = productCode(p).toUpperCase();
  if (/^D\b/.test(c)) return null;
  if (c.startsWith('OF02')) return 'guard';
  if (c.startsWith('OT06')) return 'waste';
  if (c.startsWith('OT42')) return 'safety';
  if (c.startsWith('OT03')) return 'hire';
  if (c.startsWith('OT08')) return 'consult';
  if (c.startsWith('HR')) return 'training';
  if (c.startsWith('MA')) return 'maint';
  if (/^\d\d-S/.test(c)) return 'goods';
  return 'other';
}

/** Category for every PO line id: its own, or (note/discount lines) the category with the most money on the same PO. */
export function categorizePoLines(lines: { odoo_id: number; po_no: string; product: string; subtotal: number }[]) {
  const own = new Map<number, SpendCat | null>();
  const perPo = new Map<string, Map<SpendCat, number>>();
  for (const l of lines) {
    const c = lineCategory(l.product);
    own.set(l.odoo_id, c);
    if (!c) continue;
    const m = perPo.get(l.po_no) ?? new Map<SpendCat, number>();
    m.set(c, (m.get(c) || 0) + Math.abs(Number(l.subtotal) || 0) + 1e-9); // +epsilon: zero-value lines still count
    perPo.set(l.po_no, m);
  }
  const main = new Map<string, SpendCat>();
  for (const [po, m] of perPo) main.set(po, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  const out = new Map<number, SpendCat>();
  for (const l of lines) out.set(l.odoo_id, own.get(l.odoo_id) ?? main.get(l.po_no) ?? 'other');
  return out;
}

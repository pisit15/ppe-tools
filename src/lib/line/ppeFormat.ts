// PPE stock replies for the LINE bot. Pure, so it can be unit-tested.
// "Low" and "out" follow /api/ppe/stock: low = min_stock > 0 && current < min_stock,
// out = current <= 0.

export type StockRow = {
  company_id: string;
  name: string;
  type?: string | null;
  unit?: string | null;
  min_stock?: number | null;
  current_stock?: number | null;
};

const cur = (r: StockRow) => Number(r.current_stock ?? 0);
const min = (r: StockRow) => Number(r.min_stock ?? 0);
export const isLow = (r: StockRow) => min(r) > 0 && cur(r) < min(r);
export const isOut = (r: StockRow) => cur(r) <= 0;

const fmt = (n: number) => n.toLocaleString('en-US');
const line = (r: StockRow) =>
  `• ${r.name}: ${fmt(cur(r))}${r.unit ? ` ${r.unit}` : ''}${min(r) > 0 ? ` (ขั้นต่ำ ${fmt(min(r))})` : ''}`;

// Fill ratio, lowest first; out-of-stock items sort to the top.
const byUrgency = (a: StockRow, b: StockRow) => {
  const ra = min(a) > 0 ? cur(a) / min(a) : cur(a) <= 0 ? -1 : Infinity;
  const rb = min(b) > 0 ? cur(b) / min(b) : cur(b) <= 0 ? -1 : Infinity;
  return ra - rb || a.name.localeCompare(b.name, 'th');
};

const MAX_LINES = 25;
const more = (n: number) => (n > MAX_LINES ? [`…และอีก ${fmt(n - MAX_LINES)} รายการ ดูทั้งหมดที่ tools.eashe.org/ppe`] : []);

export function formatSummary(rows: StockRow[], companyName: string): string {
  if (rows.length === 0) return `PPE ${companyName}\nยังไม่มีรายการ PPE`;
  const low = rows.filter(isLow);
  const out = rows.filter(isOut);
  const urgent = rows.filter(r => isLow(r) || isOut(r)).sort(byUrgency);
  return [
    `สรุป PPE คงเหลือ ${companyName}`,
    `ทั้งหมด ${fmt(rows.length)} รายการ · หมด ${fmt(out.length)} · ต่ำกว่าขั้นต่ำ ${fmt(low.length)}`,
    ...(urgent.length
      ? ['', 'ต้องดูก่อน (เรียงจากน้อยสุด)', ...urgent.slice(0, MAX_LINES).map(line), ...more(urgent.length)]
      : ['', 'ไม่มีรายการที่หมดหรือต่ำกว่าขั้นต่ำ']),
  ].join('\n');
}

export function formatLow(rows: StockRow[], companyName: string): string {
  const low = rows.filter(isLow).sort(byUrgency);
  if (low.length === 0) return `PPE ใกล้หมด ${companyName}\nไม่มีรายการที่ต่ำกว่าจุดสั่งขั้นต่ำ`;
  return [`PPE ต่ำกว่าขั้นต่ำ ${companyName} (${fmt(low.length)} รายการ)`, '', ...low.slice(0, MAX_LINES).map(line), ...more(low.length)].join('\n');
}

export function formatSearch(rows: StockRow[], query: string, companyName: string): string {
  const q = query.toLowerCase();
  const hits = rows.filter(r => `${r.name} ${r.type ?? ''}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  if (hits.length === 0) return `ไม่พบ PPE ที่ตรงกับ "${query}" ใน ${companyName}\nพิมพ์ "เมนู" เพื่อดูคำสั่งทั้งหมด`;
  return [`ผลค้นหา "${query}" ${companyName} (${fmt(hits.length)} รายการ)`, '', ...hits.slice(0, MAX_LINES).map(line), ...more(hits.length)].join('\n');
}

/** Admin overview: one line per company. */
export function formatCompanyOverview(rows: StockRow[], names: Record<string, string>): string {
  const by = new Map<string, StockRow[]>();
  for (const r of rows) by.set(r.company_id, [...(by.get(r.company_id) || []), r]);
  const ids = [...by.keys()].sort((a, b) => (names[a] || a).localeCompare(names[b] || b, 'th'));
  return [
    'สรุป PPE ทุกบริษัท',
    'บริษัท (รหัส): รายการ / หมด / ต่ำ',
    ...ids.map(id => {
      const rs = by.get(id) || [];
      return `• ${names[id] || id} (${id}): ${fmt(rs.length)} / ${fmt(rs.filter(isOut).length)} / ${fmt(rs.filter(isLow).length)}`;
    }),
    '',
    'ดูรายละเอียดบริษัท พิมพ์ เช่น "PPE ใกล้หมด amt"',
  ].join('\n');
}

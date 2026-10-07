// Browse PPE by category → item list → item detail, driven by postback buttons.
// Pure (no I/O). Postback data is re-authorized in bot.ts; never trust it here.
import { PPE_TYPES, TRANSACTION_TYPES } from '../constants';
import { isLow, isOut, type StockRow } from './ppeFormat';
import { C, SITE, bar, flex, fmt, header, pill, status, unitLabel, type Json, type LineMessage } from './flex';

export const PAGE_ROWS = 12; // names per bubble
export const PAGE_BUBBLES = 3; // bubbles per carousel page

export type Postback =
  | { a: 'cats'; c: string }
  | { a: 'list'; c: string; t: string; p: number }
  | { a: 'item'; c: string; id: string };

export function encodePostback(p: Postback): string {
  return new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString();
}

const SAFE = /^[a-z0-9_-]{1,40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodePostback(data: string): Postback | null {
  const q = new URLSearchParams(data);
  const a = q.get('a');
  const c = q.get('c') || '';
  if (!SAFE.test(c)) return null;
  if (a === 'cats') return { a, c };
  if (a === 'list') {
    const t = q.get('t') || '';
    const p = Number(q.get('p') || 0);
    if (!SAFE.test(t) || !Number.isInteger(p) || p < 0 || p > 50) return null;
    return { a, c, t, p };
  }
  if (a === 'item') {
    const id = q.get('id') || '';
    return UUID.test(id) ? { a, c, id } : null;
  }
  return null;
}

const typeInfo = (t?: string | null) => PPE_TYPES.find(x => x.value === t) || { value: t || 'others', label: t || 'อื่น ๆ', icon: '📦' };

function postbackAction(label: string, p: Postback, displayText: string): Json {
  return { type: 'postback', label: label.slice(0, 20), data: encodePostback(p), displayText: displayText.slice(0, 300) };
}

const byName = (a: StockRow, b: StockRow) => a.name.localeCompare(b.name, 'th');

/** Step 1: categories with counts. */
export function categoryCard(rows: StockRow[], companyId: string, companyName: string): LineMessage {
  const groups = new Map<string, StockRow[]>();
  for (const r of rows) {
    const t = typeInfo(r.type).value;
    groups.set(t, [...(groups.get(t) || []), r]);
  }
  const order = PPE_TYPES.map(t => t.value);
  const types = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));

  const body: Json[] = rows.length
    ? [
        { type: 'text', text: `${fmt(rows.length)} รายการ · แตะหมวดเพื่อดูชื่อ PPE`, size: 'xs', color: C.faint },
        ...types.map(t => {
          const rs = groups.get(t) || [];
          const info = typeInfo(t);
          const out = rs.filter(isOut).length;
          const low = rs.filter(isLow).length;
          return {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            paddingAll: '10px',
            backgroundColor: '#F7F9FC',
            cornerRadius: '8px',
            spacing: 'sm',
            alignItems: 'center',
            action: postbackAction(info.label, { a: 'list', c: companyId, t, p: 0 }, `รายการ ${info.label}`),
            contents: [
              { type: 'text', text: info.icon, size: 'lg', flex: 0 },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                contents: [
                  { type: 'text', text: info.label, size: 'sm', weight: 'bold', color: C.text },
                  { type: 'text', text: `${fmt(rs.length)} รายการ`, size: 'xxs', color: C.faint },
                ],
              },
              ...(out ? [pill(`หมด ${fmt(out)}`, C.danger, C.dangerBg)] : []),
              ...(low - out > 0 ? [pill(`ต่ำ ${fmt(low - out)}`, C.warn, C.warnBg)] : []),
              { type: 'text', text: '›', size: 'lg', color: C.faint, flex: 0 },
            ],
          } as Json;
        }),
      ]
    : [{ type: 'text', text: 'ยังไม่มีรายการ PPE', size: 'sm', color: C.sub }];

  return flex(`รายการ PPE ${companyName}: ${rows.length} รายการ`, {
    type: 'bubble',
    size: 'mega',
    header: header('รายการ PPE', companyName, C.primary),
    body: { type: 'box', layout: 'vertical', contents: body },
  });
}

function nameRow(r: StockRow, companyId: string): Json {
  const s = status(r);
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    paddingTop: '10px',
    paddingBottom: '10px',
    alignItems: 'center',
    action: r.product_id ? postbackAction('ดูยอด', { a: 'item', c: companyId, id: r.product_id }, r.name) : { type: 'message', label: 'ค้นหา', text: `ค้นหา ${r.name.slice(0, 40)}` },
    contents: [
      { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: s.color, contents: [] },
      { type: 'text', text: r.name, size: 'sm', color: C.text, wrap: true, maxLines: 2, flex: 1 },
      { type: 'text', text: '›', size: 'md', color: C.faint, flex: 0 },
    ],
  };
}

/** Step 2: item names in a category, paged as a carousel. */
export function listCarousel(rows: StockRow[], companyId: string, companyName: string, type: string, page: number): LineMessage {
  const info = typeInfo(type);
  const items = rows.filter(r => typeInfo(r.type).value === info.value).sort(byName);
  const perPage = PAGE_ROWS * PAGE_BUBBLES;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(page, pages - 1);
  const slice = items.slice(p * perPage, (p + 1) * perPage);

  const bubbles: Json[] = [];
  for (let i = 0; i < slice.length; i += PAGE_ROWS) {
    const chunk = slice.slice(i, i + PAGE_ROWS);
    const from = p * perPage + i + 1;
    bubbles.push({
      type: 'bubble',
      size: 'mega',
      header: header(`${info.icon} ${info.label} · ${companyName}`, `รายการที่ ${fmt(from)}–${fmt(from + chunk.length - 1)} จาก ${fmt(items.length)}`, C.primary),
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'แตะชื่อเพื่อดูยอดคงเหลือ · ● แดง=หมด ส้ม=ต่ำ เขียว=ปกติ', size: 'xxs', color: C.faint, wrap: true },
          ...chunk.flatMap((r, k) => (k === 0 ? [nameRow(r, companyId)] : [{ type: 'separator' } as Json, nameRow(r, companyId)])),
        ],
      },
    });
  }

  const nav: Json[] = [];
  if (p + 1 < pages) nav.push({ type: 'button', style: 'primary', color: C.primary, height: 'sm', action: postbackAction('หน้าถัดไป', { a: 'list', c: companyId, t: info.value, p: p + 1 }, `${info.label} หน้า ${p + 2}`) });
  if (p > 0) nav.push({ type: 'button', style: 'secondary', height: 'sm', action: postbackAction('หน้าก่อน', { a: 'list', c: companyId, t: info.value, p: p - 1 }, `${info.label} หน้า ${p}`) });
  nav.push({ type: 'button', style: 'link', height: 'sm', action: postbackAction('กลับไปหมวด', { a: 'cats', c: companyId }, 'รายการ PPE') });

  if (bubbles.length === 0) {
    bubbles.push({ type: 'bubble', size: 'mega', header: header(info.label, companyName, C.primary), body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'ไม่มีรายการในหมวดนี้', size: 'sm', color: C.sub }] } });
  }
  // Navigation sits in the footer of the last bubble.
  const last = bubbles[bubbles.length - 1] as { [k: string]: Json };
  last.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'text', text: `หน้า ${p + 1} / ${pages}`, size: 'xxs', color: C.faint, align: 'center' }, ...nav] };

  return flex(`${info.label} ${companyName}: ${items.length} รายการ (หน้า ${p + 1}/${pages})`, { type: 'carousel', contents: bubbles });
}

export type LastMove = { transaction_type: string; quantity: number; transaction_date: string } | null;

const thaiDate = (d: string) => {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
};

function infoRow(label: string, value: string, color: string = C.text): Json {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      { type: 'text', text: label, size: 'sm', color: C.sub, flex: 2 },
      { type: 'text', text: value, size: 'sm', color, weight: 'bold', align: 'end', flex: 3, wrap: true },
    ],
  };
}

/** Step 3: one item's stock. */
export function itemCard(r: StockRow, companyId: string, companyName: string, last: LastMove): LineMessage {
  const s = status(r);
  const info = typeInfo(r.type);
  const unit = unitLabel(r.unit);
  const cur = Number(r.current_stock ?? 0);
  const min = Number(r.min_stock ?? 0);
  const move = last ? TRANSACTION_TYPES.find(t => t.value === last.transaction_type)?.label || last.transaction_type : '';

  return flex(`${r.name}: คงเหลือ ${fmt(cur)} ${unit}`, {
    type: 'bubble',
    size: 'mega',
    header: header(`${info.icon} ${info.label} · ${companyName}`, r.name, s.color),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'flex-end',
          contents: [
            { type: 'text', text: fmt(cur), size: '3xl', weight: 'bold', color: s.color, flex: 0 },
            { type: 'text', text: unit || ' ', size: 'sm', color: C.sub, margin: 'sm', flex: 1, gravity: 'bottom' },
            pill(s.label, s.color, s.bg),
          ],
        },
        { type: 'text', text: 'คงเหลือ', size: 'xs', color: C.faint },
        ...(min > 0 ? [bar(r, s.color)] : []),
        { type: 'separator', margin: 'lg' },
        infoRow('จุดสั่งขั้นต่ำ', min > 0 ? `${fmt(min)} ${unit}` : 'ไม่ได้ตั้ง'),
        infoRow('รับเข้าทั้งหมด', `${fmt(Number(r.total_in ?? 0))} ${unit}`),
        infoRow('เบิกออกทั้งหมด', `${fmt(Number(r.total_out ?? 0))} ${unit}`),
        infoRow('เคลื่อนไหวล่าสุด', last ? `${move} ${fmt(last.quantity)} · ${thaiDate(last.transaction_date)}` : 'ยังไม่มีรายการ', C.sub),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`กลับไป${info.label}`, { a: 'list', c: companyId, t: info.value, p: 0 }, `รายการ ${info.label}`) },
        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดในระบบ', uri: SITE } },
      ],
    },
  });
}

/** Admin step 0: pick a company, then browse its categories. */
export function companyPickerCard(rows: StockRow[], names: Record<string, string>): LineMessage {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.company_id, (counts.get(r.company_id) || 0) + 1);
  const ids = [...counts.keys()].sort((a, b) => (names[a] || a).localeCompare(names[b] || b, 'th'));
  return flex('เลือกบริษัทเพื่อดูรายการ PPE', {
    type: 'bubble',
    size: 'mega',
    header: header('รายการ PPE', 'เลือกบริษัท', C.primary),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: ids.slice(0, 24).map(
        (id, i) =>
          ({
            type: 'box',
            layout: 'horizontal',
            margin: i ? 'md' : 'none',
            action: postbackAction(id, { a: 'cats', c: id }, `รายการ PPE ${names[id] || id}`),
            contents: [
              { type: 'text', text: names[id] || id, size: 'sm', color: C.text, flex: 1 },
              { type: 'text', text: `${fmt(counts.get(id) || 0)} รายการ ›`, size: 'xs', color: C.faint, align: 'end', flex: 0 },
            ],
          }) as Json,
      ),
    },
  });
}

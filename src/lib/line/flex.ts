// LINE Flex Message cards for PPE replies. Pure (no I/O), so it can be unit-tested.
// Low/out rules come from ppeFormat (same as /api/ppe/stock).
import { isLow, isOut, type StockRow } from './ppeFormat';
import { UNIT_TYPES } from '../constants';

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type LineMessage = { [k: string]: Json };

export const C = {
  primary: '#4E79A7',
  warn: '#F28E2B',
  danger: '#E15759',
  ok: '#59A14F',
  text: '#333333',
  sub: '#666666',
  faint: '#999999',
  track: '#EEEEEE',
  dangerBg: '#FDECEC',
  warnBg: '#FEF3E8',
  okBg: '#EEF6EC',
};

export const SITE = 'https://tools.eashe.org/ppe';
const MAX_ROWS = 10;
export const fmt = (n: number) => n.toLocaleString('en-US');
/** Thai unit label (piece → ชิ้น); unknown units pass through. */
export const unitLabel = (u?: string | null) => (u ? UNIT_TYPES.find(t => t.value === u)?.label || u : '');
const cur = (r: StockRow) => Number(r.current_stock ?? 0);
const min = (r: StockRow) => Number(r.min_stock ?? 0);

export const QUICK_REPLY: Json = {
  items: [
    ['รายการ PPE', 'รายการ PPE'],
    ['PPE คงเหลือ', 'PPE คงเหลือ'],
    ['PPE ใกล้หมด', 'PPE ใกล้หมด'],
    ['สถิติอุบัติเหตุ', 'สถิติอุบัติเหตุ'],
    ['การจัดการขยะ', 'การจัดการขยะ'],
    ['ค้นหากฎหมาย', 'ค้นหากฎหมาย'],
    ['เมนู', 'เมนู'],
  ].map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text } })),
};

export const text = (t: string): LineMessage => ({ type: 'text', text: t.length > 5000 ? `${t.slice(0, 4998)}…` : t });

export function status(r: StockRow): { label: string; color: string; bg: string } {
  if (isOut(r)) return { label: 'หมด', color: C.danger, bg: C.dangerBg };
  if (isLow(r)) return { label: 'ต่ำ', color: C.warn, bg: C.warnBg };
  return { label: 'ปกติ', color: C.ok, bg: C.okBg };
}

export function pill(label: string, color: string, bg: string): Json {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    backgroundColor: bg,
    cornerRadius: '10px',
    paddingStart: '8px',
    paddingEnd: '8px',
    paddingTop: '2px',
    paddingBottom: '2px',
    contents: [{ type: 'text', text: label, size: 'xxs', color, weight: 'bold' }],
  };
}

// Stock vs minimum as a bar; full when at or above the minimum.
export function bar(r: StockRow, color: string): Json {
  const pct = min(r) > 0 ? Math.max(0, Math.min(100, Math.round((cur(r) / min(r)) * 100))) : cur(r) > 0 ? 100 : 0;
  return {
    type: 'box',
    layout: 'vertical',
    height: '4px',
    backgroundColor: C.track,
    cornerRadius: '2px',
    margin: 'sm',
    contents:
      pct > 0
        ? [{ type: 'box', layout: 'vertical', width: `${pct}%`, height: '4px', backgroundColor: color, cornerRadius: '2px', contents: [] }]
        : [],
  };
}

function itemRow(r: StockRow, tag?: string): Json {
  const s = status(r);
  const unit = r.unit ? ` ${unitLabel(r.unit)}` : '';
  const qty = min(r) > 0 ? `${fmt(cur(r))} / ${fmt(min(r))}${unit}` : `${fmt(cur(r))}${unit}`;
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'text', text: r.name, size: 'sm', color: C.text, wrap: true, maxLines: 2, flex: 1 },
          pill(s.label, s.color, s.bg),
        ],
      },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: min(r) > 0 ? `คงเหลือ / ขั้นต่ำ` : 'คงเหลือ', size: 'xxs', color: C.faint, flex: 1 },
          { type: 'text', text: qty, size: 'xs', color: s.color, weight: 'bold', align: 'end', flex: 0 },
        ],
      },
      ...(tag ? [{ type: 'text', text: tag, size: 'xxs', color: C.faint }] as Json[] : []),
      bar(r, s.color),
    ],
  };
}

function kpi(label: string, value: number, color: string): Json {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    alignItems: 'center',
    contents: [
      { type: 'text', text: fmt(value), size: 'xl', weight: 'bold', color },
      { type: 'text', text: label, size: 'xxs', color: C.sub },
    ],
  };
}

export function header(kicker: string, title: string, color: string): Json {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: color,
    paddingAll: '16px',
    contents: [
      { type: 'text', text: kicker, size: 'xs', color: '#FFFFFFCC' },
      { type: 'text', text: title, size: 'lg', weight: 'bold', color: '#FFFFFF', wrap: true, maxLines: 2 },
    ],
  };
}

function footer(extra: number): Json {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: [
      ...(extra > 0 ? [{ type: 'text', text: `และอีก ${fmt(extra)} รายการในระบบ`, size: 'xs', color: C.faint, align: 'center' }] as Json[] : []),
      { type: 'button', style: 'primary', color: C.primary, height: 'sm', action: { type: 'uri', label: 'ดูทั้งหมดในระบบ', uri: SITE } },
    ],
  };
}

function bubble(head: Json, body: Json[], foot: Json): Json {
  return { type: 'bubble', size: 'mega', header: head, body: { type: 'box', layout: 'vertical', contents: body }, footer: foot };
}

export function flex(altText: string, contents: Json): LineMessage {
  return { type: 'flex', altText: altText.slice(0, 400), contents };
}

// Fill ratio, lowest first; out-of-stock first.
const byUrgency = (a: StockRow, b: StockRow) => {
  const ra = min(a) > 0 ? cur(a) / min(a) : cur(a) <= 0 ? -1 : Infinity;
  const rb = min(b) > 0 ? cur(b) / min(b) : cur(b) <= 0 ? -1 : Infinity;
  return ra - rb || a.name.localeCompare(b.name, 'th');
};

const sectionTitle = (t: string): Json => ({ type: 'text', text: t, size: 'sm', weight: 'bold', color: C.text, margin: 'xl' });

export function summaryCard(rows: StockRow[], companyName: string): LineMessage {
  const out = rows.filter(isOut);
  const low = rows.filter(isLow);
  const urgent = rows.filter(r => isOut(r) || isLow(r)).sort(byUrgency);
  const body: Json[] = [
    { type: 'box', layout: 'horizontal', contents: [kpi('รายการทั้งหมด', rows.length, C.primary), kpi('หมด', out.length, C.danger), kpi('ต่ำกว่าขั้นต่ำ', low.length, C.warn)] },
    { type: 'separator', margin: 'lg' },
  ];
  if (rows.length === 0) body.push({ type: 'text', text: 'ยังไม่มีรายการ PPE', size: 'sm', color: C.sub, margin: 'lg' });
  else if (urgent.length === 0) body.push({ type: 'text', text: 'ไม่มีรายการที่หมดหรือต่ำกว่าขั้นต่ำ 👍', size: 'sm', color: C.ok, margin: 'lg', wrap: true });
  else body.push(sectionTitle('ต้องดูก่อน'), ...urgent.slice(0, MAX_ROWS).map(r => itemRow(r)));
  return flex(
    `PPE ${companyName}: ทั้งหมด ${rows.length} · หมด ${out.length} · ต่ำ ${low.length}`,
    bubble(header('สรุป PPE คงเหลือ', companyName, C.primary), body, footer(Math.max(0, urgent.length - MAX_ROWS))),
  );
}

export function lowCard(rows: StockRow[], companyName: string): LineMessage {
  const low = rows.filter(isLow).sort(byUrgency);
  const body: Json[] = low.length
    ? [{ type: 'text', text: `${fmt(low.length)} รายการต่ำกว่าจุดสั่งขั้นต่ำ`, size: 'sm', color: C.sub }, ...low.slice(0, MAX_ROWS).map(r => itemRow(r))]
    : [{ type: 'text', text: 'ไม่มีรายการที่ต่ำกว่าจุดสั่งขั้นต่ำ 👍', size: 'sm', color: C.ok, wrap: true }];
  return flex(
    `PPE ใกล้หมด ${companyName}: ${low.length} รายการ`,
    bubble(header('PPE ใกล้หมด', companyName, C.warn), body, footer(Math.max(0, low.length - MAX_ROWS))),
  );
}

export function searchCard(rows: StockRow[], query: string, scopeName: string, showCompany = false): LineMessage {
  const q = query.toLowerCase();
  const hits = rows.filter(r => `${r.name} ${r.type ?? ''}`.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  if (hits.length === 0) {
    return text(`ไม่พบ PPE ที่ตรงกับ "${query}" ใน ${scopeName}\nลองพิมพ์คำที่สั้นลง หรือกด "เมนู" เพื่อดูคำสั่ง`);
  }
  const body: Json[] = [
    { type: 'text', text: `พบ ${fmt(hits.length)} รายการ`, size: 'sm', color: C.sub },
    ...hits.slice(0, MAX_ROWS).map(r => itemRow(r, showCompany ? `บริษัท ${r.company_id}` : undefined)),
  ];
  return flex(
    `ผลค้นหา "${query}": ${hits.length} รายการ`,
    bubble(header(`ผลค้นหา "${query.slice(0, 30)}"`, scopeName, C.primary), body, footer(Math.max(0, hits.length - MAX_ROWS))),
  );
}

/** Admin: one tappable row per company. */
export function overviewCard(rows: StockRow[], names: Record<string, string>): LineMessage {
  const by = new Map<string, StockRow[]>();
  for (const r of rows) by.set(r.company_id, [...(by.get(r.company_id) || []), r]);
  const ids = [...by.keys()]
    .map(id => ({ id, rs: by.get(id) || [] }))
    .sort((a, b) => b.rs.filter(isLow).length - a.rs.filter(isLow).length || (names[a.id] || a.id).localeCompare(names[b.id] || b.id, 'th'));
  const body: Json[] = [
    { type: 'text', text: 'แตะบริษัทเพื่อดูรายการใกล้หมด', size: 'xs', color: C.faint },
    ...ids.slice(0, 20).map(({ id, rs }) => ({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      spacing: 'sm',
      action: { type: 'message', label: id, text: `PPE ใกล้หมด ${id}` },
      contents: [
        { type: 'text', text: names[id] || id, size: 'sm', color: C.text, flex: 1, wrap: true, maxLines: 1 },
        pill(`หมด ${fmt(rs.filter(isOut).length)}`, C.danger, C.dangerBg),
        pill(`ต่ำ ${fmt(rs.filter(isLow).length)}`, C.warn, C.warnBg),
      ],
    }) as Json),
  ];
  return flex('สรุป PPE ทุกบริษัท', bubble(header('สรุป PPE', 'ทุกบริษัท', C.primary), body, footer(0)));
}

/** Attach the command shortcuts to the last message of a reply. */
export function withQuickReply(messages: LineMessage[]): LineMessage[] {
  if (messages.length === 0) return messages;
  const last = { ...messages[messages.length - 1], quickReply: QUICK_REPLY };
  return [...messages.slice(0, -1), last];
}

/** Plain-text stand-ins used only if LINE rejects a card (keeps the bot from going silent). */
export function textFallback(messages: LineMessage[]): LineMessage[] {
  return messages.map(m => {
    if (m.type !== 'flex') return m;
    const alt = typeof m.altText === 'string' ? m.altText : 'ผลลัพธ์';
    return { ...text(`${alt}\nดูรายละเอียดที่ ${SITE}`), ...(m.quickReply ? { quickReply: m.quickReply } : {}) };
  });
}

const MENU_ITEMS: [string, string, string, string][] = [
  ['🦺', 'รายการ PPE', 'ดูตามหมวด แตะดูยอด', 'รายการ PPE'],
  ['📦', 'PPE คงเหลือ', 'สรุปสต็อก', 'PPE คงเหลือ'],
  ['⚠️', 'PPE ใกล้หมด', 'ต่ำกว่าขั้นต่ำ', 'PPE ใกล้หมด'],
  ['📊', 'สถิติอุบัติเหตุ', 'กราฟ LTIFR TRIR', 'สถิติอุบัติเหตุ'],
  ['♻️', 'การจัดการขยะ', 'รีไซเคิล · กำจัด', 'การจัดการขยะ'],
  ['🔍', 'ค้นหา PPE', 'พิมพ์ชื่ออุปกรณ์', 'ค้นหา PPE'],
  ['⚖️', 'ค้นหากฎหมาย', 'คลังกฎหมาย SHE', 'ค้นหากฎหมาย'],
  ['👤', 'บัญชีของฉัน', 'บัญชีที่เชื่อมอยู่', 'บัญชี'],
];

function menuTile([icon, title, sub, send]: [string, string, string, string]): Json {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    paddingAll: '12px',
    backgroundColor: '#F5F8FC',
    cornerRadius: '10px',
    action: { type: 'message', label: title.slice(0, 20), text: send },
    contents: [
      { type: 'text', text: icon, size: 'xl' },
      { type: 'text', text: title, size: 'sm', weight: 'bold', color: C.text, margin: 'sm', wrap: true },
      { type: 'text', text: sub, size: 'xxs', color: C.faint, wrap: true },
    ],
  };
}

/** Reply to "เมนู": tappable tiles instead of a wall of text. */
export function menuCard(isAdmin: boolean, helpText: string): LineMessage {
  const rows: Json[] = [];
  for (let i = 0; i < MENU_ITEMS.length; i += 2) {
    rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', margin: i ? 'sm' : 'none', contents: [menuTile(MENU_ITEMS[i]), menuTile(MENU_ITEMS[i + 1])] });
  }
  return flex(helpText.slice(0, 400), {
    type: 'bubble',
    size: 'mega',
    header: header('EA SHE Bot', 'เมนู', C.primary),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        ...rows,
        { type: 'text', text: 'พิมพ์ชื่ออุปกรณ์ได้เลย เช่น "ถุงมือ" · ต่อท้ายปีได้ เช่น "สถิติอุบัติเหตุ 2023"', size: 'xxs', color: C.faint, wrap: true, margin: 'lg' },
        ...(isAdmin ? [{ type: 'text', text: 'admin: ต่อท้ายรหัสบริษัทได้ เช่น "PPE ใกล้หมด amt"', size: 'xxs', color: C.faint, wrap: true } as Json] : []),
      ],
    },
  });
}

export const SEARCH_HELP =
  'พิมพ์ชื่ออุปกรณ์ที่ต้องการได้เลย เช่น\n• ถุงมือ\n• รองเท้า\n• หน้ากาก N95\n\nบอทจะแสดงยอดคงเหลือของรายการที่ตรงกัน หรือกด "รายการ PPE" เพื่อดูตามหมวด';

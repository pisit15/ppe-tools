// Legal library search for the LINE bot. Pure.
// Search/ranking rules live in lawSearch.ts; this file only draws cards.
// Excluded and repealed laws are never shown (same as eashe.org /api/legal/laws).
import { C, flex, header, type Json, type LineMessage } from './flex';
import { LAW_TOPICS, type LawHit } from './lawSearch';

export type LawRow = {
  id: string;
  code?: string | null;
  ministry?: string | null;
  title: string;
  law_type?: string | null;
  status?: string | null;
  enacted_date?: string | null;
  gazette_url?: string | null;
  external_url?: string | null;
  is_core?: boolean | null;
};

export const LAW_PAGE_SIZE = 8;
const LIBRARY = 'https://eashe.org/projects/legal/library?view=all';
const LAW_COLOR = '#5B4B8A';

const MINISTRY_SHORT: Record<string, string> = {
  MOL: 'แรงงาน',
  MIND: 'อุตสาหกรรม',
  MNRE: 'ทรัพยากรฯ',
  MOE: 'พลังงาน',
  MINT: 'มหาดไทย',
  MTRN: 'คมนาคม',
  MDEF: 'กลาโหม',
  MOPH: 'สาธารณสุข',
  MSCT: 'อว.',
};
const STATUS_LABEL: Record<string, string> = { active: 'มีผลบังคับใช้', partially_repealed: 'ยกเลิกบางส่วน', repealed: 'ยกเลิกแล้ว' };

export { searchWords, thaiSpellingVariants, wordFilter } from './lawSearch';

const safeUri = (u?: string | null) => (u && /^https:\/\/\S+$/.test(u) && u.length <= 1000 ? u : null);
const thaiYear = (d?: string | null) => {
  const m = String(d || '').match(/^(\d{4})/);
  return m ? `พ.ศ. ${Number(m[1]) + 543}` : '';
};

/** Examples on the help card: everyday words that the synonym list maps to legal wording. */
export const LAW_EXAMPLES = ['นั่งร้าน', 'เครน', 'ที่สูง', 'ไฟไหม้', 'สารเคมี', 'เสียงดัง', 'น้ำเสีย', 'ไฟฟ้า'];

const chip = (label: string, textToSend: string, icon = '⚖️'): Json => ({
  type: 'box',
  layout: 'horizontal',
  flex: 1,
  paddingAll: '10px',
  backgroundColor: '#F4F2FA',
  cornerRadius: '8px',
  action: { type: 'message', label: [...label].slice(0, 20).join(''), text: textToSend },
  contents: [{ type: 'text', text: `${icon} ${label}`, size: 'sm', color: C.text, flex: 1, wrap: true }],
});

/** Lay chips out two per row. */
function grid(items: Json[], margin = 'sm'): Json[] {
  const rows: Json[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    if (pair.length === 1) pair.push({ type: 'filler' });
    rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', margin: i ? 'sm' : margin, contents: pair });
  }
  return rows;
}

/** "กฎหมาย" with no words: browse by topic, or search with example buttons. */
export function lawHelpCard(): LineMessage {
  return flex('ค้นหากฎหมาย: เลือกดูตามหมวด หรือพิมพ์ "กฎหมาย" ตามด้วยคำค้น เช่น กฎหมาย นั่งร้าน', {
    type: 'bubble',
    size: 'mega',
    header: header('คลังกฎหมาย SHE', 'ค้นหากฎหมาย', LAW_COLOR),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'button', style: 'primary', color: LAW_COLOR, height: 'sm', action: { type: 'message', label: '📚 เลือกดูตามหมวด', text: 'หมวดกฎหมาย' } },
        { type: 'text', text: 'หรือพิมพ์ "กฎหมาย" ตามด้วยคำค้น เช่น', size: 'sm', color: C.text, wrap: true, margin: 'lg' },
        { type: 'text', text: 'กฎหมาย นั่งร้าน', size: 'md', weight: 'bold', color: LAW_COLOR, margin: 'sm' },
        { type: 'text', text: 'ค้นทั้งชื่อกฎหมายและเนื้อหาข้อกำหนด พิมพ์คำที่ใช้ทั่วไปได้ เช่น เครน → ปั้นจั่น, ไฟไหม้ → อัคคีภัย', size: 'xs', color: C.faint, margin: 'md', wrap: true },
        ...grid(LAW_EXAMPLES.map(q => chip(q, `กฎหมาย ${q}`)), 'lg'),
      ],
    },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดคลังกฎหมายบนเว็บ', uri: LIBRARY } }] },
  });
}

/** Topic picker. `counts` = laws per topic label; empty topics are hidden. */
export function lawTopicsCard(counts: Record<string, number>): LineMessage {
  const groups = Array.from(new Set(LAW_TOPICS.map(t => t.group)));
  const body: Json[] = [{ type: 'text', text: 'แตะหมวดเพื่อดูรายการกฎหมาย (★ กฎหมายหลักขึ้นก่อน)', size: 'xxs', color: C.faint, wrap: true }];
  for (const g of groups) {
    const topics = LAW_TOPICS.filter(t => t.group === g && (counts[t.label] ?? 0) > 0);
    if (!topics.length) continue;
    body.push({ type: 'text', text: g, size: 'sm', weight: 'bold', color: LAW_COLOR, margin: 'lg' });
    body.push(
      ...grid(
        topics.map(t => chip(`${t.label} (${(counts[t.label] ?? 0).toLocaleString('en-US')})`, `หมวดกฎหมาย ${t.label}`, t.icon)),
        'sm',
      ),
    );
  }
  return flex('เลือกหมวดกฎหมาย', {
    type: 'bubble',
    size: 'giga',
    header: header('คลังกฎหมาย SHE', 'เลือกดูตามหมวด', LAW_COLOR),
    body: { type: 'box', layout: 'vertical', contents: body },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'กฎหมายบางฉบับยังไม่ได้จัดหมวด ค้นด้วยคำจะพบครบกว่า', size: 'xxs', color: C.faint, wrap: true, align: 'center' },
        { type: 'button', style: 'link', height: 'sm', action: { type: 'message', label: '🔍 วิธีค้นด้วยคำ', text: 'ค้นหากฎหมาย' } },
      ],
    },
  });
}

function lawRow(r: LawRow & Partial<Pick<LawHit, 'clause'>>): Json {
  const doc = safeUri(r.external_url);
  const gazette = safeUri(r.gazette_url);
  const meta = [r.code, r.ministry ? MINISTRY_SHORT[r.ministry] || r.ministry : '', thaiYear(r.enacted_date)].filter(Boolean).join(' · ');
  const partial = r.status === 'partially_repealed';
  const clause = r.clause && r.clause.text ? r.clause : null;
  return {
    type: 'box',
    layout: 'vertical',
    paddingTop: '12px',
    paddingBottom: '12px',
    contents: [
      {
        type: 'text',
        text: `${r.is_core ? '★ ' : ''}${r.title}`,
        size: 'sm',
        weight: 'bold',
        color: doc ? '#2F5597' : C.text,
        wrap: true,
        maxLines: 4,
        ...(doc ? { action: { type: 'uri', label: 'เปิดเอกสาร', uri: doc } } : {}),
      },
      { type: 'text', text: meta || ' ', size: 'xxs', color: C.faint, wrap: true, margin: 'xs' },
      ...(clause
        ? [
            {
              type: 'box',
              layout: 'vertical',
              margin: 'sm',
              paddingAll: '8px',
              backgroundColor: '#F4F2FA',
              cornerRadius: '6px',
              contents: [{ type: 'text', text: `📌 ${clause.ref ? `${clause.ref}: ` : ''}${clause.text}`, size: 'xs', color: C.sub, wrap: true, maxLines: 4 }],
            } as Json,
          ]
        : []),
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'lg',
        margin: 'sm',
        contents: [
          ...(doc ? [{ type: 'text', text: '📄 เปิดเอกสาร', size: 'xs', color: '#2F5597', weight: 'bold', flex: 0, action: { type: 'uri', label: 'เปิดเอกสาร', uri: doc } } as Json] : []),
          ...(gazette ? [{ type: 'text', text: '📜 ราชกิจจาฯ', size: 'xs', color: '#2F5597', weight: 'bold', flex: 0, action: { type: 'uri', label: 'ราชกิจจาฯ', uri: gazette } } as Json] : []),
          ...(partial ? [{ type: 'text', text: STATUS_LABEL.partially_repealed, size: 'xxs', color: C.warn, flex: 0, gravity: 'center' } as Json] : []),
        ],
      },
    ],
  };
}

export type LawResultsOptions = {
  /** Some results match only part of the query. */
  approximate?: boolean;
  /** Synonyms that were searched too (shown as a note). */
  synonyms?: string[];
  /** Text sent by the paging buttons, without " หน้า N". Default "กฎหมาย <query>". */
  pagePrefix?: string;
  /** Header kicker override (topic browsing). */
  kicker?: string;
};

/** Search or topic results; `page` is 1-based. Paging buttons resend the command with "หน้า N". */
export function lawResultsCard(rows: (LawRow & Partial<Pick<LawHit, 'clause'>>)[], query: string, total: number, page: number, opts: LawResultsOptions = {}): LineMessage {
  const pages = Math.max(1, Math.ceil(total / LAW_PAGE_SIZE));
  const prefix = opts.pagePrefix || `กฎหมาย ${query}`;
  if (total === 0) {
    return flex(`ไม่พบกฎหมายที่ตรงกับ "${query}"`, {
      type: 'bubble',
      size: 'mega',
      header: header('ค้นหากฎหมาย', `ไม่พบ "${query.slice(0, 40)}"`, LAW_COLOR),
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'ลองใช้คำหลักที่สั้นลง เช่น "นั่งร้าน" แทน "การตรวจนั่งร้าน" หรือเลือกดูตามหมวด', size: 'sm', color: C.sub, wrap: true },
          { type: 'button', style: 'primary', color: LAW_COLOR, height: 'sm', margin: 'lg', action: { type: 'message', label: '📚 เลือกดูตามหมวด', text: 'หมวดกฎหมาย' } },
        ],
      },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ค้นในคลังกฎหมายบนเว็บ', uri: LIBRARY } }] },
    });
  }
  const nav: Json[] = [];
  if (page > 1) nav.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '‹ ก่อนหน้า', text: `${prefix} หน้า ${page - 1}` } });
  if (page < pages) nav.push({ type: 'button', style: 'primary', color: LAW_COLOR, height: 'sm', action: { type: 'message', label: 'ถัดไป ›', text: `${prefix} หน้า ${page + 1}` } });
  const notes: Json[] = [];
  if (opts.approximate)
    notes.push({ type: 'text', text: 'ไม่พบฉบับที่ตรงทุกคำมากพอ จึงแสดงผลที่ตรงบางคำด้วย (ตรงมากสุดขึ้นก่อน)', size: 'xxs', color: C.warn, wrap: true });
  if (opts.synonyms?.length) notes.push({ type: 'text', text: `รวมคำใกล้เคียง: ${opts.synonyms.slice(0, 6).join(', ')}`, size: 'xxs', color: C.faint, wrap: true });
  notes.push({ type: 'text', text: 'แตะชื่อหรือ "เปิดเอกสาร" เพื่อเปิดไฟล์ · ★ = กฎหมายหลัก · 📌 = ข้อที่ตรงกับคำค้น', size: 'xxs', color: C.faint, wrap: true });
  return flex(`กฎหมาย "${query}": ${total} ฉบับ (หน้า ${page}/${pages})`, {
    type: 'bubble',
    size: 'giga',
    header: header(opts.kicker || `ค้นหากฎหมาย · พบ ${total.toLocaleString('en-US')} ฉบับ`, `"${query.slice(0, 40)}"`, LAW_COLOR),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [...notes, ...rows.flatMap((r, k) => (k === 0 ? [lawRow(r)] : [{ type: 'separator' } as Json, lawRow(r)]))],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `หน้า ${page} / ${pages}`, size: 'xxs', color: C.faint, align: 'center' },
        ...(nav.length ? [{ type: 'box', layout: 'horizontal', spacing: 'sm', contents: nav } as Json] : []),
        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดคลังกฎหมายบนเว็บ', uri: LIBRARY } },
      ],
    },
  });
}

// Legal library search for the LINE bot. Pure.
// Matching mirrors eashe.org /api/legal/laws (pisit15/safety-env-dashboard):
//   every word must appear in the title or code (ilike), with ฏ/ฎ spelling variants;
//   excluded laws hidden, repealed laws hidden; ★ core first, then newest.
import { C, flex, header, type Json, type LineMessage } from './flex';

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

/** Same as the library: split on spaces, strip PostgREST-special characters, max 8 words. */
export function searchWords(q: string): string[] {
  return q
    .replace(/[%,()*\\"]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** ปฏิกูล / ปฎิกูล — either spelling finds the law. */
export function thaiSpellingVariants(word: string): string[] {
  const out: string[] = [];
  if (word.includes('ฏ')) out.push(word.replace(/ฏ/g, 'ฎ'));
  if (word.includes('ฎ')) out.push(word.replace(/ฎ/g, 'ฏ'));
  return out;
}

/** PostgREST `or` filter for one word (title or code, any spelling variant). */
export function wordFilter(word: string): string {
  const variants = Array.from(new Set([word, ...thaiSpellingVariants(word)]));
  return variants.flatMap(v => [`title.ilike.%${v}%`, `code.ilike.%${v}%`]).join(',');
}

const safeUri = (u?: string | null) => (u && /^https:\/\/\S+$/.test(u) && u.length <= 1000 ? u : null);
const thaiYear = (d?: string | null) => {
  const m = String(d || '').match(/^(\d{4})/);
  return m ? `พ.ศ. ${Number(m[1]) + 543}` : '';
};

export const LAW_EXAMPLES = ['นั่งร้าน', 'ที่อับอากาศ', 'สารเคมีอันตราย', 'ความร้อน แสง เสียง', 'ไฟฟ้า', 'ปั้นจั่น'];

/** "กฎหมาย" with no words: how to search + example buttons. */
export function lawHelpCard(): LineMessage {
  return flex('ค้นหากฎหมาย: พิมพ์ "กฎหมาย" ตามด้วยคำค้น เช่น กฎหมาย นั่งร้าน', {
    type: 'bubble',
    size: 'mega',
    header: header('คลังกฎหมาย SHE', 'ค้นหากฎหมาย', LAW_COLOR),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'พิมพ์ "กฎหมาย" ตามด้วยคำค้น เช่น', size: 'sm', color: C.text, wrap: true },
        { type: 'text', text: 'กฎหมาย นั่งร้าน', size: 'md', weight: 'bold', color: LAW_COLOR, margin: 'sm' },
        { type: 'text', text: 'ค้นจากชื่อและเลขที่ ทุกคำต้องตรง · ตัวอย่าง:', size: 'xs', color: C.faint, margin: 'lg', wrap: true },
        ...LAW_EXAMPLES.map(
          (q, i) =>
            ({
              type: 'box',
              layout: 'horizontal',
              margin: i ? 'sm' : 'md',
              paddingAll: '10px',
              backgroundColor: '#F4F2FA',
              cornerRadius: '8px',
              action: { type: 'message', label: q.slice(0, 20), text: `กฎหมาย ${q}` },
              contents: [
                { type: 'text', text: `⚖️ ${q}`, size: 'sm', color: C.text, flex: 1 },
                { type: 'text', text: '›', size: 'sm', color: C.faint, flex: 0 },
              ],
            }) as Json,
        ),
      ],
    },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิดคลังกฎหมายบนเว็บ', uri: LIBRARY } }] },
  });
}

function lawRow(r: LawRow): Json {
  const doc = safeUri(r.external_url);
  const gazette = safeUri(r.gazette_url);
  const meta = [r.code, r.ministry ? MINISTRY_SHORT[r.ministry] || r.ministry : '', thaiYear(r.enacted_date)].filter(Boolean).join(' · ');
  const partial = r.status === 'partially_repealed';
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

/** Search results; `page` is 1-based. Paging buttons resend the query with "หน้า N". */
export function lawResultsCard(rows: LawRow[], query: string, total: number, page: number): LineMessage {
  const pages = Math.max(1, Math.ceil(total / LAW_PAGE_SIZE));
  if (total === 0) {
    return flex(`ไม่พบกฎหมายที่ตรงกับ "${query}"`, {
      type: 'bubble',
      size: 'mega',
      header: header('ค้นหากฎหมาย', `ไม่พบ "${query.slice(0, 40)}"`, LAW_COLOR),
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'ลองใช้คำที่สั้นลง หรือคำหลักเพียงคำเดียว เช่น "นั่งร้าน" แทน "การตรวจนั่งร้าน" (ทุกคำต้องตรงกับชื่อกฎหมาย)', size: 'sm', color: C.sub, wrap: true },
        ],
      },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ค้นในคลังกฎหมายบนเว็บ', uri: LIBRARY } }] },
    });
  }
  const nav: Json[] = [];
  if (page > 1) nav.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '‹ ก่อนหน้า', text: `กฎหมาย ${query} หน้า ${page - 1}` } });
  if (page < pages) nav.push({ type: 'button', style: 'primary', color: LAW_COLOR, height: 'sm', action: { type: 'message', label: 'ถัดไป ›', text: `กฎหมาย ${query} หน้า ${page + 1}` } });
  return flex(`กฎหมาย "${query}": ${total} ฉบับ (หน้า ${page}/${pages})`, {
    type: 'bubble',
    size: 'giga',
    header: header(`ค้นหากฎหมาย · พบ ${total.toLocaleString('en-US')} ฉบับ`, `"${query.slice(0, 40)}"`, LAW_COLOR),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'แตะชื่อหรือ "เปิดเอกสาร" เพื่อเปิดไฟล์ · ★ = กฎหมายหลัก', size: 'xxs', color: C.faint, wrap: true },
        ...rows.flatMap((r, k) => (k === 0 ? [lawRow(r)] : [{ type: 'separator' } as Json, lawRow(r)])),
      ],
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

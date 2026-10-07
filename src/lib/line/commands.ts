// Turns a chat message into a bot command. Pure, so it can be unit-tested.

export type Command =
  | { kind: 'help' }
  | { kind: 'search_help' }
  | { kind: 'law_search'; query: string; page: number }
  | { kind: 'law_topics' }
  | { kind: 'law_topic'; topic: string; page: number }
  | { kind: 'ppe_summary'; company?: string }
  | { kind: 'ppe_browse'; company?: string }
  | { kind: 'ppe_low'; company?: string }
  | { kind: 'ppe_search'; query: string; company?: string }
  | { kind: 'incident_stats'; company?: string; year?: number }
  | { kind: 'waste_stats'; company?: string; year?: number }
  | { kind: 'unlink' }
  | { kind: 'whoami' };

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

// Optional trailing company code for admins, e.g. "PPE ใกล้หมด amt".
// Returns the code and the text without it.
function splitCompany(lower: string): { company?: string; rest: string } {
  const m = lower.match(/^(.*\S)\s+@?([a-z][a-z0-9_-]{1,19})$/);
  if (m && !['ppe', 'stock', 'low', 'incident', 'incidents'].includes(m[2])) return { company: m[2], rest: m[1] };
  return { rest: lower };
}

/** Trailing "หน้า N" (paging buttons). */
function splitPage(q: string): { rest: string; page: number } {
  const pm = q.match(/^(.*?)\s*หน้า\s*(\d{1,3})$/);
  return pm ? { rest: pm[1].trim(), page: Math.max(1, Number(pm[2])) } : { rest: q, page: 1 };
}

const has = (s: string, words: string[]) => words.some(w => s.includes(w));

export function parseCommand(input: string): Command {
  const text = normalize(input);
  const lower = text.toLowerCase();

  if (!text || ['help', 'เมนู', 'menu', 'ช่วยเหลือ', '?', 'วิธีใช้'].includes(lower)) return { kind: 'help' };
  if (['ยกเลิกการเชื่อม', 'ยกเลิกเชื่อม', 'unlink'].includes(lower)) return { kind: 'unlink' };
  if (['ฉันคือใคร', 'บัญชี', 'whoami'].includes(lower)) return { kind: 'whoami' };

  // Legal library by topic: "หมวดกฎหมาย", "หมวดกฎหมาย ไฟฟ้า หน้า 2", "กฎหมาย หมวด".
  const topic = text.match(/^(?:หมวดกฎหมาย|กฎหมาย\s*หมวด)(?:\s+(.*))?$/i);
  if (topic) {
    const { rest, page } = splitPage((topic[1] || '').trim());
    return rest ? { kind: 'law_topic', topic: rest.slice(0, 40), page } : { kind: 'law_topics' };
  }

  // Legal library: "กฎหมาย นั่งร้าน", "กฎหมาย นั่งร้าน หน้า 2", "ค้นหากฎหมาย".
  const law = text.match(/^(?:ค้นหา\s*)?(?:กฎหมาย|กม\.?|law)(?:\s+(.*))?$/i);
  if (law) {
    const { rest, page } = splitPage((law[1] || '').trim());
    return { kind: 'law_search', query: rest.slice(0, 60), page };
  }

  // Rich-menu "ค้นหา PPE" button: explain how to search instead of searching for "PPE".
  if (['ค้นหา', 'ค้นหา ppe', 'search', 'วิธีค้นหา'].includes(lower)) return { kind: 'search_help' };

  // Explicit search prefix always searches.
  const s = text.match(/^(?:ค้นหา|หา|search)\s+(.+)$/i);
  if (s) return { kind: 'ppe_search', query: s[1].trim().slice(0, 50) };

  // Optional year (2023 or พ.ศ. 2566) for incident stats.
  let year: number | undefined;
  const ym = lower.match(/(?:^|\s)((?:20|25)\d{2})(?=\s|$)/);
  if (ym) {
    const n = Number(ym[1]);
    year = n >= 2500 ? n - 543 : n;
  }
  const { company, rest } = splitCompany(ym ? lower.replace(ym[1], ' ').replace(/\s+/g, ' ').trim() : lower);

  // Browse by category: "รายการ PPE", "PPE ทั้งหมด", "รายการ".
  if (['รายการ', 'รายการ ppe', 'ppe ทั้งหมด', 'รายการ ppe ทั้งหมด', 'ชื่อ ppe', 'ดู ppe', 'หมวด ppe'].includes(rest)) {
    return { kind: 'ppe_browse', company };
  }

  // Keyword commands (free word order: "สรุปรายการ PPE คงเหลือ", "PPE ใกล้หมด amt").
  if (has(rest, ['ขยะ', 'ของเสีย', 'waste'])) return { kind: 'waste_stats', company, ...(year ? { year } : {}) };
  if (has(rest, ['อุบัติเหตุ', 'สถิติ', 'incident'])) return { kind: 'incident_stats', company, ...(year ? { year } : {}) };
  if (has(rest, ['ใกล้หมด', 'ต่ำกว่าขั้นต่ำ']) || /\bppe\s*low\b/.test(rest)) return { kind: 'ppe_low', company };
  if (rest === 'ppe' || (rest.includes('ppe') && has(rest, ['คงเหลือ', 'สรุป', 'สต็อก', 'สต๊อก', 'stock'])) || ['คงเหลือ', 'สต็อก', 'สต๊อก', 'stock'].includes(rest)) {
    return { kind: 'ppe_summary', company };
  }

  // Anything else is treated as an item search.
  const query = text;
  if (query.length < 2) return { kind: 'help' };
  return { kind: 'ppe_search', query: query.slice(0, 50) };
}

export const HELP_TEXT = [
  'คำสั่งที่ใช้ได้',
  '• รายการ PPE — ดูชื่อ PPE ตามหมวด แตะเพื่อดูยอดคงเหลือ',
  '• PPE คงเหลือ — สรุปสต็อก PPE',
  '• PPE ใกล้หมด — รายการที่ต่ำกว่าจุดสั่งขั้นต่ำ',
  '• พิมพ์ชื่ออุปกรณ์ เช่น ถุงมือ — ดูยอดคงเหลือ',
  '• สถิติอุบัติเหตุ — สรุป กราฟรายเดือน LTIFR/TRIR (ต่อท้ายปีได้ เช่น สถิติอุบัติเหตุ 2023)',
  '• การจัดการขยะ — ปริมาณ รีไซเคิล/กำจัด รายเดือน และชนิดของเสีย (ต่อท้ายปีได้)',
  '• กฎหมาย + คำค้น — ค้นคลังกฎหมาย SHE พร้อมลิงก์ เช่น กฎหมาย นั่งร้าน',
  '• หมวดกฎหมาย — เลือกดูกฎหมายตามหมวด',
  '• ยกเลิกการเชื่อม — เลิกผูกบัญชี LINE นี้',
].join('\n');

// Turns a chat message into a bot command. Pure, so it can be unit-tested.

export type Command =
  | { kind: 'help' }
  | { kind: 'ppe_summary'; company?: string }
  | { kind: 'ppe_low'; company?: string }
  | { kind: 'ppe_search'; query: string; company?: string }
  | { kind: 'incident_stats'; company?: string }
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

const has = (s: string, words: string[]) => words.some(w => s.includes(w));

export function parseCommand(input: string): Command {
  const text = normalize(input);
  const lower = text.toLowerCase();

  if (!text || ['help', 'เมนู', 'menu', 'ช่วยเหลือ', '?', 'วิธีใช้'].includes(lower)) return { kind: 'help' };
  if (['ยกเลิกการเชื่อม', 'ยกเลิกเชื่อม', 'unlink'].includes(lower)) return { kind: 'unlink' };
  if (['ฉันคือใคร', 'บัญชี', 'whoami'].includes(lower)) return { kind: 'whoami' };

  // Explicit search prefix always searches.
  const s = text.match(/^(?:ค้นหา|หา|search)\s+(.+)$/i);
  if (s) return { kind: 'ppe_search', query: s[1].trim().slice(0, 50) };

  const { company, rest } = splitCompany(lower);

  // Keyword commands (free word order: "สรุปรายการ PPE คงเหลือ", "PPE ใกล้หมด amt").
  if (has(rest, ['อุบัติเหตุ', 'สถิติ', 'incident'])) return { kind: 'incident_stats', company };
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
  '• PPE คงเหลือ — สรุปสต็อก PPE',
  '• PPE ใกล้หมด — รายการที่ต่ำกว่าจุดสั่งขั้นต่ำ',
  '• พิมพ์ชื่ออุปกรณ์ เช่น ถุงมือ — ดูยอดคงเหลือ',
  '• สถิติอุบัติเหตุ — สรุปปีปัจจุบัน แยกบริษัท',
  '• ยกเลิกการเชื่อม — เลิกผูกบัญชี LINE นี้',
].join('\n');

/**
 * Shared default pictures: matching an item to a default by name. Pure — used by the server (to pick the picture)
 * and by the admin page (to show how many items each default covers).
 */
export type DefaultImageRule = { id: string; keywords: string[] };

/** Lower-case, punctuation → spaces: "Air-X 80 mg" → "air x 80 mg", "BETADINE SOLUTION (30 ml)" → "betadine solution 30 ml". */
export const normalizeName = (s: string) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim().replace(/\s+/g, ' ');

const UNIT = /^(?:mg|mcg|g|gm|kg|ml|l|cc|iu|cm|mm|m|pcs|tab|tabs|cap|caps|มก|มล|กรัม|ซีซี|ลิตร|นิ้ว|เม็ด|ขวด|ซอง|หลอด|แผ่น|ชิ้น|ม้วน|กล่อง|ถุง)$/;
const SIZE = /^(?:\d+(?:x\d+)*[a-zก-๙]{0,4}|x|[a-z])$/; // 500, 500mg, 3x3, a lone size letter such as M
const LATIN = /[a-z]/;

/**
 * Starting keyword for a new default, specific enough to keep the brand: the part before " / ", without strength or
 * pack size; when the name mixes Thai and Latin, the Latin (brand) part.
 * "Paracetamol 500 mg" → "paracetamol" · "ยาหยอดตา Hista-Oph" → "hista oph" · "ถุงมือยาง M" → "ถุงมือยาง".
 */
export function suggestKeyword(name: string) {
  const first = (name || '').split(' / ')[0].replace(/\(.*?\)/g, ' ');
  const tokens = normalizeName(first).split(' ').filter(t => t && !UNIT.test(t) && !SIZE.test(t));
  const latin = tokens.map((t, i) => (LATIN.test(t) ? i : -1)).filter(i => i >= 0);
  const kept = latin.length ? tokens.slice(latin[0], latin[latin.length - 1] + 1) : tokens;
  return kept.join(' ') || normalizeName(first) || normalizeName(name);
}

/** A Latin keyword must start a word ("ors" matches "ORS ผงเกลือแร่", not "Norgesic"); a Thai keyword may sit anywhere. */
export function keywordMatches(normalizedName: string, keyword: string) {
  const k = normalizeName(keyword);
  if (k.length < 2) return false;
  return /^[a-z0-9]/.test(k) ? ` ${normalizedName}`.includes(` ${k}`) : normalizedName.includes(k);
}

/** The default whose longest matching keyword is the longest (most specific); earlier entries win ties. */
export function pickDefault<T extends DefaultImageRule>(itemName: string, defaults: T[]): T | null {
  const name = normalizeName(itemName); let best: T | null = null; let bestLength = 0;
  for (const d of defaults) for (const k of d.keywords) {
    const length = normalizeName(k).length;
    if (length > bestLength && keywordMatches(name, k)) { best = d; bestLength = length; }
  }
  return best;
}

/** "paracetamol, พารา ,Sara" → ["paracetamol", "พารา", "sara"] (trimmed, lower-cased, de-duplicated). */
export function parseKeywords(input: string) {
  const seen = new Set<string>(); const out: string[] = [];
  for (const part of (input || '').split(/[,\n;]+/)) { const k = part.trim().toLowerCase().replace(/\s+/g, ' '); if (k && !seen.has(normalizeName(k))) { seen.add(normalizeName(k)); out.push(k); } }
  return out;
}

// Legal library search logic for the LINE bot. Pure (no I/O) so it can be unit-tested.
// bot.ts runs the queries; this file decides what to ask for and how to rank the answers.
import type { LawRow } from './lawCards';

/** Variants of a word that should find the same law (ปฏิกูล / ปฎิกูล). */
export function thaiSpellingVariants(word: string): string[] {
  const out: string[] = [];
  if (word.includes('ฏ')) out.push(word.replace(/ฏ/g, 'ฎ'));
  if (word.includes('ฎ')) out.push(word.replace(/ฎ/g, 'ฏ'));
  return out;
}

/** `exact`: search only the terms, never the typed word (short abbreviations like "จป" hide inside "ตรวจประเมิน"). */
type SynonymGroup = { triggers: string[]; terms: string[]; related?: string[]; exact?: boolean };

/**
 * What people type → how the law words it. A typed word that equals a trigger also
 * searches every term. Terms were checked against the library (titles and approved clauses).
 * No commas, brackets or spaces in terms (they go into PostgREST `or` filters).
 */
export const SYNONYM_GROUPS: SynonymGroup[] = [
  { triggers: ['เครน', 'ปั้นจั่น', 'crane', 'ปั่นจั่น'], terms: ['ปั้นจั่น'], related: ['รถยก', 'ลิฟต์', 'เครื่องจักร'] },
  { triggers: ['ไฟไหม้', 'เพลิงไหม้', 'อัคคีภัย', 'หนีไฟ', 'ซ้อมหนีไฟ', 'fire'], terms: ['อัคคีภัย', 'ไฟไหม้', 'เพลิงไหม้', 'ดับเพลิง'], related: ['ฉุกเฉิน', 'ไวไฟ', 'ก๊าซ'] },
  { triggers: ['ถังดับเพลิง', 'ดับเพลิง'], terms: ['ดับเพลิง'], related: ['อัคคีภัย', 'ฉุกเฉิน'] },
  { triggers: ['สารเคมี', 'เคมี', 'chemical', 'วัตถุอันตราย'], terms: ['สารเคมี', 'วัตถุอันตราย'], related: ['ไวไฟ', 'ก๊าซ', 'ตรวจสุขภาพ'] },
  { triggers: ['ขยะ', 'ของเสีย', 'กาก', 'waste', 'มูลฝอย', 'สิ่งปฏิกูล'], terms: ['ขยะ', 'มูลฝอย', 'สิ่งปฏิกูล', 'ของเสีย', 'กากอุตสาหกรรม'], related: ['น้ำเสีย', 'อากาศเสีย'] },
  { triggers: ['ฟอร์คลิฟท์', 'ฟอร์คลิฟ', 'โฟล์คลิฟท์', 'โฟคลิฟ', 'รถยก', 'forklift'], terms: ['รถยก', 'ฟอร์คลิฟท์'], related: ['ปั้นจั่น', 'เครื่องจักร'] },
  { triggers: ['ที่สูง', 'ตกจากที่สูง', 'งานบนที่สูง', 'ทำงานบนที่สูง'], terms: ['บนที่สูง', 'ในที่สูง', 'จากที่สูง', 'งานที่สูง'], related: ['นั่งร้าน', 'ก่อสร้าง'], exact: true },
  { triggers: ['นั่งร้าน', 'scaffold'], terms: ['นั่งร้าน'], related: ['ที่สูง', 'ก่อสร้าง'] },
  { triggers: ['เสียงดัง', 'เสียง', 'noise'], terms: ['เสียง'], related: ['ความร้อน', 'แสงสว่าง', 'ตรวจสุขภาพ'] },
  { triggers: ['ร้อน', 'ความร้อน', 'heat'], terms: ['ความร้อน'], related: ['เสียง', 'แสงสว่าง'] },
  { triggers: ['แสง', 'แสงสว่าง', 'light'], terms: ['แสงสว่าง'], related: ['เสียง', 'ความร้อน'] },
  { triggers: ['ฝุ่น', 'pm2.5', 'dust'], terms: ['ฝุ่น'], related: ['อากาศเสีย', 'ตรวจสุขภาพ'] },
  { triggers: ['น้ำเสีย', 'น้ำทิ้ง', 'wastewater'], terms: ['น้ำเสีย', 'น้ำทิ้ง'], related: ['ขยะ', 'อากาศเสีย'] },
  { triggers: ['ควัน', 'ปล่อง', 'อากาศเสีย', 'มลพิษอากาศ'], terms: ['อากาศเสีย', 'มลพิษทางอากาศ'], related: ['ฝุ่น', 'น้ำเสีย'] },
  { triggers: ['บอยเลอร์', 'boiler', 'หม้อไอน้ำ', 'หม้อน้ำ'], terms: ['หม้อไอน้ำ', 'หม้อน้ำ'], related: ['ก๊าซ', 'เครื่องจักร'] },
  { triggers: ['จป', 'จป.', 'จปว', 'จปว.', 'จปท', 'จปท.', 'จปห', 'จปห.'], terms: ['เจ้าหน้าที่ความปลอดภัย'], related: ['คปอ', 'อบรม'] , exact: true },
  { triggers: ['คปอ', 'คปอ.'], terms: ['คณะกรรมการความปลอดภัย'], related: ['จป', 'อบรม'] , exact: true },
  { triggers: ['ppe', 'อุปกรณ์ป้องกัน', 'อุปกรณ์ป้องกันส่วนบุคคล'], terms: ['อุปกรณ์คุ้มครองความปลอดภัยส่วนบุคคล', 'อุปกรณ์ป้องกันอันตรายส่วนบุคคล'], related: ['เสียง', 'สารเคมี'] , exact: true },
  { triggers: ['แก๊ส', 'ก๊าซ', 'gas'], terms: ['ก๊าซ', 'แก๊ส'], related: ['ไวไฟ', 'อัคคีภัย'] },
  { triggers: ['lpg', 'แก๊สหุงต้ม'], terms: ['ปิโตรเลียมเหลว'], related: ['ก๊าซ', 'อัคคีภัย'] , exact: true },
  { triggers: ['ลิฟต์', 'ลิฟท์', 'lift', 'elevator'], terms: ['ลิฟต์', 'ลิฟท์'], related: ['ปั้นจั่น', 'เครื่องจักร'] },
  { triggers: ['ประเมินความเสี่ยง', 'ความเสี่ยง', 'risk'], terms: ['ประเมินความเสี่ยง', 'ชี้บ่งอันตราย'], related: ['สารเคมี', 'ฉุกเฉิน'] },
  { triggers: ['ยกของ', 'ยกด้วยมือ', 'ergonomic', 'การยศาสตร์'], terms: ['ยกของ', 'ยกด้วยมือ', 'น้ำหนักยก'], related: ['รถยก', 'สุขภาพ'] },
  { triggers: ['ไฟดูด', 'ไฟฟ้าดูด', 'ไฟช็อต', 'ไฟฟ้าช็อต'], terms: ['ไฟฟ้า'], related: ['อัคคีภัย', 'เครื่องจักร'] },
  { triggers: ['ไฟฟ้า', 'electric'], terms: ['ไฟฟ้า'], related: ['อัคคีภัย', 'เครื่องจักร'] },
  { triggers: ['ปฐมพยาบาล', 'firstaid'], terms: ['ปฐมพยาบาล'], related: ['ฉุกเฉิน', 'ตรวจสุขภาพ'] },
  { triggers: ['อับอากาศ', 'ที่อับอากาศ', 'confined'], terms: ['อับอากาศ'], related: ['ก๊าซ', 'ฉุกเฉิน'] },
  { triggers: ['eia', 'อีไอเอ'], terms: ['ผลกระทบสิ่งแวดล้อม'], related: ['อากาศเสีย', 'น้ำเสีย'] , exact: true },
  { triggers: ['ไวไฟ', 'สารไวไฟ', 'flammable'], terms: ['ไวไฟ'], related: ['สารเคมี', 'อัคคีภัย'] },
  { triggers: ['อบรม', 'ฝึกอบรม', 'training'], terms: ['อบรม'], related: ['จป', 'คปอ'] },
  { triggers: ['เงินทดแทน', 'กองทุนเงินทดแทน'], terms: ['เงินทดแทน'], related: ['ตรวจสุขภาพ', 'ปฐมพยาบาล'] },
  { triggers: ['รังสี', 'radiation', 'เอกซเรย์', 'xray', 'x-ray'], terms: ['รังสี'], related: ['ตรวจสุขภาพ'] },
  { triggers: ['ตรวจสุขภาพ', 'สุขภาพ'], terms: ['สุขภาพ'], related: ['เสียง', 'สารเคมี'] },
  { triggers: ['ฉุกเฉิน', 'emergency'], terms: ['ฉุกเฉิน'], related: ['อัคคีภัย', 'ปฐมพยาบาล'] },
  { triggers: ['ก่อสร้าง', 'construction'], terms: ['ก่อสร้าง'], related: ['นั่งร้าน', 'ที่สูง'] },
  { triggers: ['เครื่องจักร', 'machine'], terms: ['เครื่องจักร'], related: ['ปั้นจั่น', 'รถยก'] },
];

const TRIGGERS = new Map<string, SynonymGroup>();
for (const g of SYNONYM_GROUPS) for (const t of g.triggers) TRIGGERS.set(t.toLowerCase(), g);

/** Same as the library: split on spaces, strip PostgREST-special characters, max 8 words. */
export function searchWords(q: string): string[] {
  return q
    .replace(/[%,()*\\"]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export type WordGroup = { word: string; terms: string[] };

/** One group per typed word: the word itself, its synonyms and spelling variants. */
export function expandWords(words: string[]): WordGroup[] {
  return words.map(word => {
    const g = TRIGGERS.get(word.toLowerCase());
    const base = g?.exact ? g.terms : [word, ...(g ? g.terms : [])];
    const terms = Array.from(new Set(base.flatMap(t => [t, ...thaiSpellingVariants(t)])));
    return { word, terms };
  });
}

/** Synonyms actually added (for the "รวมคำใกล้เคียง" note on the card). */
export function addedTerms(groups: WordGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) for (const t of g.terms) if (t.toLowerCase() !== g.word.toLowerCase() && !thaiSpellingVariants(g.word).includes(t) && !out.includes(t) && !thaiSpellingVariants(t).some(v => out.includes(v))) out.push(t);
  return out;
}

/** PostgREST `or` filter: any term of one group in any of the columns. */
export function groupFilter(group: WordGroup, columns: string[]): string {
  return group.terms.flatMap(t => columns.map(c => `${c}.ilike.%${t}%`)).join(',');
}

/** PostgREST `or` filter: any term of any group (used for the "partial match" fallback). */
export function anyFilter(groups: WordGroup[], columns: string[]): string {
  return Array.from(new Set(groups.flatMap(g => g.terms))).flatMap(t => columns.map(c => `${c}.ilike.%${t}%`)).join(',');
}

/** Backwards-compatible single-word title/code filter. */
export const wordFilter = (word: string): string => groupFilter({ word, terms: [word, ...thaiSpellingVariants(word)] }, ['title', 'code']);

const lc = (s?: string | null) => (s || '').toLowerCase();

/** Which groups (by index) appear in a text. */
export function matchedGroups(text: string, groups: WordGroup[]): Set<number> {
  const t = lc(text);
  const out = new Set<number>();
  groups.forEach((g, i) => {
    if (g.terms.some(term => t.includes(term.toLowerCase()))) out.add(i);
  });
  return out;
}

export type LawCandidate = LawRow & { screening?: string | null; primary_category?: string | null };
export type ClauseRow = { law_id: string; clause_ref?: string | null; requirement: string };
export type LawHit = LawCandidate & { clause?: { ref: string; text: string } | null; covered: number; inTitle: boolean };

/** Short excerpt around the first matching term. */
export function snippet(text: string, groups: WordGroup[], width = 110): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const low = clean.toLowerCase();
  let at = -1;
  for (const g of groups)
    for (const term of g.terms) {
      const i = low.indexOf(term.toLowerCase());
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
  if (clean.length <= width) return clean;
  const start = Math.max(0, Math.min(at < 0 ? 0 : at - 30, clean.length - width));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + width).trim()}${start + width < clean.length ? '…' : ''}`;
}

/**
 * Merge law rows and matching clauses into ranked hits.
 * A law counts every word it covers across its title, code, category and matched clauses.
 * `partial` keeps laws that cover only some words (fallback when strict results are few).
 */
export function rankHits(laws: LawCandidate[], clauses: ClauseRow[], clauseLaws: LawCandidate[], groups: WordGroup[], partial: boolean): LawHit[] {
  const byId = new Map<string, LawCandidate>();
  for (const l of [...laws, ...clauseLaws]) if (!byId.has(l.id)) byId.set(l.id, l);
  const clausesByLaw = new Map<string, ClauseRow[]>();
  for (const c of clauses) {
    if (!byId.has(c.law_id)) continue; // hidden law (repealed / excluded)
    const list = clausesByLaw.get(c.law_id) || [];
    list.push(c);
    clausesByLaw.set(c.law_id, list);
  }
  const n = groups.length;
  const hits: LawHit[] = [];
  for (const law of byId.values()) {
    const titleSet = matchedGroups(`${law.title} ${law.code || ''} ${law.primary_category || ''}`, groups);
    const covered = new Set(titleSet);
    let best: ClauseRow | null = null;
    let bestN = 0;
    for (const c of clausesByLaw.get(law.id) || []) {
      const m = matchedGroups(c.requirement, groups);
      m.forEach(i => covered.add(i));
      if (m.size > bestN) {
        best = c;
        bestN = m.size;
      }
    }
    if (covered.size === 0) continue;
    if (!partial && covered.size < n) continue;
    const inTitle = titleSet.size === n;
    hits.push({
      ...law,
      covered: covered.size,
      inTitle,
      clause: best && !inTitle ? { ref: (best.clause_ref || '').trim(), text: snippet(best.requirement, groups) } : null,
    });
  }
  const date = (h: LawHit) => h.enacted_date || '';
  return hits.sort(
    (a, b) =>
      b.covered - a.covered ||
      Number(b.inTitle) - Number(a.inTitle) ||
      Number(!!b.is_core) - Number(!!a.is_core) ||
      Number(b.screening === 'recommended') - Number(a.screening === 'recommended') ||
      date(b).localeCompare(date(a)) ||
      (a.code || '').localeCompare(b.code || ''),
  );
}

/* ---------- Browse by topic ---------- */

export type LawTopic = { label: string; icon: string; group: string; categories: string[] };

/** Short labels (≤ 20 chars, no digits at the end) over the library's categories. */
export const LAW_TOPICS: LawTopic[] = [
  { group: 'ความปลอดภัย', icon: '🛡️', label: 'บริหารความปลอดภัย', categories: ['การบริหารจัดการความปลอดภัย กระทรวงแรงงาน', 'การชี้บ่งอันตราย การประเมินความเสี่ยง', 'การอบรมด้านความปลอดภัยและอาชีวอนามัย'] },
  { group: 'ความปลอดภัย', icon: '🌡️', label: 'ความร้อน แสง เสียง', categories: ['สภาพแวดล้อมในการทำงาน', 'การควบคุมระดับเสียง'] },
  { group: 'ความปลอดภัย', icon: '🏗️', label: 'เครื่องจักร ปั้นจั่น', categories: ['เครื่องจักร ปั้นจั่น ฟอร์คลิฟท์ และอัตราน้ำหนักยกด้วยมือ'] },
  { group: 'ความปลอดภัย', icon: '⚡', label: 'ไฟฟ้า', categories: ['ความปลอดภัยเกี่ยวกับไฟฟ้า'] },
  { group: 'ความปลอดภัย', icon: '🔥', label: 'อัคคีภัย ฉุกเฉิน', categories: ['การป้องกันและระงับอัคคีภัย และเหตุฉุกเฉิน', 'สถานการณ์ฉุกเฉิน (โรคติดต่อโควิด-19)'] },
  { group: 'ความปลอดภัย', icon: '🕳️', label: 'ที่อับอากาศ', categories: ['การทำงานในที่อับอากาศ'] },
  { group: 'ความปลอดภัย', icon: '🧱', label: 'งานก่อสร้าง', categories: ['ความปลอดภัยในงานก่อสร้าง'] },
  { group: 'ความปลอดภัย', icon: '♨️', label: 'หม้อไอน้ำ', categories: ['หม้อไอน้ำ หม้อน้ำ หม้อต้ม'] },
  { group: 'ความปลอดภัย', icon: '☢️', label: 'รังสี', categories: ['รังสี กัมมันตรังสี เครื่องต้นกำลัง วัสดุพลอยได้'] },
  { group: 'ความปลอดภัย', icon: '🩺', label: 'สุขภาพ เงินทดแทน', categories: ['การตรวจสุขภาพตามปัจจัยเสี่ยง', 'การประสบอันตราย เจ็บป่วย โรคจากการทำงาน และการจ่ายเงินทดแทน', 'กองทุนเงินทดแทน'] },
  { group: 'ความปลอดภัย', icon: '👷', label: 'แรงงาน สวัสดิการ', categories: ['สถานประกอบการ และการคุ้มครองแรงงาน', 'การจัดสวัสดิการในสถานประกอบกิจการ', 'พัฒนาฝีมือแรงงาน', 'เขตปลอดบุหรี่'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '🧪', label: 'สารเคมี วัตถุอันตราย', categories: ['สารเคมีและวัตถุอันตราย'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '⛽', label: 'ก๊าซและน้ำมัน', categories: ['ก๊าซและน้ำมัน'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '♻️', label: 'ขยะ กากของเสีย', categories: ['การจัดการขยะและกากของเสีย'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '💨', label: 'คุณภาพอากาศ', categories: ['การควบคุมคุณภาพอากาศ'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '💧', label: 'คุณภาพน้ำ', categories: ['การควบคุมคุณภาพน้ำ'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '🌱', label: 'การปนเปื้อนในดิน', categories: ['การควบคุมมลภาวะการปนเปื้อนสู่ดิน'] },
  { group: 'สารเคมีและสิ่งแวดล้อม', icon: '📝', label: 'สิ่งแวดล้อม รายงาน', categories: ['การจัดการด้านสิ่งแวดล้อม และการรายงาน', 'ห้องปฏิบัติการวิเคราะห์เอกชน'] },
  { group: 'โรงงานและมาตรฐาน', icon: '🏭', label: 'ประกอบกิจการโรงงาน', categories: ['การประกอบกิจการโรงงาน'] },
  { group: 'โรงงานและมาตรฐาน', icon: '🏷️', label: 'มอก.', categories: ['มาตรฐานผลิตภัณฑ์อุตสาหกรรม (มอก.)'] },
  { group: 'โรงงานและมาตรฐาน', icon: '📐', label: 'มตช.', categories: ['มาตรฐานการตรวจสอบและรับรองแห่งชาติ (มตช.)'] },
];

export const findTopic = (label: string): LawTopic | undefined => {
  const l = label.trim().toLowerCase();
  return LAW_TOPICS.find(t => t.label.toLowerCase() === l) || LAW_TOPICS.find(t => t.label.replace(/\s+/g, '').toLowerCase() === l.replace(/\s+/g, ''));
};

/** Topic whose categories include this category (for the "ดูทั้งหมวด" suggestion). */
export const topicOfCategory = (cat?: string | null): LawTopic | undefined => (cat ? LAW_TOPICS.find(t => t.categories.includes(cat)) : undefined);

/** Laws per topic from each law's `categories` array (a law counts once per topic). */
export function topicCounts(rows: { categories?: string[] | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of LAW_TOPICS) out[t.label] = 0;
  for (const r of rows) {
    const cats = r.categories || [];
    for (const t of LAW_TOPICS) if (t.categories.some(c => cats.includes(c))) out[t.label]++;
  }
  return out;
}

/** Quick-reply suggestions after a search: related words, then the main topic of the results. */
export function suggestions(groups: WordGroup[], hits: LawHit[]): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const typed = new Set(groups.map(g => g.word.toLowerCase()));
  for (const g of groups) {
    const syn = TRIGGERS.get(g.word.toLowerCase());
    for (const r of syn?.related || []) if (!typed.has(r.toLowerCase()) && !out.some(o => o.text === `กฎหมาย ${r}`)) out.push({ label: `⚖️ ${r}`, text: `กฎหมาย ${r}` });
  }
  const tally = new Map<string, number>();
  for (const h of hits.slice(0, 40)) {
    const t = topicOfCategory(h.primary_category);
    if (t) tally.set(t.label, (tally.get(t.label) || 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const picks = out.slice(0, 4);
  if (top) picks.push({ label: `📚 ${top[0]}`, text: `หมวดกฎหมาย ${top[0]}` });
  picks.push({ label: '📚 ทุกหมวด', text: 'หมวดกฎหมาย' });
  return picks.map(p => ({ ...p, label: [...p.label].slice(0, 20).join('') }));
}

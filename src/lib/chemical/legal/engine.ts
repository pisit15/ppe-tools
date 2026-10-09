import { LEGAL_CATEGORIES, type LegalCandidate, type LegalCatalog, type LegalCheck, type LegalContext, type LegalObligation } from './types';

/** Accept only an intact CAS identifier with a valid check digit. Never repair spreadsheet numbers. */
export function normalizeCas(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cas = value.trim().replace(/[‐‑‒–−]/g, '-');
  if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) return null;
  const digits = cas.replace(/-/g, '');
  const sum = [...digits.slice(0, -1)].reverse().reduce((total, digit, i) => total + Number(digit) * (i + 1), 0);
  return sum % 10 === Number(digits.at(-1)) ? cas : null;
}
export function looksLikeCas(value: string) { return /^[\d\s‐‑‒–−-]+$/.test(value.trim()); }
const norm = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

export function searchLegalCatalog(catalog: LegalCatalog, query: string): { candidates: LegalCandidate[]; total: number; invalidCas: boolean } {
  const term = norm(query);
  if (!term) return { candidates: [], total: 0, invalidCas: false };
  const cas = normalizeCas(query);
  if (looksLikeCas(query) && !cas) return { candidates: [], total: 0, invalidCas: true };
  const found = new Map<string, LegalCandidate>();
  for (const entry of catalog.entries) {
    if (!(cas ? entry.cas_numbers.includes(cas) : norm([entry.name, ...entry.aliases].join(' ')).includes(term))) continue;
    for (const number of entry.cas_numbers) {
      if (!normalizeCas(number) || (cas && number !== cas)) continue;
      const current = found.get(number) || { cas: number, name: entry.name, categories: [], needsReview: false };
      if (!current.categories.includes(entry.category)) current.categories.push(entry.category);
      current.needsReview ||= entry.review_state !== 'verified';
      found.set(number, current);
    }
  }
  const candidates = [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return { candidates: candidates.slice(0, 40), total: candidates.length, invalidCas: false };
}
export function checkLegalCatalog(catalog: LegalCatalog, cas: string): LegalCheck {
  if (!normalizeCas(cas)) throw new Error('Invalid CAS');
  const entries = catalog.entries.filter(entry => entry.cas_numbers.includes(cas));
  const counts = Object.fromEntries(LEGAL_CATEGORIES.map(category => {
    const rows = entries.filter(entry => entry.category === category);
    return [category, {
      verified: rows.filter(r => r.legal_status === 'active' && r.review_state === 'verified').length,
      pending: rows.filter(r => r.legal_status === 'active' && r.review_state !== 'verified').length,
      historical: rows.filter(r => r.legal_status !== 'active').length,
    }];
  })) as LegalCheck['counts'];
  return { cas, entries, general: catalog.entries.filter(e => e.details.group), counts };
}

/** Screening only: absence from this partial catalog is never a legal exemption. */
export function evaluateObligations(check: LegalCheck, context: LegalContext): LegalObligation[] {
  return LEGAL_CATEGORIES.map(category => {
    const found = check.counts[category];
    if (category === 'health') return { category, status: 'conditional', text: 'ต้องเทียบกลุ่มสารและงานที่สัมผัส แล้วให้แพทย์กำหนดรายการตรวจ ไม่อนุมานจาก CAS อย่างเดียว' };
    if (!found.verified) return { category, status: 'unknown', text: found.pending ? 'พบรายการรอตรวจทาน ยังใช้ยืนยันหน้าที่ไม่ได้' : 'ยังไม่พบรายการยืนยันในชุดข้อมูลนี้ ต้องตรวจบัญชีและเงื่อนไขเพิ่มเติม' };
    if (category === 'reporting') {
      if (context.reporting_scope === 'in' && context.possessed_100kg === 'yes' && context.reporting_period) return { category, status: 'action', text: `เข้าข่ายแจ้ง วอ./อก.7 ตามบริบทที่ระบุ รอบ ${context.reporting_period} — ต้องตรวจเอกสารปริมาณและเงื่อนไขบัญชีประกอบ` };
      if (context.reporting_scope === 'out' || (context.reporting_scope === 'in' && context.possessed_100kg === 'no' && context.reporting_period)) return { category, status: 'not_triggered', text: 'บริบทที่ระบุยังไม่ถึงเงื่อนไข วอ./อก.7 สำหรับรายการนี้ ไม่ใช่ข้อยกเว้นกฎหมายเรื่องอื่น' };
      return { category, status: 'conditional', text: 'พบในบัญชี ต้องยืนยันขอบเขตการใช้ รอบครึ่งปี และมีหรือเคยมีในครอบครองตั้งแต่ 100 กก. ต่อรายชื่อในรอบนั้น' };
    }
    if (category === 'hazard') return { category, status: 'conditional', text: 'พบรายการ ต้องพิจารณาการใช้ ความเข้มข้น และข้อยกเว้นแยกตามหน่วยงานก่อนสรุปชนิด' };
    if (category === 'labour') return { category, status: 'conditional', text: 'พบในบัญชีสารเคมีอันตราย ตรวจขอบเขตสถานประกอบกิจการและการครอบครองเพื่อแจ้ง สอ.1 พร้อม SDS' };
    return { category, status: 'conditional', text: 'พบค่าขีดจำกัด ตรวจงานที่สัมผัส รูปสาร หน่วย และช่วงเวลาเฉลี่ยก่อนกำหนดแผนตรวจวัด' };
  });
}

export function parseLegalContext(input: unknown): LegalContext {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('กรุณาระบุบริบทการตรวจ');
  const data = input as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const value = data[key];
    if (typeof value !== 'string' || value.length > max) throw new Error('ข้อมูลบริบทไม่ถูกต้อง');
    return value.trim();
  };
  const choice = <T extends string>(key: string, values: readonly T[]): T => {
    const value = text(key, 30);
    if (!values.includes(value as T)) throw new Error('ตัวเลือกบริบทไม่ถูกต้อง');
    return value as T;
  };
  const result: LegalContext = {
    purpose: text('purpose', 1000), concentration: text('concentration', 10),
    concentration_unit: choice('concentration_unit', ['', '%w/w', '%v/v']),
    reporting_period: text('reporting_period', 7), reporting_scope: choice('reporting_scope', ['unknown', 'in', 'out']),
    possessed_100kg: choice('possessed_100kg', ['unknown', 'yes', 'no']), workplace_exposure: choice('workplace_exposure', ['unknown', 'yes', 'no']),
  };
  if (result.concentration && (!/^\d+(\.\d+)?$/.test(result.concentration) || Number(result.concentration) > 100 || !result.concentration_unit)) throw new Error('ความเข้มข้นต้องอยู่ระหว่าง 0–100 และระบุหน่วย');
  if (result.reporting_period && !/^(25|26)\d{2}-[12]$/.test(result.reporting_period)) throw new Error('รอบรายงานต้องเป็นปี พ.ศ.-ครึ่งปี เช่น 2569-1');
  return result;
}

import type { ChemicalComponent, ChemicalProductType } from '@/lib/types';
import { normalizeCas } from './legal/engine';

export const MAX_COMPONENTS = 100;
export const PRODUCT_TYPES: Record<ChemicalProductType, string> = { unknown: 'ยังไม่ระบุ', single: 'สารเดี่ยว', mixture: 'สารผสม' };
export const CONCENTRATION_BASES = { unspecified: 'SDS ไม่ระบุฐาน', 'w/w': '% โดยน้ำหนัก (w/w)', 'v/v': '% โดยปริมาตร (v/v)', 'w/v': '% น้ำหนักต่อปริมาตร (w/v)' } as const;
export const CAS_STATUSES = { specified: 'ระบุ CAS', not_provided: 'SDS ไม่ระบุ CAS', confidential: 'ความลับทางการค้า' } as const;
export const emptyComponent = (): ChemicalComponent => ({ name: '', cas_no: null, cas_status: 'specified', concentration_text: null, concentration_basis: 'unspecified', source_page: null });
export function validateProductType(value: unknown): ChemicalProductType {
  if (value !== 'unknown' && value !== 'single' && value !== 'mixture') throw new Error('ประเภทผลิตภัณฑ์ไม่ถูกต้อง');
  return value;
}
/** Shared by API and form; invalid identities are rejected instead of silently dropped. */
export function validateComponents(value: unknown): ChemicalComponent[] {
  if (!Array.isArray(value) || value.length > MAX_COMPONENTS) throw new Error(`องค์ประกอบต้องเป็นรายการไม่เกิน ${MAX_COMPONENTS} แถว`);
  return value.map((item, i) => {
    const fail = (message: string): never => { throw new Error(`องค์ประกอบ ${i + 1}: ${message}`); };
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail('รูปแบบไม่ถูกต้อง');
    const text = (key: string, max: number): string | null => {
      const v = item[key];
      if (v == null || v === '') return null;
      if (typeof v !== 'string' || v.length > max) return fail(`ช่อง ${key} ต้องเป็นข้อความไม่เกิน ${max} ตัวอักษร`);
      return v.trim() || null;
    };
    const name = text('name', 300); if (!name) return fail('กรุณาระบุชื่อสารตาม SDS');
    const cas_no = text('cas_no', 40)?.replace(/[‐‑‒–−]/g, '-') || null;
    const cas_status = item.cas_status;
    if (cas_status !== 'specified' && cas_status !== 'not_provided' && cas_status !== 'confidential') return fail('กรุณาระบุสถานะ CAS');
    if (cas_status === 'specified' && !normalizeCas(cas_no)) return fail('CAS ไม่ถูกต้อง หรือเลือก SDS ไม่ระบุ CAS');
    if (cas_status !== 'specified' && cas_no) return fail('สถานะไม่ระบุ/ความลับต้องไม่มีเลข CAS');
    const basis = item.concentration_basis;
    if (basis !== 'unspecified' && basis !== 'w/w' && basis !== 'v/v' && basis !== 'w/v') return fail('ฐานความเข้มข้นไม่ถูกต้อง');
    return { name, cas_no, cas_status, concentration_text: text('concentration_text', 120), concentration_basis: basis, source_page: text('source_page', 40) };
  });
}
export function componentSummary(c: ChemicalComponent): string {
  return [c.name, c.cas_no ? `CAS ${c.cas_no}` : CAS_STATUSES[c.cas_status], c.concentration_text, c.concentration_basis !== 'unspecified' ? CONCENTRATION_BASES[c.concentration_basis] : null].filter(Boolean).join(' · ');
}

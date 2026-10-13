import type { ChemSubstance } from '@/lib/types';
import type { LegalCatalog, LegalCheck, LegalEntry } from './types';
import { LEGAL_CATEGORIES } from './types';
import { CONCENTRATION_BASES } from '../components';
import { checkLegalCatalog, normalizeCas } from './engine';

export type ProductLegalInput = Pick<ChemSubstance, 'name' | 'cas_no' | 'product_type' | 'components'>;
export type ProductLegalPart = {
  key: string; name: string; kind: 'product' | 'component'; cas: string | null;
  concentration: string | null; basis: string | null; source_page: string | null;
  missingReason: string | null; check: LegalCheck | null;
};
export type ProductLegalCheck = {
  parts: ProductLegalPart[]; general: LegalEntry[]; counts: LegalCheck['counts']; checked_cas_count: number;
  missing_cas_count: number; component_count: number; incomplete: boolean;
};
/** Identity matching only. Concentration/use thresholds remain visible in the original legal conditions. */
export function checkRegisteredProduct(catalog: LegalCatalog, product: ProductLegalInput, cache = new Map<string, LegalCheck>()): ProductLegalCheck {
  const parts: ProductLegalPart[] = [];
  const resolve = (cas: string | null) => {
    if (!cas) return null;
    if (!cache.has(cas)) cache.set(cas, checkLegalCatalog(catalog, cas));
    return cache.get(cas)!;
  };
  if (product.cas_no?.trim() || (product.product_type !== 'mixture' && !product.components?.length)) {
    const cas = normalizeCas(product.cas_no);
    parts.push({ key: 'product', name: product.name, kind: 'product', cas, concentration: null, basis: null, source_page: null,
      missingReason: cas ? null : 'ไม่มี CAS ระดับผลิตภัณฑ์ที่ใช้ค้นหาได้', check: resolve(cas) });
  }
  for (const [index, c] of (product.components || []).entries()) {
    const cas = c.cas_status === 'specified' ? normalizeCas(c.cas_no) : null;
    parts.push({ key: `component-${index}`, name: c.name, kind: 'component', cas,
      concentration: c.concentration_text, basis: c.concentration_basis === 'unspecified' ? null : CONCENTRATION_BASES[c.concentration_basis], source_page: c.source_page,
      missingReason: cas ? null : c.cas_status === 'confidential' ? 'ไม่เปิดเผย CAS ใน SDS' : 'ไม่มี CAS ขององค์ประกอบที่ใช้ค้นหาได้', check: resolve(cas) });
  }
  const unique = new Map<string, LegalEntry>();
  for (const part of parts) for (const entry of part.check?.entries || []) unique.set(entry.id, entry);
  const counts = Object.fromEntries(LEGAL_CATEGORIES.map(category => {
    const rows = [...unique.values()].filter(e => e.category === category);
    return [category, { verified: rows.filter(e => e.legal_status === 'active' && e.review_state === 'verified').length,
      pending: rows.filter(e => e.legal_status === 'active' && e.review_state !== 'verified').length,
      historical: rows.filter(e => e.legal_status !== 'active').length }];
  })) as LegalCheck['counts'];
  const missing = parts.filter(p => !p.cas).length;
  return { parts, general: catalog.entries.filter(e => e.details.group), counts, checked_cas_count: new Set(parts.flatMap(p => p.cas ? [p.cas] : [])).size,
    missing_cas_count: missing, component_count: product.components?.length || 0,
    incomplete: missing > 0 || (product.product_type === 'mixture' && !product.components?.length) };
}

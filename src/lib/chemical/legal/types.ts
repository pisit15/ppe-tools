export const LEGAL_CATEGORIES = ['hazard', 'reporting', 'labour', 'health', 'exposure'] as const;
export type LegalCategory = typeof LEGAL_CATEGORIES[number];
export const CATEGORY_LABELS: Record<LegalCategory, string> = {
  hazard: 'ชนิดวัตถุอันตราย', reporting: 'วอ./อก.7', labour: 'สอ.1', health: 'ตรวจสุขภาพ', exposure: 'ตรวจความเข้มข้น',
};
export type LegalSource = { id: string; title: string; url: string; note: string; checked_on: string };
export type LegalEntry = {
  id: string; release_id: string; category: LegalCategory; name: string; aliases: string[];
  cas_numbers: string[]; source_cas: string; agency: string; list_ref: string; revision: string;
  source_id: string; source_page: number; hazardous_type: number | null;
  conditions: string; review_state: 'verified' | 'pending' | 'conflict';
  legal_status: 'active' | 'repealed' | 'superseded'; effective_from: string | null; effective_to: string | null;
  details: { note?: string; twa?: string; short?: string; duration?: string; ceiling?: string; related_sources?: string[]; group?: boolean; replaces?: string };
};
export type LegalRelease = {
  id: string; label: string; checked_on: string; entry_count: number; is_current: boolean;
  coverage: Record<LegalCategory, string>; gaps: string[];
};
export type LegalCatalog = { release: LegalRelease; sources: LegalSource[]; entries: LegalEntry[] };
export type LegalCandidate = { cas: string; name: string; categories: LegalCategory[]; needsReview: boolean };
export type LegalCheck = { cas: string; entries: LegalEntry[]; general: LegalEntry[]; counts: Record<LegalCategory, { verified: number; pending: number; historical: number }> };
export type LegalContext = {
  purpose: string; concentration: string; concentration_unit: '' | '%w/w' | '%v/v';
  reporting_period: string; reporting_scope: 'unknown' | 'in' | 'out';
  possessed_100kg: 'unknown' | 'yes' | 'no'; workplace_exposure: 'unknown' | 'yes' | 'no';
};
export const EMPTY_LEGAL_CONTEXT: LegalContext = { purpose: '', concentration: '', concentration_unit: '', reporting_period: '', reporting_scope: 'unknown', possessed_100kg: 'unknown', workplace_exposure: 'unknown' };
export type LegalObligation = { category: LegalCategory; status: 'conditional' | 'action' | 'not_triggered' | 'unknown'; text: string };
export type LegalAssessment = {
  id: string; company_id: string; substance_id: string | null; cas: string; release_id: string;
  review_status: 'pending' | 'reviewed'; review_note: string; actor_name: string; created_at: string;
  snapshot: { context: LegalContext; check: LegalCheck; sources: LegalSource[]; obligations: LegalObligation[]; substance_name: string | null; substance_updated_at: string | null };
};

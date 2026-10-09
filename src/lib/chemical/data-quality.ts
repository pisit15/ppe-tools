import type { ChemSubstance, ChemCompanySettings } from '@/lib/types';

export type QualityFilter = '' | 'missing_sds' | 'missing_date' | 'due' | 'no_policy' | 'no_class' | 'unreviewed';
export const hasSds = (s: Pick<ChemSubstance, 'sds_file_path' | 'sds_url'>) => Boolean(s.sds_file_path || s.sds_url);
export function sdsState(s: ChemSubstance, policy?: ChemCompanySettings, today = new Date()) {
  if (!hasSds(s)) return 'missing_sds';
  if (!s.sds_revision_date || !/^\d{4}-\d{2}-\d{2}$/.test(s.sds_revision_date)) return 'missing_date';
  const date = new Date(`${s.sds_revision_date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== s.sds_revision_date) return 'missing_date';
  const years = policy?.sds_review_years;
  if (!years || !policy?.sds_review_policy?.trim()) return 'no_policy';
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const due = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  const bangkokDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
  return due <= bangkokDay ? 'due' : 'current';
}
export function matchesQuality(s: ChemSubstance, filter: QualityFilter, policy?: ChemCompanySettings) {
  if (!filter) return true;
  if (filter === 'no_class') return !s.storage_class;
  if (filter === 'unreviewed') return s.review_status !== 'reviewed';
  return sdsState(s, policy) === filter;
}

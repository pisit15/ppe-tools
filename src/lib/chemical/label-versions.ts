import type { ChemSubstance } from '@/lib/types';
import { labelDraft, labelLayout, type LabelDraft, type LabelOptions } from './label';

export type SavedLabelDraft = Omit<LabelDraft, 'demo' | 'sdsUrl'>;
export interface LabelSnapshot { schema: 1; draft: SavedLabelDraft; options: LabelOptions }
export interface LabelVersionSummary {
  id: string; version: number; title: string; created_at: string;
  created_by: { id: string; accountTable: string; displayName: string; username: string };
}
export interface LabelVersion extends LabelVersionSummary { snapshot: LabelSnapshot }
export interface LabelHistory { versions: LabelVersionSummary[]; latest: LabelVersion | null; hasMore: boolean }

// Only editable fields are persisted. Public SDS URLs and demo markings come from the current record.
export function labelSnapshot(draft: LabelDraft, options: LabelOptions): LabelSnapshot {
  const { name, identity, pictograms, signal, hazards, precautions, supplier, emergency, contents, extra } = draft;
  return { schema: 1, draft: { name, identity, pictograms, signal, hazards, precautions, supplier, emergency, contents, extra }, options: {
    width: options.width, height: options.height, fontSize: options.fontSize, copies: options.copies, layout: options.layout,
    pageOrientation: options.pageOrientation, content: options.content, includeQr: options.includeQr,
  } };
}
export function restoreLabel(snapshot: LabelSnapshot, substance: ChemSubstance): LabelDraft {
  const current = labelDraft(substance);
  return { ...snapshot.draft, demo: current.demo, sdsUrl: current.sdsUrl };
}

export function validateLabelSnapshot(input: unknown): LabelSnapshot {
  const invalid = () => { throw new Error('ข้อมูลฉลากไม่ถูกต้อง กรุณาตรวจข้อความและขนาดฉลาก'); };
  if (!input || typeof input !== 'object') return invalid();
  const source = input as Record<string, unknown>;
  if (source.schema !== 1 || !source.draft || typeof source.draft !== 'object' || !source.options || typeof source.options !== 'object') return invalid();
  const draft = source.draft as Record<string, unknown>;
  const options = source.options as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const value = draft[key];
    if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) return invalid();
    return value;
  };
  if (!Array.isArray(draft.pictograms) || draft.pictograms.length > 9 || !draft.pictograms.every(p => typeof p === 'string' && /^GHS0[1-9]$/.test(p))) return invalid();
  if (typeof draft.signal !== 'string' || !['', 'Danger', 'Warning', 'None'].includes(draft.signal)) return invalid();
  if (typeof options.layout !== 'string' || !['a4', 'single'].includes(options.layout)
    || typeof options.pageOrientation !== 'string' || !['portrait', 'landscape'].includes(options.pageOrientation)
    || typeof options.content !== 'string' || !['full', 'compact'].includes(options.content) || typeof options.includeQr !== 'boolean') return invalid();
  if (![options.width, options.height, options.fontSize, options.copies].every(v => typeof v === 'number' && Number.isFinite(v))) return invalid();
  const cleanOptions: LabelOptions = {
    width: options.width as number, height: options.height as number, fontSize: options.fontSize as number, copies: options.copies as number,
    layout: options.layout as LabelOptions['layout'], pageOrientation: options.pageOrientation as LabelOptions['pageOrientation'],
    content: options.content as LabelOptions['content'], includeQr: options.includeQr,
  };
  labelLayout(cleanOptions);
  // Saving an unfinished draft is allowed; PDF export still applies labelProblems and overflow checks.
  return { schema: 1, draft: {
    name: text('name', 500), identity: text('identity', 500), contents: text('contents', 500),
    supplier: text('supplier', 500), emergency: text('emergency', 500), extra: text('extra', 8000),
    hazards: text('hazards', 8000), precautions: text('precautions', 8000),
    pictograms: [...new Set(draft.pictograms)] as SavedLabelDraft['pictograms'], signal: draft.signal as SavedLabelDraft['signal'],
  }, options: cleanOptions };
}

import type { ChemSubstance, GhsPictogramCode, SignalWord } from '@/lib/types';
import { H_STATEMENTS, P_STATEMENTS } from './ghs';

export const MISSING_LABEL_TEXT = '[เติมข้อความจาก SDS]';
export interface LabelDraft {
  name: string;
  identity: string;
  pictograms: GhsPictogramCode[];
  signal: SignalWord | '';
  hazards: string;
  precautions: string;
  supplier: string;
  emergency: string;
  contents: string;
  extra: string;
  demo: boolean;
}
export interface LabelOptions { width: number; height: number; fontSize: number; copies: number; layout: 'a4' | 'single' }
export const DEFAULT_LABEL_OPTIONS: LabelOptions = { width: 90, height: 120, fontSize: 9, copies: 4, layout: 'a4' };

function statements(codes: string[], dictionary: Record<string, string>) {
  return [...new Set(codes)].map(raw => {
    const code = raw.trim().toUpperCase();
    const text = dictionary[code] || code.split('+').map(c => dictionary[c.trim()] || MISSING_LABEL_TEXT).join(' ');
    return `${code} ${text.replace(/…|\.{3}/g, MISSING_LABEL_TEXT)}`;
  }).join('\n');
}

export function labelDraft(substance: ChemSubstance): LabelDraft {
  return {
    name: substance.name,
    identity: [substance.chemical_name, substance.cas_no && `CAS ${substance.cas_no}`, substance.un_no && `UN ${substance.un_no}`].filter(Boolean).join(' · '),
    pictograms: [...new Set(substance.ghs_pictograms || [])],
    signal: substance.signal_word || '',
    hazards: statements(substance.h_codes || [], H_STATEMENTS),
    precautions: statements(substance.p_codes || [], P_STATEMENTS),
    supplier: substance.supplier || '', emergency: substance.emergency_contact || '',
    // Inventory quantity is not the amount in the individual container.
    contents: '', extra: '', demo: !!substance.is_demo,
  };
}

export function labelLayout(options: LabelOptions) {
  const { width, height, copies, fontSize, layout } = options;
  if (![width, height, copies, fontSize].every(Number.isFinite) || width < 50 || width > 190 || height < 50 || height > 277 || !Number.isInteger(copies) || copies < 1 || copies > 100 || fontSize < 8 || fontSize > 12) {
    throw new Error('กำหนดกว้าง 50–190 มม. สูง 50–277 มม. จำนวน 1–100 ดวง และตัวอักษร 8–12 pt');
  }
  const gap = 4;
  const margin = layout === 'a4' ? 10 : 0;
  const columns = layout === 'a4' ? Math.floor((190 + gap) / (width + gap)) : 1;
  const rows = layout === 'a4' ? Math.floor((277 + gap) / (height + gap)) : 1;
  const perPage = columns * rows;
  return { columns, rows, perPage, pages: Math.ceil(copies / perPage), margin, gap };
}

export function labelProblems(draft: LabelDraft) {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push('กรอกชื่อสารเคมี');
  if (!draft.signal) problems.push('ระบุคำสัญญาณตาม SDS (หรือเลือกไม่มีคำสัญญาณ)');
  if ([draft.hazards, draft.precautions].some(t => t.includes(MISSING_LABEL_TEXT))) problems.push('เติมข้อความของรหัสที่ระบบไม่มีข้อมูลให้ครบตาม SDS');
  return problems;
}

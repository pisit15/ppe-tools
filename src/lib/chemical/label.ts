import type { ChemSubstance, GhsPictogramCode, SignalWord } from '@/lib/types';
import { H_STATEMENTS, P_STATEMENTS } from './ghs';
import type { LabelPpeCode } from './ppe';

export const MISSING_LABEL_TEXT = '[เติมข้อความจาก SDS]';
export interface LabelDraft {
  name: string;
  identity: string;
  pictograms: GhsPictogramCode[];
  ppe: LabelPpeCode[];
  signal: SignalWord | '';
  hazards: string;
  precautions: string;
  supplier: string;
  emergency: string;
  contents: string;
  extra: string;
  demo: boolean;
  sdsUrl: string;
}
export interface LabelOptions {
  width: number; height: number; fontSize: number; copies: number; layout: 'a4' | 'single';
  pageOrientation: 'portrait' | 'landscape'; content: 'full' | 'compact'; includeQr: boolean;
  /** Optional for snapshots saved before QR sizing was introduced. */
  qrSize?: 16 | 20 | 24;
  /** Older snapshots preserve the existing visible-caption behaviour. */
  showPpeCaptions?: boolean;
}
export interface LabelPreset {
  id: string; orientation: 'portrait' | 'landscape'; pageOrientation: 'portrait' | 'landscape';
  columns: number; rows: number; count: number; width: number; height: number;
}
function preset(id: string, orientation: LabelPreset['orientation'], pageOrientation: LabelPreset['pageOrientation'], columns: number, rows: number): LabelPreset {
  const paper = pageOrientation === 'portrait' ? [210, 297] : [297, 210];
  return { id, orientation, pageOrientation, columns, rows, count: columns * rows,
    width: Math.floor((paper[0] - 20 - (columns - 1) * 4) / columns * 10) / 10,
    height: Math.floor((paper[1] - 20 - (rows - 1) * 4) / rows * 10) / 10 };
}
export const LABEL_PRESETS: LabelPreset[] = [
  preset('landscape-8', 'landscape', 'portrait', 2, 4),
  preset('landscape-6', 'landscape', 'landscape', 2, 3),
  preset('landscape-4', 'landscape', 'landscape', 2, 2),
  preset('landscape-2', 'landscape', 'portrait', 1, 2),
  preset('landscape-1', 'landscape', 'landscape', 1, 1),
  preset('portrait-6', 'portrait', 'portrait', 3, 2),
  preset('portrait-4', 'portrait', 'portrait', 2, 2),
  preset('portrait-1', 'portrait', 'portrait', 1, 1),
];
export const DEFAULT_LABEL_OPTIONS: LabelOptions = { width: 93, height: 136.5, fontSize: 9, copies: 4, layout: 'a4', pageOrientation: 'portrait', content: 'full', includeQr: true, qrSize: 16, showPpeCaptions: true };
export function publicSdsUrl(id: string) { return `https://tools.eashe.org/sds/${encodeURIComponent(id)}`; }
export function applyLabelPreset(options: LabelOptions, p: LabelPreset): LabelOptions {
  return { ...options, width: p.width, height: p.height, pageOrientation: p.pageOrientation, layout: 'a4', copies: p.count };
}

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
    ppe: [],
    signal: substance.signal_word || '',
    hazards: statements(substance.h_codes || [], H_STATEMENTS),
    precautions: statements(substance.p_codes || [], P_STATEMENTS),
    supplier: substance.supplier || '', emergency: substance.emergency_contact || '',
    // Inventory quantity is not the amount in the individual container.
    contents: '', extra: '', demo: !!substance.is_demo,
    sdsUrl: substance.sds_file_path || substance.sds_url ? publicSdsUrl(substance.id) : '',
  };
}

export function labelLayout(options: LabelOptions) {
  const { width, height, copies, fontSize, layout, pageOrientation } = options;
  if (![width, height, copies, fontSize].every(Number.isFinite) || width < 50 || width > 277 || height < 50 || height > 277 || !Number.isInteger(copies) || copies < 1 || copies > 100 || fontSize < 8 || fontSize > 12) {
    throw new Error('กำหนดกว้าง/สูง 50–277 มม. จำนวน 1–100 ดวง และตัวอักษร 8–12 pt');
  }
  const gap = 4;
  const margin = layout === 'a4' ? 10 : 0;
  const pageWidth = layout === 'single' ? width : pageOrientation === 'landscape' ? 297 : 210;
  const pageHeight = layout === 'single' ? height : pageOrientation === 'landscape' ? 210 : 297;
  const columns = layout === 'a4' ? Math.floor((pageWidth - margin * 2 + gap + 0.0001) / (width + gap)) : 1;
  const rows = layout === 'a4' ? Math.floor((pageHeight - margin * 2 + gap + 0.0001) / (height + gap)) : 1;
  const perPage = columns * rows;
  if (!perPage) throw new Error('ฉลากไม่พอดีกับ A4 แนวนี้ ลองหมุนกระดาษหรือเลือกหนึ่งดวงต่อหน้า');
  return { columns, rows, perPage, pages: Math.ceil(copies / perPage), margin, gap, pageWidth, pageHeight };
}

// GHS hazard statements whose category always carries the signal word "Danger"
// (Rev.9 Annex 1). Mixed-category codes (e.g. H228, H242) are deliberately left out.
const DANGER_CODES = new Set([
  'H200', 'H201', 'H202', 'H203', 'H220', 'H222', 'H224', 'H225', 'H230', 'H240', 'H241', 'H250', 'H260', 'H261',
  'H270', 'H271', 'H300', 'H301', 'H304', 'H310', 'H311', 'H314', 'H318', 'H330', 'H331', 'H334', 'H340', 'H350',
  'H360', 'H370', 'H372',
]);
// Codes that need at least "Warning" (their category never has "no signal word").
const SIGNAL_REQUIRED_CODES = new Set([
  ...DANGER_CODES, 'H204', 'H221', 'H223', 'H226', 'H227', 'H229', 'H252', 'H272', 'H280', 'H281', 'H290', 'H302',
  'H312', 'H315', 'H317', 'H319', 'H320', 'H332', 'H335', 'H336', 'H341', 'H351', 'H361', 'H362', 'H371', 'H373',
  'H400', 'H410',
]);
const hazardCodesIn = (text: string) => [...new Set((text.toUpperCase().match(/H\d{3}/g) || []))];

/** GHS label completeness checks — every problem blocks the PDF download. */
export function labelProblems(draft: LabelDraft, options?: LabelOptions) {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push('กรอกชื่อสารเคมี');
  if (!draft.signal) problems.push('ระบุคำสัญญาณตาม SDS (หรือเลือกไม่มีคำสัญญาณ)');
  const codes = hazardCodesIn(draft.hazards);
  const hasSignal = draft.signal === 'Danger' || draft.signal === 'Warning';
  if ((hasSignal || draft.pictograms.length > 0) && codes.length === 0) {
    problems.push('มีคำสัญญาณหรือรูปสัญลักษณ์อันตราย แต่ยังไม่มีข้อความแสดงอันตราย (รหัส H) — เติมจาก SDS ข้อ 2');
  }
  const dangerCodes = codes.filter(c => DANGER_CODES.has(c));
  if (dangerCodes.length && draft.signal !== 'Danger') {
    problems.push(`คำสัญญาณต้องเป็น "อันตราย (Danger)" เพราะมี ${dangerCodes.slice(0, 3).join(', ')}`);
  } else if (draft.signal === 'None' && codes.some(c => SIGNAL_REQUIRED_CODES.has(c))) {
    problems.push('รหัส H ที่ระบุต้องมีคำสัญญาณ — เลือก "ระวัง (Warning)" หรือ "อันตราย (Danger)" ตาม SDS');
  }
  if (!draft.supplier.trim()) problems.push('กรอกชื่อผู้ผลิต/ผู้จำหน่าย (ข้อมูลบังคับบนฉลาก GHS)');
  if ([draft.hazards, ...(options?.content === 'compact' ? [] : [draft.precautions])].some(t => t.includes(MISSING_LABEL_TEXT))) problems.push('เติมข้อความของรหัสที่ระบบไม่มีข้อมูลให้ครบตาม SDS');
  return problems;
}

import type { GateCheckConfig, GateCheckRow, HasPermit, VisitorStatus } from './types';

// Option lists copied from Jotform 241632326118046 (30 Oct 2026). Free text is never
// forced into these lists: the API stores whatever the form sends after length checks.

export const VISITOR_DEPARTMENTS = [
  'Accounting', 'Administration', 'Battery Manufacturing', 'Cell Assembly', 'Customer Service',
  'Domestic Sales', 'Electrode', 'Equipment Development', 'Facility Maintenance', 'Formation',
  'Human Resources', 'Manufacturing Planning', 'MES', 'MIS', 'NMP', 'Pack', 'Module',
  'Process Engineering', 'Procurement', 'Production Development', 'Production Plant Maintenance',
  'Project 2 G', 'Quality Control', 'Quality Engineering', 'Quality Management System',
  'Research & Development', 'Safety & Environment', 'Supplier Quality Management',
  'Supply Chain Management', 'Warehouse & Logistics', 'Others (อื่นๆ)',
] as const;

export const VISITOR_PURPOSES = [
  'ผู้รับเหมาปฏิบัติงาน (Contractor\'s Working)',
  'ส่งสินค้า (Deliver Goods)',
  'รับสินค้า (Received Goods)',
  'รับ/ส่งเอกสาร (Receive/Send Documents)',
  'ประชุมธุรกิจ (Business Meeting)',
  'นำเสนอสินค้า (Present Product)',
  'วิทยากร / ที่ปรึกษา (Trainer / Consultant)',
  'อาจารย์นิเทศน์นักศึกษา (The instructor visits the trainee)',
  'มาเข้ารับการอบรม (Trainee)',
  'หน่วยงานรัฐ (Government Department)',
  'ออดิท (Audit)',
  'ฉีดวัคซีน',
  'อื่นๆ (Others)',
] as const;
export const PURPOSE_OTHER = 'อื่นๆ (Others)';
export const PURPOSE_CONTRACTOR = VISITOR_PURPOSES[0];

export const VISITOR_WORK_AREAS = [
  'FB01 ชั้น 1', 'FB01 ชั้น 1.5', 'FB01 ชั้น 1.5.5', 'FB01 ชั้น 2', 'FB01 ชั้น 2.5',
  'อาคาร Electrolyte', 'อาคาร Workshop', 'อาคาร UT', 'อาคาร CCR', 'อาคาร Warehouse ใหม่',
  'ห้องขยะ (Solid Waste)', 'Waste Water Treatment', 'Sub Station', 'ESS', 'Raw Material Loading',
  'พื้นที่รอบนอกอาคาร', 'อื่น ๆ',
] as const;

export const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  submitted: 'รออนุมัติ',
  need_info: 'ขอข้อมูลเพิ่ม',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก',
};

export const HAS_PERMIT_LABEL: Record<HasPermit, string> = {
  yes: 'มี Permit to Work ที่อนุมัติแล้ว',
  no: 'ไม่มี',
  unknown: 'ไม่ทราบ / ยังไม่ได้ขอ',
};

export const VISITOR_LIMITS = {
  maxPersons: 60,
  maxRequestsPerLinkPerHour: 60,
  boardDaysAhead: 1, // today + tomorrow
  maxBatchDays: 14, // dates per multi-day request
};

// "ตรวจที่ทางเข้า โดย รปภ." — per-company matrix (visitor_company_options.gate_check). This is the AMT default
// (Jotform table: helmet / vest / shoes); other companies edit columns and rows in /visitor/settings.
const P_CONTRACTOR = 'ผู้รับเหมาปฏิบัติงาน (Contractor\'s Working)';
const P_GOODS = ['ส่งสินค้า (Deliver Goods)', 'รับสินค้า (Received Goods)'];
const P_DOCS = 'รับ/ส่งเอกสาร (Receive/Send Documents)';
export const DEFAULT_GATE_CHECK: GateCheckConfig = {
  title: 'ตรวจอุปกรณ์ PPE ที่ทางเข้า โดย รปภ.',
  items: ['หมวกเซฟตี้', 'เสื้อสะท้อนแสง', 'รองเท้าเซฟตี้'],
  rows: [
    { key: 'contractor', label: 'ผู้รับเหมา', en: 'Contractor', purposes: [P_CONTRACTOR], areaMode: 'any', areas: [], checks: [true, true, true] },
    { key: 'garbage', label: 'รถขยะทั่วไป รีไซเคิล ติดเชื้อ', en: 'Garbage truck', purposes: P_GOODS, areaMode: 'areas', areas: ['ห้องขยะ (Solid Waste)'], checks: [false, true, false] },
    { key: 'transport', label: 'พนักงานขับรถส่งสินค้า', en: 'Transportation Driver', purposes: P_GOODS, areaMode: 'any', areas: [], checks: [true, true, true] },
    { key: 'delivery', label: 'บริษัทขนส่งเอกชน', en: 'Private Delivery Driver', purposes: [P_DOCS], areaMode: 'any', areas: [], checks: [false, true, false] },
    { key: 'visitor_work', label: 'ผู้มาติดต่อ (เข้าพื้นที่ทำงาน)', en: 'Visitor (At working area)', purposes: [], areaMode: 'with_area', areas: [], checks: [true, true, true] },
    { key: 'visitor_meeting', label: 'ผู้มาติดต่อ (ไม่มีการทำงาน)', en: 'Visitor (At Meeting room)', purposes: [], areaMode: 'without_area', areas: [], checks: [false, false, false] },
  ],
};

/** Normalise whatever is stored (or null) into a usable config: pads/truncates checks to items, drops blanks. */
export function gateCheckConfig(raw: unknown): GateCheckConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_GATE_CHECK;
  const c = raw as Partial<GateCheckConfig>;
  const items = Array.isArray(c.items) ? c.items.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 12) : [];
  const rows: GateCheckRow[] = Array.isArray(c.rows) ? c.rows.filter(r => r && typeof r === 'object').map((r, i): GateCheckRow => ({
    key: String(r.key || `row${i}`),
    label: String(r.label ?? '').trim().slice(0, 80),
    en: String(r.en ?? '').trim().slice(0, 80),
    purposes: Array.isArray(r.purposes) ? r.purposes.map(String) : [],
    areaMode: r.areaMode === 'with_area' || r.areaMode === 'without_area' || r.areaMode === 'areas' ? r.areaMode : 'any',
    areas: Array.isArray(r.areas) ? r.areas.map(String) : [],
    checks: items.map((_, k) => Boolean(Array.isArray(r.checks) && r.checks[k])),
  })).filter(r => r.label).slice(0, 30) : [];
  return { title: String(c.title ?? '').trim().slice(0, 120) || 'ตรวจที่ทางเข้า โดย รปภ.', items, rows };
}

/** First row whose rule matches (purpose + work areas). Null when no purpose yet or nothing matches. */
export function gateCheckRowFor(config: GateCheckConfig, purpose: string, workAreas: string[]): GateCheckRow | null {
  if (!purpose) return null;
  const hasArea = workAreas.length > 0;
  return config.rows.find(r => {
    if (r.purposes.length && !r.purposes.includes(purpose)) return false;
    if (r.areaMode === 'with_area') return hasArea;
    if (r.areaMode === 'without_area') return !hasArea;
    if (r.areaMode === 'areas') return r.areas.some(a => workAreas.includes(a));
    return true;
  }) || null;
}
export function gateCheckText(config: GateCheckConfig, row: GateCheckRow | null) {
  if (!row) return '';
  const items = config.items.filter((_, k) => row.checks[k]);
  return items.length ? items.join(' · ') : 'ไม่ต้องตรวจเพิ่มเติม';
}

// "การพิจารณาการอนุญาตให้นำรถเข้าภายในโรงงาน" — vehicle-entry policy per purpose (owner, 30 Oct 2026).
// allow: vehicle may enter, no reason needed · conditional: form asks for a reason, SHE decides per vehicle ·
// deny: the vehicle question is hidden and the form tells the requester to park outside.
export type VehiclePolicy = { mode: 'allow' | 'conditional' | 'deny'; note: string; reasonLabel?: string; reasonHint?: string };
const CONDITIONAL_BULKY: VehiclePolicy = {
  mode: 'conditional',
  note: 'นำรถเข้าได้เฉพาะกรณีมีสิ่งของจำเป็นสำหรับการปฏิบัติงาน ซึ่งมีขนาดใหญ่/จำนวนมากจนถือเข้าไปไม่ได้ — ทีม SHE พิจารณารายคัน',
  reasonLabel: 'สิ่งของที่ต้องขนเข้า และเหตุใดจึงถือเข้าไปไม่ได้ *',
  reasonHint: 'เช่น นั่งร้าน 20 ชุด, เครื่องเชื่อม 2 เครื่อง, ตัวอย่างสินค้า 15 ลัง',
};
export const VEHICLE_POLICY: Record<string, VehiclePolicy> = {
  'ผู้รับเหมาปฏิบัติงาน (Contractor\'s Working)': CONDITIONAL_BULKY,
  'ส่งสินค้า (Deliver Goods)': { mode: 'allow', note: 'รถส่งสินค้านำเข้าภายในได้' },
  'รับสินค้า (Received Goods)': { mode: 'allow', note: 'รถรับสินค้านำเข้าภายในได้' },
  // Owner (30 Oct): document runs are EA's own cars signed in by Administration — allowed by default.
  'รับ/ส่งเอกสาร (Receive/Send Documents)': { mode: 'allow', note: 'รถรับ-ส่งเอกสารของ EA (ลงชื่อโดยแผนก Administration) นำเข้าภายในได้' },
  'ประชุมธุรกิจ (Business Meeting)': {
    mode: 'conditional',
    note: 'การประชุมธุรกิจโดยทั่วไป ให้จอดรถที่ลานจอดนอกพื้นที่โรงงาน เฉพาะกรณีผู้มาประชุมเป็นบุคคลสำคัญระดับ VIP เท่านั้น จึงนำรถเข้ามาจอดได้ — ทีม SHE พิจารณารายคัน',
    reasonLabel: 'เป็นบุคคลสำคัญระดับ VIP อย่างไร มีความสำคัญอย่างไร *',
    reasonHint: 'เช่น CEO บริษัทคู่ค้า มาลงนามสัญญา, ผู้บริหารระดับสูงของลูกค้ารายใหญ่',
  },
  'นำเสนอสินค้า (Present Product)': { ...CONDITIONAL_BULKY, note: 'นำรถเข้าได้เฉพาะกรณีมีสิ่งของจำเป็นสำหรับการนำเสนอสินค้า ซึ่งมีขนาดใหญ่/จำนวนมากจนถือเข้าไปไม่ได้ — ทีม SHE พิจารณารายคัน' },
  'วิทยากร / ที่ปรึกษา (Trainer / Consultant)': { mode: 'allow', note: 'นำรถเข้าภายในได้' },
  'อาจารย์นิเทศน์นักศึกษา (The instructor visits the trainee)': { mode: 'allow', note: 'นำรถเข้าภายในได้' },
  'มาเข้ารับการอบรม (Trainee)': { mode: 'deny', note: 'ผู้เข้ารับการอบรมไม่อนุญาตนำรถเข้าภายในโรงงาน กรุณาแจ้งผู้มาติดต่อให้จอดที่ลานจอดด้านนอก' },
  'หน่วยงานรัฐ (Government Department)': { mode: 'allow', note: 'นำรถเข้าภายในได้' },
  'ออดิท (Audit)': { mode: 'allow', note: 'นำรถเข้าภายในได้' },
  'ฉีดวัคซีน': { mode: 'deny', note: 'ไม่อนุญาตนำรถเข้าภายในโรงงาน กรุณาจอดที่ลานจอดด้านนอก' },
};
const OTHER_POLICY: VehiclePolicy = { mode: 'conditional', note: 'วัตถุประสงค์นี้ไม่อยู่ในตาราง — ทีม SHE พิจารณารายคัน', reasonLabel: 'เหตุผลที่ต้องนำรถเข้าภายใน *' };
export const vehiclePolicyFor = (purpose: string): VehiclePolicy => VEHICLE_POLICY[purpose] || OTHER_POLICY;
export const VEHICLE_TYPES = ['รถยนต์นั่ง', 'กระบะ/ตู้', 'รถ 6 ล้อ', 'รถ 10 ล้อ/บรรทุก', 'อื่น ๆ'] as const;
export const VEHICLE_DECISION_LABEL = { allowed: 'เข้าภายในได้', pending: 'รอ SHE พิจารณา', outside: 'จอดลานด้านนอก' } as const;

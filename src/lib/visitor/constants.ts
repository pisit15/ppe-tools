import type { HasPermit, VisitorStatus } from './types';

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
};

// "ตรวจอุปกรณ์ PPE ที่ทางเข้า โดย รปภ." — the matrix image on the Jotform, as data so the form and the
// guard board can highlight the row that applies to a request.
export type PpeRow = { key: string; label: string; en: string; hat: boolean; vest: boolean; shoes: boolean };
export const PPE_MATRIX: PpeRow[] = [
  { key: 'contractor', label: 'ผู้รับเหมา', en: 'Contractor', hat: true, vest: true, shoes: true },
  { key: 'transport', label: 'พนักงานขับรถส่งสินค้า', en: 'Transportation Driver', hat: true, vest: true, shoes: true },
  { key: 'visitor_work', label: 'ผู้มาติดต่อ (เข้าพื้นที่ทำงาน)', en: 'Visitor (At working area)', hat: true, vest: true, shoes: true },
  { key: 'delivery', label: 'บริษัทขนส่งเอกชน', en: 'Private Delivery Driver', hat: false, vest: true, shoes: false },
  { key: 'garbage', label: 'รถขยะทั่วไป รีไซเคิล ติดเชื้อ', en: 'Garbage truck', hat: false, vest: true, shoes: false },
  { key: 'visitor_meeting', label: 'ผู้มาติดต่อ (ไม่มีการทำงาน)', en: 'Visitor (At Meeting room)', hat: false, vest: false, shoes: false },
];
export const PPE_LABEL = { hat: 'หมวกเซฟตี้', vest: 'เสื้อสะท้อนแสง', shoes: 'รองเท้าเซฟตี้' } as const;

/** Which PPE row applies to a request (purpose + work areas). Returns null when nothing is chosen yet. */
export function ppeRowFor(purpose: string, workAreas: string[]): PpeRow | null {
  if (!purpose) return null;
  const find = (k: string) => PPE_MATRIX.find(r => r.key === k) || null;
  if (/ผู้รับเหมา/.test(purpose)) return find('contractor');
  if (/สินค้า/.test(purpose)) return workAreas.some(a => /ขยะ|waste/i.test(a)) ? find('garbage') : find('transport');
  if (/เอกสาร/.test(purpose)) return find('delivery');
  return workAreas.length > 0 ? find('visitor_work') : find('visitor_meeting');
}
export function ppeText(row: PpeRow | null) {
  if (!row) return '';
  const items = (['hat', 'vest', 'shoes'] as const).filter(k => row[k]).map(k => PPE_LABEL[k]);
  return items.length ? items.join(' · ') : 'ไม่ต้องใช้ PPE';
}

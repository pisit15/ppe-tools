import type { InspDueState, InspItemKind, InspServiceKind, InspectionMode } from './types';

export const INSPECT_MODULE_ID = 'inspect';
export const INSPECT_BUCKET = 'inspect-photos';

export const INSPECT_LIMITS = {
  /** Server-side ceiling per photo after client compression (bytes). */
  maxPhotoBytes: 600 * 1024,
  /** Client compression targets. */
  photoMaxPx: 1280,
  photoQuality: 0.78,
  /** Public form: inspections per asset per hour (abuse guard). */
  maxInspectionsPerAssetPerHour: 12,
  /** Registry import */
  maxImportRows: 2000,
  /** Remember inspector code on the device (days). */
  rememberInspectorDays: 30,
} as const;

export const DUE_STATE_LABEL: Record<InspDueState, string> = {
  ok: 'ตรวจแล้ว',
  due_soon: 'ใกล้ถึงรอบ',
  overdue: 'เกินกำหนด',
  never: 'ยังไม่เคยตรวจ',
  inactive: 'ไม่ใช้งาน',
};
export const DUE_STATE_COLOR: Record<InspDueState, string> = {
  ok: '#59A14F',
  due_soon: '#F28E2B',
  overdue: '#E15759',
  never: '#BAB0AC',
  inactive: '#D4D4D4',
};

export const MODE_LABEL: Record<InspectionMode, string> = {
  she: 'ทีม SHE เท่านั้น (ต้องเข้าสู่ระบบ)',
  department: 'พนักงานแผนก (รหัสผู้ตรวจ ไม่ต้องเข้าสู่ระบบ)',
};

export const ITEM_KIND_LABEL: Record<InspItemKind, string> = {
  pass_fail: 'ผ่าน / ไม่ผ่าน',
  pass_fail_na: 'ผ่าน / ไม่ผ่าน / ไม่มี',
  number: 'ตัวเลข',
};

export const SERVICE_KIND_LABEL: Record<InspServiceKind, string> = {
  legal_test: 'ทดสอบตามกฎหมาย/มาตรฐาน',
  refill: 'เติม/อัดใหม่',
  maintenance: 'ซ่อมบำรุง',
  replace: 'เปลี่ยนใหม่',
  dispose: 'ปลดระวาง',
  other: 'อื่น ๆ',
};

/** Category icons available in the UI (lucide names → component map lives in _components/icons.tsx). */
export const CATEGORY_ICONS = ['flame', 'droplets', 'waves', 'shirt', 'lightbulb', 'heart-pulse', 'package', 'shield', 'siren', 'wrench', 'thermometer', 'zap', 'wind', 'biohazard'] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

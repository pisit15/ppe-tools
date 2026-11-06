export type FirstAidMode = 'controlled' | 'self_service';
export type TransactionKind = 'issue' | 'receive' | 'transfer' | 'dispose';
export type PersonSnapshot = { id?: string | null; code?: string; name: string; department: string; identityMethod?: 'self_declared' };
export type TransactionLine = { itemId: string; quantity: number; lotId?: string };
export type TransactionInput = {
  idempotencyKey: string; kind: TransactionKind; locationId: string; destinationId?: string;
  date: string; lines: TransactionLine[]; expiry?: string | null; lotCode?: string;
  requesterId?: string; recipientId?: string; requesterPerson?: PersonSnapshot; recipientPerson?: PersonSnapshot;
  requester?: PersonSnapshot; onBehalf?: boolean; note?: string;
};

export type FirstAidEmployee = { id: string; code: string; name: string; department: string };

export type FirstAidPermissions = { canManage: boolean; canClinical: boolean; public: boolean };

/** Placeholder name stored when the person collecting was not recorded (staff dispensing or anonymous QR pick). */
export const FA_ANON_NAME = 'ไม่ระบุ';
export const FA_ANON_DEPARTMENT = 'ไม่ระบุ';

export type FaIcon = '' | 'pill' | 'bottle' | 'sachet' | 'plaster' | 'gauze' | 'mask' | 'glove' | 'device' | 'cream' | 'other';
export const FA_ICONS: { id: Exclude<FaIcon, ''>; label: string }[] = [
  { id: 'pill', label: 'ยาเม็ด / แคปซูล' }, { id: 'bottle', label: 'ยาน้ำ / ขวด' }, { id: 'sachet', label: 'ซอง' }, { id: 'cream', label: 'ครีม / หลอด' },
  { id: 'plaster', label: 'พลาสเตอร์' }, { id: 'gauze', label: 'ผ้าก๊อซ / ผ้าพัน' }, { id: 'mask', label: 'หน้ากาก' }, { id: 'glove', label: 'ถุงมือ' }, { id: 'device', label: 'อุปกรณ์' }, { id: 'other', label: 'อื่น ๆ' },
];

// ---- Shapes returned by /api/first-aid/state (normalized at the API boundary) ----
export type FaLocation = { id: string; name: string; type: string; area: string; issueMode: FirstAidMode; lastChecked: string | null; inspectionIssue: boolean; hasPublicLink: boolean; icon: string; isRegister: boolean };
export type FaItem = { id: string; name: string; generic: string; description: string; category: string; unit: string; min: number; trackExpiry: boolean; icon: FaIcon; imageUrl: string | null; hasImage: boolean; imageSource: string };
export type FaLot = { id: string; itemId: string; locationId: string; code: string; expiry: string | null; quantity: number };
export type FaThreshold = { itemId: string; locationId: string; min: number };
export type FaInspection = { id: string; locationId: string; date: string; notes: string; hasIssue: boolean; ready: boolean; lowItems: string[]; expiredLots: string[] };
export type FaVisit = { id: string; date: string; person: string; service: string; note: string; timeIn: string; timeOut: string };
export type FaAllocation = { lotId: string; code: string; expiry: string | null; quantity: number };
export type FaEvent = {
  id: string; documentId: string; date: string; datePrecision: 'day' | 'month'; kind: TransactionKind; itemId: string; locationId: string; destinationId?: string; quantity: number;
  allocations: FaAllocation[]; requester: PersonSnapshot | null; recipientPerson: PersonSnapshot | null; recipient: string; onBehalf: boolean; note: string;
  recordedBy: { id: string; name: string; identityMethod: 'legacy_import' | 'self_declared' | 'authenticated_session' }; recordingMode: 'legacy' | 'staff' | 'self_service'; recordedAt: string;
};
export type FaUsageSummary = { monthUsesByLocation: { locationId: string; count: number }[]; dailyUsesByLocation: { locationId: string; date: string; count: number }[] };
export type FaState = {
  schemaVersion: number; asOf: string; company: { id: string; name: string; short: string; infirmary: boolean };
  locations: FaLocation[]; archivedLocations: FaLocation[]; items: FaItem[]; archivedItems: FaItem[]; thresholds: FaThreshold[]; lots: FaLot[];
  events: FaEvent[]; inspections: FaInspection[]; visits: FaVisit[]; employees: FirstAidEmployee[]; departments: string[];
  session: { id: string; name: string; identityMethod: string }; permissions: FirstAidPermissions; usageSummary: FaUsageSummary; historyLimit: number; historyHasMore: boolean;
};
export type FaPublicState = {
  schemaVersion: number; asOf: string; company: { name: string; short: string; infirmary: boolean };
  locations: FaLocation[]; items: FaItem[]; lots: FaLot[]; thresholds: FaThreshold[]; departments: string[]; permissions: FirstAidPermissions;
};

/** One row of a stock take (ตรวจนับ). `counted` null = not counted (no change). */
export type FaCountLine = { itemId: string; counted: number | null; expiry?: string | null };
export type FaCountInput = { createId: string; locationId: string; date: string; lines: FaCountLine[]; disposeLotIds: string[]; notes: string; hasIssue: boolean };

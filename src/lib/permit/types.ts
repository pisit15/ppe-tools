export type PermitRole = "area_owner" | "safety" | "project_manager";
export type PermitActor = {
  key: string;
  id: string;
  name: string;
  companyId: string;
  admin: boolean;
  contractor: boolean;
  // Legacy contractor flag means a permit-only requester, including employees.
  requesterType?: "employee" | "contractor";
  department?: string;
  contractorName?: string;
  expiresAt?: string;
  roles: PermitRole[];
};
export type TemplateField = {
  id: string;
  label: string;
  required: boolean;
  kind: "text" | "textarea" | "check";
};
export type PermitTemplate = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  revision: string;
  version: number;
  active: boolean;
  source_code: string | null;
  review_note: string;
  config: { fields: TemplateField[]; roles: PermitRole[] };
  created_at: string;
};
export type PermitForm = {
  template: PermitTemplate;
  answers: Record<string, string>;
};
export type PermitSignature = {
  actor: string;
  name: string;
  role: string;
  stage: string;
  at: string;
  image: string;
  hash: string;
};
export type PermitEvent = {
  id: string;
  actor: string;
  name: string;
  action: string;
  at: string;
  note: string;
  document?: Omit<PermitData, "events">;
};
export type PermitData = {
  title: string;
  location: string;
  detail: string;
  contractorName: string;
  phone: string;
  workers: string;
  startsAt: string;
  endsAt: string;
  fireImpact: string;
  project: boolean;
  forms: PermitForm[];
  approvers: Partial<Record<PermitRole, string>>;
  attachments: { id: string; name: string; type: string; data: string }[];
  signatures: PermitSignature[];
  events: PermitEvent[];
  sourcePermitId?: string;
};
export type PermitStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "active"
  | "suspended"
  | "closing"
  | "closed"
  | "cancelled";
export type Permit = {
  id: string;
  company_id: string;
  created_by: string;
  status: PermitStatus;
  version: number;
  data: PermitData;
  created_at: string;
  updated_at: string;
};
export const ROLE_LABELS: Record<PermitRole, string> = {
  area_owner: "เจ้าของพื้นที่",
  safety: "เจ้าหน้าที่ความปลอดภัย",
  project_manager: "ผู้จัดการโครงการ",
};
export const STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  submitted: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  active: "กำลังทำงาน",
  suspended: "พักงาน",
  closing: "รอตรวจรับปิดงาน",
  closed: "ปิดงานแล้ว",
  cancelled: "ยกเลิก",
  expired: "หมดอายุ",
};
export function displayStatus(p: Permit, now = Date.now()) {
  return ["submitted", "approved", "active", "suspended"].includes(p.status) &&
    Date.parse(p.data.endsAt) <= now
    ? "expired"
    : p.status;
}
export function requiredRoles(data: PermitData): PermitRole[] {
  return [
    ...new Set(
      data.forms
        .flatMap((f) => f.template.config.roles)
        .concat(data.project ? ["project_manager"] : []),
    ),
  ];
}

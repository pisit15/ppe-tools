import { componentSummary } from './components';
import type {
  ChemCompanySettings,
  ChemSubstance,
  GhsPictogramCode,
  SignalWord,
} from "@/lib/types";
import { labelDraft } from "./label";
import type { LabelPpeCode } from "./ppe";
import { LABEL_PPE } from "./ppe";
import { storageClassDef } from "./storage-classes";

export const POSTER_SECTIONS = {
  hazards: "ข้อความแสดงอันตราย (Hazard statements)",
  precautions: "ข้อควรระวัง / วิธีปฏิบัติ (Precautionary statements)",
  firstAid: "การปฐมพยาบาล (First aid)",
  storage: "การขนย้ายและจัดเก็บ (Handling / Storage)",
  fire: "การดับเพลิง (Fire fighting)",
  spill: "กรณีหกรั่วไหล (Spill response)",
  ingredients: "ส่วนประกอบ / สารเคมีอันตราย",
  physical: "ข้อมูลทางกายภาพ (Physical)",
  ppe: "อุปกรณ์ป้องกันส่วนบุคคล (PPE)",
};
export type PosterSection = keyof typeof POSTER_SECTIONS;
export interface PosterTemplateConfig {
  layout: "summary" | "aab" | "amt";
  title: string;
  subtitle: string;
  brand: string;
  logo: string;
  accent: string;
  formCode: string;
  formRevision: string;
  headings: Record<PosterSection, string>;
}
export interface PosterTemplate {
  id: string;
  name: string;
  company_id: string;
  is_visible: boolean;
  revision: number;
  config: PosterTemplateConfig;
  updated_at: string;
}
export type PosterTemplateSnapshot = Pick<
  PosterTemplate,
  "id" | "name" | "revision" | "config"
>;
export const DEFAULT_POSTER_CONFIG: PosterTemplateConfig = {
  layout: "summary",
  title: "ข้อมูลความปลอดภัยสารเคมี · CHEMICAL SAFETY SUMMARY",
  subtitle: "",
  brand: "EA SHE",
  logo: "",
  accent: "#991b1b",
  formCode: "",
  formRevision: "",
  headings: POSTER_SECTIONS,
};
export const POSTER_TEXT_FIELDS = {
  name: "ชื่อผลิตภัณฑ์ / สารเคมี",
  chemicalName: "ชื่อทางเคมี",
  cas: "CAS No.",
  un: "UN No.",
  formula: "สูตรเคมี",
  supplier: "ผู้ผลิต / ผู้จำหน่าย",
  company: "ชื่อบริษัทบนโปสเตอร์",
  department: "หน่วยงานที่ใช้ (User Dept.)",
  documentCode: "รหัสเอกสาร SDS",
  documentRevision: "Rev. บนเอกสาร",
  effectiveDate: "วันที่มีผล (Effective date)",
  formCode: "รหัสแบบฟอร์ม",
  formRevision: "Rev. แบบฟอร์ม",
  issued: "ผู้จัดทำ (Issued)",
  checked: "ผู้ตรวจสอบ (Checked)",
  approved: "ผู้อนุมัติ (Approved)",
  ingredients: "ส่วนประกอบ / สารเคมีอันตราย",
  physical: "ข้อมูลทางกายภาพ",
  hazards: "ข้อความแสดงอันตราย",
  precautions: "ข้อควรระวัง / วิธีปฏิบัติ",
  firstAid: "การปฐมพยาบาล",
  storage: "การขนย้ายและจัดเก็บ",
  storageClass: "ประเภทการจัดเก็บ",
  fire: "การดับเพลิง",
  spill: "กรณีหกรั่วไหล",
  ppeNotes: "รายละเอียด PPE ตาม SDS",
  emergency: "ข้อมูลติดต่อฉุกเฉิน",
  sdsDate: "วันที่ปรับปรุง SDS",
};
export type PosterTextField = keyof typeof POSTER_TEXT_FIELDS;
export type PosterDraft = Record<PosterTextField, string> & {
  pictograms: GhsPictogramCode[];
  signal: SignalWord | "";
  ppe: LabelPpeCode[];
  showPpeCaptions: boolean;
  productImage: string;
};
export interface PosterSnapshot {
  schema: 1;
  template: PosterTemplateSnapshot;
  draft: PosterDraft;
  fontSize: number;
}
export interface PosterVersionSummary {
  id: string;
  version: number;
  title: string;
  created_at: string;
  created_by: {
    id: string;
    displayName: string;
    username: string;
    accountTable: string;
  };
}
export interface PosterVersion extends PosterVersionSummary {
  snapshot: PosterSnapshot;
}
export interface PosterHistory {
  versions: PosterVersionSummary[];
  latest: PosterVersion | null;
  hasMore: boolean;
}
export function templateSnapshot(t: PosterTemplate): PosterTemplateSnapshot {
  return { id: t.id, name: t.name, revision: t.revision, config: t.config };
}
export function posterDraft(
  s: ChemSubstance,
  t: PosterTemplateSnapshot,
  cfg?: ChemCompanySettings | null,
): PosterDraft {
  const label = labelDraft(s);
  const cls = storageClassDef(s.storage_class);
  const d = Object.fromEntries(
    Object.keys(POSTER_TEXT_FIELDS).map((k) => [k, ""]),
  ) as Record<PosterTextField, string>;
  const first = s.first_aid || {};
  return {
    ...d,
    name: s.name,
    ingredients: (s.components || []).map(componentSummary).join('\n'),
    chemicalName: s.chemical_name || "",
    documentCode: s.document_code || "",
    cas: s.cas_no || "",
    un: s.un_no || "",
    supplier: s.supplier || "",
    company: t.config.subtitle || s.company_id.toUpperCase(),
    hazards: label.hazards,
    precautions: label.precautions,
    firstAid: [
      ["สูดดม", first.inhalation],
      ["ผิวหนัง", first.skin],
      ["เข้าตา", first.eye],
      ["กลืนกิน", first.ingestion],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    storage: s.storage_conditions || "",
    storageClass: cls ? `${cls.code} · ${cls.nameTh}` : s.storage_class || "",
    fire: s.fire_fighting || "",
    spill: s.spill_response || "",
    ppeNotes: (s.ppe_required || []).join("\n"),
    physical: [
      s.physical_state && `สถานะ: ${s.physical_state}`,
      s.flash_point_c != null && `จุดวาบไฟ: ${s.flash_point_c} °C`,
      s.boiling_point_c != null && `จุดเดือด: ${s.boiling_point_c} °C`,
    ]
      .filter(Boolean)
      .join("\n"),
    emergency:
      cfg?.show_emergency === false
        ? ""
        : cfg?.emergency_contacts?.length
          ? cfg.emergency_contacts
              .map((c) => `${c.label} ${c.phone}`)
              .join("\n")
          : s.emergency_contact || "",
    sdsDate: s.sds_revision_date || "",
    formCode: t.config.formCode,
    formRevision: t.config.formRevision,
    documentRevision: "01",
    pictograms: label.pictograms,
    signal: label.signal,
    ppe: [],
    showPpeCaptions: true,
    productImage: "",
  };
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("ข้อมูลโปสเตอร์ไม่ถูกต้อง");
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 500) {
  if (typeof v !== "string" || v.length > max || v.includes("\0"))
    throw new Error("ข้อความโปสเตอร์ไม่ถูกต้องหรือยาวเกินกำหนด");
  return v;
}
export function posterImage(v: unknown, max = 400000) {
  const s = text(v, max);
  if (s && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s))
    throw new Error("รูปภาพต้องเป็น PNG หรือ JPEG");
  return s;
}
export function validatePosterConfig(input: unknown): PosterTemplateConfig {
  const c = record(input);
  if (!["summary", "aab", "amt"].includes(String(c.layout)))
    throw new Error("รูปแบบแม่แบบไม่ถูกต้อง");
  if (typeof c.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(c.accent))
    throw new Error("สีแม่แบบไม่ถูกต้อง");
  const h = record(c.headings);
  const headings = Object.fromEntries(
    Object.keys(POSTER_SECTIONS).map((k) => [k, text(h[k], 100)]),
  ) as PosterTemplateConfig["headings"];
  if (Object.values(headings).some((v) => !v.trim()))
    throw new Error("กรอกชื่อหัวข้อให้ครบ");
  return {
    layout: c.layout as PosterTemplateConfig["layout"],
    title: text(c.title, 160),
    subtitle: text(c.subtitle, 160),
    brand: text(c.brand, 30),
    logo: posterImage(c.logo, 200000),
    accent: c.accent,
    formCode: text(c.formCode, 100),
    formRevision: text(c.formRevision, 30),
    headings,
  };
}
export const posterUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validatePosterSnapshot(input: unknown): PosterSnapshot {
  const s = record(input),
    t = record(s.template),
    d = record(s.draft);
  if (
    s.schema !== 1 ||
    typeof s.fontSize !== "number" ||
    s.fontSize < 7 ||
    s.fontSize > 12 ||
    !Number.isFinite(s.fontSize) ||
    !posterUuid.test(String(t.id)) ||
    !Number.isInteger(t.revision) ||
    Number(t.revision) < 1
  )
    throw new Error("รูปแบบโปสเตอร์ไม่ถูกต้อง");
  const draft = Object.fromEntries(
    Object.keys(POSTER_TEXT_FIELDS).map((k) => [k, text(d[k], 8000)]),
  ) as Record<PosterTextField, string>;
  if (
    !Array.isArray(d.pictograms) ||
    d.pictograms.length > 9 ||
    !d.pictograms.every((v) => typeof v === "string" && /^GHS0[1-9]$/.test(v))
  )
    throw new Error("สัญลักษณ์ GHS ไม่ถูกต้อง");
  if (
    !Array.isArray(d.ppe) ||
    d.ppe.length > 9 ||
    !d.ppe.every((v) => LABEL_PPE.some((p) => p.code === v)) ||
    typeof d.showPpeCaptions !== "boolean" ||
    !["", "Danger", "Warning", "None"].includes(String(d.signal))
  )
    throw new Error("ข้อมูล PPE หรือคำสัญญาณไม่ถูกต้อง");
  return {
    schema: 1,
    template: {
      id: String(t.id),
      name: text(t.name, 120),
      revision: Number(t.revision),
      config: validatePosterConfig(t.config),
    },
    fontSize: s.fontSize,
    draft: {
      ...draft,
      pictograms: [...new Set(d.pictograms)] as GhsPictogramCode[],
      ppe: [...new Set(d.ppe)] as LabelPpeCode[],
      showPpeCaptions: d.showPpeCaptions,
      signal: d.signal as PosterDraft["signal"],
      productImage: posterImage(d.productImage),
    },
  };
}

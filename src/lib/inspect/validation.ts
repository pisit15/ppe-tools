import { AccessError } from '@/lib/toolsSession';
import type { CreateInspectionInput, InspAssetInput, InspAssetStatus, InspAttributeDef, InspItemDef, InspOverall, InspResultValue, InspServiceKind, InspectionMode } from './types';

export const bad = (msg: string) => new AccessError(msg, 400);
export const str = (v: unknown, max: number, label: string, min = 1) => {
  if (typeof v !== 'string') throw bad(`กรุณากรอก${label}`);
  const t = v.trim();
  if (t.length < min) throw bad(`กรุณากรอก${label}`);
  if (t.length > max) throw bad(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return t;
};
export const opt = (v: unknown, max: number, label: string) => (v === undefined || v === null || v === '' ? '' : str(v, max, label, 0));
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bangkokToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
export const periodOf = (ymd: string) => ymd.slice(0, 7);
export function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function isDate(v: unknown): v is string {
  return typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}
const optDate = (v: unknown, label: string) => {
  if (v === undefined || v === null || v === '') return null;
  if (!isDate(v)) throw bad(`${label}ไม่ถูกต้อง`);
  return v;
};
const optInt = (v: unknown, label: string, min: number, max: number) => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label}ต้องเป็นตัวเลข ${min}–${max}`);
  return n;
};

// ---------------------------------------------------------------- checklist evaluation

/** Normalise raw results against the template; returns clean results, failed keys and the overall verdict. */
export function evaluateResults(items: InspItemDef[], raw: unknown): { results: Record<string, InspResultValue>; fail_items: string[]; overall: InspOverall } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('ผลการตรวจไม่ถูกต้อง');
  const input = raw as Record<string, unknown>;
  const results: Record<string, InspResultValue> = {};
  const fail_items: string[] = [];
  for (const item of items) {
    const v = input[item.key];
    if (item.kind === 'number') {
      if (v === undefined || v === null || v === '') {
        if (item.required) throw bad(`กรุณากรอก "${item.label}"`);
        results[item.key] = null;
        continue;
      }
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw bad(`"${item.label}" ต้องเป็นตัวเลข`);
      results[item.key] = Math.round(n * 100) / 100;
      continue;
    }
    if (v === 'pass' || v === 'fail' || (v === 'na' && item.kind === 'pass_fail_na')) {
      results[item.key] = v;
      if (v === 'fail') fail_items.push(item.key);
      continue;
    }
    if (v === undefined || v === null || v === '') {
      if (item.required) throw bad(`กรุณาเลือกผลข้อ "${item.label}"`);
      results[item.key] = null;
      continue;
    }
    throw bad(`ผลข้อ "${item.label}" ไม่ถูกต้อง`);
  }
  return { results, fail_items, overall: fail_items.length ? 'fail' : 'pass' };
}

export function validateInspectionBody(body: unknown, requireAsset: boolean): CreateInspectionInput & { token?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('ข้อมูลการตรวจไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const out: CreateInspectionInput & { token?: string } = { asset_id: '', results: {} };
  if (requireAsset) {
    const id = str(b.asset_id, 36, 'อุปกรณ์');
    if (!UUID.test(id)) throw bad('อุปกรณ์ไม่ถูกต้อง');
    out.asset_id = id;
  } else {
    const token = str(b.token, 64, 'ลิงก์อุปกรณ์');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw bad('ลิงก์อุปกรณ์ไม่ถูกต้อง');
    out.token = token;
  }
  const inspected_on = b.inspected_on === undefined || b.inspected_on === '' ? bangkokToday() : str(b.inspected_on, 10, 'วันที่ตรวจ');
  if (!isDate(inspected_on)) throw bad('วันที่ตรวจไม่ถูกต้อง');
  if (inspected_on > bangkokToday()) throw bad('วันที่ตรวจต้องไม่เป็นวันในอนาคต');
  if (inspected_on < addDays(bangkokToday(), -45)) throw bad('วันที่ตรวจย้อนหลังได้ไม่เกิน 45 วัน');
  out.inspected_on = inspected_on;
  out.inspector_code = opt(b.inspector_code, 40, 'รหัสผู้ตรวจ');
  out.inspector_name = opt(b.inspector_name, 120, 'ชื่อผู้ตรวจ');
  out.note = opt(b.note, 1000, 'หมายเหตุ');
  if (!b.results || typeof b.results !== 'object') throw bad('ผลการตรวจไม่ถูกต้อง');
  out.results = b.results as Record<string, InspResultValue>;
  const paths = Array.isArray(b.photo_paths) ? b.photo_paths : [];
  if (paths.length > 5) throw bad('แนบรูปได้ไม่เกิน 5 รูป');
  out.photo_paths = paths.map(p => {
    if (typeof p !== 'string' || !/^[a-z0-9_-]+\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.(jpg|webp|png)$/i.test(p)) throw bad('รูปภาพไม่ถูกต้อง');
    return p;
  });
  return out;
}

// ---------------------------------------------------------------- registry

export function validateAttributes(defs: InspAttributeDef[], raw: unknown): Record<string, string | number | null> {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string | number | null> = {};
  for (const def of defs) {
    const v = input[def.key];
    if (v === undefined || v === null || v === '') { out[def.key] = null; continue; }
    if (def.type === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) throw bad(`"${def.label}" ต้องเป็นตัวเลข`);
      out[def.key] = n;
    } else {
      const s = String(v).trim();
      if (s.length > 120) throw bad(`"${def.label}" ยาวเกิน 120 ตัวอักษร`);
      if (def.type === 'select' && def.options && !def.options.includes(s)) throw bad(`"${def.label}" ต้องเลือกจากรายการ`);
      out[def.key] = s;
    }
  }
  return out;
}

export function validateAssetInput(body: unknown, partial = false): Partial<InspAssetInput> & { attributes_raw?: unknown } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('ข้อมูลอุปกรณ์ไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const out: Partial<InspAssetInput> & { attributes_raw?: unknown } = {};
  const has = (k: string) => b[k] !== undefined;
  if (!partial || has('category_id')) { const id = str(b.category_id, 36, 'หมวดอุปกรณ์'); if (!UUID.test(id)) throw bad('หมวดอุปกรณ์ไม่ถูกต้อง'); out.category_id = id; }
  if (has('template_id')) { if (b.template_id === null || b.template_id === '') out.template_id = null; else { const id = str(b.template_id, 36, 'รายการตรวจ'); if (!UUID.test(id)) throw bad('รายการตรวจไม่ถูกต้อง'); out.template_id = id; } }
  if (!partial || has('code')) out.code = str(b.code, 60, 'รหัสอุปกรณ์');
  if (has('name')) out.name = opt(b.name, 120, 'ชื่อ');
  if (has('department')) out.department = opt(b.department, 80, 'แผนก');
  if (has('building')) out.building = opt(b.building, 80, 'อาคาร');
  if (has('floor')) out.floor = opt(b.floor, 40, 'ชั้น');
  if (has('location')) out.location = opt(b.location, 200, 'ตำแหน่ง');
  if (has('attributes')) out.attributes_raw = b.attributes;
  if (has('mfg_year')) out.mfg_year = optInt(b.mfg_year, 'ปีที่ผลิต', 1980, 2100);
  if (has('mfg_month')) out.mfg_month = optInt(b.mfg_month, 'เดือนที่ผลิต', 1, 12);
  if (has('last_service_on')) out.last_service_on = optDate(b.last_service_on, 'วันทดสอบล่าสุด');
  if (has('service_interval_months')) out.service_interval_months = optInt(b.service_interval_months, 'รอบทดสอบ (เดือน)', 1, 600);
  if (has('status')) { if (!['active', 'inactive', 'disposed'].includes(String(b.status))) throw bad('สถานะไม่ถูกต้อง'); out.status = b.status as InspAssetStatus; }
  if (has('note')) out.note = opt(b.note, 1000, 'หมายเหตุ');
  return out;
}

export function validateSettings(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('ข้อมูลตั้งค่าไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const out: { inspection_mode?: InspectionMode; photo_retention_days?: number; max_photos_pass?: number; max_photos_fail?: number; require_photo?: boolean } = {};
  if (b.inspection_mode !== undefined) { if (b.inspection_mode !== 'she' && b.inspection_mode !== 'department') throw bad('โหมดผู้ตรวจไม่ถูกต้อง'); out.inspection_mode = b.inspection_mode; }
  if (b.photo_retention_days !== undefined) out.photo_retention_days = optInt(b.photo_retention_days, 'ระยะเวลาเก็บรูป', 7, 3660) ?? 90;
  if (b.max_photos_pass !== undefined) out.max_photos_pass = optInt(b.max_photos_pass, 'จำนวนรูปเมื่อผ่าน', 0, 5) ?? 1;
  if (b.max_photos_fail !== undefined) out.max_photos_fail = optInt(b.max_photos_fail, 'จำนวนรูปเมื่อไม่ผ่าน', 1, 5) ?? 3;
  if (b.require_photo !== undefined) { if (typeof b.require_photo !== 'boolean') throw bad('ค่าบังคับรูปไม่ถูกต้อง'); out.require_photo = b.require_photo; }
  return out;
}

export function validateItems(raw: unknown): InspItemDef[] {
  if (!Array.isArray(raw) || raw.length === 0) throw bad('รายการตรวจต้องมีอย่างน้อย 1 ข้อ');
  if (raw.length > 40) throw bad('รายการตรวจได้ไม่เกิน 40 ข้อ');
  const keys = new Set<string>();
  return raw.map((it, i) => {
    if (!it || typeof it !== 'object') throw bad(`ข้อ ${i + 1} ไม่ถูกต้อง`);
    const o = it as Record<string, unknown>;
    const key = typeof o.key === 'string' && /^[a-z0-9_]{1,40}$/.test(o.key) ? o.key : `item_${i + 1}`;
    if (keys.has(key)) throw bad(`รหัสข้อ "${key}" ซ้ำ`);
    keys.add(key);
    const label = str(o.label, 160, `ข้อความข้อ ${i + 1}`);
    const kind = ['pass_fail', 'pass_fail_na', 'number'].includes(String(o.kind)) ? (o.kind as InspItemDef['kind']) : 'pass_fail';
    const def: InspItemDef = { key, label, kind };
    if (o.required === true) def.required = true;
    const unit = opt(o.unit, 20, 'หน่วย'); if (unit) def.unit = unit;
    const hint = opt(o.hint, 200, 'คำอธิบาย'); if (hint) def.hint = hint;
    return def;
  });
}

export function validateAttributeDefs(raw: unknown): InspAttributeDef[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw bad('ฟิลด์เฉพาะหมวดไม่ถูกต้อง');
  if (raw.length > 20) throw bad('ฟิลด์เฉพาะหมวดได้ไม่เกิน 20 ฟิลด์');
  const keys = new Set<string>();
  return raw.map((it, i) => {
    if (!it || typeof it !== 'object') throw bad(`ฟิลด์ ${i + 1} ไม่ถูกต้อง`);
    const o = it as Record<string, unknown>;
    const key = typeof o.key === 'string' && /^[a-z0-9_]{1,40}$/.test(o.key) ? o.key : `field_${i + 1}`;
    if (keys.has(key)) throw bad(`รหัสฟิลด์ "${key}" ซ้ำ`);
    keys.add(key);
    const label = str(o.label, 80, `ชื่อฟิลด์ ${i + 1}`);
    const type = ['text', 'number', 'select', 'month'].includes(String(o.type)) ? (o.type as InspAttributeDef['type']) : 'text';
    const def: InspAttributeDef = { key, label, type };
    if (type === 'select') {
      const options = Array.isArray(o.options) ? o.options.map(x => String(x).trim()).filter(Boolean) : [];
      if (options.length === 0) throw bad(`ฟิลด์ "${label}" ต้องมีตัวเลือก`);
      def.options = options.slice(0, 30);
    }
    const unit = opt(o.unit, 20, 'หน่วย'); if (unit) def.unit = unit;
    const hint = opt(o.hint, 200, 'คำอธิบาย'); if (hint) def.hint = hint;
    return def;
  });
}

export function validateServiceEvent(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('ข้อมูลไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const kinds: InspServiceKind[] = ['legal_test', 'refill', 'maintenance', 'replace', 'dispose', 'other'];
  if (!kinds.includes(b.kind as InspServiceKind)) throw bad('ประเภทงานไม่ถูกต้อง');
  const done_on = str(b.done_on, 10, 'วันที่ดำเนินการ');
  if (!isDate(done_on)) throw bad('วันที่ดำเนินการไม่ถูกต้อง');
  if (done_on > bangkokToday()) throw bad('วันที่ดำเนินการต้องไม่เป็นวันในอนาคต');
  const file_path = b.file_path === undefined || b.file_path === null || b.file_path === '' ? null : str(b.file_path, 300, 'ไฟล์แนบ');
  if (file_path && !/^[a-z0-9_-]+\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.(jpg|webp|png|pdf)$/i.test(file_path)) throw bad('ไฟล์แนบไม่ถูกต้อง');
  return { kind: b.kind as InspServiceKind, done_on, provider: opt(b.provider, 160, 'ผู้ให้บริการ'), certificate_no: opt(b.certificate_no, 80, 'เลขที่ใบรับรอง'), note: opt(b.note, 1000, 'หมายเหตุ'), file_path };
}

export function categoryPatch(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const has = (k: string) => b[k] !== undefined;
  if (!partial || has('name')) out.name = str(b.name, 80, 'ชื่อหมวด');
  if (has('icon')) out.icon = opt(b.icon, 40, 'ไอคอน') || 'shield';
  if (has('color')) { const c = String(b.color); if (!/^#[0-9A-Fa-f]{6}$/.test(c)) throw bad('สีไม่ถูกต้อง'); out.color = c; }
  if (has('inspection_interval_days')) { const n = Number(b.inspection_interval_days); if (!Number.isInteger(n) || n < 1 || n > 3660) throw bad('รอบตรวจต้องเป็น 1–3660 วัน'); out.inspection_interval_days = n; }
  if (has('service_label')) out.service_label = opt(b.service_label, 80, 'ชื่อการทดสอบ');
  if (has('service_interval_months')) { const v = b.service_interval_months; if (v === null || v === '') out.service_interval_months = null; else { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 600) throw bad('รอบทดสอบต้องเป็น 1–600 เดือน'); out.service_interval_months = n; } }
  if (has('service_ref')) out.service_ref = opt(b.service_ref, 200, 'อ้างอิง');
  if (has('attributes')) out.attributes = validateAttributeDefs(b.attributes);
  if (has('sort_order')) { const n = Number(b.sort_order); if (!Number.isInteger(n)) throw bad('ลำดับไม่ถูกต้อง'); out.sort_order = n; }
  if (has('is_active')) { if (typeof b.is_active !== 'boolean') throw bad('สถานะไม่ถูกต้อง'); out.is_active = b.is_active; }
  return out;
}


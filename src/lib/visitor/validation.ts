import { AccessError } from '@/lib/toolsSession';
import { VISITOR_LIMITS } from './constants';
import type { CreateVisitorRequestInput, DecisionInput, HasPermit } from './types';

const bad = (msg: string) => new AccessError(msg, 400);
const str = (v: unknown, max: number, label: string, min = 1) => {
  if (typeof v !== 'string') throw bad(`กรุณากรอก${label}`);
  const t = v.trim();
  if (t.length < min) throw bad(`กรุณากรอก${label}`);
  if (t.length > max) throw bad(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return t;
};
const opt = (v: unknown, max: number, label: string) => (v === undefined || v === null || v === '' ? '' : str(v, max, label, 0));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Bangkok calendar date (the site and the guard post both run on Thai time). */
export function bangkokToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function validateCreate(body: unknown): CreateVisitorRequestInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('ข้อมูลคำขอไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const token = str(b.token, 64, 'ลิงก์คำขอ');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) throw bad('ลิงก์คำขอไม่ถูกต้อง');

  const arrival_date = str(b.arrival_date, 10, 'วันที่เข้าพื้นที่');
  if (!DATE.test(arrival_date) || Number.isNaN(Date.parse(`${arrival_date}T00:00:00Z`))) throw bad('วันที่เข้าพื้นที่ไม่ถูกต้อง');
  if (arrival_date < addDays(bangkokToday(), -1)) throw bad('วันที่เข้าพื้นที่ต้องไม่ย้อนหลังเกิน 1 วัน');
  if (arrival_date > addDays(bangkokToday(), 365)) throw bad('วันที่เข้าพื้นที่ต้องไม่เกิน 1 ปีข้างหน้า');
  const time_from = str(b.time_from, 5, 'เวลาเริ่ม');
  const time_to = str(b.time_to, 5, 'เวลาสิ้นสุด');
  if (!TIME.test(time_from) || !TIME.test(time_to)) throw bad('รูปแบบเวลาไม่ถูกต้อง (HH:MM)');
  if (time_to <= time_from) throw bad('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');

  const has_permit = (['yes', 'no', 'unknown'].includes(String(b.has_permit)) ? b.has_permit : 'unknown') as HasPermit;
  const rawAreas = Array.isArray(b.work_areas) ? b.work_areas : [];
  if (rawAreas.length > 30) throw bad('เลือกพื้นที่มากเกินไป');
  const work_areas = Array.from(new Set(rawAreas.map(a => str(a, 80, 'พื้นที่ปฏิบัติงาน'))));

  const rawPersons = Array.isArray(b.persons) ? b.persons : [];
  const persons = rawPersons
    .map(p => (p && typeof p === 'object' ? p as Record<string, unknown> : {}))
    .map(p => ({ name: typeof p.name === 'string' ? p.name.trim() : '', detail: typeof p.detail === 'string' ? p.detail.trim() : '' }))
    .filter(p => p.name || p.detail);
  if (persons.length === 0) throw bad('กรุณากรอกรายชื่อผู้มาติดต่ออย่างน้อย 1 คน');
  if (persons.length > VISITOR_LIMITS.maxPersons) throw bad(`รายชื่อได้ไม่เกิน ${VISITOR_LIMITS.maxPersons} คนต่อคำขอ`);
  for (const p of persons) {
    if (!p.name) throw bad('รายชื่อผู้มาติดต่อต้องมีชื่อทุกแถว');
    if (p.name.length > 120) throw bad('ชื่อผู้มาติดต่อยาวเกิน 120 ตัวอักษร');
    if (p.detail.length > 120) throw bad('รายละเอียดผู้มาติดต่อยาวเกิน 120 ตัวอักษร');
  }

  const purpose = str(b.purpose, 80, 'วัตถุประสงค์');
  const purpose_other = opt(b.purpose_other, 200, 'วัตถุประสงค์ (อื่นๆ)');
  if (/อื่น/.test(purpose) && !purpose_other) throw bad('กรุณาระบุวัตถุประสงค์ (กรณีเลือกอื่นๆ)');

  return {
    token,
    informer_name: str(b.informer_name, 120, 'ชื่อผู้แจ้ง'),
    informer_employee_code: str(b.informer_employee_code, 40, 'รหัสพนักงาน'),
    informer_phone: str(b.informer_phone, 30, 'เบอร์โทรศัพท์', 6),
    informer_department: str(b.informer_department, 80, 'แผนก'),
    visitor_company: str(b.visitor_company, 160, 'ชื่อบริษัทผู้มาติดต่อ'),
    arrival_date, time_from, time_to, purpose, purpose_other, work_areas,
    work_area_detail: opt(b.work_area_detail, 500, 'รายละเอียดพื้นที่'),
    has_permit,
    permit_ref: opt(b.permit_ref, 80, 'เลขที่ Permit'),
    note: opt(b.note, 1000, 'หมายเหตุ'),
    persons,
  };
}

export function validateDecision(body: unknown): DecisionInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('ข้อมูลการตัดสินใจไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const action = String(b.action);
  if (!['approve', 'reject', 'need_info', 'cancel'].includes(action)) throw bad('คำสั่งไม่ถูกต้อง');
  const note = opt(b.note, 1000, 'หมายเหตุ');
  if ((action === 'reject' || action === 'need_info') && !note) throw bad('กรุณาระบุเหตุผล');
  return { action: action as DecisionInput['action'], note, conditions: opt(b.conditions, 1000, 'เงื่อนไข') };
}

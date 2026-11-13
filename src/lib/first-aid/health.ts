/**
 * "What are people coming for?" — every dispense line is put in one illness group.
 * The reason the person chose (or typed) wins; without one the group is inferred from the medicine.
 * Pure functions: used by the report tab, the Excel export and the tests.
 */
import { cleanGeneric } from './browse';
import type { FaEvent, FaItem } from './types';

/** Reason chips on the dispense ticket and the QR page (stored as the first part of the note). */
export const DISPENSE_REASONS = ['ปวดหัว / ไข้', 'ปวดท้อง / ท้องเสีย', 'คลื่นไส้', 'แพ้ / คัน', 'ปวดเมื่อย', 'บาดแผล', 'หยิบให้เพื่อน', 'เติมกล่องประจำทีม'] as const;

export type HealthGroupId = 'fever' | 'muscle' | 'allergy' | 'cold' | 'stomach' | 'diarrhea' | 'nausea' | 'wound' | 'burn' | 'eye' | 'mouth' | 'other' | 'none';
/** 'chip' = picked a reason button · 'note' = typed a symptom · 'medicine' = inferred from what was taken. */
export type HealthSource = 'chip' | 'note' | 'medicine';

/** Display order. `illness: false` rows (restocking a team box, masks, gloves, envelopes) are reported apart. */
export const HEALTH_GROUPS: { id: HealthGroupId; label: string; illness: boolean }[] = [
  { id: 'fever', label: 'ปวดหัว / ไข้ / ปวดทั่วไป', illness: true },
  { id: 'muscle', label: 'ปวดกล้ามเนื้อ / เคล็ด', illness: true },
  { id: 'allergy', label: 'แพ้ / คัน / ผื่น', illness: true },
  { id: 'cold', label: 'ไอ / เจ็บคอ / หวัด', illness: true },
  { id: 'stomach', label: 'ท้องอืด / ปวดท้อง / กรดไหลย้อน', illness: true },
  { id: 'diarrhea', label: 'ท้องเสีย', illness: true },
  { id: 'nausea', label: 'เวียนหัว / คลื่นไส้', illness: true },
  { id: 'wound', label: 'แผล / ทำแผล', illness: true },
  { id: 'burn', label: 'ไฟไหม้ / น้ำร้อนลวก', illness: true },
  { id: 'eye', label: 'ตา', illness: true },
  { id: 'mouth', label: 'แผลในปาก / ร้อนใน', illness: true },
  { id: 'other', label: 'อื่น ๆ / จัดกลุ่มไม่ได้', illness: true },
  { id: 'none', label: 'ไม่ใช่การเจ็บป่วย (เติมกล่อง หน้ากาก ถุงมือ วัสดุ)', illness: false },
];
export const healthLabel = (id: HealthGroupId) => HEALTH_GROUPS.find(g => g.id === id)?.label || id;

/** Some registers type "แ" as two "เ"; fold them so "ยาเเก้เเพ้" reads as "ยาแก้แพ้". */
export const foldThai = (s: string) => s.replace(/เเ/g, 'แ');

/**
 * Medicine → group, first match wins. Order matters: specific body sites before broad words
 * (an eye drop for allergy is "eye"; Norgesic contains paracetamol but is a muscle relaxant).
 */
const MEDICINE_RULES: [HealthGroupId, RegExp][] = [
  ['none', /plastic bott|ซองยา|ตลับยา|ตลับบรรจุ|ถ้วยยา|แก้วตวง|แก้วยา|หลอดหยด|ไม้กดลิ้น|mask|หน้ากาก|glove|ถุงมือ|ปรอท|thermo|เครื่องวัด|forcep|ปากคีบ|scissor|กรรไกร/i],
  ['eye', /oph\b|eye|ล้างตา|หยอดตา|ป้ายตา|ปิดตา|opsar|terramycin|tetracaine/i],
  ['mouth', /trinolone|แผลในปาก|ร้อนใน|ป้ายปาก/i],
  ['burn', /silver|siverderm|mebo|calgonate|burn|ไหม้|ลวก/i],
  ['nausea', /dimen|dramamine|motilium|domperidone|motidom|movelium|ยาหอม|ยาดม|ammonia|แอมโมเนีย|คลื่นไส้|เมารถ|วิงเวียน/i],
  ['diarrhea', /carbon|ca-r-bon|ผงถ่าน|\bors\b|o\.r\.s|เกลือแร่|bismol|ท้องเสีย/i],
  ['stomach', /air-x|airx|simethicone|antacil|buscopan|hyoscine|\beno\b|carminative|stomachica|ยาธาตุ|ธาตุน้ำ|gaviscon|guttru|cimetidine|magesto|กระเพาะ|ท้องอืด|ลดกรด|กรดไหลย้อน|ปวดท้อง/i],
  ['cold', /bisolvon|bromhex|mybacin|strepsils|tussis|แก้ไอ|เจ็บคอ|เสมหะ|แก้หวัด/i],
  ['allergy', /cpm|chlorphen|atarax|hydroxyzine|cetrizin|cetirizine|zyrtec|calamine|cadramine|clotriderm|ta cream|t\.a\. cream|triamcin|แก้แพ้|แก้คัน|ผื่น/i],
  ['muscle', /norgesic|orphenadrine|counterpain|flanil|uniren|mygesal|neobun|balm|ยาหม่อง|zambuk|คลายกล้ามเนื้อ|ปวดเมื่อย|ปวดกล้ามเนื้อ|elastic|\beb \d|arm sling|tubura|ผ้าพันยืด|ผ้ายืด|ผ้าพันเคล็ด|ผ้าสามเหลี่ยม|เคล็ด/i],
  ['fever', /paracetamol|\bpara\b|tylenol|cemol|\bsara\b|ibuprofen|ponstan|mefenamic|mefamed|anpuzz|แก้ปวด|ลดไข้|ปวดประจำเดือน/i],
  ['wound', /betadine|povid|polidine|septyl|\bnss\b|saline|sterile water|serile water|alcohol|gauze|ก๊อซ|plast|พลาสเตอร์|bactigra|sofra|fixomull|easifix|coban|transpor|micropor|micopor|cotton|สำลี|dressing|ชุดทำแผล|conform|ห้ามเลือด|แผล/i],
];
/** Free-text symptoms people type in the note ("ปวดหัว", "โดนมีดบาด"). */
const NOTE_RULES: [HealthGroupId, RegExp][] = [
  ['eye', /เคืองตา|ตาแดง|คันตา|เข้าตา|ล้างตา|ปวดตา|เจ็บตา/],
  ['mouth', /ร้อนใน|แผลในปาก|ปากเปื่อย/],
  ['burn', /ไหม้|ลวก|พุพอง/],
  ['diarrhea', /ท้องเสีย|ท้องร่วง|ถ่ายเหลว/],
  ['nausea', /คลื่นไส้|อาเจียน|เวียนหัว|วิงเวียน|มึนหัว|เมารถ|หน้ามืด/],
  ['stomach', /ปวดท้อง|ท้องอืด|จุกเสียด|แน่นท้อง|กรดไหลย้อน|แสบท้อง|โรคกระเพาะ/],
  ['cold', /ไอ(?![ทซโ])|เจ็บคอ|หวัด|น้ำมูก|เสมหะ|คัดจมูก/],
  ['allergy', /แพ้|คัน|ผื่น|ลมพิษ/],
  ['muscle', /ปวดเมื่อย|ปวดหลัง|ปวดกล้าม|ปวดไหล่|ปวดคอ|ปวดขา|ปวดแขน|ปวดเอว|ปวดเข่า|เคล็ด|ขัดยอก|ตะคริว/],
  ['fever', /ปวดหัว|ปวดศีรษะ|ไข้|ตัวร้อน|ปวดฟัน|ปวดประจำเดือน|ไมเกรน/],
  ['wound', /แผล|บาด|ถลอก|เลือดออก|ทิ่ม/],
];
const REASON_GROUP: Record<string, HealthGroupId> = { 'ปวดหัว / ไข้': 'fever', 'ปวดท้อง / ท้องเสีย': 'stomach', 'คลื่นไส้': 'nausea', 'แพ้ / คัน': 'allergy', 'ปวดเมื่อย': 'muscle', 'บาดแผล': 'wound' };

const firstMatch = (rules: [HealthGroupId, RegExp][], text: string): HealthGroupId | null => { for (const [id, test] of rules) if (test.test(text)) return id; return null; };

/** The group a medicine points to when nobody said why it was taken. Name and register group first, description second. */
export function itemHealthGroup(item: Pick<FaItem, 'name' | 'generic' | 'description'>): HealthGroupId {
  return firstMatch(MEDICINE_RULES, foldThai(`${item.name} ${cleanGeneric(item.generic)}`)) || firstMatch(MEDICINE_RULES, foldThai(item.description || '')) || 'other';
}

/** The reason chip stored at the start of a note, if any. */
export function recordedReason(note: string): string {
  const first = foldThai(note || '').split(' · ')[0].trim();
  return (DISPENSE_REASONS as readonly string[]).includes(first) ? first : '';
}

export function classifyDispense(note: string, item: Pick<FaItem, 'name' | 'generic' | 'description'> | undefined, legacy = false): { group: HealthGroupId; source: HealthSource; reason: string } {
  const inferred = item ? itemHealthGroup(item) : 'other';
  const reason = recordedReason(note);
  if (reason === 'เติมกล่องประจำทีม') return { group: 'none', source: 'chip', reason };
  const mapped = REASON_GROUP[reason];
  if (mapped) {
    // One chip covers two groups; the medicine says which. A burn dressing recorded as "บาดแผล" stays a burn.
    if (mapped === 'stomach' && inferred === 'diarrhea') return { group: 'diarrhea', source: 'chip', reason };
    if (mapped === 'wound' && (inferred === 'burn' || inferred === 'eye')) return { group: inferred, source: 'chip', reason };
    return { group: mapped, source: 'chip', reason };
  }
  // No symptom chip ("หยิบให้เพื่อน" says who, not why): read what was typed. Imported history notes are bookkeeping, not symptoms.
  if (!legacy) {
    const parts = foldThai(note || '').split(' · ').map(p => p.trim()).filter(p => p && p !== reason && !p.startsWith('แจ้ง จป.'));
    const typed = parts.join(' · ');
    const fromNote = typed ? firstMatch(NOTE_RULES, typed) : null;
    if (fromNote) return { group: fromNote, source: 'note', reason: typed.slice(0, 80) };
  }
  return { group: inferred, source: 'medicine', reason };
}

export type HealthRow = {
  id: string; documentId: string; date: string; month: string; datePrecision: 'day' | 'month';
  locationId: string; location: string; department: string;
  group: HealthGroupId; source: HealthSource; reason: string;
  itemId: string; item: string; category: string; quantity: number; unit: string;
  channel: 'staff' | 'self_service' | 'legacy';
};

/** One row per dispense line (a medicine handed out once). No names: department is the finest personal detail kept. */
export function healthRows(events: FaEvent[], items: FaItem[], locations: { id: string; name: string }[]): HealthRow[] {
  const itemById = new Map(items.map(i => [i.id, i])); const locById = new Map(locations.map(l => [l.id, l.name]));
  const rows: HealthRow[] = [];
  for (const e of events) {
    if (e.kind !== 'issue' || e.usage === 'open') continue;
    const item = itemById.get(e.itemId);
    const channel = e.recordingMode === 'legacy' ? 'legacy' : e.recordingMode === 'self_service' ? 'self_service' : 'staff';
    const { group, source, reason } = classifyDispense(e.note, item, channel === 'legacy');
    rows.push({
      id: e.id, documentId: e.documentId, date: e.date, month: e.date.slice(0, 7), datePrecision: e.datePrecision,
      locationId: e.locationId, location: locById.get(e.locationId) || '', department: ((e.recipientPerson || e.requester)?.department || '').trim(),
      group, source, reason, itemId: e.itemId, item: item?.name || '(รายการที่ถูกลบ)', category: item?.category || '',
      quantity: e.quantity, unit: e.usage === 'use' || item?.dispenseMode === 'shared' ? 'ครั้ง' : item?.unit || '', channel,
    });
  }
  return rows;
}

export const SOURCE_LABEL: Record<HealthSource, string> = { chip: 'ผู้เบิกเลือกอาการ', note: 'ผู้เบิกพิมพ์อาการ', medicine: 'อนุมานจากยาที่เบิก' };
export const CHANNEL_LABEL: Record<HealthRow['channel'], string> = { staff: 'เจ้าหน้าที่บันทึก', self_service: 'หยิบเอง (QR)', legacy: 'นำเข้าจาก Excel เดิม' };

/** Browse helpers for people who do not know a medicine's name: symptom chips and register groups. */

/** Strip import bookkeeping appended to `generic` ("… · Excel Sep 2026 แถว 56", "… · รอยืนยันล็อต…"). */
export const cleanGeneric = (s: string) => s.split(' · ')[0].replace(/\s*Excel\s+[A-Za-z]+\s+\d{4}\s+แถว\s*\d+\s*$/i, '').trim();

/** "ยารับประทาน / ยาเม็ด" → group label used for browsing. */
export function itemGroup(item: { generic: string; category: string }) {
  const g = cleanGeneric(item.generic);
  return g || item.category || 'อื่น ๆ';
}

export type SymptomTag = { id: string; label: string; test: RegExp };
/** Common first-aid needs → medicines, matched on name + generic (Thai/English). Order = display order. */
export const SYMPTOMS: SymptomTag[] = [
  { id: 'pain', label: 'ปวดหัว / ไข้ / ปวดเมื่อย', test: /paracetamol|para|norgesic|ponstan|ibuprofen|counterpain|ยาหม่อง|mygesal|balm|แก้ปวด|ลดไข้/i },
  { id: 'allergy', label: 'แพ้ / คัน / ผื่น', test: /cpm|chlorphen|atarax|cetrizin|cetirizine|calamine|clotriderm|ta cream|triamcin|trinolone|แพ้|คัน/i },
  { id: 'stomach', label: 'ท้องอืด / ปวดท้อง / กรดไหลย้อน', test: /air-x|airx|simethicone|buscopan|eno|carminative|ธาตุน้ำขาว|gaviscon|guttru|cimetidine|ยาหอม|ท้องอืด/i },
  { id: 'nausea', label: 'คลื่นไส้ / เมารถ / เวียนหัว', test: /dimen|motilium|domperidone|ยาหอม|เมารถ|คลื่นไส้/i },
  { id: 'diarrhea', label: 'ท้องเสีย', test: /ultracarbon|carbon|ors|ท้องเสีย|เกลือแร่/i },
  { id: 'cough', label: 'ไอ / เจ็บคอ', test: /bisolvon|bromhex|mybacin|strepsils|ไอ|เจ็บคอ/i },
  { id: 'wound', label: 'แผล / ทำแผล / เลือดออก', test: /betadine|nss|saline|alcohol|gauze|ก๊อซ|tensoplast|plast|bactigra|fixomull|neobun|transpor|micropor|cotton|สำลี|dressing|conform|coban|easifix|eb \d|elastic|แผล|silver|siverderm|ห้ามเลือด/i },
  { id: 'burn', label: 'ไฟไหม้ / น้ำร้อนลวก', test: /burn|silver|siverderm|calgonate|ไหม้|ลวก/i },
  { id: 'eye', label: 'ตา', test: /oph|eye|ตา/i },
  { id: 'sprain', label: 'เคล็ด / ขัดยอก / พยุง', test: /arm sling|eb \d|elastic|counterpain|tubura|เคล็ด|ยอก/i },
  { id: 'equipment', label: 'อุปกรณ์ / วัดไข้ / วัดความดัน', test: /ปรอท|thermo|เครื่องวัด|stethoscope|aed|ambu|mask with bag|tourniquet|forcep|scissor|กรรไกร|ไฟฉาย|atk/i },
  { id: 'ppe', label: 'หน้ากาก / ถุงมือ', test: /mask|หน้ากาก|glove|ถุงมือ/i },
];
export const matchesSymptom = (tag: SymptomTag, item: { name: string; generic: string; description: string }) => tag.test.test(`${item.name} ${cleanGeneric(item.generic)} ${item.description}`);

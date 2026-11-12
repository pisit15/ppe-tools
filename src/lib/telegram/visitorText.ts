// Telegram messages for visitor access requests (HTML parse mode + inline keyboards).
import { esc, type InlineKeyboard } from './api';
import { VEHICLE_DECISION_LABEL, VISITOR_STATUS_LABEL } from '../visitor/constants';
import type { VisitorRequestWithPersons } from '../visitor/types';

const QUEUE = 'https://tools.eashe.org/visitor';
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const thaiDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
};
const hhmm = (t: string) => t.slice(0, 5);
const line = (label: string, value: string) => `<b>${esc(label)}:</b> ${esc(value || '-')}`;

function details(r: VisitorRequestWithPersons): string[] {
  const names = r.visitor_persons.slice(0, 10).map(p => `  ${p.seq}. ${esc(p.name)}`).join('\n') + (r.visitor_persons.length > 10 ? `\n  …และอีก ${r.visitor_persons.length - 10} คน` : '');
  const out = [
    line('บริษัท', r.visitor_company),
    line('วันเวลา', `${thaiDate(r.arrival_date)} ${hhmm(r.time_from)}–${hhmm(r.time_to)}`),
    line('วัตถุประสงค์', r.purpose === 'อื่นๆ (Others)' ? r.purpose_other : r.purpose),
    line('พื้นที่', [...r.work_areas, r.work_area_detail].filter(Boolean).join(', ')),
    line('ผู้แจ้ง', `${r.informer_name} (${r.informer_department}) ${r.informer_phone}`),
    `<b>รายชื่อ ${r.visitor_persons.length} คน:</b>\n${names}`,
  ];
  if ((r.visitor_vehicles || []).length) out.push(`<b>รถ ${r.visitor_vehicles.length} คัน:</b>\n${r.visitor_vehicles.map(v => `  🚗 ${esc(v.plate)}${v.province ? ` ${esc(v.province)}` : ''} — ${VEHICLE_DECISION_LABEL[v.decision]}${v.reason ? ` (${esc(v.reason)})` : ''}`).join('\n')}`);
  if (r.note) out.push(line('หมายเหตุ', r.note));
  return out;
}

export function newRequestText(r: VisitorRequestWithPersons, companyName: string): { html: string; keyboard: InlineKeyboard } {
  const html = [`🟠 <b>VISITOR ACCESS · รออนุมัติ</b>`, `<b>คำขอใหม่ ${esc(r.request_no)}</b>`, '', ...details(r), '', `<i>${esc(companyName)} · ${esc(r.request_no)}</i>`].join('\n');
  return {
    html,
    keyboard: { inline_keyboard: [
      [{ text: '✅ อนุมัติ (ผู้มีสิทธิ์ที่ผูกบัญชีแล้ว)', callback_data: `visitor:approve:${r.id}` }],
      [{ text: 'เปิดคิว · ใส่เงื่อนไข / ขอข้อมูลเพิ่ม / ไม่อนุมัติ', url: QUEUE }],
    ] },
  };
}

export function decisionText(r: VisitorRequestWithPersons, companyName: string): { html: string; keyboard: InlineKeyboard } {
  const icon = r.status === 'approved' ? '🟢' : r.status === 'rejected' ? '🔴' : r.status === 'need_info' ? '🔵' : '⚪';
  const label = VISITOR_STATUS_LABEL[r.status];
  const extra: string[] = [];
  if (r.status === 'approved' && r.conditions) extra.push(line('เงื่อนไข', r.conditions));
  if (r.status === 'approved' && (r.visitor_vehicles || []).length) extra.push(`<b>รถ:</b> ${r.visitor_vehicles.map(v => `${esc(v.plate)} — ${VEHICLE_DECISION_LABEL[v.decision]}`).join(', ')}`);
  if (r.decision_note) extra.push(line('จาก SHE', r.decision_note));
  if (r.decided_by) extra.push(line('ผู้ตัดสิน', r.decided_by));
  const html = [`${icon} <b>VISITOR ACCESS · ผลการพิจารณา</b>`, `<b>${esc(label)} ${esc(r.request_no)}</b>`, '', ...details(r).slice(0, 3), ...extra, '', `<i>${esc(companyName)} · ${esc(r.request_no)}</i>`].join('\n');
  return { html, keyboard: { inline_keyboard: [[{ text: 'ดูสถานะ', url: `https://tools.eashe.org/visitor/track/${r.track_code}` }]] } };
}

export const testText = (companyName: string) => `ทดสอบการแจ้งเตือน Visitor Access ของ <b>${esc(companyName)}</b> — กลุ่มนี้จะได้รับคำขอเข้าพื้นที่ใหม่และผลการพิจารณา\n\nคำสั่งในกลุ่ม: พิมพ์ <code>@she เมนู</code> หรือ <code>/she เมนู</code>`;

export function pendingDigestText(rows: VisitorRequestWithPersons[], companyName: string): string {
  if (rows.length === 0) return `${esc(companyName)}: ไม่มีคำขอเข้าพื้นที่ค้างอนุมัติ`;
  const lines = rows.map(r => `• ${esc(r.request_no)} ${thaiDate(r.arrival_date)} ${hhmm(r.time_from)} ${esc(r.visitor_company)} (${r.visitor_persons.length} คน)${r.status === 'need_info' ? ' [ขอข้อมูลเพิ่ม]' : ''}`);
  return [`<b>คำขอเข้าพื้นที่ค้างอนุมัติ ${rows.length} รายการ · ${esc(companyName)}</b>`, ...lines, '', `เปิดคิวอนุมัติ: ${QUEUE}`].join('\n');
}

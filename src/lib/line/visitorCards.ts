// Flex cards pushed to a company's LINE group for visitor access requests.
import { C, flex, header, text, type Json, type LineMessage } from './flex';
import { VISITOR_STATUS_LABEL } from '../visitor/constants';
import type { VisitorRequestWithPersons } from '../visitor/types';

const QUEUE = 'https://tools.eashe.org/visitor';
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const thaiDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
};
const hhmm = (t: string) => t.slice(0, 5);

const row = (label: string, value: string, bold = false): Json => ({
  type: 'box', layout: 'baseline', spacing: 'sm',
  contents: [
    { type: 'text', text: label, size: 'sm', color: C.sub, flex: 3 },
    { type: 'text', text: value || '-', size: 'sm', color: C.text, flex: 7, wrap: true, weight: bold ? 'bold' : 'regular' },
  ],
});

function body(r: VisitorRequestWithPersons, companyName: string): Json[] {
  const names = r.visitor_persons.slice(0, 6).map(p => `${p.seq}. ${p.name}`).join('\n') + (r.visitor_persons.length > 6 ? `\n…และอีก ${r.visitor_persons.length - 6} คน` : '');
  return [
    row('บริษัท', r.visitor_company, true),
    row('วันเวลา', `${thaiDate(r.arrival_date)} ${hhmm(r.time_from)}–${hhmm(r.time_to)}`),
    row('วัตถุประสงค์', r.purpose === 'อื่นๆ (Others)' ? r.purpose_other : r.purpose),
    row('พื้นที่', [...r.work_areas, r.work_area_detail].filter(Boolean).join(', ')),
    row('ผู้แจ้ง', `${r.informer_name} (${r.informer_department}) ${r.informer_phone}`),
    row(`รายชื่อ ${r.visitor_persons.length} คน`, names),
    ...(r.note ? [row('หมายเหตุ', r.note)] : []),
    { type: 'text', text: `${companyName} · ${r.request_no}`, size: 'xs', color: C.faint, margin: 'lg' },
  ];
}

const button = (label: string, uri: string, color: string): Json => ({
  type: 'box', layout: 'vertical',
  contents: [{ type: 'button', style: 'primary', color, height: 'sm', action: { type: 'uri', label, uri } }],
});

/** Pushed when an employee submits a request. */
export function newRequestCard(r: VisitorRequestWithPersons, companyName: string): LineMessage {
  const alt = `คำขอเข้าพื้นที่ใหม่ ${r.request_no}: ${r.visitor_company} ${thaiDate(r.arrival_date)} ${hhmm(r.time_from)} (${r.visitor_persons.length} คน) — รออนุมัติ`;
  return flex(alt, {
    type: 'bubble', size: 'mega',
    header: header('VISITOR ACCESS · รออนุมัติ', `คำขอใหม่ ${r.request_no}`, C.warn),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: body(r, companyName) },
    footer: button('เปิดคิวคัดกรอง-อนุมัติ', QUEUE, C.primary),
  });
}

/** Pushed when SHE decides (approved / need_info / rejected / cancelled). */
export function decisionCard(r: VisitorRequestWithPersons, companyName: string): LineMessage {
  const color = r.status === 'approved' ? C.ok : r.status === 'rejected' ? C.danger : r.status === 'need_info' ? C.primary : C.faint;
  const label = VISITOR_STATUS_LABEL[r.status];
  const extra: Json[] = [];
  if (r.status === 'approved' && r.conditions) extra.push(row('เงื่อนไข', r.conditions, true));
  if (r.decision_note) extra.push(row('จาก SHE', r.decision_note));
  if (r.decided_by) extra.push(row('ผู้ตัดสิน', r.decided_by));
  const alt = `${label} ${r.request_no}: ${r.visitor_company} ${thaiDate(r.arrival_date)}${r.conditions ? ` · เงื่อนไข: ${r.conditions}` : ''}`;
  return flex(alt, {
    type: 'bubble', size: 'mega',
    header: header('VISITOR ACCESS · ผลการพิจารณา', `${label} ${r.request_no}`, color),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [...body(r, companyName).slice(0, 3), ...extra, { type: 'text', text: `${companyName} · ${r.request_no}`, size: 'xs', color: C.faint, margin: 'lg' }] },
    footer: button('ดูสถานะ', `https://tools.eashe.org/visitor/track/${r.track_code}`, color === C.faint ? C.primary : color),
  });
}

export const testMessage = (companyName: string) => text(`ทดสอบการแจ้งเตือน Visitor Access ของ ${companyName} — กลุ่มนี้จะได้รับคำขอเข้าพื้นที่ใหม่และผลการพิจารณา`);

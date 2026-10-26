import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { UNIT_TYPES } from './constants';
import type { PPERequest } from './types';

const statusLabels = { pending: 'รออนุมัติ', approved: 'อนุมัติ / รอจัดจ่าย', ready: 'รอยืนยันรับ', received: 'รับครบแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };
const formatDate = (value: string) => new Date(value).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });

/** An authenticated, current snapshot of one reservation; generating it never changes stock. */
export async function createReservationPDF(row: PPERequest, companyName: string, exportedAt = new Date()) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readFile(path.join(process.cwd(), 'public/fonts/NotoSansThai.ttf')), { subset: true });
  doc.setTitle(`ใบจองสต็อก PPE - ${row.id}`);
  doc.setAuthor('PPE Inventory');
  const blue = rgb(0.306, 0.475, 0.655), ink = rgb(0.2, 0.2, 0.2), muted = rgb(0.4, 0.4, 0.4);
  const left = 42, width = 511;
  let page = doc.addPage([595.28, 841.89]), y = 0;
  const header = () => {
    page.drawText('ใบจองสต็อก PPE', { x: left, y: 787, font, size: 23, color: blue });
    page.drawText(`เลขที่คำขอ: ${row.id}`, { x: left, y: 764, font, size: 9, color: muted });
    page.drawLine({ start: { x: left, y: 751 }, end: { x: 553, y: 751 }, color: blue, thickness: 1 });
    y = 726;
  };
  header();
  const room = (height: number) => { if (y - height < 65) { page = doc.addPage([595.28, 841.89]); header(); } };
  const segments = new Intl.Segmenter('th', { granularity: 'grapheme' });
  const paragraph = (value: string, size = 11, color = ink) => {
    for (const raw of value.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').split('\n')) {
      let line = '';
      const draw = () => { room(19); page.drawText(line, { x: left, y, font, size, color }); y -= 19; line = ''; };
      for (const { segment } of segments.segment(raw)) {
        if (line && font.widthOfTextAtSize(line + segment, size) > width) draw();
        line += segment;
      }
      draw();
    }
  };
  paragraph(`บริษัท: ${companyName} (${row.company_id.toUpperCase()})`, 13);
  paragraph(`สถานะ ณ เวลาออกเอกสาร: ${statusLabels[row.status]}`);
  paragraph(`วันที่ขอ: ${formatDate(row.created_at)}`);
  paragraph(`วันที่อนุมัติ: ${row.approved_at ? formatDate(row.approved_at) : '-'}`);
  paragraph(`ผู้ขอเบิก: ${row.ppe_requesters.display_name}`);
  paragraph(`รหัสพนักงาน: ${row.ppe_requesters.employee_code}   แผนก: ${row.ppe_requesters.department || '-'}`);
  const approval = row.ppe_request_events.find(e => e.action === 'approve');
  paragraph(`ผู้อนุมัติ: ${approval?.actor_name || '-'}`);
  y -= 10;
  paragraph('รายการอุปกรณ์', 14, blue);
  paragraph(row.ppe_products.name, 13);
  paragraph(`หน่วย: ${UNIT_TYPES.find(u => u.value === row.ppe_products.unit)?.label || row.ppe_products.unit}`);
  room(82);
  const remaining = ['approved', 'ready'].includes(row.status) ? row.approved_quantity - row.received_quantity : 0;
  const metrics = [['จำนวนที่ขอ', row.quantity], ['อนุมัติจอง', row.approved_quantity], ['รับแล้ว', row.received_quantity], ['จองคงเหลือ', remaining]] as const;
  metrics.forEach(([label, value], index) => {
    const x = left + index * width / 4;
    page.drawRectangle({ x, y: y - 60, width: width / 4, height: 70, color: rgb(0.94, 0.96, 0.98), borderColor: rgb(0.83, 0.85, 0.88), borderWidth: 0.5 });
    page.drawText(label, { x: x + 10, y: y - 10, font, size: 11, color: muted });
    page.drawText(value.toLocaleString('th-TH'), { x: x + 10, y: y - 40, font, size: 20, color: blue });
  });
  y -= 90;
  paragraph(`เหตุผลการขอเบิก: ${row.reason}`);
  if (row.manager_note) paragraph(`หมายเหตุผู้ดูแล: ${row.manager_note}`);
  if (row.status === 'cancelled') paragraph('คำขอนี้ถูกยกเลิกแล้ว ยอดจองคงเหลือเป็น 0', 11, rgb(0.7, 0.2, 0.2));
  y -= 12;
  paragraph('เอกสารนี้แสดงยอดจอง ณ เวลาที่ดาวน์โหลด ไม่ใช่หลักฐานยืนยันรับอุปกรณ์', 10, muted);
  paragraph('ระบบจะตัดสต็อกเมื่อผู้ขอเบิกกดยืนยันรับในระบบเท่านั้น การ Export PDF ไม่เปลี่ยนยอดสต็อก', 10, muted);
  const pages = doc.getPages();
  pages.forEach((p, index) => {
    p.drawText(`ออกเอกสาร: ${formatDate(exportedAt.toISOString())} (เวลาไทย)`, { x: left, y: 33, font, size: 8, color: muted });
    p.drawText(`หน้า ${index + 1} / ${pages.length}`, { x: 497, y: 33, font, size: 8, color: muted });
  });
  return doc.save();
}

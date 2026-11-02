import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { supportsOriginalPdf } from "./catalog";
export { supportsOriginalPdf } from "./catalog";
import { displayStatus, STATUS_LABELS, ROLE_LABELS, type Permit, type PermitSignature } from "./types";
import { documentHash } from "./workflow";
import { createPdfTextMetrics, fitPdfSlotText } from "./pdf-text-layout";

export type PdfOverflowWarning = { formCode: string; fieldId: string; label: string; page: number; annex: string; reason?: "overflow" | "unmapped" };
export type PermitPdfOptions = { preview?: boolean; onOverflow?: (warning: PdfOverflowWarning) => void };

// Coordinates use the reviewed 827 x 1170 renders of the supplied originals.
// Never infer an individual paper checklist answer from a broader digital answer.
type Box = [number, number, number, number];
type Layout = { date: Box; from: Box; to: Box; company: Box; title: Box; location: Box; detail: Box; fire: Box; request: Box; workerCount?: Box; owner?: Box; safety?: Box; project?: Box; phone?: Box; close?: { date: Box; time: Box; request: Box; owner: Box; safety: Box } };
const standard = (dy = 0, closeY = 1095): Layout => ({
  date: [235, 81 + dy, 128, 14], from: [537, 81 + dy, 76, 14], to: [666, 81 + dy, 75, 14],
  company: [254, 103 + dy, 108, 14], title: [544, 103 + dy, 196, 14],
  location: [613, 125 + dy, 128, 14], detail: [218, 145 + dy, 146, 15], fire: [551, 145 + dy, 190, 15],
  workerCount: [212, 125 + dy, 88, 14],
  request: [133, 211 + dy, 72, 20], phone: [340, 220 + dy, 78, 12],
  owner: [85, 243 + dy, 177, 20], safety: [624, 211 + dy, 78, 20], project: [552, 243 + dy, 155, 20],
  close: { date: [91, closeY + 10, 52, 14], time: [210, closeY + 10, 62, 14], request: [350, closeY + 8, 85, 25], owner: [522, closeY + 8, 77, 25], safety: [720, closeY + 8, 75, 25] },
});
const hot = (second = false): Layout => {
  const d = second ? -35 : 0;
  return { date: [239, 132 + d, 175, 14], from: [551, 132 + d, 69, 14], to: [671, 132 + d, 75, 14],
    company: [247, 155 + d, 164, 14], title: [553, 155 + d, 192, 14],
    location: [615, 179 + d, 130, 14], detail: [185, 197 + d, 190, 14], fire: [560, 195 + d, 185, 15],
    request: [161, 243 + d, 109, 20], owner: [113, 266 + d, 156, 16], safety: [578, 244 + d, 103, 19], project: [577, 266 + d, 104, 16],
    ...(second ? {} : { close: { date: [144, 1047, 60, 16] as Box, time: [252, 1047, 60, 16] as Box, request: [397, 1043, 69, 25] as Box, owner: [553, 1043, 60, 25] as Box, safety: [718, 1043, 50, 25] as Box } }),
  };
};
const layouts: Record<string, Layout> = {
  "003": { ...standard(-24, 1100), request: [133, 187, 72, 20], owner: [85, 220, 177, 17], safety: [624, 187, 78, 20], project: [552, 220, 155, 17], phone: [340, 197, 78, 12] },
  "004": standard(), "005": hot(), "013": standard(11), "014": standard(0, 1088),
  "015": standard(-4, 1097), "016": standard(-4, 1064), "029": standard(-4, 1081),
  "006": { date: [89, 132, 199, 13], from: [348, 132, 124, 13], to: [574, 132, 123, 13],
    company: [533, 99, 170, 13], title: [177, 148, 320, 13], location: [180, 99, 266, 13],
    detail: [185, 148, 312, 13], fire: [0, 0, 0, 0], request: [505, 305, 96, 20] },
};
const ink = rgb(0.06, 0.16, 0.31);
const stageLabels: Record<string, string> = { request: "ส่งคำขอ", approve: "อนุมัติ", start: "ยืนยันเปิดงาน", close: "ปิดงาน" };
const actionLabels: Record<string, string> = { create: "สร้างคำขอ", edit: "แก้ไขร่าง", submit: "ส่งคำขอ", approve: "อนุมัติ", start: "เปิดงาน", return: "ส่งกลับแก้ไข", suspend: "พักงาน", resume: "กลับเข้าทำงาน", inspect: "ตรวจระหว่างงาน", request_close: "ขอปิดงาน", close: "ตรวจรับปิดงาน", cancel: "ยกเลิก" };
const date = (v: string, timeOnly = false) => !v || !Number.isFinite(Date.parse(v)) ? "" : new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", ...(timeOnly ? {hour: "2-digit", minute: "2-digit"} : {day: "2-digit", month: "2-digit", year: "numeric"}) }).format(new Date(v));
const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" });
export function wrapPdfText(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const {segment} of graphemes.segment(paragraph)) {
      if (line && font.widthOfTextAtSize(line + segment, size) > width) { lines.push(line); line = ""; }
      line += segment;
    }
    lines.push(line);
  }
  return lines;
}
export async function renderPermitPdf(p: Permit, options: PermitPdfOptions = {}): Promise<Uint8Array> {
  if (!supportsOriginalPdf(p)) throw new Error("แม่แบบหรือ Revision นี้ยังไม่มีผังพิมพ์ตรงต้นฉบับ กรุณาใช้พิมพ์สรุปข้อมูล");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "public/fonts/NotoSansThai.ttf"));
  const font = await doc.embedFont(fontBytes, { subset: true });
  const metrics = createPdfTextMetrics(fontBytes);
  const ref = options.preview ? "ตัวอย่าง" : p.id.slice(0, 8).toUpperCase();
  const status = options.preview ? "ร่าง ยังไม่ได้บันทึก" : STATUS_LABELS[displayStatus(p)];
  const hash = documentHash(p.data);
  const printedAt = new Date().toISOString();
  const signatures = options.preview ? [] : p.data.signatures.filter(s => !s.stage.startsWith("superseded:"));
  const findSig = (stage: string, role?: string) => signatures.find(s => s.stage === stage && (!role || s.role === role));
  const imageCache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  const mappedFields = new Map<number, Set<string>>();
  const extraDetails = new Map<number, { label: string; value: string }[]>();
  const structuredForms = new Set<number>();
  const sourcePageByForm = new Map<number, number>();
  const safeText = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  let currentFormCode = "";
  function warn(fieldId: string, label: string, annex: string, page: number, reason: "overflow" | "unmapped") {
    options.onOverflow?.({formCode: currentFormCode, fieldId, label, page, annex, reason});
  }
  function fill(page: PDFPage, box: Box, value: string, appendix: string, field?: {id: string; label: string}) {
    if (!value || box[2] <= 0) return !value;
    const scale = page.getWidth() / 827;
    const fit = fitPdfSlotText(value, box[2], box[3], metrics, appendix);
    if (fit) page.drawText(fit.text, { x: (box[0] + fit.x) * scale, y: page.getHeight() - (box[1] + fit.baseline) * scale, size: fit.size * scale, font, color: ink });
    if (!fit?.originalFits && field) warn(field.id, field.label, appendix, doc.getPages().indexOf(page) + 1, "overflow");
    return Boolean(fit?.originalFits);
  }
  async function sign(page: PDFPage, box: Box | undefined, s: PermitSignature | undefined) {
    if (!box || !s?.image) return;
    // Only the recorded signature for this exact workflow stage is used.
    let image = imageCache.get(s.image);
    if (!image) { image = await doc.embedPng(s.image); imageCache.set(s.image, image); }
    const scale = page.getWidth() / 827;
    const fit = Math.min(box[2] * scale / image.width, box[3] * scale / image.height);
    const w = image.width * fit, h = image.height * fit;
    page.drawImage(image, {x: box[0] * scale + (box[2] * scale - w) / 2, y: page.getHeight() - (box[1] + box[3]) * scale + (box[3] * scale - h) / 2, width: w, height: h});
  }
  for (const [index, form] of p.data.forms.entries()) {
    currentFormCode = form.template.code;
    sourcePageByForm.set(index, doc.getPageCount() + 1);
    const code = form.template.source_code!;
    const sourceBytes = await readFile(path.join(process.cwd(), "data/permit-templates", `${code}.pdf`));
    const structured = form.template.config.layoutVersion === "amt-2026-11-v2";
    if (structured) {
      const actualHash = createHash("sha256").update(sourceBytes).digest("hex");
      if (!["003", "004"].includes(code) || actualHash !== form.template.config.sourceSha256)
        throw new Error("ต้นฉบับ PDF ไม่ตรงกับผังพิมพ์ที่ตรวจแล้ว กรุณาติดต่อผู้ดูแล");
      structuredForms.add(index);
    }
    mappedFields.set(index, new Set());
    const details: { label: string; value: string }[] = [];
    extraDetails.set(index, details);
    const source = await PDFDocument.load(sourceBytes);
    const pages = await doc.copyPages(source, source.getPageIndices());
    for (const [pageIndex, page] of pages.entries()) {
      doc.addPage(page);
      const layout = code === "005" ? hot(pageIndex === 1) : layouts[code];
      const appendix = `F${index + 1}`;
      if(pageIndex===0 && p.data.workers.trim()) warn("workers","รายชื่อผู้ปฏิบัติงาน",appendix,doc.getPages().indexOf(page)+1,"unmapped");
      fill(page, layout.date, date(p.data.startsAt), appendix);
      fill(page, layout.from, date(p.data.startsAt, true), appendix);
      fill(page, layout.to, date(p.data.endsAt, true), appendix);
      if (layout.workerCount && p.data.workerCount) fill(page, layout.workerCount, String(p.data.workerCount), appendix, {id:"workerCount",label:"จำนวนผู้ปฏิบัติงาน"});
      const common = (box: Box | undefined, fieldId: string, label: string, value: string) => {
        if ((!box || !fill(page, box, value, appendix, {id:fieldId,label})) && pageIndex === 0) {
          details.push({label, value});
          if(value.trim() && (!box || box[2]<=0)) warn(fieldId,label,appendix,doc.getPages().indexOf(page)+1,"unmapped");
        }
      };
      common(layout.company, "contractorName", "บริษัท / แผนก", p.data.contractorName);
      common(code === "006" ? undefined : layout.title, "title", "ชื่องาน", p.data.title);
      common(layout.location, "location", "พื้นที่", p.data.location);
      common(layout.detail, "detail", "รายละเอียดงาน", p.data.detail);
      common(layout.fire, "fireImpact", "ผลกระทบระบบดับเพลิง", p.data.fireImpact);
      common(layout.phone, "phone", "ติดต่อ", p.data.phone);
      await sign(page, layout.request, findSig("request", "requester"));
      await sign(page, layout.owner, findSig("approve", "area_owner"));
      await sign(page, layout.safety, findSig("approve", "safety"));
      await sign(page, layout.project, findSig("approve", "project_manager"));
      if (layout.close) {
        const close = findSig("close", "requester");
        if (close) {
          fill(page, layout.close.date, date(close.at).replace(/\/(\d{2})(\d{2})$/, "/$2"), appendix);
          fill(page, layout.close.time, date(close.at, true), appendix);
        }
        await sign(page, layout.close.request, close);
        await sign(page, layout.close.owner, findSig("close", "area_owner"));
        await sign(page, layout.close.safety, findSig("close", "safety"));
      }
      if (code === "003") {
        const codes = ["004", "005", "006", "013", "014", "015", "016", "029"];
        const scale = page.getWidth() / 827;
        for (const [i, c] of codes.entries()) if (p.data.forms.some(f => f.template.source_code === c)) {
          page.drawText("X", {x: [62,160,257,354,457,556,651,753][i] * scale, y: page.getHeight() - 358 * scale, font, size: 11 * scale, color: ink});
        }
      }
      if (code === "006") {
        fill(page, [178, 164, 319, 13], form.answers.equipment, appendix, {id:"equipment",label:"เครื่องมือและอุปกรณ์"});
        fill(page, [80, 219, 107, 14], form.answers.entrants || p.data.workers, appendix, {id:"entrants",label:"รายชื่อผู้ปฏิบัติงาน"});
        fill(page, [223, 219, 98, 14], form.answers.rescuers, appendix, {id:"rescuers",label:"รายชื่อผู้ช่วยเหลือ"});
        // The original authorizer/supervisor roles are not inferred from SHE approval roles.
      }
      if (structured) {
        const scale = page.getWidth() / 827;
        for (const field of form.template.config.fields) {
          const mapping = field.print;
          const answer = form.answers[field.id] || "";
          if (!mapping || (mapping.page ?? 0) !== pageIndex || !answer) continue;
          const value = answer.startsWith("na:") ? "na" : answer;
          if (mapping.marks) {
            const mark = mapping.marks.find(m => m.value === value);
            if (mark) {
              // Mark coordinates are the centre of the original checkbox.
              page.drawText("X", {x: (mark.x - 3) * scale, y: page.getHeight() - (mark.y + 4) * scale, font, size: 10 * scale, color: ink});
              mappedFields.get(index)!.add(field.id);
            } else if (field.kind === "choice" && value === "no" && field.options?.some(o => o.value === "no")) {
              // An explicit "not selected" value is represented by the empty box.
              mappedFields.get(index)!.add(field.id);
            }
          } else if (mapping.width && fill(page, [mapping.x, mapping.y, mapping.width, mapping.height || 14], answer, appendix, {id:field.id,label:field.label})) {
            mappedFields.get(index)!.add(field.id);
          }
          // Preserve the reason even when the N/A checkbox is marked on the original.
          if (answer.startsWith("na:")) mappedFields.get(index)!.delete(field.id);
        }
      }
      const s = page.getWidth() / 827;
      const statusNote = !options.preview && p.status === "active" && displayStatus(p) !== "expired" ? status : `${status} (ไม่ใช่การอนุญาตเริ่มงาน)`;
      page.drawText(`${ref} | V${p.version} | ${statusNote} | รายละเอียดและผลตรวจ: ภาคผนวก ${appendix}`, {x: 24 * s, y: 2.5, size: 5.2, font, color: ink});
    }
  }
  // Legacy fields remain in full annexes. Structured forms only need unmatched or
  // overflowing details; no original checkbox is inferred from a broader answer.
  let page: PDFPage, y = 0;
  function newPage(title: string) {
    page = doc.addPage([595.32, 841.92]); y = 782;
    page.drawText(title, {x: 36, y: 808, font, size: 12, color: ink});
    page.drawText(`${ref} | V${p.version} | ${status}`, {x: 36, y: 30, font, size: 8, color: ink});
  }
  function paragraph(label: string, value: string, title: string) {
    const lines = wrapPdfText(safeText(`${label}: ${value || "ไม่ได้ระบุ"}`), font, 9, 523);
    for (const line of lines) {
      if (y < 55) newPage(`${title} (ต่อ)`);
      page.drawText(line, {x: 36, y, font, size: 9, color: ink}); y -= 15;
    }
    y -= 5;
  }
  for (const [i, form] of p.data.forms.entries()) {
    currentFormCode = form.template.code;
    const title = `ภาคผนวก F${i + 1} | ${form.template.code} Rev.${form.template.revision}`;
    newPage(title);
    paragraph("การอ่านเอกสาร", "ช่องในต้นฉบับที่ไม่มีข้อมูลตรงกันจะเว้นว่าง ผลตรวจด้านล่างเป็นรายการที่ผู้ใช้บันทึกในระบบ ไม่ใช่ผลตรวจรายช่องหรือรายชั่วโมงที่ไม่ได้บันทึก", title);
    if (form.template.source_code === "005") paragraph("ต้นฉบับ", "ไฟล์ที่ได้รับมีหน้า 1 Rev.D และหน้า 2 Rev.B ระบบคงทั้งสองหน้าตามต้นฉบับ", title);
    const commonDetails = structuredForms.has(i) ? [
      ...extraDetails.get(i)!.map(d => [d.label, d.value]),
      ["ผู้ปฏิบัติงาน", p.data.workers],
      ["เวลาเริ่ม - สิ้นสุด (ประเทศไทย)", `${date(p.data.startsAt)} ${date(p.data.startsAt,true)} - ${date(p.data.endsAt)} ${date(p.data.endsAt,true)}`],
      ["งานโครงการ", p.data.project ? "ใช่" : "ไม่ใช่"],
    ] : [
      ["ชื่องาน", p.data.title], ["พื้นที่", p.data.location], ["บริษัท / แผนก", p.data.contractorName],
      ["รายละเอียดงาน", p.data.detail], ["ผู้ปฏิบัติงาน", p.data.workers], ["ติดต่อ", p.data.phone],
      ["เวลาเริ่ม - สิ้นสุด (ประเทศไทย)", `${date(p.data.startsAt)} ${date(p.data.startsAt,true)} - ${date(p.data.endsAt)} ${date(p.data.endsAt,true)}`],
      ["ผลกระทบระบบดับเพลิง", p.data.fireImpact], ["งานโครงการ", p.data.project ? "ใช่" : "ไม่ใช่"],
    ];
    for (const [label, value] of commonDetails) paragraph(label, value, title);
    for (const f of form.template.config.fields) {
      if (structuredForms.has(i) && mappedFields.get(i)!.has(f.id)) continue;
      const a = form.answers[f.id] || "";
      if (options.preview && !a.trim()) continue;
      if (structuredForms.has(i) && f.id.startsWith("control_")) {
        const hazard = form.template.config.fields.find(h => h.id.startsWith("hazard_") && f.id.startsWith(`control_${h.id.slice(7)}_`));
        if (hazard && form.answers[hazard.id] === "no") continue;
      }
      if (structuredForms.has(i) && !a && !f.required) continue;
      if(a.trim() && ((!f.print && ["text","textarea"].includes(f.kind)) || a.startsWith("na:"))) warn(f.id,a.startsWith("na:")?`เหตุผล: ${f.label}`:f.label,`F${i+1}`,sourcePageByForm.get(i)!,"unmapped");
      const answer = f.kind === "check" ? a === "yes" ? "ใช่" : a === "no" ? "ไม่ใช่" : a.startsWith("na:") ? `ไม่เกี่ยวข้อง: ${a.slice(3)}` : a : f.kind === "choice" ? f.options?.find(o => o.value === a)?.label || a : a;
      paragraph(f.label, answer, title);
    }
  }
  if (p.data.inspections?.length) {
    const inspectionTitle = "ผลตรวจระหว่างปฏิบัติงาน";
    newPage(inspectionTitle);
    for (const [index, inspection] of p.data.inspections.entries()) {
      paragraph(`การตรวจครั้งที่ ${index + 1}`, `${inspection.formCode} | ${date(inspection.at)} ${date(inspection.at, true)} | ผู้ตรวจ ${inspection.name}`, inspectionTitle);
      const form = p.data.forms.find(f => f.template.code === inspection.formCode);
      for (const [fieldId, answer] of Object.entries(inspection.answers)) {
        const label = form?.template.config.fields.find(f => f.id === fieldId)?.label || fieldId;
        const value = answer === "yes" ? "ผ่าน" : answer === "no" ? "ไม่ผ่าน" : answer.startsWith("na:") ? `ไม่เกี่ยวข้อง: ${answer.slice(3)}` : answer;
        paragraph(label, value, inspectionTitle);
      }
      paragraph("บันทึกผลตรวจ", inspection.note, inspectionTitle);
    }
  }
  const signatureTitle = options.preview ? "ตัวอย่างขณะกรอก - ยังไม่ได้บันทึก" : "หลักฐานการลงนามและประวัติเอกสาร";
  newPage(signatureTitle);
  if (!options.preview) {
    const statusUrl = `https://tools.eashe.org/permit?company_id=${encodeURIComponent(p.company_id)}&id=${encodeURIComponent(p.id)}`;
    const qr = await doc.embedPng(await QRCode.toDataURL(statusUrl, {width: 240, margin: 1}));
    page!.drawImage(qr, {x: 455, y: 693, width: 104, height: 104});
    page!.drawText("สแกนตรวจสถานะล่าสุด", {x: 452, y: 680, font, size: 8, color: ink});
    page!.drawText("ต้องเข้าสู่ระบบ", {x: 476, y: 667, font, size: 8, color: ink});
  }
  page!.drawText(options.preview ? "ตัวอย่างประกอบการกรอกคำขอ" : `เลขใบอนุญาต ${ref}`, {x: 36, y: 782, font, size: 12, color: ink});
  page!.drawText(`สถานะขณะพิมพ์: ${status} | เวอร์ชัน ${p.version}`, {x: 36, y: 757, font, size: 10, color: ink});
  page!.drawText(`พิมพ์เมื่อ ${date(printedAt)} ${date(printedAt, true)} (เวลาไทย)`, {x: 36, y: 735, font, size: 9, color: ink});
  for (const [line, j] of wrapPdfText(options.preview ? "ยังไม่ได้บันทึกหรือส่งคำขอ ตัวอย่างนี้ไม่ใช่ใบอนุญาตให้เริ่มงาน" : "เอกสารที่พิมพ์แล้วไม่ปรับสถานะอัตโนมัติ โปรดสแกนตรวจสถานะปัจจุบันก่อนใช้งาน", font, 9, 390).map((v,j) => [v,j] as const))
    page!.drawText(line, {x: 36, y: 708 - j * 15, font, size: 9, color: ink});
  y = 635;
  if (!options.preview) {
    paragraph("เลขอ้างอิงเต็ม", p.id, signatureTitle);
    paragraph("รหัสตรวจสอบข้อมูล SHA-256", hash, signatureTitle);
  }
  for (const s of signatures) {
    if (y < 125) newPage(`${signatureTitle} (ต่อ)`);
    const signerRole = s.role === "requester" ? "ผู้ขออนุญาต" : ROLE_LABELS[s.role as keyof typeof ROLE_LABELS] || s.role;
    const stage = s.stage.startsWith("resume:") ? "ยืนยันกลับเข้าทำงาน" : s.stage === "close" && s.role === "requester" ? "ขอปิดงาน" : stageLabels[s.stage] || s.stage;
    paragraph("ผู้ลงนาม", `${s.name} | ${signerRole} | ${stage} | ${date(s.at)} ${date(s.at,true)}`, signatureTitle);
    if (s.image) {
      let image = imageCache.get(s.image);
      if (!image) { image = await doc.embedPng(s.image); imageCache.set(s.image,image); }
      const fit = Math.min(145/image.width, 35/image.height);
      page!.drawImage(image,{x:36,y:y-35,width:image.width*fit,height:image.height*fit}); y -= 43;
    }
    paragraph("รหัสข้อมูลขณะลงนาม", s.hash, signatureTitle);
  }
  if(!options.preview)for (const e of p.data.events) paragraph("ประวัติ", `${date(e.at)} ${date(e.at,true)} | ${e.name} | ${actionLabels[e.action] || e.action} | ${e.note || "-"}`, signatureTitle);
  for (const a of p.data.attachments) paragraph("เอกสารแนบในระบบ", a.name, signatureTitle);
  if (!options.preview && p.data.sourcePermitId) paragraph("ใบอนุญาตต้นทาง", p.data.sourcePermitId, signatureTitle);
  for (const [i, pg] of doc.getPages().entries()) pg.drawText(`${i + 1}/${doc.getPageCount()}`, {x: pg.getWidth()-32, y: 4.5, size: 6, font, color: ink});
  doc.setTitle(options.preview ? `ตัวอย่างคำขอ - ${p.data.title}` : `Work Permit ${ref} - ${p.data.title}`);
  doc.setSubject(options.preview ? "Unsaved work permit preview" : `Permit ${p.id}; version ${p.version}; SHA-256 ${hash}`);
  doc.setCreator("EA SHE Work Permit");
  return doc.save();
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supportsOriginalPdf } from "./catalog";
export { supportsOriginalPdf } from "./catalog";
import { displayStatus, STATUS_LABELS, ROLE_LABELS, type Permit, type PermitSignature } from "./types";
import { documentHash } from "./workflow";

// Coordinates use the reviewed 827 x 1170 renders of the supplied originals.
// Never infer an individual paper checklist answer from a broader digital answer.
type Box = [number, number, number, number];
type Layout = { date: Box; from: Box; to: Box; company: Box; title: Box; location: Box; detail: Box; fire: Box; request: Box; owner?: Box; safety?: Box; project?: Box; phone?: Box; close?: { date: Box; time: Box; request: Box; owner: Box; safety: Box } };
const standard = (dy = 0, closeY = 1095): Layout => ({
  date: [235, 81 + dy, 128, 14], from: [537, 81 + dy, 76, 14], to: [666, 81 + dy, 75, 14],
  company: [254, 103 + dy, 108, 14], title: [544, 103 + dy, 196, 14],
  location: [613, 125 + dy, 128, 14], detail: [218, 145 + dy, 146, 15], fire: [551, 145 + dy, 190, 15],
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
const date = (v: string, timeOnly = false) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", ...(timeOnly ? {hour: "2-digit", minute: "2-digit"} : {day: "2-digit", month: "2-digit", year: "numeric"}) }).format(new Date(v));
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
export async function renderPermitPdf(p: Permit): Promise<Uint8Array> {
  if (!supportsOriginalPdf(p)) throw new Error("แม่แบบหรือ Revision นี้ยังไม่มีผังพิมพ์ตรงต้นฉบับ กรุณาใช้พิมพ์สรุปข้อมูล");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readFile(path.join(process.cwd(), "public/fonts/NotoSansThai.ttf")), { subset: true });
  const ref = p.id.slice(0, 8).toUpperCase();
  const status = STATUS_LABELS[displayStatus(p)];
  const hash = documentHash(p.data);
  const signatures = p.data.signatures.filter(s => !s.stage.startsWith("superseded:"));
  const findSig = (stage: string, role?: string) => signatures.find(s => s.stage === stage && (!role || s.role === role));
  const imageCache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  const safeText = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  function fill(page: PDFPage, box: Box, value: string, appendix: string) {
    if (!value || box[2] <= 0) return;
    const scale = page.getWidth() / 827;
    let size = 11;
    const content = safeText(value).replace(/\s+/g, " ").trim();
    while (size > 9 && font.widthOfTextAtSize(content, size) > box[2]) size -= 0.5;
    const text = font.widthOfTextAtSize(content, size) <= box[2] ? content : `ดูภาคผนวก ${appendix}`;
    page.drawText(text, { x: box[0] * scale, y: page.getHeight() - (box[1] + 11) * scale, size: size * scale, font, color: ink });
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
    const code = form.template.source_code!;
    const source = await PDFDocument.load(await readFile(path.join(process.cwd(), "data/permit-templates", `${code}.pdf`)));
    const pages = await doc.copyPages(source, source.getPageIndices());
    for (const [pageIndex, page] of pages.entries()) {
      doc.addPage(page);
      const layout = code === "005" ? hot(pageIndex === 1) : layouts[code];
      const appendix = `F${index + 1}`;
      fill(page, layout.date, date(p.data.startsAt), appendix);
      fill(page, layout.from, date(p.data.startsAt, true), appendix);
      fill(page, layout.to, date(p.data.endsAt, true), appendix);
      fill(page, layout.company, p.data.contractorName, appendix);
      if (code !== "006") fill(page, layout.title, p.data.title, appendix);
      fill(page, layout.location, p.data.location, appendix);
      fill(page, layout.detail, p.data.detail, appendix);
      fill(page, layout.fire, p.data.fireImpact, appendix);
      if (layout.phone) fill(page, layout.phone, p.data.phone, appendix);
      await sign(page, layout.request, findSig("submit"));
      await sign(page, layout.owner, findSig("approve", "area_owner"));
      await sign(page, layout.safety, findSig("approve", "safety"));
      await sign(page, layout.project, findSig("approve", "project_manager"));
      if (layout.close) {
        const close = findSig("request_close");
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
        fill(page, [178, 164, 319, 13], form.answers.equipment, appendix);
        fill(page, [80, 219, 107, 14], form.answers.entrants || p.data.workers, appendix);
        fill(page, [223, 219, 98, 14], form.answers.rescuers, appendix);
        // The original authorizer/supervisor roles are not inferred from SHE approval roles.
      }
      const s = page.getWidth() / 827;
      const statusNote = p.status === "active" && displayStatus(p) !== "expired" ? status : `${status} (ไม่ใช่การอนุญาตเริ่มงาน)`;
      page.drawText(`${ref} | V${p.version} | ${statusNote} | รายละเอียดและผลตรวจ: ภาคผนวก ${appendix}`, {x: 24 * s, y: 2.5, size: 5.2, font, color: ink});
    }
  }
  // Digital fields are intentionally broader than some paper checklists. Preserve all
  // recorded answers in an explicitly labelled annex rather than manufacture checkmarks.
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
    const title = `ภาคผนวก F${i + 1} | ${form.template.code} Rev.${form.template.revision}`;
    newPage(title);
    paragraph("การอ่านเอกสาร", "ช่องในต้นฉบับที่ไม่มีข้อมูลตรงกันจะเว้นว่าง ผลตรวจด้านล่างเป็นรายการที่ผู้ใช้บันทึกในระบบ ไม่ใช่ผลตรวจรายช่องหรือรายชั่วโมงที่ไม่ได้บันทึก", title);
    if (form.template.source_code === "005") paragraph("ต้นฉบับ", "ไฟล์ที่ได้รับมีหน้า 1 Rev.D และหน้า 2 Rev.B ระบบคงทั้งสองหน้าตามต้นฉบับ", title);
    for (const [label, value] of [
      ["ชื่องาน", p.data.title], ["พื้นที่", p.data.location], ["บริษัท / แผนก", p.data.contractorName],
      ["รายละเอียดงาน", p.data.detail], ["ผู้ปฏิบัติงาน", p.data.workers], ["ติดต่อ", p.data.phone],
      ["เวลาเริ่ม - สิ้นสุด (ประเทศไทย)", `${date(p.data.startsAt)} ${date(p.data.startsAt,true)} - ${date(p.data.endsAt)} ${date(p.data.endsAt,true)}`],
      ["ผลกระทบระบบดับเพลิง", p.data.fireImpact], ["งานโครงการ", p.data.project ? "ใช่" : "ไม่ใช่"],
    ]) paragraph(label, value, title);
    for (const f of form.template.config.fields) {
      const a = form.answers[f.id] || "";
      const answer = f.kind === "check" ? a === "yes" ? "ใช่" : a === "no" ? "ไม่ใช่" : a.startsWith("na:") ? `ไม่เกี่ยวข้อง: ${a.slice(3)}` : a : a;
      paragraph(f.label, answer, title);
    }
  }
  const signatureTitle = "หลักฐานการลงนามและประวัติเอกสาร";
  newPage(signatureTitle);
  paragraph("เลขอ้างอิงเต็ม", p.id, signatureTitle);
  paragraph("รหัสตรวจสอบข้อมูล SHA-256", hash, signatureTitle);
  for (const s of signatures) {
    if (y < 125) newPage(`${signatureTitle} (ต่อ)`);
    paragraph("ผู้ลงนาม", `${s.name} | ${ROLE_LABELS[s.role as keyof typeof ROLE_LABELS] || s.role} | ${s.stage} | ${date(s.at)} ${date(s.at,true)}`, signatureTitle);
    if (s.image) {
      let image = imageCache.get(s.image);
      if (!image) { image = await doc.embedPng(s.image); imageCache.set(s.image,image); }
      const fit = Math.min(145/image.width, 35/image.height);
      page!.drawImage(image,{x:36,y:y-35,width:image.width*fit,height:image.height*fit}); y -= 43;
    }
    paragraph("รหัสข้อมูลขณะลงนาม", s.hash, signatureTitle);
  }
  for (const e of p.data.events) paragraph("ประวัติ", `${date(e.at)} ${date(e.at,true)} | ${e.name} | ${e.action} | ${e.note || "-"}`, signatureTitle);
  for (const a of p.data.attachments) paragraph("เอกสารแนบในระบบ", a.name, signatureTitle);
  if (p.data.sourcePermitId) paragraph("ใบอนุญาตต้นทาง", p.data.sourcePermitId, signatureTitle);
  for (const [i, pg] of doc.getPages().entries()) pg.drawText(`${i + 1}/${doc.getPageCount()}`, {x: pg.getWidth()-32, y: 4.5, size: 6, font, color: ink});
  doc.setTitle(`Work Permit ${ref} - ${p.data.title}`);
  doc.setSubject(`Permit ${p.id}; version ${p.version}; SHA-256 ${hash}`);
  doc.setCreator("EA SHE Work Permit");
  return doc.save();
}

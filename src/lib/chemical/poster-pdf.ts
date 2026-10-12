import type { PosterSnapshot, PosterSection } from "./poster";
import { ghsPictogram } from "./ghs";
import { LABEL_PPE, ppeFile } from "./ppe";

const FONT = "ChemicalLabelThai",
  MM = 300 / 25.4,
  PT = 25.4 / 72;
export interface RenderedPoster {
  image: string;
  width: number;
  height: number;
  problems: string[];
  sdsUrl: string;
  qr?: { x: number; y: number; size: number };
}
async function picture(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("โหลดรูปภาพโปสเตอร์ไม่สำเร็จ"));
    im.src = src;
  });
}
function wrap(ctx: CanvasRenderingContext2D, value: string, w: number) {
  const lines: string[] = [];
  const words = new Intl.Segmenter("th", { granularity: "word" }),
    glyphs = new Intl.Segmenter("th", { granularity: "grapheme" });
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const { segment } of words.segment(paragraph)) {
      if (ctx.measureText(line + segment).width <= w) {
        line += segment;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = segment.trimStart();
      if (ctx.measureText(line).width > w) {
        let part = "";
        for (const { segment: g } of glyphs.segment(line)) {
          if (part && ctx.measureText(part + g).width > w) {
            lines.push(part);
            part = "";
          }
          part += g;
        }
        line = part;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
/** Both the preview and downloaded PDF use this single 300 DPI rendering. */
export async function renderPoster(
  s: PosterSnapshot,
  sdsUrl: string,
  demo: boolean,
): Promise<RenderedPoster> {
  const {
    draft: d,
    template: { config: c },
    fontSize: fs,
  } = s;
  const aab = c.layout === "aab";
  const width = aab ? 297 : 210,
    height = aab ? 210 : 297;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * MM);
  canvas.height = Math.round(height * MM);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างโปสเตอร์");
  const fonts = await Promise.all([
    document.fonts.load(`400 12px ${FONT}`),
    document.fonts.load(`700 12px ${FONT}`),
  ]);
  if (fonts.some((f) => !f.length))
    throw new Error("โหลดแบบอักษรไทยไม่สำเร็จ กรุณาลองใหม่");
  const ghs = await Promise.all(
    d.pictograms.map((code) => picture(ghsPictogram(code)!.file)),
  );
  const ppes = aab
    ? LABEL_PPE
    : LABEL_PPE.filter((p) => d.ppe.includes(p.code));
  const ppeImages = await Promise.all(
    ppes.map((p) => picture(ppeFile(p.code))),
  );
  const logo = c.logo ? await picture(c.logo) : null,
    product = d.productImage ? await picture(d.productImage) : null;
  ctx.scale(MM, MM);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "alphabetic";
  const problems: string[] = [];
  function rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill = "#fff",
    stroke = "#222",
  ) {
    ctx!.fillStyle = fill;
    ctx!.fillRect(x, y, w, h);
    ctx!.strokeStyle = stroke;
    ctx!.lineWidth = 0.22;
    ctx!.strokeRect(x, y, w, h);
  }
  function txt(
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    pt = fs,
    bold = false,
    color = "#111827",
    key = "ข้อความ",
  ) {
    ctx!.font = `${bold ? 700 : 400} ${pt * PT}px ${FONT}`;
    const lines = wrap(ctx!, value || "—", w),
      lh = pt * PT * 1.35;
    if (lines.length * lh > h + 0.15)
      problems.push(
        `${key}: ข้อความเกินพื้นที่ ลองย่อข้อความหรือปรับขนาดตัวอักษร`,
      );
    ctx!.save();
    ctx!.beginPath();
    ctx!.rect(x, y, w, h);
    ctx!.clip();
    ctx!.fillStyle = color;
    lines.forEach((line, i) =>
      ctx!.fillText(line, x, y + pt * PT * 1.07 + i * lh),
    );
    ctx!.restore();
  }
  function rightText(
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    pt: number,
    key: string,
  ) {
    ctx!.font = `400 ${pt * PT}px ${FONT}`;
    const measured = ctx!.measureText(value).width;
    txt(
      value,
      x + Math.max(0, w - measured),
      y,
      Math.min(w, measured || w) + 0.05,
      h,
      pt,
      false,
      "#111",
      key,
    );
  }
  function image(
    im: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const ratio = Math.min(w / im.naturalWidth, h / im.naturalHeight);
    const iw = im.naturalWidth * ratio,
      ih = im.naturalHeight * ratio;
    ctx!.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  function section(
    key: PosterSection,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    color = "#eef2f7",
  ) {
    rect(x, y, w, h);
    rect(x, y, w, 6, color);
    txt(
      c.headings[key],
      x + 1.5,
      y + 0.6,
      w - 3,
      5,
      Math.min(fs, 8),
      true,
      color === "#c90000" || color === "#008b4a" ? "#fff" : "#111827",
      `หัวข้อ ${c.headings[key]}`,
    );
    txt(
      value,
      x + 2,
      y + 7,
      w - 4,
      h - 8,
      fs,
      false,
      "#111827",
      c.headings[key],
    );
  }
  function symbols(x: number, y: number, w: number, h: number) {
    rect(x, y, w, h);
    const columns = aab
      ? Math.min(3, Math.max(1, ghs.length))
      : Math.min(9, Math.max(1, ghs.length));
    const rows = Math.ceil(ghs.length / columns),
      size = Math.min(
        aab ? 30 : 22,
        (w - 6) / columns,
        (h - 12) / Math.max(1, rows),
      );
    ghs.forEach((im, i) =>
      image(
        im,
        x + (w - columns * size) / 2 + (i % columns) * size,
        y + 2 + Math.floor(i / columns) * size,
        size,
        size,
      ),
    );
    const signal =
      d.signal === "Danger"
        ? "อันตราย / DANGER"
        : d.signal === "Warning"
          ? "ระวัง / WARNING"
          : d.signal === "None"
            ? "ไม่มีคำสัญญาณ"
            : "";
    if (signal)
      txt(
        signal,
        x + 2,
        y + h - 8,
        w - 4,
        6,
        Math.min(fs + 1, 11),
        true,
        "#c00000",
        "คำสัญญาณ",
      );
  }
  function equipment(x: number, y: number, w: number, h: number) {
    rect(x, y, w, h);
    rect(x, y, w, 6, aab ? c.accent : "#244a85");
    txt(
      c.headings.ppe,
      x + 1.5,
      y + 0.5,
      w - 3,
      5,
      8,
      true,
      "#fff",
      "หัวข้อ PPE",
    );
    const cols = aab ? 2 : 5,
      cw = (w - 4) / cols,
      rowH = aab ? 8.5 : d.showPpeCaptions ? 16 : 10;
    ppes.forEach((p, i) => {
      const px = x + 2 + (i % cols) * cw,
        py = y + 7 + Math.floor(i / cols) * rowH;
      image(ppeImages[i], px, py, 8, 8);
      if (aab) {
        rect(px + 9, py + 0.5, 2.7, 2.7);
        if (d.ppe.includes(p.code)) {
          ctx!.strokeStyle = "#111";
          ctx!.lineWidth = 0.5;
          ctx!.beginPath();
          ctx!.moveTo(px + 9.4, py + 1.7);
          ctx!.lineTo(px + 10.2, py + 2.7);
          ctx!.lineTo(px + 11.3, py + 1);
          ctx!.stroke();
        }
      }
      if (d.showPpeCaptions)
        txt(
          p.caption.join(" "),
          px + (aab ? 13 : 0),
          py + (aab ? 0 : 8.2),
          cw - (aab ? 14 : 1),
          aab ? 9 : 7,
          7,
          false,
          "#172554",
          p.name,
        );
    });
    const notesY = y + 8 + Math.ceil(ppes.length / cols) * rowH;
    if (d.ppeNotes)
      txt(
        d.ppeNotes,
        x + 2,
        notesY,
        w - 4,
        h - (notesY - y) - 1,
        Math.min(fs, 8),
        false,
        "#111827",
        "รายละเอียด PPE",
      );
  }
  function metadata(x: number, y: number, w: number, h: number) {
    const rows = [
      ["User Dept.", d.department],
      ["Revision", d.documentRevision],
      ["Effective date", d.effectiveDate],
      ["Issued", d.issued],
      ["Checked", d.checked],
      ["Approved", d.approved],
    ];
    const rh = h / rows.length;
    rows.forEach(([label, value], i) => {
      rect(x, y + i * rh, w * 0.43, rh);
      rect(x + w * 0.43, y + i * rh, w * 0.57, rh);
      txt(label, x + 1, y + i * rh + 0.4, w * 0.43 - 2, rh - 0.6, 7);
      txt(
        value,
        x + w * 0.43 + 1,
        y + i * rh + 0.4,
        w * 0.57 - 2,
        rh - 0.6,
        7,
        false,
        "#111",
        label,
      );
    });
  }
  const docLine = [
    d.documentCode,
    d.documentRevision && `Rev. ${d.documentRevision}`,
    d.effectiveDate && `Effective date ${d.effectiveDate}`,
  ]
    .filter(Boolean)
    .join(" / ");
  let qr: RenderedPoster["qr"];
  if (aab) {
    rightText(docLine, 135, 2, 155, 5, 7, "รหัสเอกสาร / Rev. / วันที่มีผล");
    rect(7, 8, 283, 18);
    if (logo) image(logo, 10, 10, 28, 14);
    else txt(c.brand, 11, 11, 29, 11, 19, true, c.accent, "ตราบริษัท");
    txt(c.title, 43, 10, 212, 7, 14, true, "#111", "ชื่อหัวโปสเตอร์");
    txt(d.company, 43, 18, 212, 6, 10, false, "#111", "ชื่อบริษัท");
    ctx.fillStyle = "#007a49";
    ctx.beginPath();
    ctx.arc(278, 17, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(276.7, 12.5, 2.6, 9);
    ctx.fillRect(273.5, 15.7, 9, 2.6);
    rect(7, 26, 67, 8);
    txt("ชื่อผลิตภัณฑ์ (Product name)", 9, 27, 63, 6, 8, true);
    rect(74, 26, 145, 8);
    txt(
      d.name,
      76,
      27,
      141,
      6,
      Math.min(fs + 1, 10),
      true,
      "#111",
      "ชื่อผลิตภัณฑ์",
    );
    rect(219, 26, 71, 8);
    txt(d.documentCode, 221, 27, 67, 6, 9, false, "#111", "รหัสเอกสาร");
    symbols(7, 34, 67, 45);
    [
      ["CAS No.", d.cas],
      ["UN No.", d.un],
      ["สูตรเคมี", d.formula],
    ].forEach(([k, v], i) => {
      rect(7, 79 + i * 6, 67, 6);
      txt(k, 9, 80 + i * 6, 20, 4.5, 7);
      txt(v, 30, 80 + i * 6, 42, 4.5, 7, false, "#111", k);
    });
    section("ingredients", d.ingredients, 7, 97, 67, 59);
    section("physical", d.physical, 7, 156, 67, 46);
    section("hazards", d.hazards, 74, 34, 145, 43, "#c90000");
    section("precautions", d.precautions, 74, 77, 145, 43, "#ffed00");
    section("firstAid", d.firstAid, 74, 120, 145, 36, "#008b4a");
    section(
      "spill",
      [d.spill, d.emergency && `ฉุกเฉิน: ${d.emergency}`]
        .filter(Boolean)
        .join("\n"),
      74,
      156,
      72.5,
      46,
    );
    section("fire", d.fire, 146.5, 156, 72.5, 46);
    equipment(219, 34, 71, 68);
    rect(219, 102, 71, 25);
    txt("รูปสารเคมี / สินค้า", 221, 102.3, 45, 4.5, 7, true);
    if (product) image(product, 221, 107, 48, 18);
    if (sdsUrl) qr = { x: 271, y: 106.5, size: 16 };
    section(
      "storage",
      [d.storage, d.storageClass && `ประเภทจัดเก็บ: ${d.storageClass}`]
        .filter(Boolean)
        .join("\n"),
      219,
      127,
      71,
      39,
    );
    metadata(219, 166, 71, 36);
    rightText(
      [d.formCode, d.formRevision && `Rev: ${d.formRevision}`]
        .filter(Boolean)
        .join(" / "),
      172,
      203,
      118,
      5,
      7,
      "รหัสแบบฟอร์ม / Rev.",
    );
    if (demo) txt("ข้อมูลสาธิต", 7, 203, 60, 5, 8, true, "#b45309");
  } else {
    rect(7, 7, 196, 28, c.accent, c.accent);
    const left = logo ? 39 : 11;
    if (logo) image(logo, 10, 10, 25, 20);
    txt(c.title, left, 9, 201 - left, 6, 9, true, "#fff", "ชื่อหัวโปสเตอร์");
    txt(d.name, left, 16, 201 - left, 10, 18, true, "#fff", "ชื่อผลิตภัณฑ์");
    txt(
      [d.chemicalName, d.cas && `CAS ${d.cas}`, d.un && `UN ${d.un}`]
        .filter(Boolean)
        .join(" · "),
      left,
      27,
      201 - left,
      6,
      9,
      false,
      "#fff",
      "ชื่อทางเคมี / CAS / UN",
    );
    symbols(7, 38, 137, 35);
    rect(147, 38, 56, 35, "#eff6ff", "#cbd5e1");
    txt("ประเภทการจัดเก็บ", 150, 40, 50, 6, 9, true);
    txt(
      d.storageClass,
      150,
      47,
      50,
      24,
      fs,
      false,
      "#111827",
      "ประเภทการจัดเก็บ",
    );
    section("hazards", d.hazards, 7, 76, 96, 39);
    section("precautions", d.precautions, 7, 118, 96, 42);
    section("storage", d.storage, 7, 163, 96, 33);
    section("ingredients", d.ingredients, 7, 199, 96, 27);
    section(
      "physical",
      [d.formula && `สูตรเคมี: ${d.formula}`, d.physical]
        .filter(Boolean)
        .join("\n"),
      7,
      229,
      96,
      32,
    );
    equipment(107, 76, 96, 55);
    section("firstAid", d.firstAid, 107, 134, 96, 43, "#dcfce7");
    section("fire", d.fire, 107, 180, 96, 32, "#fff7ed");
    section("spill", d.spill, 107, 215, 96, 29);
    txt(
      d.emergency ? `ฉุกเฉิน: ${d.emergency}` : "ฉุกเฉิน: —",
      109,
      246,
      92,
      15,
      fs,
      true,
      "#991b1b",
      "ข้อมูลติดต่อฉุกเฉิน",
    );
    rect(7, 264, 196, 26, "#f8fafc", "#cbd5e1");
    txt(
      [d.company, d.department, d.supplier && `ผู้จำหน่าย: ${d.supplier}`]
        .filter(Boolean)
        .join(" · "),
      10,
      265,
      169,
      8,
      7,
      false,
      "#111827",
      "บริษัท / ผู้จำหน่าย",
    );
    txt(
      docLine,
      10,
      274,
      169,
      4,
      7,
      false,
      "#111827",
      "รหัสเอกสาร / Rev. / วันที่มีผล",
    );
    txt(
      [
        d.formCode,
        d.formRevision && `Rev: ${d.formRevision}`,
        d.sdsDate && `SDS: ${d.sdsDate}`,
        demo && "ข้อมูลสาธิต",
      ]
        .filter(Boolean)
        .join(" · "),
      10,
      279,
      169,
      4,
      7,
      false,
      "#111827",
      "รหัสแบบฟอร์ม / วันที่ SDS",
    );
    txt(
      [
        d.issued && `จัดทำ: ${d.issued}`,
        d.checked && `ตรวจสอบ: ${d.checked}`,
        d.approved && `อนุมัติ: ${d.approved}`,
      ]
        .filter(Boolean)
        .join(" · "),
      10,
      284,
      169,
      5,
      7,
      false,
      "#111827",
      "ผู้จัดทำ / ผู้ตรวจ / ผู้อนุมัติ",
    );
    if (sdsUrl) qr = { x: 183, y: 267, size: 16 };
  }
  if (qr && sdsUrl) {
    const matrix = (await import("qrcode")).create(sdsUrl, {
      errorCorrectionLevel: "M",
    }).modules;
    const modulePx = Math.floor((qr.size * MM) / (matrix.size + 8));
    const size = modulePx / MM,
      offset = (qr.size - (matrix.size + 8) * size) / 2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(qr.x, qr.y, qr.size, qr.size);
    ctx.fillStyle = "#000";
    for (let r = 0; r < matrix.size; r++)
      for (let col = 0; col < matrix.size; col++)
        if (matrix.get(r, col))
          ctx.fillRect(
            qr.x + offset + (col + 4) * size,
            qr.y + offset + (r + 4) * size,
            size,
            size,
          );
    txt(
      "SDS ฉบับจริง",
      qr.x - 0.5,
      qr.y + qr.size + 0.3,
      qr.size + 1,
      4,
      6.5,
      true,
      "#111",
      "คำกำกับ SDS",
    );
  }
  return {
    image: canvas.toDataURL("image/png"),
    width,
    height,
    problems: [...new Set(problems)],
    sdsUrl,
    qr,
  };
}
export async function downloadPoster(rendered: RenderedPoster, name: string) {
  if (rendered.problems.length)
    throw new Error("ข้อความเกินพื้นที่ กรุณาปรับก่อนดาวน์โหลด");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: rendered.width > rendered.height ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.addImage(
    rendered.image,
    "PNG",
    0,
    0,
    rendered.width,
    rendered.height,
    undefined,
    "FAST",
  );
  if (rendered.qr)
    pdf.link(rendered.qr.x, rendered.qr.y, rendered.qr.size, rendered.qr.size, {
      url: rendered.sdsUrl,
    });
  pdf.save(
    `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 100) || "chemical"}-poster.pdf`,
  );
}
/** Resize the user's uploaded bitmap locally; no external image URL is fetched or stored. */
export async function readPosterImage(
  file: File,
  max = 400000,
): Promise<string> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 10000000)
    throw new Error("เลือกไฟล์ PNG หรือ JPEG ไม่เกิน 10 MB");
  const url = URL.createObjectURL(file);
  try {
    const im = await picture(url);
    const canvas = document.createElement("canvas");
    const ratio = Math.min(
      1,
      800 / Math.max(im.naturalWidth, im.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(im.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(im.naturalHeight * ratio));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    for (const q of [0.9, 0.75, 0.55, 0.35]) {
      const value = canvas.toDataURL("image/jpeg", q);
      if (value.length <= max) return value;
    }
    throw new Error("รูปมีรายละเอียดมากเกินไป กรุณาใช้รูปขนาดเล็กลง");
  } finally {
    URL.revokeObjectURL(url);
  }
}

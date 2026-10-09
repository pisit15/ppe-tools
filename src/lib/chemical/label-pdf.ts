import { ghsPictogram } from './ghs';
import { labelLayout, labelProblems, type LabelDraft, type LabelOptions } from './label';

const DPI = 300;
const PX_PER_MM = DPI / 25.4;
const PT_TO_MM = 25.4 / 72;
const FONT = 'ChemicalLabelThai';
type TextRun = { text: string; x: number; y: number; pt: number; bold: boolean; color: string };
export interface RenderedLabel { image: string; width: number; height: number; requiredHeight: number; lines: string[]; qr?: { x: number; y: number; size: number; url: string } }

async function labelFont() {
  try {
    const fonts = await Promise.all([document.fonts.load(`400 12px ${FONT}`), document.fonts.load(`700 12px ${FONT}`)]);
    if (fonts.some(f => f.length === 0)) throw new Error('Font unavailable');
  } catch {
    throw new Error('โหลดแบบอักษรไทยไม่สำเร็จ กรุณาลองใหม่');
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('โหลดสัญลักษณ์ GHS ไม่สำเร็จ กรุณาลองใหม่'));
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });
  const graphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const { segment } of wordSegmenter.segment(paragraph)) {
      if (ctx.measureText(line + segment).width <= maxWidth) { line += segment; continue; }
      if (line.trim()) lines.push(line.trimEnd());
      line = segment.trimStart();
      if (ctx.measureText(line).width <= maxWidth) continue;
      let part = '';
      for (const { segment: glyph } of graphemeSegmenter.segment(line)) {
        if (part && ctx.measureText(part + glyph).width > maxWidth) { lines.push(part); part = ''; }
        part += glyph;
      }
      line = part;
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

/** Canvas uses the browser's Thai shaping at 300 DPI. Preview and PDF share the exact same image. */
export async function renderChemicalLabel(draft: LabelDraft, options: LabelOptions): Promise<RenderedLabel> {
  labelLayout(options);
  const pictures = draft.pictograms.map(code => {
    const p = ghsPictogram(code);
    if (!p) throw new Error(`ไม่พบสัญลักษณ์ ${code}`);
    return p;
  });
  const [images] = await Promise.all([Promise.all(pictures.map(p => loadImage(p.file))), labelFont()]);
  const qrCode = options.includeQr && draft.sdsUrl ? (await import('qrcode')).create(draft.sdsUrl, { errorCorrectionLevel: 'M' }) : null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์ไม่รองรับการสร้างฉลาก');
  const compact = options.content === 'compact';
  const inset = compact ? 3 : 4;
  const usable = options.width - inset * 2;
  const qr = qrCode ? { x: options.width - inset - 24, y: inset, size: 24, url: draft.sdsUrl } : undefined;
  const sideQr = !!qr && usable >= 48;
  const headerWidth = usable - (sideQr ? 28 : 0);
  const runs: TextRun[] = [];
  let y = inset;
  function text(value: string, pt = options.fontSize, bold = false, color = '#111827', width = usable) {
    if (!value.trim()) return;
    ctx!.font = `${bold ? 700 : 400} ${pt * PT_TO_MM}px ${FONT}`;
    const lineHeight = pt * PT_TO_MM * (compact ? 1.36 : 1.48);
    for (const line of wrapText(ctx!, value, width)) {
      // Baseline leaves room for Thai ascenders and stacked tone marks.
      runs.push({ text: line, x: inset, y: y + pt * PT_TO_MM * 1.1, pt, bold, color });
      y += lineHeight;
    }
  }
  if (draft.demo) { text('ข้อมูลสาธิต', 8, true, '#92400e', headerWidth); y += 1; }
  text(draft.name, compact ? 11 : 14, true, '#111827', headerWidth);
  text(draft.identity, options.fontSize, false, '#111827', headerWidth);
  if (draft.contents) text(`ปริมาณ: ${draft.contents}`, options.fontSize, false, '#111827', headerWidth);
  y += compact ? 1 : 2;
  const pictureY = y;
  const pictureSize = 16;
  const pictureGap = 2;
  const pictureColumns = Math.max(1, Math.floor((headerWidth + pictureGap) / (pictureSize + pictureGap)));
  if (images.length) y += Math.ceil(images.length / pictureColumns) * (pictureSize + pictureGap);
  if (draft.signal === 'Danger') text('อันตราย / DANGER', compact ? 10 : 13, true, '#b91c1c', headerWidth);
  if (draft.signal === 'Warning') text('ระวัง / WARNING', compact ? 10 : 13, true, '#92400e', headerWidth);
  if (!draft.signal) text('ยังไม่ระบุคำสัญญาณ', 10, true, '#92400e', headerWidth);
  if (qr && sideQr) {
    runs.push({ text: 'SDS ฉบับเต็ม', x: qr.x + 2, y: qr.y + 27, pt: 7, bold: true, color: '#111827' });
    y = Math.max(y, qr.y + 29);
  }
  y += 1;
  if (draft.hazards) { if (!compact) text('ข้อความแสดงความเป็นอันตราย', options.fontSize, true); text(draft.hazards); y += 1.5; }
  if (!compact && draft.precautions) { text('ข้อควรระวัง', options.fontSize, true); text(draft.precautions); y += 1.5; }
  if (!compact && draft.supplier) text(`ผู้จำหน่าย: ${draft.supplier}`);
  if (draft.emergency) text(`ฉุกเฉิน: ${draft.emergency}`, options.fontSize, true);
  if (!compact && draft.extra) text(draft.extra);
  if (qr && !sideQr) {
    qr.y = y + 1;
    runs.push({ text: 'SDS ฉบับเต็ม', x: qr.x + 2, y: qr.y + 27, pt: 7, bold: true, color: '#111827' });
    y = qr.y + 29;
  }
  const requiredHeight = Math.ceil(y + inset);
  const height = Math.max(requiredHeight, options.height);
  // Do not allocate an unbounded bitmap for a pasted SDS. No text is silently omitted.
  if (height > 1000) throw new Error('ข้อความยาวเกินพื้นที่ฉลาก โปรดใช้ข้อความสำหรับฉลากจาก SDS');
  canvas.width = Math.ceil(options.width * PX_PER_MM);
  canvas.height = Math.ceil(height * PX_PER_MM);
  ctx.scale(PX_PER_MM, PX_PER_MM);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, options.width, height);
  ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 0.15;
  ctx.strokeRect(0.2, 0.2, options.width - 0.4, height - 0.4);
  for (const run of runs) {
    ctx.font = `${run.bold ? 700 : 400} ${run.pt * PT_TO_MM}px ${FONT}`;
    ctx.fillStyle = run.color;
    ctx.fillText(run.text, run.x, run.y);
  }
  images.forEach((img, index) => {
    ctx.drawImage(img, inset + (index % pictureColumns) * (pictureSize + pictureGap), pictureY + Math.floor(index / pictureColumns) * (pictureSize + pictureGap), pictureSize, pictureSize);
  });
  if (qrCode && qr) {
    // Integer device pixels, four-module quiet zone; no interpolation of the QR modules.
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const count = qrCode.modules.size;
    const modulePixels = Math.floor(qr.size * PX_PER_MM / (count + 8));
    const offset = (qr.size * PX_PER_MM - modulePixels * (count + 8)) / 2;
    const left = Math.round(qr.x * PX_PER_MM + offset) + 4 * modulePixels;
    const top = Math.round(qr.y * PX_PER_MM + offset) + 4 * modulePixels;
    ctx.fillStyle = '#000000';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      if (qrCode.modules.get(row, col)) ctx.fillRect(left + col * modulePixels, top + row * modulePixels, modulePixels, modulePixels);
    }
    ctx.restore();
  }
  return { image: canvas.toDataURL('image/png'), width: options.width, height, requiredHeight, lines: runs.map(r => r.text), qr };
}

export async function downloadChemicalLabel(draft: LabelDraft, options: LabelOptions) {
  const layout = labelLayout(options);
  const problems = labelProblems(draft, options);
  if (problems.length) throw new Error(problems.join(' · '));
  const rendered = await renderChemicalLabel(draft, options);
  if (rendered.requiredHeight > options.height) throw new Error(`ข้อความเกินฉลาก ต้องใช้ความสูงอย่างน้อย ${rendered.requiredHeight} มม.`);
  const { jsPDF } = await import('jspdf');
  const single = options.layout === 'single';
  const pdf = new jsPDF({ unit: 'mm', format: single ? [options.width, options.height] : 'a4', orientation: single ? options.width > options.height ? 'landscape' : 'portrait' : options.pageOrientation, compress: true });
  pdf.setProperties({ title: `${draft.name} - Chemical labels`, subject: 'Print at actual size (100%). Label artwork rendered at 300 DPI.', creator: 'EA SHE Tools' });
  for (let index = 0; index < options.copies; index++) {
    if (index && index % layout.perPage === 0) pdf.addPage();
    const slot = index % layout.perPage;
    const x = layout.margin + (slot % layout.columns) * (options.width + layout.gap);
    const y = layout.margin + Math.floor(slot / layout.columns) * (options.height + layout.gap);
    pdf.addImage(rendered.image, 'PNG', x, y, options.width, options.height, 'chemical-label', 'FAST');
    if (rendered.qr) pdf.link(x + rendered.qr.x, y + rendered.qr.y, rendered.qr.size, rendered.qr.size, { url: rendered.qr.url });
  }
  const filename = draft.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 90).trim() || 'chemical';
  pdf.save(`ฉลาก-${filename}-${options.width}x${options.height}mm.pdf`);
}

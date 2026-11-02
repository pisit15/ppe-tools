import fontkit from "@pdf-lib/fontkit";
import type { Font } from "@pdf-lib/fontkit";

export type TextInk = { minX: number; minY: number; maxX: number; maxY: number; advance: number };
export type PdfTextMetrics = (text: string, size: number) => TextInk;
export type PdfSlotText = {
  text: string; size: number; x: number; baseline: number;
  bounds: {left: number; top: number; right: number; bottom: number};
  originalFits: boolean;
};

/** Measure the actual sequence encoded by pdf-lib's CustomFontEmbedder.
 * pdf-lib uses glyph.advanceWidth and does not apply GlyphRun.positions. Using
 * the positioned run bbox would therefore under/over-estimate the PDF ink.
 */
export function createPdfTextMetrics(bytes: Uint8Array): PdfTextMetrics {
  const font = fontkit.create(bytes) as Font;
  const cache = new Map<string, TextInk>();
  return (text, size) => {
    let ink = cache.get(text);
    if (!ink) {
      let pen = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const glyph of font.layout(text).glyphs) {
        const box = glyph.bbox;
        if ([box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite) && (box.width > 0 || box.height > 0)) {
          minX = Math.min(minX, pen + box.minX); maxX = Math.max(maxX, pen + box.maxX);
          minY = Math.min(minY, box.minY); maxY = Math.max(maxY, box.maxY);
        }
        pen += glyph.advanceWidth;
      }
      const factor = 1 / font.unitsPerEm;
      ink = {minX: Number.isFinite(minX) ? minX * factor : 0, minY: Number.isFinite(minY) ? minY * factor : 0,
        maxX: Number.isFinite(maxX) ? maxX * factor : 0, maxY: Number.isFinite(maxY) ? maxY * factor : 0, advance: pen * factor};
      cache.set(text, ink);
    }
    return {minX: ink.minX * size, minY: ink.minY * size, maxX: ink.maxX * size, maxY: ink.maxY * size, advance: ink.advance * size};
  };
}

/** Single-line original-paper slot layout in the normalized 827x1170 space.
 * A value either fits entirely or is retained in the annex. No ellipsis or
 * clipping is used to disguise missing content. Even the reference must fit.
 */
export function fitPdfSlotText(value: string, width: number, height: number, metrics: PdfTextMetrics, appendix: string): PdfSlotText | null {
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (!text || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const padding = 1;
  function tryText(candidate: string, originalFits: boolean): PdfSlotText | null {
    for (let size = 11; size >= 9; size -= .5) {
      const ink = metrics(candidate, size);
      const leftExtent = Math.min(0, ink.minX), rightExtent = Math.max(ink.advance, ink.maxX);
      if (rightExtent - leftExtent + padding * 2 > width || ink.maxY - ink.minY + padding * 2 > height) continue;
      const x = padding - leftExtent;
      const lowBaseline = padding + ink.maxY, highBaseline = height - padding + ink.minY;
      const baseline = Math.min(highBaseline, Math.max(lowBaseline, 11));
      return {text: candidate, size, x, baseline, originalFits,
        bounds: {left: x + ink.minX, top: baseline - ink.maxY, right: x + ink.maxX, bottom: baseline - ink.minY}};
    }
    return null;
  }
  const raw = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  return (raw === text ? tryText(text, true) : null) || tryText(`ดูภาคผนวก ${appendix}`, false) || tryText(appendix, false);
}

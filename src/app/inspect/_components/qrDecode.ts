'use client';

/**
 * Find the asset token inside a photo that includes the QR label.
 * Runs entirely in the browser (jsQR), on the original file before compression,
 * at a few scales so small labels still decode. Returns null when no inspect QR is found.
 */
export async function decodeInspectToken(file: File): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const bitmap = await load(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const longest = Math.max(bitmap.width, bitmap.height);
  const targets = [...new Set([Math.min(longest, 1600), Math.min(longest, 2400), Math.min(longest, 1000)])];
  for (const target of targets) {
    const scale = target / longest;
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    const token = hit ? tokenFrom(hit.data) : null;
    if (token) { release(bitmap); return token; }
    // Second pass: centre crop (labels are usually framed in the middle) at 2x
    const cw = Math.round(canvas.width * 0.6), ch = Math.round(canvas.height * 0.6);
    const cx = Math.round((canvas.width - cw) / 2), cy = Math.round((canvas.height - ch) / 2);
    const crop = ctx.getImageData(cx, cy, cw, ch);
    const c2 = document.createElement('canvas'); c2.width = cw * 2; c2.height = ch * 2;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    if (x2) {
      const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch;
      tmp.getContext('2d')?.putImageData(crop, 0, 0);
      x2.imageSmoothingEnabled = false;
      x2.drawImage(tmp, 0, 0, c2.width, c2.height);
      const big = x2.getImageData(0, 0, c2.width, c2.height);
      const hit2 = jsQR(big.data, big.width, big.height, { inversionAttempts: 'attemptBoth' });
      const token2 = hit2 ? tokenFrom(hit2.data) : null;
      if (token2) { release(bitmap); return token2; }
    }
  }
  release(bitmap);
  return null;
}

function tokenFrom(text: string): string | null {
  const m = text.match(/\/inspect\/i\/([A-Za-z0-9_-]{20,64})/);
  return m ? m[1] : null;
}

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านไฟล์รูปไม่ได้')); };
    img.src = url;
  });
}
function release(b: ImageBitmap | HTMLImageElement) { if ('close' in b) b.close(); }

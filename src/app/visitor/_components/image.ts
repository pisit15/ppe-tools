/** Downscale a picked image to a JPEG data URL (fits localStorage / a text column). */
export function fileToDataUrl(file: File, maxPx = 1920, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

/** Shrink until the data URL fits `maxChars` (used for the company form background column). */
export async function fileToBoundedDataUrl(file: File, maxChars: number): Promise<string> {
  const steps: [number, number][] = [[1920, 0.82], [1600, 0.78], [1280, 0.72], [1024, 0.65], [800, 0.6]];
  for (const [px, q] of steps) {
    const out = await fileToDataUrl(file, px, q);
    if (out.length <= maxChars) return out;
  }
  throw new Error('too-large');
}

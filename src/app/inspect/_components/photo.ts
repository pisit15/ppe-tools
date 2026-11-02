'use client';

import { INSPECT_LIMITS } from '@/lib/inspect/constants';
import { postJson } from './ui';

export type Compressed = { blob: Blob; width: number; height: number; ext: 'jpg' | 'webp'; previewUrl: string };

/** Downscale + re-encode on the device so uploads stay small (target ≤ ~250 KB). Never touches Vercel. */
export async function compressImage(file: File, maxPx: number = INSPECT_LIMITS.photoMaxPx, quality: number = INSPECT_LIMITS.photoQuality): Promise<Compressed> {
  const bitmap = await loadImage(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('อุปกรณ์นี้ไม่รองรับการย่อรูป');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();
  const webp = await toBlob(canvas, 'image/webp', quality);
  const useWebp = !!webp && webp.type === 'image/webp';
  let blob = useWebp ? webp : await toBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new Error('ย่อรูปไม่สำเร็จ');
  // Second pass if still too big (very detailed photos, or JPEG fallback)
  if (blob.size > (useWebp ? INSPECT_LIMITS.maxPhotoBytes : 180 * 1024)) {
    const smaller = await toBlob(canvas, useWebp ? 'image/webp' : 'image/jpeg', 0.6);
    if (smaller && smaller.size < blob.size) blob = smaller;
  }
  return { blob, width: canvas.width, height: canvas.height, ext: useWebp ? 'webp' : 'jpg', previewUrl: URL.createObjectURL(blob) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
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

type Signed = { data: { path: string; signedUrl: string; token: string } };

/**
 * Upload one compressed photo straight to Supabase Storage via a signed URL, then register it.
 * `sign` and `confirm` differ between the public form (token) and SHE pages (session).
 */
export async function uploadPhoto(c: Compressed, sign: { url: string; body: Record<string, unknown> }, confirm: { url: string; body: Record<string, unknown> }): Promise<string> {
  const { data } = await postJson<Signed>(sign.url, { ...sign.body, ext: c.ext });
  const put = await fetch(data.signedUrl, { method: 'PUT', headers: { 'content-type': c.blob.type, 'x-upsert': 'false', 'cache-control': 'max-age=3600' }, body: c.blob });
  if (!put.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
  await postJson(confirm.url, { ...confirm.body, path: data.path, width: c.width, height: c.height });
  return data.path;
}

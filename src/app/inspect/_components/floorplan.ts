'use client';

import { postJson } from './ui';

export const PLAN_MAX_PX = 2500;
export type PlanImage = { blob: Blob; width: number; height: number; ext: 'webp' | 'jpg'; previewUrl: string };

/** Turn a PDF (first page) or an image file into a ≤2500 px WebP/JPEG ready for upload. */
export async function fileToPlanImage(file: File, page = 1): Promise<PlanImage> {
  const canvas = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? await renderPdf(file, page) : await drawImage(file);
  const webp = await toBlob(canvas, 'image/webp', 0.86);
  const useWebp = !!webp && webp.type === 'image/webp';
  let blob = useWebp ? webp : await toBlob(canvas, 'image/jpeg', 0.86);
  if (!blob) throw new Error('แปลงไฟล์แผนผังไม่สำเร็จ');
  if (blob.size > 1_400_000) { const smaller = await toBlob(canvas, useWebp ? 'image/webp' : 'image/jpeg', 0.7); if (smaller && smaller.size < blob.size) blob = smaller; }
  if (blob.size > 1_400_000) throw new Error('ไฟล์แผนผังใหญ่เกินไปหลังย่อ (เกิน 1.4 MB) — ลองลดความละเอียดหรือครอปส่วนที่ไม่จำเป็น');
  return { blob, width: canvas.width, height: canvas.height, ext: useWebp ? 'webp' : 'jpg', previewUrl: URL.createObjectURL(blob) };
}

export async function pdfPageCount(file: File): Promise<number> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = doc.numPages; await doc.destroy();
  return n;
}

async function renderPdf(file: File, pageNo: number): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = PLAN_MAX_PX / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแปลง PDF');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  await doc.destroy();
  return canvas;
}

async function drawImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, PLAN_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการย่อรูป');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

type Signed = { data: { path: string; signedUrl: string } };

/** Upload the converted plan image straight to storage; returns the storage path to reference in the row. */
export async function uploadPlanImage(company: string, img: PlanImage): Promise<{ path: string; width: number; height: number }> {
  const { data } = await postJson<Signed>('/api/inspect/floorplans/sign', { company_id: company, ext: img.ext });
  const put = await fetch(data.signedUrl, { method: 'PUT', headers: { 'content-type': img.blob.type, 'x-upsert': 'false', 'cache-control': 'max-age=3600' }, body: img.blob });
  if (!put.ok) throw new Error('อัปโหลดแผนผังไม่สำเร็จ กรุณาลองใหม่');
  return { path: data.path, width: img.width, height: img.height };
}

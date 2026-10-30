import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requireModuleActor, assertCompany, apiError, type ToolsActor } from '@/lib/toolsSession';
import { assertSdsPath } from '@/lib/chemical/access';
import { extractSds, SdsExtractionError } from '@/lib/chemical/sds-extraction';
import { fetchSdsFromUrl } from '@/lib/chemical/safe-fetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * สกัดข้อมูลจาก SDS (PDF) ด้วย Claude → JSON ตาม SdsExtraction
 * รับได้ 3 แบบ:
 *   FormData { file }                — ไฟล์ที่ผู้ใช้เพิ่งเลือก (ยังไม่อัปโหลด)
 *   JSON { path }                    — ไฟล์ใน bucket chemical-sds
 *   JSON { url }                     — ลิงก์ PDF ภายนอก (ต้องเปิดได้โดยไม่ล็อกอิน)
 * ต้องตั้ง ANTHROPIC_API_KEY ใน Vercel — ถ้าไม่มีจะตอบ 503 พร้อมคำอธิบาย (ปุ่มใน UI จะซ่อน)
 */

const MODEL = process.env.SDS_EXTRACT_MODEL || 'claude-sonnet-5';
const MAX_BYTES = 20 * 1024 * 1024;

async function readSource(request: NextRequest, actor: ToolsActor): Promise<{ base64: string; mediaType: string; label: string }> {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new SdsExtractionError('ไม่พบไฟล์ SDS กรุณาเลือกไฟล์อีกครั้ง', 'MISSING_FILE', 400);
    if (file.size > MAX_BYTES) throw new SdsExtractionError('ไฟล์ใหญ่เกิน 20 MB สำหรับการสกัดอัตโนมัติ', 'FILE_TOO_LARGE', 413);
    const buf = Buffer.from(await file.arrayBuffer());
    return { base64: buf.toString('base64'), mediaType: file.type || 'application/pdf', label: file.name };
  }
  const body = (await request.json()) as { path?: string; url?: string };
  if (body.path) {
    assertCompany(actor, assertSdsPath(body.path));
    const db = getSupabaseServer();
    const { data, error } = await db.storage.from('chemical-sds').download(body.path);
    if (error || !data) throw new SdsExtractionError('เปิดไฟล์ SDS ที่แนบไว้ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่', 'SOURCE_UNAVAILABLE', 422);
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new SdsExtractionError('ไฟล์ใหญ่เกิน 20 MB สำหรับการสกัดอัตโนมัติ', 'FILE_TOO_LARGE', 413);
    return { base64: buf.toString('base64'), mediaType: data.type || 'application/pdf', label: body.path };
  }
  if (typeof body.url === 'string' && body.url) {
    // SSRF-safe: https only, public addresses only, re-checked redirects, streamed size cap
    const { buf, mediaType, label } = await fetchSdsFromUrl(body.url, MAX_BYTES);
    return { base64: buf.toString('base64'), mediaType, label };
  }

  throw new SdsExtractionError('เลือกไฟล์ SDS หรือใส่ลิงก์ก่อนสกัดข้อมูล', 'MISSING_SOURCE', 400);
}

/** GET → บอก UI ว่าเปิดใช้การสกัดอัตโนมัติได้หรือไม่ */
export async function GET(request: NextRequest) {
  try { await requireModuleActor(request, 'chemical', 'Chemical Management'); return NextResponse.json({ available: !!process.env.ANTHROPIC_API_KEY }); }
  catch (e) { return apiError(e); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireModuleActor(request, 'chemical', 'Chemical Management');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์ — กรอกข้อมูลด้วยตนเองไปก่อน', code: 'NO_API_KEY' },
        { status: 503 },
      );
    }
    const src = await readSource(request, actor);
    const parsed = await extractSds(src, apiKey, MODEL);

    return NextResponse.json({ data: parsed, source: src.label, model: MODEL });
  } catch (error: unknown) {
    if (error instanceof SdsExtractionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      return NextResponse.json({ error: 'เปิดไฟล์ SDS ไม่ทันเวลา กรุณาเลือกไฟล์จากเครื่องแล้วลองใหม่', code: 'SOURCE_TIMEOUT' }, { status: 504 });
    }
    return apiError(error);
  }
}

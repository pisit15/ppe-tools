import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BUCKET = 'chemical-sds';          // private — เปิดดูผ่าน signed URL เท่านั้น
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

/** GET ?path=<storage path> → signed URL อายุ 1 ชม. */
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get('path') || '';
    if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    const db = getSupabaseServer();
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error || new Error('ไม่สามารถสร้างลิงก์ได้');
    return NextResponse.json({ url: data.signedUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'เปิดไฟล์ไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

/** POST FormData { file, company_id } → { path, file_name, size } */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const companyId = String(form.get('company_id') || '').trim();
    if (!(file instanceof File) || !companyId) {
      return NextResponse.json({ error: 'ข้อมูลไฟล์ไม่ถูกต้อง' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `ไฟล์ ${(file.size / 1024 / 1024).toFixed(1)} MB เกิน 25 MB — ใช้ลิงก์ภายนอกแทน` }, { status: 413 });
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'รองรับเฉพาะ PDF, PNG, JPG' }, { status: 415 });
    }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'sds.pdf';
    const path = `${companyId}/${Date.now()}-${safe}`;
    const db = getSupabaseServer();
    const { error } = await db.storage.from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type || 'application/pdf', upsert: false });
    if (error) throw error;
    return NextResponse.json({ path, file_name: file.name, size: file.size }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'อัปโหลดไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

/** DELETE ?path= → ลบไฟล์ออกจาก bucket */
export async function DELETE(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get('path') || '';
    if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    const db = getSupabaseServer();
    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'ลบไฟล์ไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

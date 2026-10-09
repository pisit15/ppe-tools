import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { assertSdsPath } from '@/lib/chemical/access';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
function unavailable(status = 404) {
  return new NextResponse('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เปิด SDS ไม่ได้</title><body style="font-family:Arial,sans-serif;padding:32px;line-height:1.8"><h1>ยังเปิดเอกสาร SDS ไม่ได้</h1><p>ไม่พบไฟล์แนบ หรือเอกสารนี้ถูกนำออกแล้ว กรุณาติดต่อผู้ดูแลสารเคมี</p></body></html>', { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}

// The owner explicitly allows unauthenticated SDS access from printed labels.
// Resolve only the attached document: no registry fields, arbitrary storage path or writes.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return unavailable();
  try {
    const db = getSupabaseServer();
    const { data, error } = await db.from('chem_substances').select('company_id,sds_file_path,sds_url').eq('id', id).eq('is_active', true).maybeSingle();
    if (error) return unavailable(503);
    if (!data) return unavailable();
    let target = data.sds_url;
    if (data.sds_file_path) {
      assertSdsPath(data.sds_file_path, data.company_id);
      const result = await db.storage.from('chemical-sds').createSignedUrl(data.sds_file_path, 300);
      if (result.error || !result.data?.signedUrl) return unavailable();
      target = result.data.signedUrl;
    }
    if (!target) return unavailable();
    const url = new URL(target);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return unavailable();
    return NextResponse.redirect(url, { status: 307, headers });
  } catch { return unavailable(503); }
}

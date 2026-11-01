import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { signPhotoUpload } from '@/lib/inspect/server';
import { UUID, bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** POST { asset_id, ext } → { path, signedUrl } (SHE session) */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as { asset_id?: string; ext?: string } | null;
    const assetId = String(body?.asset_id || '');
    if (!UUID.test(assetId)) throw bad('อุปกรณ์ไม่ถูกต้อง');
    const ext = ['jpg', 'webp', 'png', 'pdf'].includes(String(body?.ext)) ? (body!.ext as 'jpg' | 'webp' | 'png' | 'pdf') : 'jpg';
    const { data, error } = await db().from('insp_assets').select('id, company_id').eq('id', assetId).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('ไม่พบอุปกรณ์', 404);
    assertCompany(actor, data.company_id, true);
    return NextResponse.json({ data: await signPhotoUpload(data.company_id, assetId, ext) });
  } catch (error) { return apiError(error); }
}

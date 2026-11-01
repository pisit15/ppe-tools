import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { confirmPhoto } from '@/lib/inspect/server';
import { UUID, bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** POST { asset_id, path, width, height } → photo row (SHE session) */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as { asset_id?: string; path?: string; width?: number; height?: number } | null;
    const assetId = String(body?.asset_id || '');
    if (!UUID.test(assetId)) throw bad('อุปกรณ์ไม่ถูกต้อง');
    const { data, error } = await db().from('insp_assets').select('id, company_id').eq('id', assetId).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('ไม่พบอุปกรณ์', 404);
    assertCompany(actor, data.company_id, true);
    const row = await confirmPhoto(data.company_id, assetId, String(body?.path || ''), { width: Number(body?.width || 0), height: Number(body?.height || 0) });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) { return apiError(error); }
}

import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertSameOrigin } from '@/lib/toolsSession';
import { db, optionalInspectStaff } from '@/lib/inspect/access';
import { assetByToken, companySettings, signPhotoUpload } from '@/lib/inspect/server';
import { bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/**
 * POST { token, ext, inspector_code? } → signed upload URL for one photo of this asset.
 * In 'department' mode the inspector code must be registered; in 'she' mode a session is required.
 * Abuse guard: at most 20 pending (unlinked) uploads per asset per hour.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => null) as { token?: string; ext?: string; inspector_code?: string } | null;
    const token = String(body?.token || '');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw bad('QR ไม่ถูกต้อง');
    const asset = await assetByToken(token);
    const settings = await companySettings(asset.company_id);
    const actor = await optionalInspectStaff(request);
    const staff = !!actor && (actor.companyId === 'admin' || actor.companyId === asset.company_id);
    if (!staff) {
      if (settings.inspection_mode !== 'department') throw new AccessError('กรุณาเข้าสู่ระบบก่อนแนบรูป', 401);
      const code = String(body?.inspector_code || '').trim();
      if (!code) throw bad('กรุณากรอกรหัสผู้ตรวจก่อนแนบรูป');
      const { data, error } = await db().from('insp_inspectors').select('id').eq('company_id', asset.company_id).eq('is_active', true).ilike('code', code).maybeSingle();
      if (error) throw error;
      if (!data) throw new AccessError('ไม่พบรหัสผู้ตรวจนี้ในทะเบียน', 403);
    }
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count, error: cErr } = await db().from('insp_photos').select('id', { count: 'exact', head: true }).eq('asset_id', asset.id).gte('created_at', since);
    if (cErr) throw cErr;
    if ((count || 0) >= 20) throw new AccessError('อัปโหลดรูปถี่เกินไป กรุณาลองใหม่ภายหลัง', 429);
    const ext = ['jpg', 'webp', 'png'].includes(String(body?.ext)) ? (body!.ext as 'jpg' | 'webp' | 'png') : 'jpg';
    return NextResponse.json({ data: await signPhotoUpload(asset.company_id, asset.id, ext) });
  } catch (error) { return apiError(error); }
}

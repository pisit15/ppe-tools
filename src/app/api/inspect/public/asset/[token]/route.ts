import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError } from '@/lib/toolsSession';
import { optionalInspectStaff } from '@/lib/inspect/access';
import { publicAssetInfo } from '@/lib/inspect/server';

export const dynamic = 'force-dynamic';

/** GET → what the QR form needs. A logged-in SHE user is recognised through the cookie. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new AccessError('QR ไม่ถูกต้อง', 404);
    const actor = await optionalInspectStaff(request);
    const info = await publicAssetInfo(token, actor ? actor.displayName : null);
    if (actor && actor.companyId !== 'admin' && actor.companyId !== info.company.id) info.actor = null;
    return NextResponse.json({ data: info }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}

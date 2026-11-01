import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { requireInspectStaff } from '@/lib/inspect/access';
import { signedPhotoUrl } from '@/lib/inspect/server';
import { bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** GET ?path=&thumb=1 → signed URL (30 min). The first path segment is the company. */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const path = request.nextUrl.searchParams.get('path') || '';
    if (!/^[a-z0-9_-]+\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.(jpg|webp|png|pdf)$/i.test(path)) throw bad('รูปภาพไม่ถูกต้อง');
    assertCompany(actor, path.split('/')[0], true);
    const thumb = request.nextUrl.searchParams.get('thumb') === '1' && !path.endsWith('.pdf');
    const url = await signedPhotoUrl(path, 1800, thumb ? { width: 320, height: 320 } : undefined);
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (error) { return apiError(error); }
}

import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { requireInspectStaff } from '@/lib/inspect/access';
import { signFloorplanUpload } from '@/lib/inspect/server';

export const dynamic = 'force-dynamic';

/** POST { company_id, ext } → { path, signedUrl } for a floor-plan image (browser PUTs straight to storage). */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as { company_id?: string; ext?: string } | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const ext = ['jpg', 'webp', 'png'].includes(String(body?.ext)) ? (body!.ext as 'jpg' | 'webp' | 'png') : 'webp';
    return NextResponse.json({ data: await signFloorplanUpload(company, ext) });
  } catch (error) { return apiError(error); }
}

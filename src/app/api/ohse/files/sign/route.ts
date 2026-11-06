import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { requireOhseStaff, signUpload } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';

/** POST { company_id, file_name } → signed upload URL (browser PUTs the file straight to storage) */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    return NextResponse.json({ data: await signUpload(company, String(body?.file_name || '')) });
  } catch (error) { return apiError(error); }
}

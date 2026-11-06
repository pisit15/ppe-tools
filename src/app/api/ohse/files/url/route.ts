import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { getDocument, requireOhseStaff, signedFileUrl } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';

/** GET ?company=&id= → short-lived URL to open the file */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const company = request.nextUrl.searchParams.get('company') || '';
    assertCompany(actor, company, true);
    const doc = await getDocument(company, request.nextUrl.searchParams.get('id') || '');
    if (!doc.file_path) throw new AccessError('เอกสารนี้ไม่มีไฟล์', 404);
    return NextResponse.json({ data: { url: await signedFileUrl(doc.file_path, doc.file_name) } });
  } catch (error) { return apiError(error); }
}

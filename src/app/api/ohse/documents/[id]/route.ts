import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { cleanDocumentInput, db, getDocument, getSection, removeObject, requireOhseStaff } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** PATCH { company_id, ...fields } — replacing file_path deletes the old object */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const actor = await requireOhseStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const doc = await getDocument(company, id);
    const input = cleanDocumentInput(body, true);
    if (input.section_id) {
      const s = await getSection(company, input.section_id);
      if (s.kind === 'folder' || s.kind === 'link') throw new AccessError('หมวดนี้ไม่มีทะเบียนเอกสาร', 400);
    }
    if (input.file_path && !input.file_path.startsWith(`${company}/`)) throw new AccessError('ไฟล์ไม่ถูกต้อง', 400);
    const { data, error } = await db().from('ohse_documents').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', company).select('*').single();
    if (error) throw error;
    if ('file_path' in input && doc.file_path && doc.file_path !== input.file_path) await removeObject(doc.file_path);
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** DELETE ?company= — removes the row and its file (revision history rows pointing here are detached) */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const actor = await requireOhseStaff(request);
    const company = request.nextUrl.searchParams.get('company') || '';
    assertCompany(actor, company, true);
    const doc = await getDocument(company, id);
    const { error } = await db().from('ohse_documents').delete().eq('id', id).eq('company_id', company);
    if (error) throw error;
    await removeObject(doc.file_path);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

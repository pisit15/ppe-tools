import { NextRequest, NextResponse } from 'next/server';
import { AccessError } from '@/lib/toolsSession';
import { db, getDocument, importCors, importError, importJson, removeObject, requireImportTicket, signUpload } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';

export function OPTIONS() { return importCors(new NextResponse(null, { status: 204 })); }

/** POST { id } → signed upload URL for that document's file; the path is recorded on the row. */
export async function POST(request: NextRequest) {
  try {
    const company = await requireImportTicket(request);
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    const doc = await getDocument(company, String(body?.id || ''));
    if (doc.source !== 'superhuman' || !doc.file_name) throw new AccessError('not an import row', 400);
    if (doc.file_path) await removeObject(doc.file_path);
    const signed = await signUpload(company, doc.file_name);
    const { error } = await db().from('ohse_documents').update({ file_path: signed.path, mime_type: signed.mime, file_size: null }).eq('id', doc.id);
    if (error) throw error;
    return importJson({ data: signed });
  } catch (error) { return importError(error); }
}

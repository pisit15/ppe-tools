import { NextRequest, NextResponse } from 'next/server';
import { AccessError } from '@/lib/toolsSession';
import { db, getDocument, importCors, importError, importJson, objectSize, requireImportTicket } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';

export function OPTIONS() { return importCors(new NextResponse(null, { status: 204 })); }

/** POST { id } → confirm the uploaded object and record its size. */
export async function POST(request: NextRequest) {
  try {
    const company = await requireImportTicket(request);
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    const doc = await getDocument(company, String(body?.id || ''));
    if (!doc.file_path) throw new AccessError('no upload reserved', 400);
    const size = await objectSize(doc.file_path);
    if (!size) throw new AccessError('file not found in storage', 400);
    const { error } = await db().from('ohse_documents').update({ file_size: size, updated_at: new Date().toISOString() }).eq('id', doc.id);
    if (error) throw error;
    return importJson({ ok: true, size });
  } catch (error) { return importError(error); }
}

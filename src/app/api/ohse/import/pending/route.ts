import { NextRequest, NextResponse } from 'next/server';
import { db, importCors, importError, importJson, requireImportTicket } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';

export function OPTIONS() { return importCors(new NextResponse(null, { status: 204 })); }

/** GET → Superhuman-sourced documents still waiting for their file (source_ref = page|row key|file index). */
export async function GET(request: NextRequest) {
  try {
    const company = await requireImportTicket(request);
    const { data, error } = await db().from('ohse_documents').select('id, source_ref, file_name, file_size').eq('company_id', company).eq('source', 'superhuman').not('file_name', 'is', null).is('file_size', null).limit(1000);
    if (error) throw error;
    return importJson({ data });
  } catch (error) { return importError(error); }
}

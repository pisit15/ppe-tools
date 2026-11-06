import { NextRequest } from 'next/server';
import { db, importCors, importError, importJson, requireImportTicket } from '@/lib/ohse/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function OPTIONS() { return importCors(new NextResponse(null, { status: 204 })); }

/** One-off Superhuman migration: POST { page_code, rows: [...] } stores raw captured rows for SQL mapping. */
export async function POST(request: NextRequest) {
  try {
    const company = await requireImportTicket(request);
    const body = await request.json().catch(() => null) as { page_code?: unknown; rows?: unknown } | null;
    const page = typeof body?.page_code === 'string' ? body.page_code.slice(0, 40) : '';
    const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 500) : [];
    if (!page || !rows.length) return importJson({ error: 'no rows' }, 400);
    const { error } = await db().from('ohse_import_staging').insert(rows.map(payload => ({ company_id: company, page_code: page, payload })));
    if (error) throw error;
    return importJson({ ok: true, staged: rows.length });
  } catch (error) { return importError(error); }
}

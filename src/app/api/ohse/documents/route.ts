import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { cleanDocumentInput, db, getDocument, getSection, requireOhseStaff } from '@/lib/ohse/server';
import type { OhseDocumentRow } from '@/lib/ohse/types';

export const dynamic = 'force-dynamic';

/** GET ?company=&section=&q=&history=1&expiring=1 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const sp = request.nextUrl.searchParams;
    const company = sp.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    let q = db().from('ohse_documents').select('*').eq('company_id', company);
    const section = sp.get('section');
    if (section) q = q.eq('section_id', section);
    if (sp.get('history') !== '1') q = q.eq('status', 'current');
    if (sp.get('expiring') === '1') q = q.not('expires_on', 'is', null);
    const term = (sp.get('q') || '').trim().replace(/[%,()]/g, ' ').slice(0, 80);
    if (term) q = q.or(`title.ilike.%${term}%,doc_no.ilike.%${term}%,file_name.ilike.%${term}%,note.ilike.%${term}%`);
    const { data, error } = await q.order('sort_order').order('doc_no', { nullsFirst: false }).order('doc_date', { ascending: false, nullsFirst: false }).limit(1000);
    if (error) throw error;
    return NextResponse.json({ data: (data || []) as OhseDocumentRow[] });
  } catch (error) { return apiError(error); }
}

/** POST { company_id, replaces_id?, ...document } — replaces_id = new revision of an existing document */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const input = cleanDocumentInput(body, false);
    const section = await getSection(company, input.section_id!);
    if (section.kind === 'folder' || section.kind === 'link') throw new AccessError('หมวดนี้ไม่มีทะเบียนเอกสาร เลือกหมวดย่อย', 400);
    if (input.file_path && !input.file_path.startsWith(`${company}/`)) throw new AccessError('ไฟล์ไม่ถูกต้อง', 400);
    const replaces = typeof body?.replaces_id === 'string' ? await getDocument(company, body.replaces_id) : null;
    const client = db();
    const { data, error } = await client.from('ohse_documents').insert([{ ...input, company_id: company, created_by: actor.displayName, source: 'manual' }]).select('*').single();
    if (error) throw error;
    if (replaces) {
      const { error: uErr } = await client.from('ohse_documents').update({ status: 'superseded', superseded_by: data.id, updated_at: new Date().toISOString() }).eq('id', replaces.id);
      if (uErr) throw uErr;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

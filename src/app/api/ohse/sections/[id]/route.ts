import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { cleanSectionInput, db, getSection, requireOhseStaff } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** PATCH { company_id, ...fields } */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const actor = await requireOhseStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    await getSection(company, id);
    const input = cleanSectionInput(body, true);
    if (input.parent_id === id) throw new AccessError('หมวดซ้อนตัวเองไม่ได้', 400);
    const { data, error } = await db().from('ohse_sections').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', company).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** DELETE ?company= — only empty sections without sub-sections */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const actor = await requireOhseStaff(request);
    const company = request.nextUrl.searchParams.get('company') || '';
    assertCompany(actor, company, true);
    await getSection(company, id);
    const client = db();
    const [{ count: docs }, { count: kids }] = await Promise.all([
      client.from('ohse_documents').select('id', { count: 'exact', head: true }).eq('section_id', id),
      client.from('ohse_sections').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    ]);
    if ((docs || 0) > 0 || (kids || 0) > 0) throw new AccessError('ลบได้เฉพาะหมวดที่ไม่มีเอกสารและหมวดย่อย', 400);
    const { error } = await client.from('ohse_sections').delete().eq('id', id).eq('company_id', company);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

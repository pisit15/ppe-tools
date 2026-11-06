import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { cleanSectionInput, db, listSections, requireOhseStaff } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';

/** GET ?company= → section tree (flat, with doc counts) */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    return NextResponse.json({ data: await listSections(company) });
  } catch (error) { return apiError(error); }
}

/** POST { company_id, ...section } */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const input = cleanSectionInput(body, false);
    const { data, error } = await db().from('ohse_sections').insert([{ ...input, company_id: company }]).select('*').single();
    if (error) {
      if (String(error.code) === '23505') throw new AccessError(`รหัสหมวด "${input.code}" มีอยู่แล้ว`, 400);
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

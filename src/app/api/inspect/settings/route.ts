import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { companySettings } from '@/lib/inspect/server';
import { validateSettings } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    return NextResponse.json({ data: await companySettings(company) });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const patch = validateSettings(body);
    const { data, error } = await db().from('insp_company_settings').upsert([{ company_id: company, ...patch, updated_by: actor.displayName }], { onConflict: 'company_id' }).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

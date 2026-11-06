import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { db, requireOhseStaff, sha256 } from '@/lib/ohse/server';
import type { OhseCompanySettingsView } from '@/lib/ohse/types';

export const dynamic = 'force-dynamic';

/** GET ?company= → whether the employee access code is set (the code itself is never returned) */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const { data, error } = await db().from('ohse_company_settings').select('*').eq('company_id', company).maybeSingle();
    if (error) throw error;
    const view: OhseCompanySettingsView = { company_id: company, has_access_code: !!data?.access_code_hash, updated_by: data?.updated_by ?? null, updated_at: data?.updated_at ?? null };
    return NextResponse.json({ data: view });
  } catch (error) { return apiError(error); }
}

/** PUT { company_id, access_code } — empty code closes the employee view */
export async function PUT(request: NextRequest) {
  try {
    const actor = await requireOhseStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const raw = typeof body?.access_code === 'string' ? body.access_code.trim() : '';
    if (raw && !/^[A-Za-z0-9]{6,20}$/.test(raw)) throw new AccessError('รหัสต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 6–20 ตัว', 400);
    const { error } = await db().from('ohse_company_settings').upsert({ company_id: company, access_code_hash: raw ? sha256(raw.toUpperCase()) : null, updated_by: actor.displayName, updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

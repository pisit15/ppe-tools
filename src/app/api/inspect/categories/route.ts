import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { loadCategories } from '@/lib/inspect/server';
import { bad, categoryPatch } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** GET ?company=&all=1 → categories (shared + company) with templates */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const data = await loadCategories(company, request.nextUrl.searchParams.get('all') === '1');
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** POST → company-specific category */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw bad('ข้อมูลไม่ถูกต้อง');
    const company = String(body.company_id || '');
    assertCompany(actor, company, true);
    const key = String(body.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `custom_${Date.now().toString(36)}`;
    const patch = categoryPatch(body, false);
    const { data, error } = await db().from('insp_categories').insert([{ ...patch, company_id: company, key }]).select('*').single();
    if (error) { if (String(error.code) === '23505') throw bad('รหัสหมวดนี้มีอยู่แล้ว'); throw error; }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

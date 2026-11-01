import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { listAssets, loadCategories, newToken } from '@/lib/inspect/server';
import { bad, validateAssetInput, validateAttributes } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** GET ?company=&all=1 → registry with due status */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const data = await listAssets(company, { includeInactive: request.nextUrl.searchParams.get('all') === '1' });
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** POST → create one asset */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const input = validateAssetInput(body);
    const { categories, templates } = await loadCategories(company, true);
    const category = categories.find(c => c.id === input.category_id);
    if (!category) throw bad('ไม่พบหมวดอุปกรณ์');
    if (input.template_id && !templates.some(t => t.id === input.template_id && t.category_id === category.id)) throw bad('รายการตรวจไม่ตรงกับหมวด');
    const attributes = validateAttributes(category.attributes, input.attributes_raw);
    const { attributes_raw: _raw, ...fields } = input;
    void _raw;
    const { data, error } = await db().from('insp_assets').insert([{ ...fields, company_id: company, attributes, qr_token: newToken(24), created_by: actor.displayName }]).select('id').single();
    if (error) {
      if (String(error.code) === '23505') throw bad(`รหัส "${input.code}" มีอยู่แล้วในบริษัทนี้`);
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

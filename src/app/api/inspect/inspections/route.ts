import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { requireInspectStaff } from '@/lib/inspect/access';
import { companySettings, createInspection, assetByToken, defaultTemplateFor, getAsset, listInspections, loadCategories } from '@/lib/inspect/server';
import { validateInspectionBody } from '@/lib/inspect/validation';
import { db } from '@/lib/inspect/access';
import type { InspAssetRow } from '@/lib/inspect/types';

export const dynamic = 'force-dynamic';

/** GET ?company=&period=YYYY-MM&asset_id=&overall=&open=1&from=&to= */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const sp = request.nextUrl.searchParams;
    const company = sp.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const overall = sp.get('overall');
    const data = await listInspections(company, {
      asset_id: sp.get('asset_id') || undefined, period: sp.get('period') || undefined, from: sp.get('from') || undefined, to: sp.get('to') || undefined,
      overall: overall === 'pass' || overall === 'fail' ? overall : undefined, open: sp.get('open') === '1', limit: Math.min(2000, Number(sp.get('limit') || 500)),
    });
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** POST → SHE user records an inspection from the app (by asset_id or by token) */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const byToken = !!body && typeof body.token === 'string' && !body.asset_id;
    const input = validateInspectionBody(body, !byToken);
    let asset: InspAssetRow;
    if (byToken) asset = await assetByToken(input.token!);
    else {
      const { data, error } = await db().from('insp_assets').select('*').eq('id', input.asset_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new AccessError('ไม่พบอุปกรณ์', 404);
      asset = data as InspAssetRow;
    }
    assertCompany(actor, asset.company_id, true);
    const [{ templates }, settings] = await Promise.all([loadCategories(asset.company_id, true), companySettings(asset.company_id)]);
    const template = (asset.template_id && templates.find(t => t.id === asset.template_id)) || defaultTemplateFor(templates, asset.category_id, asset.company_id);
    if (!template) throw new AccessError('หมวดนี้ยังไม่มีรายการตรวจ', 400);
    const row = await createInspection(asset, template, { ...input, asset_id: asset.id }, { inspector_code: input.inspector_code || 'SHE', inspector_name: input.inspector_name || actor.displayName }, 'app', settings);
    return NextResponse.json({ data: row, asset: await getAsset(asset.id) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

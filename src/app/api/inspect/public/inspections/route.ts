import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertSameOrigin } from '@/lib/toolsSession';
import { optionalInspectStaff } from '@/lib/inspect/access';
import { assetByToken, companySettings, createInspection, defaultTemplateFor, lastInspectionInRound, loadCategories, resolveInspector } from '@/lib/inspect/server';
import { validateInspectionBody } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** POST { token, inspector_code?, results, note?, photo_paths?, confirm_repeat? } — a second pass in the same round needs confirm_repeat:true */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => null);
    const input = validateInspectionBody(body, false);
    const asset = await assetByToken(input.token!);
    const actor = await optionalInspectStaff(request);
    const actorName = actor && (actor.companyId === 'admin' || actor.companyId === asset.company_id) ? actor.displayName : null;
    const [{ categories, templates }, settings] = await Promise.all([loadCategories(asset.company_id, true), companySettings(asset.company_id)]);
    const category = categories.find(c => c.id === asset.category_id);
    const { last, inRound } = await lastInspectionInRound(asset.id, category?.inspection_interval_days || 30);
    if (inRound && last?.overall === 'pass' && (body as { confirm_repeat?: unknown } | null)?.confirm_repeat !== true) {
      throw new AccessError(`อุปกรณ์นี้ตรวจผ่านแล้วในรอบนี้ (${last.inspected_on} โดย ${last.inspector_name}) — ติ๊กยืนยันบันทึกซ้ำก่อนส่ง`, 409);
    }
    const template = (asset.template_id && templates.find(t => t.id === asset.template_id)) || defaultTemplateFor(templates, asset.category_id, asset.company_id);
    if (!template) throw new AccessError('หมวดนี้ยังไม่มีรายการตรวจ กรุณาติดต่อทีม SHE', 400);
    const who = await resolveInspector(asset.company_id, settings.inspection_mode, actorName, input.inspector_code || '', input.inspector_name || '');
    const row = await createInspection(asset, template, { ...input, asset_id: asset.id }, who, actorName ? 'app' : 'qr', settings);
    return NextResponse.json({ data: { id: row.id, overall: row.overall, fail_items: row.fail_items, inspected_on: row.inspected_on, inspector_name: row.inspector_name } }, { status: 201 });
  } catch (error) { return apiError(error); }
}

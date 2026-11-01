import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, AccessError } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { getAsset } from '@/lib/inspect/server';
import { UUID, validateServiceEvent } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** POST → record a service event (legal test / refill / ...). A legal_test also moves asset.last_service_on. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new AccessError('ไม่พบอุปกรณ์', 404);
    const asset = await getAsset(id);
    assertCompany(actor, asset.company_id, true);
    const input = validateServiceEvent(await request.json().catch(() => null));
    if (input.file_path && !input.file_path.startsWith(`${asset.company_id}/${asset.id}/`)) throw new AccessError('ไฟล์แนบไม่ถูกต้อง', 400);
    const client = db();
    const { data, error } = await client.from('insp_service_events').insert([{ ...input, company_id: asset.company_id, asset_id: id, created_by: actor.displayName }]).select('*').single();
    if (error) throw error;
    const updates: Record<string, unknown> = {};
    if (input.kind === 'legal_test' && (!asset.last_service_on || input.done_on > asset.last_service_on)) updates.last_service_on = input.done_on;
    if (input.kind === 'dispose') updates.status = 'disposed';
    if (Object.keys(updates).length) {
      const { error: uErr } = await client.from('insp_assets').update(updates).eq('id', id);
      if (uErr) throw uErr;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

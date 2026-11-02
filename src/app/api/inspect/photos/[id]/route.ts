import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { removeStorageObject } from '@/lib/inspect/server';
import { UUID, bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** DELETE — remove one inspection photo (row soft-deleted with reason 'manual', object removed). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireInspectStaff(request);
    const { id } = await params;
    if (!UUID.test(id)) throw bad('รูปไม่ถูกต้อง');
    const client = db();
    const { data: row, error: rErr } = await client.from('insp_photos').select('id, company_id, storage_path, deleted_at').eq('id', id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new AccessError('ไม่พบรูป', 404);
    assertCompany(actor, row.company_id, true);
    if (!row.deleted_at) {
      const { error } = await client.from('insp_photos').update({ deleted_at: new Date().toISOString(), deleted_reason: `manual:${actor.displayName}`.slice(0, 120) }).eq('id', id);
      if (error) throw error;
      await removeStorageObject(row.storage_path);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

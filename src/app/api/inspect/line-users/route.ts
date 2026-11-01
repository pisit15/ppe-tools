import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** LINE users registered to record inspections for this company (via photo to the OA). */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const { data, error } = await db().from('insp_line_users').select('*').eq('company_id', company).order('last_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** DELETE ?id=<line_user_id> → unlink (the person must register again with their code). */
export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!/^U[0-9a-f]{32}$/.test(id)) throw bad('LINE user id ไม่ถูกต้อง');
    const { data: row, error: rErr } = await db().from('insp_line_users').select('company_id').eq('line_user_id', id).maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw bad('ไม่พบผู้ใช้นี้');
    assertCompany(actor, String(row.company_id || ''), true);
    const { error } = await db().from('insp_line_users').delete().eq('line_user_id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

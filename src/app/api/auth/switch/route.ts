import { NextRequest, NextResponse } from 'next/server';
import { requireToolsActor, apiError, AccessError, TOOLS_COOKIE, TOOLS_COOKIE_OPTIONS, issueToolsSession } from '@/lib/toolsSession';
import { linkedCompanies, linkedRow } from '@/lib/accountCompanies';
import { getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** POST { company_id } — re-issue the session for another company row of the same person (no password needed: it was verified at login and the rows share one hash). */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const body = await request.json().catch(() => ({})) as { company_id?: string };
    const companyId = String(body.company_id || '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(companyId)) throw new AccessError('กรุณาเลือกบริษัทที่ถูกต้อง', 400);
    const row = await linkedRow(actor, companyId);
    if (!row) throw new AccessError('บัญชีนี้ไม่มีสิทธิ์ในบริษัทที่เลือก', 403);
    const { data: company } = await getSupabaseServer().from('company_settings').select('company_name').eq('company_id', companyId).maybeSingle();
    const companies = await linkedCompanies({ ...actor, row });
    const user = {
      id: row.id, username: row.username, companyId, companyName: company?.company_name || companyId.toUpperCase(),
      displayName: String(row.display_name || row.username), nickname: String(row.nickname || ''), position: String(row.position || ''),
      role: 'user', allowedModules: (row.allowed_modules as string[] | null) ?? null, ppeRole: 'manager', companies,
    };
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(TOOLS_COOKIE, issueToolsSession(row, actor.accountTable), TOOLS_COOKIE_OPTIONS);
    return response;
  } catch (e) { return apiError(e); }
}

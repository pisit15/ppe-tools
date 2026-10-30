import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { db } from '@/lib/visitor/server';
import { notifyPendingDigest, notifyTest } from '@/lib/visitor/notify';
import type { LineGroupOption, NotifyLogRow } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

/** SHE: LINE groups the OA has joined (to pick one per company) + this company's recent pushes and month-to-date count. */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const company = request.nextUrl.searchParams.get('company') || actor.companyId;
    assertCompany(actor, company, true);
    const client = db();
    const [{ data: groups, error: gErr }, { data: log, error: lErr }] = await Promise.all([
      client.from('line_groups').select('group_id, group_name, active, joined_at').order('last_event_at', { ascending: false }).limit(50),
      client.from('visitor_notify_log').select('*').eq('company_id', company).order('sent_at', { ascending: false }).limit(20),
    ]);
    if (gErr) throw gErr;
    if (lErr) throw lErr;
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const { count, error: cErr } = await client.from('visitor_notify_log').select('id', { count: 'exact', head: true }).gte('sent_at', monthStart.toISOString()).lt('http_status', 300);
    if (cErr) throw cErr;
    return NextResponse.json({ data: { groups: (groups || []) as LineGroupOption[], log: (log || []) as NotifyLogRow[], sent_this_month_all_companies: count || 0, configured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN) } });
  } catch (error) {
    return apiError(error);
  }
}

/** SHE: send a test message, or a pending-requests digest ({ action: 'digest' }), to the company's configured group. */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const body = (await request.json().catch(() => null)) as { company_id?: unknown; action?: unknown } | null;
    const company = body?.company_id;
    assertCompany(actor, company, true);
    const { data, error } = await db().from('visitor_company_options').select('line_group_id').eq('company_id', company).maybeSingle();
    if (error) throw error;
    const groupId = (data as { line_group_id: string | null } | null)?.line_group_id;
    if (!groupId) throw new AccessError('ยังไม่ได้เลือกกลุ่ม LINE ของบริษัทนี้', 400);
    const digest = body?.action === 'digest';
    const result = digest ? await notifyPendingDigest(company, groupId) : { ...(await notifyTest(company, groupId)), count: 0 };
    if (result.status >= 300 || result.status === 0) throw new AccessError(`ส่งไม่สำเร็จ (LINE ตอบ ${result.status})${result.error ? `: ${result.error.slice(0, 120)}` : ''}`, 502);
    return NextResponse.json({ data: { ok: true, count: result.count } });
  } catch (error) {
    return apiError(error);
  }
}

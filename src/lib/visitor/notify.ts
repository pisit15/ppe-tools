// LINE group notifications for visitor requests. Never throws: a failed push must not fail the request.
import { pushMessages } from '@/lib/line/push';
import { decisionCard, newRequestCard, pendingDigest, testMessage } from '@/lib/line/visitorCards';
import { REQUEST_SELECT, sortPersons } from './server';
import { companyName, db } from './server';
import type { VisitorRequestWithPersons } from './types';

type Kind = 'new_request' | 'decision' | 'test';
type Settings = { line_group_id: string | null; notify_new: boolean; notify_decision: boolean };

async function settings(companyId: string): Promise<Settings | null> {
  const { data } = await db().from('visitor_company_options').select('line_group_id, notify_new, notify_decision').eq('company_id', companyId).maybeSingle();
  return (data as Settings | null) || null;
}

async function send(companyId: string, groupId: string, kind: Kind, requestId: string | null, message: Parameters<typeof pushMessages>[1][number]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) return { status: 0, error: 'LINE_CHANNEL_ACCESS_TOKEN missing' };
  const result = await pushMessages(groupId, [message], token);
  await db().from('visitor_notify_log').insert([{ company_id: companyId, request_id: requestId, kind, group_id: groupId, http_status: result.status, error: result.error || null }]);
  return result;
}

export async function notifyNewRequest(r: VisitorRequestWithPersons) {
  try {
    const s = await settings(r.company_id);
    if (!s?.line_group_id || !s.notify_new) return;
    await send(r.company_id, s.line_group_id, 'new_request', r.id, newRequestCard(r, await companyName(r.company_id)));
  } catch (e) { console.error('visitor notify (new) failed', e instanceof Error ? e.message : e); }
}

export async function notifyDecision(r: VisitorRequestWithPersons) {
  try {
    const s = await settings(r.company_id);
    if (!s?.line_group_id || !s.notify_decision) return;
    await send(r.company_id, s.line_group_id, 'decision', r.id, decisionCard(r, await companyName(r.company_id)));
  } catch (e) { console.error('visitor notify (decision) failed', e instanceof Error ? e.message : e); }
}

/** Settings page "send test" — returns the LINE status so the UI can show quota/permission problems. */
export async function notifyTest(companyId: string, groupId: string) {
  return send(companyId, groupId, 'test', null, testMessage(await companyName(companyId)));
}

/** Settings page: one message listing everything still waiting for a decision (e.g. after a bulk import). Logged as kind 'test'. */
export async function notifyPendingDigest(companyId: string, groupId: string) {
  const { data, error } = await db().from('visitor_requests').select(REQUEST_SELECT).eq('company_id', companyId)
    .in('status', ['submitted', 'need_info']).order('arrival_date').order('time_from').limit(40);
  if (error) throw error;
  const rows = (data as VisitorRequestWithPersons[]).map(sortPersons);
  return { ...(await send(companyId, groupId, 'test', null, pendingDigest(rows, await companyName(companyId)))), count: rows.length };
}

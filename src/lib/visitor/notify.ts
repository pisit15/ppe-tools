// Group notifications for visitor requests — LINE (push quota) and/or Telegram (free). Never throws:
// a failed send must not fail the request.
import { pushMessages } from '@/lib/line/push';
import { decisionCard, newRequestCard, pendingDigest, testMessage } from '@/lib/line/visitorCards';
import { sendMessage } from '@/lib/telegram/api';
import { decisionText, newRequestText, pendingDigestText, testText } from '@/lib/telegram/visitorText';
import { REQUEST_SELECT, sortPersons } from './server';
import { companyName, db } from './server';
import type { VisitorRequestWithPersons } from './types';

type Kind = 'new_request' | 'decision' | 'test';
export type NotifyChannel = 'line' | 'telegram';
type Settings = { line_group_id: string | null; telegram_chat_id: number | null; notify_new: boolean; notify_decision: boolean };
type SendResult = { status: number; error?: string };

async function settings(companyId: string): Promise<Settings | null> {
  const { data } = await db().from('visitor_company_options').select('line_group_id, telegram_chat_id, notify_new, notify_decision').eq('company_id', companyId).maybeSingle();
  return (data as Settings | null) || null;
}

async function log(companyId: string, channel: NotifyChannel, target: string, kind: Kind, requestId: string | null, result: SendResult) {
  await db().from('visitor_notify_log').insert([{ company_id: companyId, request_id: requestId, kind, group_id: target, channel, http_status: result.status, error: result.error || null }]);
}

async function sendLine(companyId: string, groupId: string, kind: Kind, requestId: string | null, message: Parameters<typeof pushMessages>[1][number]): Promise<SendResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  const result: SendResult = token ? await pushMessages(groupId, [message], token) : { status: 0, error: 'LINE_CHANNEL_ACCESS_TOKEN missing' };
  await log(companyId, 'line', groupId, kind, requestId, result);
  return result;
}

async function sendTelegram(companyId: string, chatId: number, kind: Kind, requestId: string | null, html: string, keyboard?: Parameters<typeof sendMessage>[2]): Promise<SendResult> {
  const r = await sendMessage(chatId, html, keyboard);
  const result: SendResult = { status: r.ok ? 200 : r.status, error: r.error };
  await log(companyId, 'telegram', String(chatId), kind, requestId, result);
  return result;
}

/** @param batchDates every date of a multi-day batch (one card for the whole batch; approving it approves every day) */
export async function notifyNewRequest(r: VisitorRequestWithPersons, batchDates?: string[]) {
  try {
    const s = await settings(r.company_id);
    if (!s?.notify_new) return;
    const name = await companyName(r.company_id);
    if (s.line_group_id) await sendLine(r.company_id, s.line_group_id, 'new_request', r.id, newRequestCard(r, name, batchDates));
    if (s.telegram_chat_id) { const t = newRequestText(r, name, batchDates); await sendTelegram(r.company_id, s.telegram_chat_id, 'new_request', r.id, t.html, t.keyboard); }
  } catch (e) { console.error('visitor notify (new) failed', e instanceof Error ? e.message : e); }
}

/** @param skip channel that already showed the decision in-chat (e.g. the Telegram confirm message) */
export async function notifyDecision(r: VisitorRequestWithPersons, skip?: NotifyChannel) {
  try {
    const s = await settings(r.company_id);
    if (!s?.notify_decision) return;
    const name = await companyName(r.company_id);
    if (s.line_group_id && skip !== 'line') await sendLine(r.company_id, s.line_group_id, 'decision', r.id, decisionCard(r, name));
    if (s.telegram_chat_id && skip !== 'telegram') { const t = decisionText(r, name); await sendTelegram(r.company_id, s.telegram_chat_id, 'decision', r.id, t.html, t.keyboard); }
  } catch (e) { console.error('visitor notify (decision) failed', e instanceof Error ? e.message : e); }
}

/** Settings page "send test" — returns the channel status so the UI can show quota/permission problems. */
export async function notifyTest(companyId: string, channel: NotifyChannel, target: string): Promise<SendResult> {
  const name = await companyName(companyId);
  return channel === 'telegram' ? sendTelegram(companyId, Number(target), 'test', null, testText(name)) : sendLine(companyId, target, 'test', null, testMessage(name));
}

/** Settings page: one message listing everything still waiting for a decision. Logged as kind 'test'. */
export async function notifyPendingDigest(companyId: string, channel: NotifyChannel, target: string): Promise<SendResult & { count: number }> {
  const { data, error } = await db().from('visitor_requests').select(REQUEST_SELECT).eq('company_id', companyId)
    .in('status', ['submitted', 'need_info']).order('arrival_date').order('time_from').limit(40);
  if (error) throw error;
  const rows = (data as VisitorRequestWithPersons[]).map(sortPersons);
  const name = await companyName(companyId);
  const result = channel === 'telegram' ? await sendTelegram(companyId, Number(target), 'test', null, pendingDigestText(rows, name)) : await sendLine(companyId, target, 'test', null, pendingDigest(rows, name));
  return { ...result, count: rows.length };
}

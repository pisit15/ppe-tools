// LINE push (uses the OA's monthly push quota — keep to one message per event, see visitorNotify.ts).
import type { LineMessage } from './flex';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export async function pushMessages(to: string, messages: LineMessage[], accessToken: string): Promise<{ status: number; error?: string }> {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('LINE push failed', res.status, body.slice(0, 300));
    return { status: res.status, error: body.slice(0, 300) };
  }
  return { status: res.status };
}

/** Group display name for the settings dropdown; empty when the OA cannot read it. */
export async function fetchGroupName(groupId: string, accessToken: string): Promise<string> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return '';
    const data = (await res.json()) as { groupName?: string };
    return String(data.groupName || '').slice(0, 120);
  } catch {
    return '';
  }
}

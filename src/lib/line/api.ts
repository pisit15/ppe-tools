// Minimal LINE Messaging API client (reply only — replies don't use the push quota).
import type { LineMessage } from './flex';

const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

export async function replyMessages(replyToken: string, messages: LineMessage[], accessToken: string): Promise<number> {
  const res = await fetch(REPLY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) {
    // Body may echo request details; log status and a short snippet only.
    const body = await res.text().catch(() => '');
    console.error('LINE reply failed', res.status, body.slice(0, 300));
  }
  return res.status;
}

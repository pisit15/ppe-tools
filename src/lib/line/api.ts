// Minimal LINE Messaging API client (reply only — replies don't use the push quota).

const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const MAX_TEXT = 5000; // LINE text message limit

export async function replyText(replyToken: string, texts: string[], accessToken: string): Promise<void> {
  const messages = texts.slice(0, 5).map(t => ({
    type: 'text',
    text: t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 2)}…` : t,
  }));
  const res = await fetch(REPLY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    // Body may echo request details; log status and a short snippet only.
    const body = await res.text().catch(() => '');
    console.error('LINE reply failed', res.status, body.slice(0, 200));
  }
}

// Telegram Bot API client (server only). Free and unlimited for group bots; every call is a plain HTTPS POST.
// Env: TELEGRAM_BOT_TOKEN (from @BotFather), TELEGRAM_WEBHOOK_SECRET (any random string; Telegram echoes it in a header).

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };
export type ReplyMarkup = InlineKeyboard | { keyboard: { text: string }[][]; resize_keyboard: true; one_time_keyboard: true } | { remove_keyboard: true };
export type TgResult = { ok: boolean; status: number; error?: string; message_id?: number };

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
export const telegramConfigured = () => Boolean(token());
export const webhookSecret = () => process.env.TELEGRAM_WEBHOOK_SECRET || '';

/** HTML parse mode: escape user text before interpolating. */
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; result?: T; error?: string }> {
  const t = token();
  if (!t) return { ok: false, status: 0, error: 'TELEGRAM_BOT_TOKEN missing' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !data.ok) {
      const error = String(data.description || `HTTP ${res.status}`).slice(0, 300);
      console.error('Telegram', method, 'failed', res.status, error);
      return { ok: false, status: res.status, error };
    }
    return { ok: true, status: res.status, result: data.result };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendMessage(chatId: number | string, html: string, keyboard?: ReplyMarkup, replyTo?: number): Promise<TgResult> {
  const r = await tgCall<{ message_id: number }>('sendMessage', {
    chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });
  return { ok: r.ok, status: r.status, error: r.error, message_id: r.result?.message_id };
}

export async function editMessage(chatId: number | string, messageId: number, html: string, keyboard?: InlineKeyboard): Promise<TgResult> {
  const r = await tgCall('editMessageText', {
    chat_id: chatId, message_id: messageId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: keyboard || { inline_keyboard: [] },
  });
  return { ok: r.ok, status: r.status, error: r.error };
}

export async function answerCallback(callbackId: string, text?: string, alert = false) {
  return tgCall('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200), show_alert: alert } : {}) });
}

export async function getMe() {
  return tgCall<{ id: number; username?: string; first_name?: string }>('getMe', {});
}

export async function setWebhook(url: string, secret: string) {
  return tgCall<boolean>('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query', 'my_chat_member'], drop_pending_updates: false });
}

export async function getWebhookInfo() {
  return tgCall<{ url?: string; last_error_message?: string; pending_update_count?: number }>('getWebhookInfo', {});
}

/** Download a photo/document by file_id (≤ 12 MB). Telegram serves files from a separate host that embeds the bot token. */
export async function downloadFile(fileId: string): Promise<Buffer | null> {
  const t = token();
  if (!t) return null;
  const info = await tgCall<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
  const path = info.result?.file_path;
  if (!info.ok || !path) return null;
  if ((info.result?.file_size || 0) > 12 * 1024 * 1024) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${t}/${path}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error('Telegram file download failed', e instanceof Error ? e.message : e);
    return null;
  }
}

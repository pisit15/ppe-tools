// Render the LINE bot's replies (text / Flex / template, quick replies, postbacks) as Telegram messages:
// Flex bubbles become their text nodes in order; uri actions → url buttons; postback actions → callback buttons;
// message actions and quick replies → a one-time reply keyboard (sends the text back, exactly like LINE quick replies).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json, LineMessage } from '../line/flex';
import { esc, type InlineButton, type InlineKeyboard } from './api';

export type ReplyKeyboard = { keyboard: { text: string }[][]; resize_keyboard: true; one_time_keyboard: true };
export type TgOut = { html: string; inline?: InlineKeyboard; reply?: ReplyKeyboard };

const MAX_CB = 64;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
const randKey = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Postback payload → callback_data; parks payloads over Telegram's 64-byte cap in telegram_callbacks. */
export async function callbackFor(db: SupabaseClient, data: string): Promise<string> {
  const direct = `p:${data}`;
  if (bytes(direct) <= MAX_CB) return direct;
  const key = randKey();
  await db.from('telegram_callbacks').insert([{ key, data }]);
  return `k:${key}`;
}

/** Inverse: resolves "p:…" / "k:…" back to the LINE postback payload (null when unknown/expired). */
export async function resolveCallback(db: SupabaseClient, cb: string): Promise<string | null> {
  if (cb.startsWith('p:')) return cb.slice(2);
  if (cb.startsWith('k:')) {
    const { data } = await db.from('telegram_callbacks').select('data').eq('key', cb.slice(2)).maybeSingle();
    return (data as { data: string } | null)?.data ?? null;
  }
  return null;
}

type Action = { type?: string; label?: string; uri?: string; data?: string; text?: string };

function walk(node: Json, out: { lines: string[]; actions: Action[] }) {
  if (Array.isArray(node)) { node.forEach(n => walk(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, Json>;
  if (o.type === 'text' && typeof o.text === 'string') {
    const t = o.text.trim();
    if (t) out.lines.push(o.weight === 'bold' ? `<b>${esc(t)}</b>` : esc(t));
  }
  if (o.action && typeof o.action === 'object') out.actions.push(o.action as Action);
  for (const k of ['header', 'hero', 'body', 'footer', 'contents']) if (k in o) walk(o[k], out);
}

export async function lineToTelegram(db: SupabaseClient, messages: LineMessage[]): Promise<TgOut[]> {
  const out: TgOut[] = [];
  for (const m of messages) {
    const quick = (m.quickReply as { items?: { action?: Action }[] } | undefined)?.items?.map(i => i.action).filter((a): a is Action => Boolean(a && (a.text || a.label))) || [];
    const replyRows = quick.map(a => [{ text: String(a.text || a.label) }]);
    const reply: ReplyKeyboard | undefined = replyRows.length ? { keyboard: chunk(replyRows.map(r => r[0]), 2), resize_keyboard: true, one_time_keyboard: true } : undefined;

    if (m.type === 'text') { out.push({ html: esc(String(m.text || '')), reply }); continue; }

    const alt = typeof m.altText === 'string' ? m.altText : '';
    const acc = { lines: [] as string[], actions: [] as Action[] };
    if (m.type === 'flex') walk(m.contents as Json, acc);
    if (m.type === 'template') {
      const t = m.template as Record<string, Json>;
      if (typeof t.title === 'string') acc.lines.push(`<b>${esc(t.title)}</b>`);
      if (typeof t.text === 'string') acc.lines.push(esc(t.text));
      walk(t.actions as Json, acc);
      if (Array.isArray(t.actions)) for (const a of t.actions as Json[]) acc.actions.push(a as Action);
    }
    const inlineRows: InlineButton[][] = [];
    const msgButtons: { text: string }[] = [];
    for (const a of acc.actions) {
      const label = String(a.label || a.text || '').slice(0, 40);
      if (!label) continue;
      if (a.type === 'uri' && a.uri && /^https?:/.test(a.uri)) inlineRows.push([{ text: label, url: a.uri }]);
      else if (a.type === 'postback' && a.data) inlineRows.push([{ text: label, callback_data: await callbackFor(db, a.data) }]);
      else if (a.type === 'message' && (a.text || a.label)) msgButtons.push({ text: String(a.text || a.label) });
    }
    const html = (acc.lines.length ? dedupe(acc.lines).join('\n') : esc(alt || 'ดูรายละเอียดที่ tools.eashe.org')).slice(0, 3800);
    const replyAll = msgButtons.length || reply ? { keyboard: chunk([...(reply?.keyboard.flat() || []), ...msgButtons], 2), resize_keyboard: true as const, one_time_keyboard: true as const } : undefined;
    out.push({ html, inline: inlineRows.length ? { inline_keyboard: inlineRows.slice(0, 12) } : undefined, reply: replyAll });
  }
  return out;
}

function chunk<T>(items: T[], n: number): T[][] { const rows: T[][] = []; for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n)); return rows; }
function dedupe(lines: string[]) { const seen = new Set<string>(); return lines.filter(l => { if (seen.has(l)) return false; seen.add(l); return true; }); }

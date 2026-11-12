import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { answerCallback, editMessage, sendMessage, webhookSecret, esc } from '@/lib/telegram/api';
import { handleVisitorCallback, tgLinkId } from '@/lib/telegram/visitorActions';
import { groupCommandText, handleGroupText } from '@/lib/line/groupBot';
import { telegramScope, recordChat, touchChat } from '@/lib/telegram/chats';
import { getLinkedAccount } from '@/lib/line/accounts';
import { notifyDecision } from '@/lib/visitor/notify';
import { textFallback } from '@/lib/line/flex';

export const dynamic = 'force-dynamic';

type TgUser = { id: number; first_name?: string; username?: string; is_bot?: boolean };
type TgChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string };
type TgMessage = { message_id: number; from?: TgUser; chat: TgChat; text?: string; entities?: { type: string; offset: number; length: number }[] };
type Update = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
  my_chat_member?: { chat: TgChat; new_chat_member: { status: string; user: TgUser } };
};

const CODE_TTL_MS = 15 * 60 * 1000;
const newCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
const siteBase = () => (process.env.LINE_LINK_BASE_URL || 'https://tools.eashe.org').replace(/\/+$/, '');

/** Telegram → our bot: strip "/she", "/she@BotName", "@she", a bot mention, then reuse the LINE group command parser. */
function commandText(m: TgMessage, botUsername: string): string | null {
  let t = (m.text || '').trim();
  if (!t) return null;
  const mention = new RegExp(`^/?(?:she)?@${botUsername}\\b`, 'i');
  if (botUsername && mention.test(t)) t = t.replace(mention, '@she');
  t = t.replace(/^\/she(?:@\w+)?\b/i, '@she');
  return groupCommandText(t);
}

export async function POST(request: NextRequest) {
  const secret = webhookSecret();
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return NextResponse.json({ ok: true });
  const db = getSupabaseServer();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

  try {
    // Bot added to / removed from a group → registry for the settings dropdown.
    if (update.my_chat_member) {
      const { chat, new_chat_member } = update.my_chat_member;
      if (chat.type === 'group' || chat.type === 'supergroup') {
        const inChat = ['member', 'administrator', 'restricted'].includes(new_chat_member.status);
        await recordChat(db, chat.id, chat.title || '', chat.type, inChat);
        if (inChat) await sendMessage(chat.id, `EA SHE Center เข้ากลุ่ม${chat.title ? ` "${esc(chat.title)}"` : ''}แล้ว\nทีม SHE เลือกกลุ่มนี้ได้ที่ tools.eashe.org/visitor/settings → การแจ้งเตือน Telegram\nรหัสกลุ่ม: <code>${chat.id}</code>`);
      }
      return NextResponse.json({ ok: true });
    }

    if (update.callback_query) {
      const q = update.callback_query;
      const chat = q.message?.chat;
      const data = q.data || '';
      if (!chat || !data.startsWith('visitor:')) { await answerCallback(q.id); return NextResponse.json({ ok: true }); }
      const scope = await telegramScope(db, chat.id);
      if (!scope) { await answerCallback(q.id, 'กลุ่มนี้ยังไม่ได้ผูกกับบริษัท', true); return NextResponse.json({ ok: true }); }
      const reply = await handleVisitorCallback(db, scope, q.from?.id, data);
      await answerCallback(q.id, reply.toast, reply.alert);
      const [, action] = data.split(':');
      if (action === 'confirm' && q.message) {
        // Replace the confirm prompt with the outcome, then post the decision card for everyone (LINE too, if set).
        await editMessage(chat.id, q.message.message_id, reply.html);
        if (reply.approvedRequest) await notifyDecision(reply.approvedRequest, undefined);
      } else {
        await sendMessage(chat.id, reply.html, reply.keyboard, q.message?.message_id);
      }
      return NextResponse.json({ ok: true });
    }

    const m = update.message;
    if (!m || !m.from || m.from.is_bot) return NextResponse.json({ ok: true });

    if (m.chat.type === 'private') {
      const linkId = tgLinkId(m.from.id);
      const account = await getLinkedAccount(db, linkId);
      const t = (m.text || '').trim().toLowerCase();
      if (account && !/^\/link/.test(t)) {
        await sendMessage(m.chat.id, `ผูกบัญชีแล้วในชื่อ <b>${esc(account.displayName)}</b> — กดอนุมัติจากการ์ดในกลุ่มได้เลย\nพิมพ์ /link เพื่อผูกบัญชีอื่นแทน`);
        return NextResponse.json({ ok: true });
      }
      await db.from('line_link_codes').delete().eq('line_user_id', linkId).is('used_at', null);
      const code = newCode();
      const { error } = await db.from('line_link_codes').insert({ code, line_user_id: linkId, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() });
      if (error) { await sendMessage(m.chat.id, 'ระบบเชื่อมบัญชีขัดข้อง กรุณาลองใหม่ภายหลัง'); return NextResponse.json({ ok: true }); }
      await sendMessage(m.chat.id, `ผูก Telegram นี้กับบัญชี tools.eashe.org เพื่อกดอนุมัติคำขอจากในกลุ่ม\n\nกดลิงก์แล้วเข้าสู่ระบบด้วยบัญชีบริษัท (ลิงก์ใช้ได้ 15 นาที ครั้งเดียว):\n${siteBase()}/line/link?code=${code}&via=telegram`);
      return NextResponse.json({ ok: true });
    }

    if (m.chat.type === 'group' || m.chat.type === 'supergroup') {
      await touchChat(db, m.chat.id, m.chat.title);
      const cmd = commandText(m, botUsername);
      if (cmd === null) return NextResponse.json({ ok: true });
      const scope = await telegramScope(db, m.chat.id);
      if (!scope) { await sendMessage(m.chat.id, 'กลุ่มนี้ยังไม่ได้ผูกกับบริษัท — ทีม SHE ตั้งค่าได้ที่ tools.eashe.org/visitor/settings → การแจ้งเตือน Telegram', undefined, m.message_id); return NextResponse.json({ ok: true }); }
      const messages = await handleGroupText(db, scope, cmd);
      if (messages) {
        // LINE Flex cards fall back to their alt text here; plain texts pass through.
        const html = textFallback(messages).map(x => (x.type === 'text' ? esc(String((x as { text?: string }).text || '')) : '')).filter(Boolean).join('\n\n');
        if (html) await sendMessage(m.chat.id, html, undefined, m.message_id);
      }
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error('Telegram update failed', err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true });
}

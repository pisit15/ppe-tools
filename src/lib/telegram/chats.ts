// Registry of Telegram groups the bot is in, and the company a group is bound to (visitor_company_options.telegram_chat_id).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GroupScope } from '../line/groupBot';

export type TelegramChatRow = { chat_id: number; title: string; chat_type: string; active: boolean; joined_at: string; left_at: string | null; last_event_at: string };

export async function recordChat(db: SupabaseClient, chatId: number, title: string, chatType: string, active: boolean) {
  const now = new Date().toISOString();
  const { error } = await db.from('telegram_chats').upsert(
    { chat_id: chatId, title: title.slice(0, 120), chat_type: chatType, active, left_at: active ? null : now, last_event_at: now },
    { onConflict: 'chat_id' },
  );
  if (error) throw error;
}

export async function touchChat(db: SupabaseClient, chatId: number, title?: string) {
  await db.from('telegram_chats').upsert({ chat_id: chatId, ...(title ? { title: title.slice(0, 120) } : {}), active: true, last_event_at: new Date().toISOString() }, { onConflict: 'chat_id' });
}

export async function telegramScope(db: SupabaseClient, chatId: number): Promise<GroupScope | null> {
  const { data } = await db.from('visitor_company_options').select('company_id').eq('telegram_chat_id', chatId).limit(1).maybeSingle();
  const companyId = (data as { company_id: string } | null)?.company_id;
  if (!companyId) return null;
  const { data: c } = await db.from('company_settings').select('company_name').eq('company_id', companyId).maybeSingle();
  return { companyId, companyName: String((c as { company_name?: string } | null)?.company_name || companyId.toUpperCase()) };
}

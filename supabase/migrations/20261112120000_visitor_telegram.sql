-- Telegram as a free notification/approval channel for Visitor Access (LINE push quota is 200 msgs/month counted per group member).
-- Linked Telegram users reuse line_links / line_link_codes with line_user_id = 'tg:<telegram user id>' (no new link tables).

create table if not exists public.telegram_chats (
  chat_id       bigint primary key,
  title         text not null default '',
  chat_type     text not null default 'group',
  active        boolean not null default true,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  last_event_at timestamptz not null default now()
);
alter table public.telegram_chats enable row level security;
revoke all on public.telegram_chats from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_chats to service_role;

alter table public.visitor_company_options add column if not exists telegram_chat_id bigint;
comment on column public.visitor_company_options.telegram_chat_id is 'Telegram group that receives visitor notifications (null = off)';

alter table public.visitor_notify_log add column if not exists channel text not null default 'line';
alter table public.visitor_notify_log drop constraint if exists visitor_notify_log_channel_check;
alter table public.visitor_notify_log add constraint visitor_notify_log_channel_check check (channel in ('line', 'telegram'));

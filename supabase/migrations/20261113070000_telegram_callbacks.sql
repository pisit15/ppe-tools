-- Telegram inline-button callback_data is capped at 64 bytes; longer LINE postback payloads are parked here and referenced by key.
create table if not exists public.telegram_callbacks (
  key        text primary key,
  data       text not null,
  created_at timestamptz not null default now()
);
alter table public.telegram_callbacks enable row level security;
revoke all on public.telegram_callbacks from public, anon, authenticated;
grant select, insert, delete on public.telegram_callbacks to service_role;

-- LINE chatbot: link a LINE user to an existing tools.eashe.org account.
-- Server-only tables: RLS on, no policies, so only the service-role key
-- (used by /api/line/*) can read or write them. Browser roles get nothing.

create table if not exists public.line_links (
  line_user_id   text primary key,
  account_source text not null check (account_source in ('admin_accounts', 'company_users', 'tools_users')),
  account_id     text not null,
  username       text not null,
  company_id     text not null,
  linked_at      timestamptz not null default now(),
  last_seen_at   timestamptz
);

create index if not exists line_links_account_idx on public.line_links (account_source, account_id);

-- One-time codes the bot hands out; the link page exchanges one for a line_links row.
create table if not exists public.line_link_codes (
  code         text primary key,
  line_user_id text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists line_link_codes_user_idx on public.line_link_codes (line_user_id);

alter table public.line_links enable row level security;
alter table public.line_link_codes enable row level security;

revoke all on public.line_links from anon, authenticated;
revoke all on public.line_link_codes from anon, authenticated;

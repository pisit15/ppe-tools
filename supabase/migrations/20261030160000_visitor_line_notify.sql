-- LINE group notifications for visitor requests (owner decision 30 Oct 2026): each company has its own
-- LINE group; the EA HSE Center OA is invited there, the webhook records the group, and SHE picks it in
-- /visitor/settings. Pushes are logged so quota use is visible.

create table public.line_groups (
  group_id text primary key check (group_id ~ '^[CR][0-9a-f]{32}$'),
  group_name text not null default '',
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_event_at timestamptz not null default now()
);
alter table public.line_groups enable row level security;
revoke all on public.line_groups from public, anon, authenticated, service_role;
grant select, insert, update on public.line_groups to service_role;

alter table public.visitor_company_options
  add column line_group_id text references public.line_groups(group_id),
  add column notify_new boolean not null default true,
  add column notify_decision boolean not null default true;

create table public.visitor_notify_log (
  id bigint generated always as identity primary key,
  company_id text not null,
  request_id uuid references public.visitor_requests(id) on delete set null,
  kind text not null check (kind in ('new_request','decision','test')),
  group_id text not null,
  http_status integer,
  error text,
  sent_at timestamptz not null default now()
);
create index visitor_notify_log_company on public.visitor_notify_log(company_id, sent_at desc);
alter table public.visitor_notify_log enable row level security;
revoke all on public.visitor_notify_log from public, anon, authenticated, service_role;
grant select, insert on public.visitor_notify_log to service_role;
grant usage, select on sequence public.visitor_notify_log_id_seq to service_role;

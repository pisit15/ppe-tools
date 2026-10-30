-- Visitor access requests: employees submit via a secret per-company link (no login),
-- the SHE team screens/approves in /visitor, and the guard post board (/visitor/board/<company>)
-- is public by decision of the owner (30 Oct 2026). Jotform 241632326118046 keeps running in parallel.

create table public.visitor_links (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  label text not null default '' check (length(label) <= 80),
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);
create index visitor_links_company on public.visitor_links(company_id, created_at desc);

create table public.visitor_counters (
  company_id text not null references public.company_settings(company_id),
  period text not null check (period ~ '^[0-9]{4}$'),
  last_no integer not null default 0,
  primary key (company_id, period)
);

create table public.visitor_requests (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  request_no text not null,
  track_code text not null unique check (track_code ~ '^[A-Za-z0-9_-]{16,64}$'),
  link_id uuid references public.visitor_links(id),
  status text not null default 'submitted'
    check (status in ('submitted','need_info','approved','rejected','cancelled')),
  informer_name text not null check (length(btrim(informer_name)) between 1 and 120),
  informer_employee_code text not null check (length(btrim(informer_employee_code)) between 1 and 40),
  informer_phone text not null check (length(btrim(informer_phone)) between 6 and 30),
  informer_department text not null check (length(btrim(informer_department)) between 1 and 80),
  visitor_company text not null check (length(btrim(visitor_company)) between 1 and 160),
  arrival_date date not null,
  time_from time not null,
  time_to time not null,
  purpose text not null check (length(btrim(purpose)) between 1 and 80),
  purpose_other text not null default '' check (length(purpose_other) <= 200),
  work_areas text[] not null default '{}',
  work_area_detail text not null default '' check (length(work_area_detail) <= 500),
  has_permit text not null default 'unknown' check (has_permit in ('yes','no','unknown')),
  permit_ref text not null default '' check (length(permit_ref) <= 80),
  note text not null default '' check (length(note) <= 1000),
  decision_note text not null default '' check (length(decision_note) <= 1000),
  conditions text not null default '' check (length(conditions) <= 1000),
  decided_by text,
  decided_at timestamptz,
  source text not null default 'web' check (source in ('web','jotform','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (time_to > time_from),
  unique (company_id, request_no)
);
create index visitor_requests_company_date on public.visitor_requests(company_id, arrival_date desc, created_at desc);
create index visitor_requests_status on public.visitor_requests(company_id, status, created_at desc);

create table public.visitor_persons (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.visitor_requests(id) on delete cascade,
  seq integer not null check (seq > 0),
  name text not null check (length(btrim(name)) between 1 and 120),
  detail text not null default '' check (length(detail) <= 120),
  arrived_at timestamptz,
  left_at timestamptz,
  unique (request_id, seq)
);

create table public.visitor_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.visitor_requests(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('submitted','approved','rejected','need_info','resubmitted','cancelled','arrived','left','undo_arrived','undo_left')),
  note text not null default ''
);
create index visitor_events_request on public.visitor_events(request_id, at);

-- Per-company running number: VR-<yymm>-<nnn>
create function public.visitor_next_request_no(p_company text, p_period text)
returns text language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  insert into visitor_counters(company_id, period, last_no) values (p_company, p_period, 1)
  on conflict (company_id, period) do update set last_no = visitor_counters.last_no + 1
  returning last_no into n;
  return 'VR-' || p_period || '-' || lpad(n::text, 3, '0');
end; $$;
revoke all on function public.visitor_next_request_no(text, text) from public, anon, authenticated;
grant execute on function public.visitor_next_request_no(text, text) to service_role;

create function public.visitor_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger visitor_requests_touch before update on public.visitor_requests for each row execute function public.visitor_touch();
revoke all on function public.visitor_touch() from public, anon, authenticated;
grant execute on function public.visitor_touch() to service_role;

alter table public.visitor_links enable row level security;
alter table public.visitor_counters enable row level security;
alter table public.visitor_requests enable row level security;
alter table public.visitor_persons enable row level security;
alter table public.visitor_events enable row level security;
revoke all on public.visitor_links, public.visitor_counters, public.visitor_requests, public.visitor_persons, public.visitor_events
  from public, anon, authenticated, service_role;
grant select, insert, update on public.visitor_links to service_role;
grant select, insert, update on public.visitor_counters to service_role;
grant select, insert, update on public.visitor_requests to service_role;
grant select, insert, update, delete on public.visitor_persons to service_role;
grant select, insert on public.visitor_events to service_role;
grant usage, select on sequence public.visitor_events_id_seq to service_role;

-- Home card
alter table public.tools_home_cards drop constraint tools_home_cards_id_check;
alter table public.tools_home_cards add constraint tools_home_cards_id_check
  check (id in ('ppe','chemical','permit','inspection','she-workforce','procurement','visitor'));
insert into public.tools_home_cards (id, name, description, is_visible) values
  ('visitor', 'Visitor Access', 'ขออนุญาตบุคคลภายนอกเข้าพื้นที่ คัดกรอง-อนุมัติโดยทีม SHE และจอรายชื่อสำหรับป้อม รปภ', true)
on conflict (id) do nothing;

comment on table public.visitor_requests is 'Visitor/contractor access requests. Public submit via visitor_links token; SHE approves; guard board public per company.';

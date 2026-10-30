-- Vehicles that a visitor group wants to bring inside the plant. Policy per purpose lives in
-- src/lib/visitor/constants.ts (VEHICLE_POLICY): allowed by default, conditional (SHE decides per
-- vehicle, requester must give a reason), or not allowed (question hidden on the form).
create table public.visitor_vehicles (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.visitor_requests(id) on delete cascade,
  seq integer not null check (seq > 0),
  plate text not null check (length(btrim(plate)) between 1 and 40),
  province text not null default '' check (length(province) <= 40),
  vehicle_type text not null default '' check (length(vehicle_type) <= 40),
  reason text not null default '' check (length(reason) <= 500),
  decision text not null default 'pending' check (decision in ('allowed','pending','outside')),
  decided_by text,
  decided_at timestamptz,
  unique (request_id, seq)
);
alter table public.visitor_vehicles enable row level security;
revoke all on public.visitor_vehicles from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.visitor_vehicles to service_role;

alter table public.visitor_events drop constraint visitor_events_action_check;
alter table public.visitor_events add constraint visitor_events_action_check check (action in (
  'submitted','approved','rejected','need_info','resubmitted','cancelled',
  'arrived','left','undo_arrived','undo_left','no_show','undo_no_show','guard_added','vehicle_decision'
));

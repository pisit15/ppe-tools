-- Private extensions to the shared workforce registry. No sample personnel or
-- assessment data are seeded. Access only via guarded superadmin server routes.
create table public.team_member_profiles (
  person_id uuid primary key references public.she_personnel(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table public.team_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.she_personnel(id) on delete restrict,
  cycle text not null check (length(cycle) between 1 and 100),
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique(person_id, cycle)
);
create unique index team_member_one_user on public.team_member_profiles
  ((payload->>'user_source'),(payload->>'user_id')) where coalesce(payload->>'user_id','')<>'';
create table public.team_management_history (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
alter table public.team_member_profiles enable row level security;
alter table public.team_performance_reviews enable row level security;
alter table public.team_management_history enable row level security;
revoke all on public.team_member_profiles, public.team_performance_reviews, public.team_management_history from public, anon, authenticated;
grant select, insert, update on public.team_member_profiles, public.team_performance_reviews to service_role;
grant select, insert on public.team_management_history to service_role;
grant usage, select on sequence public.team_management_history_id_seq to service_role;

-- Invoker, never SECURITY DEFINER. A single transaction changes core fields,
-- extension metadata and audit history. Optimistic revisions prevent lost edits.
create function public.save_team_member(p_member jsonb, p_profile jsonb, p_actor text, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id uuid := (p_member->>'id')::uuid;
  v_old she_personnel%rowtype;
  v_profile team_member_profiles%rowtype;
  v_revision integer;
  v_next uuid;
  v_seen uuid[];
  v_field text;
  v_payload jsonb;
begin
  -- Serialize reporting-graph mutations so concurrent A->B and B->A cannot pass.
  perform pg_advisory_xact_lock(hashtext('team-reporting-graph'));
  select * into v_old from she_personnel where id = v_id for update;
  select * into v_profile from team_member_profiles where person_id = v_id for update;
  if coalesce(v_profile.revision, 0) <> (p_profile->>'revision')::integer then
    raise exception 'TEAM_CONFLICT';
  end if;
  if v_old.id is not null and (p_expected_updated_at is null or v_old.updated_at is distinct from p_expected_updated_at) then
    raise exception 'TEAM_CONFLICT';
  end if;
  if v_old.id is null and p_expected_updated_at is not null then raise exception 'TEAM_CONFLICT'; end if;
  foreach v_field in array array['direct_manager','functional_manager'] loop
    v_next := nullif(p_profile->>v_field,'')::uuid;
    v_seen := array[v_id];
    while v_next is not null loop
      if v_next = any(v_seen) then raise exception 'TEAM_CYCLE'; end if;
      if not exists(select 1 from she_personnel where id=v_next) then raise exception 'TEAM_MANAGER_MISSING'; end if;
      v_seen := array_append(v_seen,v_next);
      select nullif(payload->>v_field,'')::uuid into v_next from team_member_profiles where person_id=v_next;
    end loop;
  end loop;
  insert into she_personnel (id, company_id, full_name, nick_name, bu, position, department,
    responsibility, phone, email, employment_type, is_active, is_she_team, updated_at)
  values (v_id, p_member->>'company_id', p_member->>'full_name', p_member->>'nick_name',
    p_member->>'bu', p_member->>'position', p_member->>'department', p_member->>'responsibility',
    p_member->>'phone',p_member->>'email',p_member->>'employment_type',
    p_profile->>'status'='working', (p_profile->'teams') ? 'SHE', now())
  on conflict(id) do update set company_id=excluded.company_id, full_name=excluded.full_name,
    nick_name=excluded.nick_name, bu=excluded.bu, position=excluded.position, department=excluded.department,
    responsibility=excluded.responsibility, phone=excluded.phone, email=excluded.email,
    employment_type=excluded.employment_type, is_active=excluded.is_active, is_she_team=excluded.is_she_team, updated_at=now();
  v_revision := coalesce(v_profile.revision,0)+1;
  v_payload := (p_profile - 'revision' - 'person_id') || jsonb_build_object('revision',v_revision,'person_id',v_id);
  insert into team_member_profiles(person_id,revision,payload,updated_by)
    values(v_id,v_revision,v_payload,p_actor)
    on conflict(person_id) do update set revision=excluded.revision,payload=excluded.payload,updated_by=p_actor,updated_at=now();
  insert into team_management_history(entity,entity_id,before_data,after_data,changed_by)
    values('member',v_id,jsonb_build_object('member',to_jsonb(v_old),'profile',v_profile.payload),jsonb_build_object('member',p_member,'profile',v_payload),p_actor);
  return v_payload;
end $$;
revoke all on function public.save_team_member(jsonb,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_team_member(jsonb,jsonb,text,timestamptz) to service_role;

create function public.save_team_review(p_review jsonb,p_actor text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_old team_performance_reviews%rowtype;
  v_id uuid := (p_review->>'id')::uuid;
  v_revision integer;
  v_payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('team-review:'||(p_review->>'person_id')||':'||(p_review->>'cycle')));
  select * into v_old from team_performance_reviews where person_id=(p_review->>'person_id')::uuid and cycle=p_review->>'cycle' for update;
  if coalesce(v_old.revision,0)<>(p_review->>'revision')::integer or (v_old.id is not null and v_old.id<>v_id) then raise exception 'TEAM_CONFLICT'; end if;
  if v_old.payload->>'state'='final' then raise exception 'TEAM_REVIEW_LOCKED'; end if;
  if exists(select 1 from team_performance_reviews where id=v_id and (person_id<>(p_review->>'person_id')::uuid or cycle<>p_review->>'cycle')) then raise exception 'TEAM_CONFLICT'; end if;
  if v_old.id is not null and (v_old.payload->'weights' is distinct from p_review->'weights' or v_old.payload->>'family' is distinct from p_review->>'family') then raise exception 'TEAM_CONFLICT'; end if;
  v_revision := coalesce(v_old.revision,0)+1;
  v_payload := (p_review-'revision') || jsonb_build_object('revision',v_revision);
  insert into team_performance_reviews(id,person_id,cycle,revision,payload,updated_by)
    values(v_id,(p_review->>'person_id')::uuid,p_review->>'cycle',v_revision,v_payload,p_actor)
    on conflict(id) do update set payload=excluded.payload,revision=excluded.revision,updated_by=p_actor,updated_at=now();
  insert into team_management_history(entity,entity_id,before_data,after_data,changed_by)
    values('review',v_id,v_old.payload,v_payload,p_actor);
  return v_payload;
end $$;
revoke all on function public.save_team_review(jsonb,text) from public, anon, authenticated;
grant execute on function public.save_team_review(jsonb,text) to service_role;

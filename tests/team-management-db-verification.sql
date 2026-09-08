begin;
set local statement_timeout='15s';
create schema codex_team_verify;
create table codex_team_verify.she_personnel (
id uuid primary key, company_id text, full_name text, nick_name text, bu text, position text, department text, responsibility text, phone text, email text, employment_type text, is_active boolean, is_she_team boolean, updated_at timestamptz default now()
);
-- Private extensions to the shared workforce registry. No sample personnel or
-- assessment data are seeded. Access only via guarded superadmin server routes.
create table codex_team_verify.team_member_profiles (
  person_id uuid primary key references codex_team_verify.she_personnel(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table codex_team_verify.team_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references codex_team_verify.she_personnel(id) on delete restrict,
  cycle text not null check (length(cycle) between 1 and 100),
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique(person_id, cycle)
);
create unique index team_member_one_user on codex_team_verify.team_member_profiles
  ((payload->>'user_source'),(payload->>'user_id')) where coalesce(payload->>'user_id','')<>'';
create table codex_team_verify.team_management_history (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
alter table codex_team_verify.team_member_profiles enable row level security;
alter table codex_team_verify.team_performance_reviews enable row level security;
alter table codex_team_verify.team_management_history enable row level security;
revoke all on codex_team_verify.team_member_profiles, codex_team_verify.team_performance_reviews, codex_team_verify.team_management_history from public, anon, authenticated;
grant select, insert, update on codex_team_verify.team_member_profiles, codex_team_verify.team_performance_reviews to service_role;
grant select, insert on codex_team_verify.team_management_history to service_role;
grant usage, select on sequence codex_team_verify.team_management_history_id_seq to service_role;

-- Invoker, never SECURITY DEFINER. A single transaction changes core fields,
-- extension metadata and audit history. Optimistic revisions prevent lost edits.
create function codex_team_verify.save_team_member(p_member jsonb, p_profile jsonb, p_actor text, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = codex_team_verify, pg_temp as $$
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
revoke all on function codex_team_verify.save_team_member(jsonb,jsonb,text,timestamptz) from public, anon, authenticated;
grant execute on function codex_team_verify.save_team_member(jsonb,jsonb,text,timestamptz) to service_role;

create function codex_team_verify.save_team_review(p_review jsonb,p_actor text)
returns jsonb language plpgsql security invoker set search_path = codex_team_verify, pg_temp as $$
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
revoke all on function codex_team_verify.save_team_review(jsonb,text) from public, anon, authenticated;
grant execute on function codex_team_verify.save_team_review(jsonb,text) to service_role;


grant usage on schema codex_team_verify to service_role;
grant select,insert,update on codex_team_verify.she_personnel to service_role;
set local role service_role;
do $test$
declare
a uuid := '11111111-1111-4111-8111-111111111111';
b uuid := '22222222-2222-4222-8222-222222222222';
m jsonb; p jsonb; t timestamptz; result jsonb; r jsonb;
begin
m:=jsonb_build_object('id',a,'company_id','test','full_name','Synthetic A','employment_type','permanent');
p:=jsonb_build_object('person_id',a,'revision',0,'status','working','teams',jsonb_build_array('SHE'),'direct_manager','','functional_manager','');
result:=codex_team_verify.save_team_member(m,p,'test',null);
if (result->>'revision')::int<>1 then raise exception 'revision assertion';end if;
begin perform codex_team_verify.save_team_member(m,p,'test',null); raise exception 'conflict missing';
exception when others then if SQLERRM<>'TEAM_CONFLICT' then raise;end if;end;
perform codex_team_verify.save_team_member(m||jsonb_build_object('id',b,'full_name','Synthetic B'),p||jsonb_build_object('person_id',b,'direct_manager',a),'test',null);
select updated_at into t from codex_team_verify.she_personnel where id=a;
begin perform codex_team_verify.save_team_member(m,p||jsonb_build_object('revision',1,'direct_manager',b),'test',t); raise exception 'cycle missing';
exception when others then if SQLERRM<>'TEAM_CYCLE' then raise;end if;end;
if exists(select 1 from codex_team_verify.team_member_profiles where person_id=a and revision<>1) then raise exception 'failed save changed revision';end if;
r:=jsonb_build_object('id','33333333-3333-4333-8333-333333333333','person_id',a,'cycle','2026','revision',0,'family','F2','weights',jsonb_build_array(30,35,20,15),'state','draft');
result:=codex_team_verify.save_team_review(r,'test');
if (result->>'revision')::int<>1 then raise exception 'review revision assertion';end if;
result:=codex_team_verify.save_team_review(r||jsonb_build_object('revision',1,'state','final'),'test');
begin perform codex_team_verify.save_team_review(r||jsonb_build_object('revision',2),'test'); raise exception 'final lock missing';
exception when others then if SQLERRM<>'TEAM_REVIEW_LOCKED' then raise;end if;end;
if (select count(*) from codex_team_verify.team_management_history)<>4 then raise exception 'audit count assertion';end if;
if has_table_privilege('anon','codex_team_verify.team_performance_reviews','select') then raise exception 'anon exposure';end if;
if has_table_privilege('authenticated','codex_team_verify.team_performance_reviews','select') then raise exception 'authenticated exposure';end if;
end $test$;
reset role;
select 'PASS: transaction, revisions, cycle prevention, final lock, audit and private grants' as result;
rollback;

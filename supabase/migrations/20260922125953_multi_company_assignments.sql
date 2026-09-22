-- Assignments extend the private, revisioned profile JSON. No personnel rows are
-- backfilled and no new privileges are granted to browser roles.
create or replace function public.validate_team_assignments(p_member jsonb, p_profile jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id text := p_member->>'id';
  v_old jsonb;
  v_assignments jsonb;
  v_all jsonb;
  v_lookup jsonb;
  v_role jsonb;
  v_previous jsonb;
  v_manager jsonb;
  v_field text;
  v_next text;
  v_seen text[];
  v_date text;
begin
  -- Same lock as save_team_member: cross-person A->B / B->A saves serialize.
  perform pg_advisory_xact_lock(hashtext('team-reporting-graph'));
  select payload into v_old from team_member_profiles where person_id=v_id::uuid;
  if v_old ? 'assignments' and not (p_profile ? 'assignments') then
    raise exception 'TEAM_ASSIGNMENT_CONFLICT';
  end if;
  if p_profile ? 'assignments' then
    if p_profile->>'assignment_version' is distinct from '1'
      or jsonb_typeof(p_profile->'assignments') is distinct from 'array' then
      raise exception 'TEAM_ASSIGNMENT_FORMAT';
    end if;
    v_assignments := p_profile->'assignments';
    if jsonb_array_length(v_assignments) not between 1 and 100 then raise exception 'TEAM_ASSIGNMENT_LIMIT'; end if;
    for v_role in select value from jsonb_array_elements(v_assignments) loop
      if jsonb_typeof(v_role) is distinct from 'object'
        or coalesce(v_role->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(v_role->>'kind','') not in ('primary','acting','additional') then raise exception 'TEAM_ASSIGNMENT_FORMAT'; end if;
      foreach v_field in array array['company_id','position','start_date','end_date','direct_manager','functional_manager'] loop
        if jsonb_typeof(v_role->v_field) is distinct from 'string' or length(v_role->>v_field)>(case when v_field='position' then 2000 else 100 end) then
          raise exception 'TEAM_ASSIGNMENT_FORMAT';
        end if;
      end loop;
      if not exists(select 1 from company_settings where company_id=v_role->>'company_id') then raise exception 'TEAM_ASSIGNMENT_COMPANY'; end if;
      if v_role->>'kind'='primary' then
        if v_role->>'id'<>v_id or v_role->>'company_id' is distinct from p_member->>'company_id'
          or v_role->>'position' is distinct from p_member->>'position'
          or v_role->>'start_date'<>'' or v_role->>'end_date'<>'' then raise exception 'TEAM_ASSIGNMENT_PRIMARY'; end if;
      elsif v_role->>'id'=v_id or btrim(v_role->>'position')='' or v_role->>'start_date'='' then
        raise exception 'TEAM_ASSIGNMENT_DETAILS';
      end if;
      foreach v_field in array array['start_date','end_date'] loop
        v_date := v_role->>v_field;
        if v_date<>'' and (v_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(v_date::date,'YYYY-MM-DD')<>v_date) then raise exception 'TEAM_ASSIGNMENT_DATE'; end if;
      end loop;
      if v_role->>'end_date'<>'' and (v_role->>'start_date'='' or v_role->>'end_date'<v_role->>'start_date') then raise exception 'TEAM_ASSIGNMENT_DATE'; end if;
      foreach v_field in array array['x','y'] loop
        if not (v_role ? v_field) then raise exception 'TEAM_ASSIGNMENT_POSITION'; end if;
        if v_role->v_field<>'null'::jsonb then
          if jsonb_typeof(v_role->v_field)<>'number' then raise exception 'TEAM_ASSIGNMENT_POSITION'; end if;
          if (v_role->>v_field)::numeric not between 0 and 20000 then raise exception 'TEAM_ASSIGNMENT_POSITION'; end if;
        end if;
      end loop;
    end loop;
    if (select count(*) from jsonb_array_elements(v_assignments) a where a->>'kind'='primary')<>1 then raise exception 'TEAM_ASSIGNMENT_PRIMARY'; end if;
    for v_previous in select value from jsonb_array_elements(coalesce(v_old->'assignments','[]'::jsonb)) loop
      select value into v_role from jsonb_array_elements(v_assignments) where value->>'id'=v_previous->>'id';
      if v_role is null then raise exception 'TEAM_ASSIGNMENT_HISTORY'; end if;
      if v_role->>'kind' is distinct from v_previous->>'kind' or
        (v_previous->>'kind'<>'primary' and v_role->>'company_id' is distinct from v_previous->>'company_id') then raise exception 'TEAM_ASSIGNMENT_IDENTITY'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(v_assignments) with ordinality a(role,n)
      join jsonb_array_elements(v_assignments) with ordinality b(role,n) on a.n<b.n
      where a.role->>'company_id'=b.role->>'company_id' and a.role->>'kind'=b.role->>'kind'
        and lower(btrim(a.role->>'position'))=lower(btrim(b.role->>'position'))
        and coalesce(nullif(a.role->>'start_date',''),'0000')<=coalesce(nullif(b.role->>'end_date',''),'9999')
        and coalesce(nullif(b.role->>'start_date',''),'0000')<=coalesce(nullif(a.role->>'end_date',''),'9999')) then raise exception 'TEAM_ASSIGNMENT_OVERLAP'; end if;
  else
    -- Legacy profiles retain their original primary-role reporting references.
    v_assignments := jsonb_build_array(jsonb_build_object('id',v_id,'direct_manager',coalesce(p_profile->>'direct_manager',''),'functional_manager',coalesce(p_profile->>'functional_manager','')));
  end if;

  with candidate as (
    select s.id::text as person_id, pr.payload
      from she_personnel s left join team_member_profiles pr on pr.person_id=s.id where s.id<>v_id::uuid
    union all select v_id, p_profile
  ), roles as (
    select a.value || jsonb_build_object('person_id',c.person_id) as role from candidate c
    cross join lateral jsonb_array_elements(coalesce(c.payload->'assignments',jsonb_build_array(jsonb_build_object(
      'id',c.person_id,'direct_manager',coalesce(c.payload->>'direct_manager',''),'functional_manager',coalesce(c.payload->>'functional_manager',''))))) a
  ) select jsonb_agg(role), jsonb_object_agg(role->>'id',role) into v_all,v_lookup from roles;
  if jsonb_array_length(v_all)<>(select count(*) from jsonb_object_keys(v_lookup)) then raise exception 'TEAM_ASSIGNMENT_DUPLICATE'; end if;
  for v_role in select value from jsonb_array_elements(v_assignments) loop
    foreach v_field in array array['direct_manager','functional_manager'] loop
      v_next := nullif(v_role->>v_field,'');
      if v_next is not null then
        v_manager := v_lookup->v_next;
        if v_manager is null then raise exception 'TEAM_ASSIGNMENT_MANAGER_MISSING'; end if;
        if v_manager->>'person_id'=v_id then raise exception 'TEAM_ASSIGNMENT_SELF'; end if;
      end if;
      v_seen := array[v_role->>'id'];
      while v_next is not null loop
        if v_next=any(v_seen) then raise exception 'TEAM_CYCLE'; end if;
        v_seen := array_append(v_seen,v_next);
        v_next := nullif(v_lookup->v_next->>v_field,'');
      end loop;
    end loop;
  end loop;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'TEAM_ASSIGNMENT_DATE';
end $$;
revoke all on function public.validate_team_assignments(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.validate_team_assignments(jsonb,jsonb) to service_role;

create or replace function public.save_team_member(p_member jsonb, p_profile jsonb, p_actor text, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id uuid := (p_member->>'id')::uuid;
  v_old she_personnel%rowtype;
  v_profile team_member_profiles%rowtype;
  v_revision integer;
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
  perform public.validate_team_assignments(p_member,p_profile);
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


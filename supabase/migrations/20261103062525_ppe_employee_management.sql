-- Current personnel profiles are separate from historical transaction snapshots.
alter table public.ppe_employees
  add column revision integer not null default 1 check (revision > 0),
  add column updated_at timestamptz not null default now();

create table public.ppe_employee_changes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.ppe_employees(id) on delete restrict,
  company_id text not null,
  action text not null check (action in ('create','update','deactivate','reactivate','department_rename')),
  actor text not null,
  actor_name text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index ppe_employee_changes_employee_idx on public.ppe_employee_changes(employee_id,created_at desc);
create index ppe_employee_changes_company_idx on public.ppe_employee_changes(company_id,created_at desc);
alter table public.ppe_employee_changes enable row level security;
revoke all on public.ppe_employee_changes from public,anon,authenticated,service_role;
grant select,insert on public.ppe_employee_changes to service_role;

-- Only verified server callers can execute these functions; database validation
-- repeats the manager/company checks inside the same transaction as each write.
create function public.ppe_employee_manager(p_actor_table text,p_actor_id text,p_company text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;
begin
  case p_actor_table
    when 'company_users' then select to_jsonb(x) into a from public.company_users x where id::text=p_actor_id and is_active;
    when 'tools_users' then select to_jsonb(x) into a from public.tools_users x where id::text=p_actor_id and is_active;
    when 'admin_accounts' then select to_jsonb(x) into a from public.admin_accounts x where id::text=p_actor_id and is_active;
    else raise exception 'เฉพาะผู้ดูแล PPE';
  end case;
  if a is null or p_company is null or p_company in ('','all','admin') then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if p_actor_table<>'admin_accounts' and (a->>'company_id') is distinct from p_company then raise exception 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้'; end if;
  if p_actor_table<>'admin_accounts' and jsonb_typeof(a->'allowed_modules')='array' and jsonb_array_length(a->'allowed_modules')>0 and not (a->'allowed_modules' ? 'ppe') then raise exception 'ไม่มีสิทธิ์ใช้งาน PPE'; end if;
  return jsonb_build_object('actor',p_actor_table||':'||p_actor_id,'name',coalesce(nullif(a->>'display_name',''),a->>'username',p_actor_table||':'||p_actor_id));
end $$;

create function public.ppe_employee_write(p_actor_table text,p_actor_id text,p_company text,
  p_employee_id uuid,p_expected_revision integer,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; old_row public.ppe_employees; new_row public.ppe_employees; k text; action_name text;
begin
  a := public.ppe_employee_manager(p_actor_table,p_actor_id,p_company);
  if jsonb_typeof(p_changes) is distinct from 'object' then raise exception 'ข้อมูลพนักงานไม่ถูกต้อง'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('employee_code','name','position','department','is_active') then raise exception 'ข้อมูลพนักงานไม่ถูกต้อง'; end if;
    if k='is_active' then
      if jsonb_typeof(p_changes->k) is distinct from 'boolean' then raise exception 'สถานะไม่ถูกต้อง'; end if;
    elsif jsonb_typeof(p_changes->k) is distinct from 'string' then raise exception 'ข้อมูลพนักงานต้องเป็นข้อความ';
    end if;
  end loop;
  if p_employee_id is null then
    if length(btrim(coalesce(p_changes->>'employee_code',''))) not between 1 and 100 or length(btrim(coalesce(p_changes->>'name',''))) not between 1 and 150 then raise exception 'กรุณาระบุรหัสพนักงานและชื่อให้ถูกต้อง'; end if;
    perform pg_advisory_xact_lock(hashtextextended('ppe_employee:'||p_company||':'||lower(btrim(p_changes->>'employee_code')),0));
    if exists(select 1 from public.ppe_employees where company_id=p_company and lower(employee_code)=lower(btrim(p_changes->>'employee_code'))) then raise exception 'รหัสพนักงานนี้มีอยู่แล้ว รวมถึงรายชื่อที่ปิดใช้งาน'; end if;
    if exists(select 1 from public.ppe_transactions where company_id=p_company and lower(employee_code)=lower(btrim(p_changes->>'employee_code'))) then raise exception 'รหัสนี้มีประวัติเดิม กรุณาตรวจสอบรายชื่อก่อนสร้างใหม่'; end if;
    if length(coalesce(p_changes->>'position',''))>150 or length(coalesce(p_changes->>'department',''))>150 then raise exception 'ตำแหน่งหรือแผนกต้องไม่เกิน 150 ตัวอักษร'; end if;
    insert into public.ppe_employees(company_id,employee_code,name,position,department,is_active)
      values(p_company,btrim(p_changes->>'employee_code'),btrim(p_changes->>'name'),btrim(coalesce(p_changes->>'position','')),btrim(coalesce(p_changes->>'department','')),coalesce((p_changes->>'is_active')::boolean,true)) returning * into new_row;
    action_name := 'create';
  else
    select * into old_row from public.ppe_employees where id=p_employee_id and company_id=p_company for update;
    if not found then raise exception 'ไม่พบพนักงานในบริษัทนี้'; end if;
    if p_expected_revision is distinct from old_row.revision then raise exception 'ข้อมูลมีการแก้ไขแล้ว กรุณารีเฟรชและตรวจสอบก่อนบันทึก'; end if;
    if p_changes ? 'employee_code' and (p_changes->>'employee_code') is distinct from old_row.employee_code then raise exception 'ไม่สามารถเปลี่ยนรหัสพนักงาน เพื่อรักษาการเชื่อมโยงประวัติเดิม'; end if;
    new_row := old_row;
    if p_changes ? 'name' then new_row.name := btrim(p_changes->>'name'); end if;
    if p_changes ? 'position' then new_row.position := btrim(p_changes->>'position'); end if;
    if p_changes ? 'department' then new_row.department := btrim(p_changes->>'department'); end if;
    if p_changes ? 'is_active' then new_row.is_active := (p_changes->>'is_active')::boolean; end if;
    if length(new_row.name) not between 1 and 150 or length(coalesce(new_row.position,''))>150 or length(coalesce(new_row.department,''))>150 then raise exception 'ชื่อ ตำแหน่ง หรือแผนกไม่ถูกต้อง'; end if;
    if new_row is not distinct from old_row then return to_jsonb(old_row); end if;
    action_name := case when old_row.is_active is distinct from new_row.is_active then case when new_row.is_active then 'reactivate' else 'deactivate' end else 'update' end;
    update public.ppe_employees set name=new_row.name,position=new_row.position,department=new_row.department,is_active=new_row.is_active,revision=revision+1,updated_at=now()
      where id=old_row.id returning * into new_row;
  end if;
  insert into public.ppe_employee_changes(employee_id,company_id,action,actor,actor_name,before_data,after_data)
    values(new_row.id,p_company,action_name,a->>'actor',a->>'name',case when p_employee_id is null then null else to_jsonb(old_row) end,to_jsonb(new_row));
  return to_jsonb(new_row);
end $$;

create function public.ppe_employee_impact(p_actor_table text,p_actor_id text,p_company text,p_employee_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.ppe_employees; accounts jsonb; request_count bigint; borrow_count bigint;
begin
  perform public.ppe_employee_manager(p_actor_table,p_actor_id,p_company);
  select * into e from public.ppe_employees where id=p_employee_id and company_id=p_company;
  if not found then raise exception 'ไม่พบพนักงานในบริษัทนี้'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'display_name',display_name,'is_active',is_active) order by username),'[]'::jsonb)
    into accounts from public.ppe_requesters where company_id=p_company and employee_code=e.employee_code;
  select count(*) into request_count from public.ppe_requests r join public.ppe_requesters u on u.id=r.requester_id and u.company_id=r.company_id
    where r.company_id=p_company and u.employee_code=e.employee_code and r.status in ('pending','approved','ready');
  -- Returns are not linked to individual loans in the legacy schema. Count loan
  -- records only and explicitly avoid presenting this as an outstanding balance.
  select count(*) into borrow_count from public.ppe_transactions where company_id=p_company and employee_code=e.employee_code and transaction_type='borrow';
  return jsonb_build_object('employee',to_jsonb(e),'requester_accounts',accounts,'open_request_count',request_count,'borrow_record_count',borrow_count);
end $$;

create function public.ppe_department_rename(p_actor_table text,p_actor_id text,p_company text,
  p_department_id bigint,p_expected_name text,p_name text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; d public.ppe_departments; e public.ppe_employees; updated_employee public.ppe_employees; moved integer:=0;
begin
  a := public.ppe_employee_manager(p_actor_table,p_actor_id,p_company);
  if p_name is null or length(btrim(p_name)) not between 1 and 150 then raise exception 'ชื่อแผนกไม่ถูกต้อง'; end if;
  select * into d from public.ppe_departments where id=p_department_id and company_id=p_company and is_active for update;
  if not found then raise exception 'ไม่พบแผนกในบริษัทนี้'; end if;
  if d.name is distinct from p_expected_name then raise exception 'ชื่อแผนกมีการแก้ไขแล้ว กรุณารีเฟรชก่อนบันทึก'; end if;
  if d.name=btrim(p_name) then return jsonb_build_object('data',to_jsonb(d),'cascaded',jsonb_build_object('employees',0,'transactions',0)); end if;
  if exists(select 1 from public.ppe_departments where company_id=p_company and lower(name)=lower(btrim(p_name)) and id<>d.id) then raise exception 'มีชื่อแผนกนี้อยู่แล้ว'; end if;
  for e in select * from public.ppe_employees where company_id=p_company and department=d.name order by id for update loop
    update public.ppe_employees set department=btrim(p_name),revision=revision+1,updated_at=now() where id=e.id returning * into updated_employee;
    insert into public.ppe_employee_changes(employee_id,company_id,action,actor,actor_name,before_data,after_data)
      values(e.id,p_company,'department_rename',a->>'actor',a->>'name',to_jsonb(e),to_jsonb(updated_employee));
    moved := moved+1;
  end loop;
  update public.ppe_departments set name=btrim(p_name),updated_at=now() where id=d.id returning * into d;
  return jsonb_build_object('data',to_jsonb(d),'cascaded',jsonb_build_object('employees',moved,'transactions',0));
end $$;

revoke all on function public.ppe_employee_manager(text,text,text),public.ppe_employee_write(text,text,text,uuid,integer,jsonb),public.ppe_employee_impact(text,text,text,uuid),public.ppe_department_rename(text,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.ppe_employee_manager(text,text,text),public.ppe_employee_write(text,text,text,uuid,integer,jsonb),public.ppe_employee_impact(text,text,text,uuid),public.ppe_department_rename(text,text,text,bigint,text,text) to service_role;

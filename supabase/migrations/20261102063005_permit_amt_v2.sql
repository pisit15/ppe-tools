alter table public.wp_members drop constraint wp_members_role_check;
alter table public.wp_members add constraint wp_members_role_check check(role in ('area_owner','safety','project_manager','permit_admin'));
create table public.wp_locations (
 id uuid primary key default gen_random_uuid(),
 company_id text not null references public.company_settings(company_id),
 name text not null check(length(btrim(name)) between 1 and 200),
 department text not null default '',
 area_owner text not null, safety text not null,
 active boolean not null default true,
 unique(company_id,name), check(area_owner<>safety)
);
alter table public.wp_locations enable row level security;
revoke all on public.wp_locations from public,anon,authenticated,service_role;
grant select,insert,update on public.wp_locations to service_role;
create index wp_permits_company_status on public.wp_permits(company_id,status,created_at desc);
create function public.wp_search_permits(p_company text,p_actor text,p_own boolean,p_query text default '',p_status text default 'all',p_queue text default 'all',p_offset int default 0,p_limit int default 25)
returns jsonb language sql stable security invoker set search_path=public as $$
with scoped as (
 select p.*,case when p.status in ('submitted','approved','active','suspended') and (p.data->>'endsAt')::timestamptz<=now() then 'expired' else p.status end as display_status,
 case when p.status='submitted' then (
   select p.data->'approvers'->>r.role from (
     select v.role,min(f.ord*100+v.ord) as pos from jsonb_array_elements(p.data->'forms') with ordinality f(form,ord)
     cross join lateral jsonb_array_elements_text(f.form->'template'->'config'->'roles') with ordinality v(role,ord) group by v.role
     union all select 'project_manager',10000 where p.data->>'project'='true'
   ) r where not exists(select 1 from jsonb_array_elements(p.data->'signatures') s where s->>'stage'='approve' and s->>'role'=r.role) order by r.pos limit 1
 ) when p.status='approved' then p.data->'approvers'->>'area_owner'
 when p.status='closing' then (select p.data->'approvers'->>r.role from (values('area_owner',1),('safety',2)) r(role,pos) where not exists(select 1 from jsonb_array_elements(p.data->'signatures') s where s->>'stage'='close' and s->>'role'=r.role) order by r.pos limit 1)
 else null end as next_actor
 from public.wp_permits p where p.company_id=p_company and (not p_own or p.created_by=p_actor)
), filtered as (
 select * from scoped p where (p_status='all' or display_status=p_status)
 and (p_query='' or concat_ws(' ',p.id::text,p.data->>'title',p.data->>'location',p.data->>'contractorName') ilike '%'||p_query||'%')
 and (p_queue='all' or (p_queue='mine' and next_actor=p_actor and display_status<>'expired')
 or (p_queue='today' and (p.data->>'startsAt')::timestamptz<date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'+interval '1 day' and (p.data->>'endsAt')::timestamptz>=date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok')
 or (p_queue='due' and p.status in ('submitted','approved','active','suspended') and (p.data->>'endsAt')::timestamptz>now() and (p.data->>'endsAt')::timestamptz<=now()+interval '2 hours')
 or (p_queue='closing' and p.status='closing'))
), paged as (select * from filtered order by created_at desc,id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0))
select jsonb_build_object('data',coalesce((select jsonb_agg((to_jsonb(p)-'display_status'-'next_actor')||jsonb_build_object('data',(p.data-'events'-'attachments'-'signatures'-'inspections')||jsonb_build_object('events','[]'::jsonb,'signatures','[]'::jsonb,'attachments','[]'::jsonb))) from paged p),'[]'::jsonb),
 'total',(select count(*) from filtered),'summary',jsonb_build_object('submitted',(select count(*) from scoped where display_status='submitted'),'active',(select count(*) from scoped where display_status='active'),'attention',(select count(*) from scoped where display_status in ('suspended','expired')),'closed',(select count(*) from scoped where display_status='closed'),'mine',(select count(*) from scoped where next_actor=p_actor and display_status<>'expired'),'due',(select count(*) from scoped where status in ('submitted','approved','active','suspended') and (data->>'endsAt')::timestamptz>now() and (data->>'endsAt')::timestamptz<=now()+interval '2 hours'),'closing',(select count(*) from scoped where status='closing')));
$$;
revoke all on function public.wp_search_permits(text,text,boolean,text,text,text,int,int) from public,anon,authenticated;
grant execute on function public.wp_search_permits(text,text,boolean,text,text,text,int,int) to service_role;
alter table public.wp_templates add column reviewed_by text,add column reviewed_at timestamptz;
grant update(reviewed_by,reviewed_at) on public.wp_templates to service_role;
create unique index wp_one_active_template on public.wp_templates(company_id,code) where active;
create function public.wp_set_template_active(p_company text,p_id uuid,p_active boolean,p_reviewer text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target wp_templates;
begin
 select * into target from wp_templates where company_id=p_company and id=p_id;
 if not found then raise exception 'Template not found';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company||':'||target.code,0));
 if p_active then update wp_templates set active=false where company_id=p_company and code=target.code and active and id<>p_id;end if;
 update wp_templates set active=p_active,reviewed_by=p_reviewer,reviewed_at=now() where company_id=p_company and id=p_id returning * into target;
 return to_jsonb(target);
end;$$;
revoke all on function public.wp_set_template_active(text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.wp_set_template_active(text,uuid,boolean,text) to service_role;

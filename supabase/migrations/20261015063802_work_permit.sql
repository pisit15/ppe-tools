-- Dedicated permit identity is deliberately not accepted by the other Tools APIs.
create table public.wp_contractors (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.company_settings(company_id),
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,59}$'), password_hash text not null,
 display_name text not null, contractor_name text not null, starts_at timestamptz not null, expires_at timestamptz not null,
 active boolean not null default true, created_at timestamptz not null default now(), check(expires_at>starts_at)
);
create table public.wp_members (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.company_settings(company_id),
 actor_key text not null, display_name text not null, role text not null check(role in ('area_owner','safety','project_manager')),
 unique(company_id,actor_key,role)
);
create table public.wp_templates (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.company_settings(company_id),
 code text not null, name text not null, revision text not null, version integer not null default 1 check(version>0),
 active boolean not null default false, source_code text, review_note text not null default '', config jsonb not null,
 created_at timestamptz not null default now(), unique(company_id,code,version)
);
create table public.wp_permits (
 id uuid primary key, company_id text not null references public.company_settings(company_id), created_by text not null,
 status text not null default 'draft' check(status in ('draft','submitted','approved','active','suspended','closing','closed','cancelled')),
 version integer not null default 1 check(version>0), data jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jsonb_typeof(data->'events')='array'), check(jsonb_typeof(data->'signatures')='array')
);
create index wp_permits_company_recent on public.wp_permits(company_id,created_at desc);
create index wp_permits_creator on public.wp_permits(created_by,created_at desc);
create table public.wp_login_limits (key text primary key, started_at timestamptz not null, attempts integer not null);
create function public.wp_login_attempt(p_key text) returns boolean language plpgsql security invoker set search_path=public as $$
declare attempts_now integer;
begin
 insert into wp_login_limits(key,started_at,attempts) values(p_key,now(),1)
 on conflict(key) do update set
 attempts=case when wp_login_limits.started_at<now()-interval '15 minutes' then 1 else wp_login_limits.attempts+1 end,
 started_at=case when wp_login_limits.started_at<now()-interval '15 minutes' then now() else wp_login_limits.started_at end
 returning attempts into attempts_now;
 return attempts_now<=10;
end; $$;
revoke all on function public.wp_login_attempt(text) from public,anon,authenticated;
grant execute on function public.wp_login_attempt(text) to service_role;
create function public.wp_guard_permit() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.company_id<>old.company_id or new.created_by<>old.created_by or new.id<>old.id or new.created_at<>old.created_at then raise exception 'Immutable permit identity'; end if;
 if new.version<>old.version+1 then raise exception 'Permit version must increment'; end if;
 if old.status in ('closed','cancelled') then raise exception 'Final permit is immutable'; end if;
 if jsonb_array_length(new.data->'events')<>jsonb_array_length(old.data->'events')+1 or not ((new.data->'events') @> (old.data->'events')) then raise exception 'Audit history is append only'; end if;
 return new;
end; $$;
create trigger wp_permit_guard before update on public.wp_permits for each row execute function public.wp_guard_permit();
revoke all on function public.wp_guard_permit() from public,anon,authenticated;
grant execute on function public.wp_guard_permit() to service_role;
alter table public.wp_contractors enable row level security;
alter table public.wp_members enable row level security;
alter table public.wp_templates enable row level security;
alter table public.wp_permits enable row level security;
alter table public.wp_login_limits enable row level security;
revoke all on public.wp_contractors,public.wp_members,public.wp_templates,public.wp_permits,public.wp_login_limits from public,anon,authenticated,service_role;
grant select,insert,update on public.wp_contractors,public.wp_permits,public.wp_login_limits to service_role;
grant select,insert on public.wp_templates to service_role;
grant update(active) on public.wp_templates to service_role;
grant select,insert,delete on public.wp_members to service_role;

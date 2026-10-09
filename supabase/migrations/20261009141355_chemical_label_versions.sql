-- Immutable label snapshots. Access is scoped by the signed Tools session in server routes.
create table public.chem_label_versions (
  id uuid primary key default gen_random_uuid(),
  substance_id uuid not null references public.chem_substances(id),
  company_id text not null,
  version integer not null check (version > 0),
  request_id uuid not null,
  title text not null default '' check (length(title) <= 120),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 150000),
  created_by jsonb not null check (jsonb_typeof(created_by) = 'object'),
  created_at timestamptz not null default now(),
  unique (substance_id, version),
  unique (substance_id, request_id)
);
create index chem_label_versions_company_idx on public.chem_label_versions(company_id);
alter table public.chem_label_versions enable row level security;
revoke all on public.chem_label_versions from public, anon, authenticated, service_role;
grant select, insert on public.chem_label_versions to service_role;

create function public.chem_save_label_version(
  p_substance_id uuid, p_company_id text, p_request_id uuid,
  p_title text, p_snapshot jsonb, p_actor jsonb
) returns setof public.chem_label_versions
language plpgsql security invoker set search_path = '' as $$
declare
  existing public.chem_label_versions;
  next_version integer;
begin
  -- Serialize writers without updating the registry or its updated_at timestamp.
  perform 1 from public.chem_substances
    where id = p_substance_id and company_id = p_company_id and is_active for update;
  if not found then raise exception 'Substance unavailable' using errcode = 'P0002'; end if;
  select * into existing from public.chem_label_versions
    where substance_id = p_substance_id and request_id = p_request_id;
  if found then
    if existing.snapshot <> p_snapshot or existing.title <> p_title or existing.created_by <> p_actor then
      raise exception 'Request already used for another snapshot' using errcode = '23505';
    end if;
    return next existing;
    return;
  end if;
  select coalesce(max(version), 0) + 1 into next_version from public.chem_label_versions where substance_id = p_substance_id;
  return query insert into public.chem_label_versions(substance_id, company_id, version, request_id, title, snapshot, created_by)
    values (p_substance_id, p_company_id, next_version, p_request_id, p_title, p_snapshot, p_actor) returning *;
end $$;
revoke all on function public.chem_save_label_version(uuid,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.chem_save_label_version(uuid,text,uuid,text,jsonb,jsonb) to service_role;
comment on table public.chem_label_versions is 'Saved chemical label text and print settings; append-only, independent of the registry. QR always resolves the current SDS.';

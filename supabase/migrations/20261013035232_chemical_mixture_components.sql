-- Additive migration: existing CAS and documents are never reclassified or rewritten.
-- Components are an atomic snapshot of SDS Section 3 on the already tenant-protected row.
create or replace function public.chem_valid_components(value jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare item jsonb; digits text; checksum integer; pos integer;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 100 then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if not (item ?& array['name','cas_no','cas_status','concentration_text','concentration_basis','source_page']) then return false; end if;
    if jsonb_typeof(item->'name') <> 'string' or length(btrim(item->>'name')) not between 1 and 300 then return false; end if;
    if (item->>'cas_status') is null or (item->>'cas_status') not in ('specified','not_provided','confidential') then return false; end if;
    if (item->>'concentration_basis') is null or (item->>'concentration_basis') not in ('unspecified','w/w','v/v','w/v') then return false; end if;
    if item->>'cas_status' = 'specified' then
      if jsonb_typeof(item->'cas_no') <> 'string' or not coalesce((item->>'cas_no') ~ '^[0-9]{2,7}-[0-9]{2}-[0-9]$',false) then return false; end if;
      digits := replace(item->>'cas_no', '-', ''); checksum := 0;
      for pos in 1..length(digits)-1 loop
        checksum := checksum + substring(digits, length(digits)-pos, 1)::integer * pos;
      end loop;
      if checksum % 10 <> right(digits, 1)::integer then return false; end if;
    elsif item->'cas_no' <> 'null'::jsonb then return false;
    end if;
    if jsonb_typeof(item->'concentration_text') not in ('string','null') or length(item->>'concentration_text') > 120 then return false; end if;
    if jsonb_typeof(item->'source_page') not in ('string','null') or length(item->>'source_page') > 40 then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.chem_valid_components(jsonb) from public, anon, authenticated;
grant execute on function public.chem_valid_components(jsonb) to service_role;
alter table public.chem_substances
  add column product_type text not null default 'unknown' check (product_type in ('unknown','single','mixture')),
  add column components jsonb not null default '[]'::jsonb check (public.chem_valid_components(components));
comment on column public.chem_substances.components is 'SDS Section 3 identities and literal concentration ranges; not a declaration of legal applicability or complete formula.';
notify pgrst, 'reload schema';

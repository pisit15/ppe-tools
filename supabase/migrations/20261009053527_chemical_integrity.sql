-- Apply with the accompanying API release. No production records are deleted.
alter table public.chem_substances
  add column if not exists is_demo boolean not null default false,
  add column if not exists ai_filled_fields text[] not null default '{}',
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;
alter table public.chem_substances add constraint chem_review_status_valid
  check (review_status in ('unreviewed', 'reviewed'));
alter table public.chem_substances add constraint chem_review_actor_required
  check ((review_status = 'reviewed' and reviewed_by is not null and reviewed_at is not null)
      or (review_status = 'unreviewed' and reviewed_by is null and reviewed_at is null));
alter table public.chem_company_settings
  add column if not exists sds_review_years integer,
  add column if not exists sds_review_policy text;
alter table public.chem_company_settings add constraint chem_sds_policy_valid
  check ((sds_review_years is null and sds_review_policy is null)
      or (sds_review_years is not null and sds_review_years between 1 and 50 and sds_review_policy is not null and length(trim(sds_review_policy)) > 0));
-- Scope-safe relations; preserve the existing ON DELETE SET NULL foreign key.
create unique index if not exists chem_storage_areas_id_company_key on public.chem_storage_areas(id, company_id);
alter table public.chem_substances add constraint chem_substances_area_company_fk
  foreign key (storage_area_id, company_id) references public.chem_storage_areas(id, company_id);
create index if not exists chem_substances_scope_demo_idx on public.chem_substances(company_id, is_demo) where is_active;
-- All chemical access goes through authenticated, company-authorized server routes.
-- Service role has explicit grants; client roles get no direct table access.
alter table public.chem_substances enable row level security;
alter table public.chem_storage_areas enable row level security;
alter table public.chem_company_settings enable row level security;
drop policy if exists "Allow all chem_substances" on public.chem_substances;
drop policy if exists "Allow all chem_storage_areas" on public.chem_storage_areas;
revoke all on public.chem_substances, public.chem_storage_areas, public.chem_company_settings from anon, authenticated;
grant select, insert, update, delete on public.chem_substances, public.chem_storage_areas, public.chem_company_settings to service_role;

alter function public.chem_touch_updated_at() set search_path = '';

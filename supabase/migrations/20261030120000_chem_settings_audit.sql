-- Phase 1 hardening: who changed the values printed on chemical posters.
-- Company users may still edit their emergency contacts; governance fields
-- (SDS review policy, default poster template) become admin-only in the API.
alter table public.chem_company_settings add column if not exists updated_by text;

create table if not exists public.chem_company_settings_history (
  id bigserial primary key,
  company_id text not null,
  changed_by text not null,
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb not null
);
create index if not exists chem_company_settings_history_company_idx
  on public.chem_company_settings_history (company_id, changed_at desc);
alter table public.chem_company_settings_history enable row level security;

-- Append-only from the API (service role); no anon/authenticated access.
grant select, insert on public.chem_company_settings_history to service_role;
grant usage, select on sequence public.chem_company_settings_history_id_seq to service_role;

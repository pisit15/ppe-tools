-- Optional default for new posters. Saved Rev snapshots remain unchanged.
-- Existing server-only access and company authorization remain in force.
alter table public.chem_company_settings
  add column if not exists default_poster_template_id uuid
  references public.chem_poster_templates(id) on delete set null;
create index if not exists chem_company_settings_poster_template_idx
  on public.chem_company_settings(default_poster_template_id)
  where default_poster_template_id is not null;
notify pgrst, 'reload schema';

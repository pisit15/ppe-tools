-- Start recording provenance now; row creators are not evidence of historical SDS importers.
alter table public.chem_substances add column sds_import jsonb;
alter table public.chem_substances add constraint chem_substances_sds_import_check check (
  sds_import is null or (
    jsonb_typeof(sds_import) = 'object'
    and sds_import ?& array['actor_id','account_table','username','display_name','imported_at','method']
    and jsonb_typeof(sds_import->'actor_id') = 'string'
    and jsonb_typeof(sds_import->'username') = 'string'
    and jsonb_typeof(sds_import->'display_name') = 'string'
    and jsonb_typeof(sds_import->'imported_at') = 'string'
    and sds_import->>'account_table' in ('admin_accounts','company_users','tools_users')
    and sds_import->>'method' in ('file','link')
  ) is true
);
create table public.chem_sds_uploads (
  path text primary key,
  company_id text not null references public.company_settings(company_id),
  importer jsonb not null,
  created_at timestamptz not null default now(),
  constraint chem_sds_uploads_path_check check (
    path ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9._-]+$' and split_part(path, '/', 1) = company_id
  ),
  constraint chem_sds_uploads_importer_check check ((
    jsonb_typeof(importer) = 'object'
    and importer ?& array['actor_id','account_table','username','display_name','imported_at','method']
    and jsonb_typeof(importer->'actor_id') = 'string'
    and jsonb_typeof(importer->'username') = 'string'
    and jsonb_typeof(importer->'display_name') = 'string'
    and jsonb_typeof(importer->'imported_at') = 'string'
    and importer->>'account_table' in ('admin_accounts','company_users','tools_users')
    and importer->>'method' = 'file'
  ) is true)
);
create index chem_sds_uploads_company_idx on public.chem_sds_uploads(company_id);
alter table public.chem_sds_uploads enable row level security;
revoke all on public.chem_sds_uploads from public, anon, authenticated, service_role;
grant select, insert on public.chem_sds_uploads to service_role;
comment on table public.chem_sds_uploads is 'Server-recorded upload receipts; signed-session API routes enforce company scope. No direct client access.';
comment on column public.chem_substances.sds_import is 'Verified account snapshot for the current SDS; NULL means no historical importer evidence.';

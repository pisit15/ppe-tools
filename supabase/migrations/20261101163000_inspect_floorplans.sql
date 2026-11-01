-- Floor plans: one image per building/floor (or zone); assets get an optional (x, y) position on one plan.
-- Positions are fractions 0..1 of the image so the image can be replaced at a different resolution.
create table public.insp_floorplans (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  name text not null check (length(name) between 1 and 120),
  building text not null default '' check (length(building) <= 80),
  floor text not null default '' check (length(floor) <= 40),
  image_path text not null,
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create index insp_floorplans_company_idx on public.insp_floorplans (company_id, sort_order, name);
create trigger insp_floorplans_touch before update on public.insp_floorplans for each row execute function public.insp_touch();

alter table public.insp_floorplans enable row level security;
revoke all on public.insp_floorplans from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.insp_floorplans to service_role;

alter table public.insp_assets
  add column floorplan_id uuid references public.insp_floorplans(id) on delete set null,
  add column pos_x real check (pos_x is null or (pos_x >= 0 and pos_x <= 1)),
  add column pos_y real check (pos_y is null or (pos_y >= 0 and pos_y <= 1));
create index insp_assets_floorplan_idx on public.insp_assets (floorplan_id) where floorplan_id is not null;

comment on table public.insp_floorplans is 'Building/floor layout images (stored in bucket inspect-photos under <company>/floorplans/, never purged by retention).';

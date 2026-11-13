-- Shared default pictures for medicines and supplies.
-- An admin sets a picture once; every company's item whose name matches one of the keywords shows it
-- until that company uploads its own picture. Files live in the private bucket first-aid-images under
-- shared.defaults/ (a prefix no company id can have, because company ids contain no dot).
create table if not exists public.fa_default_images (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  keywords text[] not null check (cardinality(keywords) between 1 and 12),
  image_path text not null unique check (image_path like 'shared.defaults/%' and length(image_path) <= 300),
  image_source text not null default '' check (length(image_source) <= 500),
  created_by text not null default '' check (length(created_by) <= 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fa_default_images enable row level security;
revoke all on public.fa_default_images from public, anon, authenticated;
grant select, insert, update, delete on public.fa_default_images to service_role;

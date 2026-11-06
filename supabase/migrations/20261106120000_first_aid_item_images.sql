-- First Aid redesign (6 Nov 2026): item pictures + short description, and a private bucket for them.
-- Pictures are optional; the UI falls back to a category icon (fa_items.icon).
alter table public.fa_items
  add column if not exists description text not null default '' check (length(description) <= 160),
  add column if not exists icon text not null default '' check (icon in ('', 'pill', 'bottle', 'sachet', 'plaster', 'gauze', 'mask', 'glove', 'device', 'cream', 'other')),
  add column if not exists image_path text check (image_path is null or (length(image_path) between 1 and 300 and image_path !~ '\.\.')),
  add column if not exists image_source text not null default '' check (length(image_source) <= 500),
  add column if not exists image_updated_at timestamptz;

-- Private bucket; every read goes through a signed URL issued by the server (service_role only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('first-aid-images', 'first-aid-images', false, 2097152, array['image/jpeg','image/webp','image/png'])
  on conflict (id) do nothing;

-- Chemical Management (tools.eashe.org/chemical)
-- ทะเบียนสารเคมีรายบริษัท + SDS (ลิงก์/ไฟล์) + การจำแนกประเภทการจัดเก็บตามคู่มือ กรอ. 13 ประเภท
-- ตารางเก็บร่วม/แยก และเงื่อนไข 18 ข้อ อยู่ในโค้ด (src/lib/chemical/storage-classes.ts) ไม่ใช่ใน DB

create table if not exists chem_storage_areas (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chem_storage_areas_company_idx on chem_storage_areas (company_id);

create table if not exists chem_substances (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  -- identity
  name text not null,                      -- ชื่อสารเคมี (ชื่อการค้า/ชื่อที่ใช้เรียกในโรงงาน)
  chemical_name text,                      -- ชื่อทางเคมี (IUPAC/ชื่อสามัญ)
  cas_no text,
  un_no text,
  supplier text,
  physical_state text,                     -- solid | liquid | gas | aerosol
  -- GHS classification (จาก SDS section 2)
  ghs_pictograms text[] not null default '{}',   -- GHS01..GHS09
  signal_word text,                        -- Danger | Warning | None
  hazard_classes text[] not null default '{}',   -- ข้อความ hazard class เช่น "Flammable liquids, Category 2"
  h_codes text[] not null default '{}',    -- H225, H319 ...
  p_codes text[] not null default '{}',    -- P210, P280 ...
  -- physical props relevant to storage classification
  flash_point_c numeric,
  boiling_point_c numeric,
  -- DIW storage classification (คู่มือการเก็บรักษาวัตถุอันตราย กรอ.)
  storage_class text,                      -- 1 | 2A | 2B | 3A | 3B | 4.1A | ... | 13
  storage_class_suggested text,            -- ค่าที่ระบบแนะนำจาก GHS (เก็บไว้เทียบ)
  storage_area_id uuid references chem_storage_areas(id) on delete set null,
  storage_location text,                   -- ตำแหน่ง/ชั้น/ตู้ (free text)
  storage_conditions text,                 -- เงื่อนไขการเก็บจาก SDS section 7
  quantity numeric,
  unit text,                               -- L, kg, ถัง, ขวด ...
  container text,                          -- ลักษณะภาชนะ
  -- safety info for poster (SDS sections 4, 5, 6, 8)
  ppe_required text[] not null default '{}',
  first_aid jsonb not null default '{}'::jsonb,   -- {inhalation, skin, eye, ingestion}
  fire_fighting text,
  spill_response text,
  emergency_contact text,
  -- SDS document
  sds_url text,                            -- ลิงก์ภายนอก
  sds_file_path text,                      -- path ใน bucket chemical-sds (private)
  sds_file_name text,
  sds_revision_date date,
  sds_language text,
  -- misc
  usage_purpose text,                      -- ใช้ทำอะไร / แผนกที่ใช้
  notes text,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chem_substances_company_idx on chem_substances (company_id, is_active);
create index if not exists chem_substances_area_idx on chem_substances (storage_area_id);

-- updated_at trigger
create or replace function chem_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists chem_substances_touch on chem_substances;
create trigger chem_substances_touch before update on chem_substances for each row execute function chem_touch_updated_at();
drop trigger if exists chem_storage_areas_touch on chem_storage_areas;
create trigger chem_storage_areas_touch before update on chem_storage_areas for each row execute function chem_touch_updated_at();

-- RLS: same posture as other tools tables (allow all; API routes use service role)
alter table chem_substances enable row level security;
alter table chem_storage_areas enable row level security;
drop policy if exists "Allow all chem_substances" on chem_substances;
create policy "Allow all chem_substances" on chem_substances for all using (true) with check (true);
drop policy if exists "Allow all chem_storage_areas" on chem_storage_areas;
create policy "Allow all chem_storage_areas" on chem_storage_areas for all using (true) with check (true);

-- private bucket for SDS files (served via signed URLs only)
insert into storage.buckets (id, name, public)
values ('chemical-sds', 'chemical-sds', false)
on conflict (id) do update set public = false;

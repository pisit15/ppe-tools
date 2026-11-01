-- Equipment Inspection module (/inspect): periodic inspection of safety equipment
-- (fire extinguishers, eyewash stations, fire hoses, fire suits/SCBA, emergency lights,
-- first-aid kits/AED, spill kits ...). Replaces the Superhuman "ตรวจถังดับเพลิง" database.
--
-- Design (owner decisions 1 Nov 2026):
--   * one registry for every kind of equipment (insp_assets) — category-specific fields in `attributes`
--   * checklist per template (insp_templates.items jsonb); results stored as jsonb with the template version
--   * each asset has a secret QR token; the public form at /inspect/i/<token> needs no login
--   * per-company inspection_mode: 'she' (SHE accounts only) or 'department' (registered inspector codes)
--   * photos live in the private bucket `inspect-photos`, compressed client-side, kept 90 days
--     (photos of failed inspections are kept until the failure is resolved + retention)
--   * legal/periodic service (e.g. hydrostatic test every 5 years) tracked per asset

-- ---------------------------------------------------------------- categories
create table public.insp_categories (
  id uuid primary key default gen_random_uuid(),
  company_id text references public.company_settings(company_id), -- null = shared default
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  icon text not null default 'shield' check (length(icon) <= 40),
  color text not null default '#4E79A7' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  inspection_interval_days integer not null default 30 check (inspection_interval_days between 1 and 3660),
  service_label text not null default '' check (length(service_label) <= 80),      -- e.g. "Hydrostatic test"
  service_interval_months integer check (service_interval_months between 1 and 600), -- null = no legal test
  service_ref text not null default '' check (length(service_ref) <= 200),          -- law / standard reference (free text)
  attributes jsonb not null default '[]'::jsonb, -- [{key,label,type:'text'|'number'|'select'|'month',options?,unit?}]
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index insp_categories_key on public.insp_categories (coalesce(company_id, ''), key);

-- ---------------------------------------------------------------- checklist templates
create table public.insp_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.insp_categories(id) on delete cascade,
  company_id text references public.company_settings(company_id), -- null = shared default
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  version integer not null default 1 check (version > 0),
  items jsonb not null default '[]'::jsonb, -- [{key,label,kind:'pass_fail'|'pass_fail_na'|'number',unit?,required?,hint?}]
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index insp_templates_key on public.insp_templates (category_id, coalesce(company_id, ''), key);

-- ---------------------------------------------------------------- per-company settings
create table public.insp_company_settings (
  company_id text primary key references public.company_settings(company_id),
  inspection_mode text not null default 'she' check (inspection_mode in ('she', 'department')),
  photo_retention_days integer not null default 90 check (photo_retention_days between 7 and 3660),
  max_photos_pass integer not null default 1 check (max_photos_pass between 0 and 5),
  max_photos_fail integer not null default 3 check (max_photos_fail between 1 and 5),
  require_photo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------- inspectors (department mode)
create table public.insp_inspectors (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  code text not null check (code ~ '^[A-Za-z0-9-]{3,20}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  department text not null default '' check (length(department) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------------------------------------------------------------- assets (the registry)
create table public.insp_assets (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  category_id uuid not null references public.insp_categories(id),
  template_id uuid references public.insp_templates(id),
  code text not null check (length(btrim(code)) between 1 and 60),
  name text not null default '' check (length(name) <= 120),
  department text not null default '' check (length(department) <= 80),
  building text not null default '' check (length(building) <= 80),
  floor text not null default '' check (length(floor) <= 40),
  location text not null default '' check (length(location) <= 200),
  attributes jsonb not null default '{}'::jsonb,
  mfg_year integer check (mfg_year between 1980 and 2100),
  mfg_month integer check (mfg_month between 1 and 12),
  last_service_on date,          -- last legal test / overhaul (e.g. hydrostatic test)
  service_interval_months integer check (service_interval_months between 1 and 600), -- override of category default
  reference_photo_path text,
  qr_token text not null unique check (qr_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  status text not null default 'active' check (status in ('active', 'inactive', 'disposed')),
  note text not null default '' check (length(note) <= 1000),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create index insp_assets_company on public.insp_assets (company_id, status, department);
create index insp_assets_category on public.insp_assets (category_id);

-- ---------------------------------------------------------------- inspections
create table public.insp_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  asset_id uuid not null references public.insp_assets(id) on delete cascade,
  template_id uuid references public.insp_templates(id),
  template_version integer not null default 1,
  inspected_on date not null,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  inspector_code text not null default '' check (length(inspector_code) <= 40),
  inspector_name text not null check (length(btrim(inspector_name)) between 1 and 120),
  results jsonb not null default '{}'::jsonb, -- {item_key: 'pass'|'fail'|'na'|number}
  overall text not null check (overall in ('pass', 'fail')),
  fail_items text[] not null default '{}',
  note text not null default '' check (length(note) <= 1000),
  source text not null default 'qr' check (source in ('qr', 'app', 'import')),
  resolved_at timestamptz,
  resolved_by text,
  resolved_note text not null default '' check (length(resolved_note) <= 1000),
  created_at timestamptz not null default now()
);
create index insp_inspections_asset on public.insp_inspections (asset_id, inspected_on desc);
create index insp_inspections_company_period on public.insp_inspections (company_id, period, overall);
create index insp_inspections_open_fail on public.insp_inspections (company_id, inspected_on desc) where overall = 'fail' and resolved_at is null;

-- ---------------------------------------------------------------- photos (private bucket, retention)
create table public.insp_photos (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  asset_id uuid not null references public.insp_assets(id) on delete cascade,
  inspection_id uuid references public.insp_inspections(id) on delete cascade,
  storage_path text not null unique,
  bytes integer not null default 0 check (bytes >= 0),
  width integer not null default 0,
  height integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz, -- set by retention cron; row kept as evidence that a photo existed
  deleted_reason text not null default ''
);
create index insp_photos_inspection on public.insp_photos (inspection_id);
create index insp_photos_retention on public.insp_photos (company_id, created_at) where deleted_at is null;

-- ---------------------------------------------------------------- service events (legal tests, refills, replacement)
create table public.insp_service_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.company_settings(company_id),
  asset_id uuid not null references public.insp_assets(id) on delete cascade,
  kind text not null check (kind in ('legal_test', 'refill', 'maintenance', 'replace', 'dispose', 'other')),
  done_on date not null,
  provider text not null default '' check (length(provider) <= 160),
  certificate_no text not null default '' check (length(certificate_no) <= 80),
  file_path text,
  note text not null default '' check (length(note) <= 1000),
  created_by text,
  created_at timestamptz not null default now()
);
create index insp_service_events_asset on public.insp_service_events (asset_id, done_on desc);

-- ---------------------------------------------------------------- touch triggers
create function public.insp_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
revoke all on function public.insp_touch() from public, anon, authenticated;
grant execute on function public.insp_touch() to service_role;
create trigger insp_categories_touch before update on public.insp_categories for each row execute function public.insp_touch();
create trigger insp_templates_touch before update on public.insp_templates for each row execute function public.insp_touch();
create trigger insp_assets_touch before update on public.insp_assets for each row execute function public.insp_touch();
create trigger insp_company_settings_touch before update on public.insp_company_settings for each row execute function public.insp_touch();

-- ---------------------------------------------------------------- status view
-- One row per asset: last inspection, next due date, due state, next legal service date, open failures.
create view public.insp_asset_status with (security_invoker = true) as
select
  a.id as asset_id,
  a.company_id,
  a.category_id,
  a.status,
  c.inspection_interval_days,
  li.inspected_on as last_inspected_on,
  li.overall as last_overall,
  li.inspector_name as last_inspector_name,
  case when li.inspected_on is null then null else li.inspected_on + c.inspection_interval_days end as next_due_on,
  case
    when a.status <> 'active' then 'inactive'
    when li.inspected_on is null then 'never'
    when li.inspected_on + c.inspection_interval_days < current_date then 'overdue'
    when li.inspected_on + c.inspection_interval_days <= current_date + 7 then 'due_soon'
    else 'ok'
  end as due_state,
  coalesce(a.service_interval_months, c.service_interval_months) as effective_service_interval_months,
  case
    when coalesce(a.service_interval_months, c.service_interval_months) is null then null
    when a.last_service_on is not null then a.last_service_on + make_interval(months => coalesce(a.service_interval_months, c.service_interval_months))
    when a.mfg_year is not null then make_date(a.mfg_year, coalesce(a.mfg_month, 1), 1) + make_interval(months => coalesce(a.service_interval_months, c.service_interval_months))
    else null
  end::date as next_service_due_on,
  (select count(*) from public.insp_inspections f where f.asset_id = a.id and f.overall = 'fail' and f.resolved_at is null) as open_failures
from public.insp_assets a
join public.insp_categories c on c.id = a.category_id
left join lateral (
  select i.inspected_on, i.overall, i.inspector_name
  from public.insp_inspections i where i.asset_id = a.id
  order by i.inspected_on desc, i.created_at desc limit 1
) li on true;

-- ---------------------------------------------------------------- security
alter table public.insp_categories enable row level security;
alter table public.insp_templates enable row level security;
alter table public.insp_company_settings enable row level security;
alter table public.insp_inspectors enable row level security;
alter table public.insp_assets enable row level security;
alter table public.insp_inspections enable row level security;
alter table public.insp_photos enable row level security;
alter table public.insp_service_events enable row level security;
revoke all on public.insp_categories, public.insp_templates, public.insp_company_settings, public.insp_inspectors,
  public.insp_assets, public.insp_inspections, public.insp_photos, public.insp_service_events, public.insp_asset_status
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.insp_categories to service_role;
grant select, insert, update, delete on public.insp_templates to service_role;
grant select, insert, update on public.insp_company_settings to service_role;
grant select, insert, update, delete on public.insp_inspectors to service_role;
grant select, insert, update, delete on public.insp_assets to service_role;
grant select, insert, update, delete on public.insp_inspections to service_role;
grant select, insert, update, delete on public.insp_photos to service_role;
grant select, insert, update, delete on public.insp_service_events to service_role;
grant select on public.insp_asset_status to service_role;

-- private bucket (signed upload + signed read only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspect-photos', 'inspect-photos', false, 1572864, array['image/jpeg', 'image/webp', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- home card + module
alter table public.tools_home_cards drop constraint tools_home_cards_id_check;
alter table public.tools_home_cards add constraint tools_home_cards_id_check
  check (id in ('ppe','chemical','permit','inspection','she-workforce','procurement','visitor','inspect'));
insert into public.tools_home_cards (id, name, description, is_visible) values
  ('inspect', 'Equipment Inspection', 'ตรวจอุปกรณ์ความปลอดภัยประจำรอบ — ถังดับเพลิง อ่างล้างตา สายฉีดน้ำ ชุดดับเพลิง ฯลฯ สแกน QR ที่อุปกรณ์ แนบรูป ติดตามรอบทดสอบตามกฎหมาย', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- shared default categories + templates
-- Common items shared by every checklist are repeated per template so each template stands alone.
with cat as (
  insert into public.insp_categories (key, name, icon, color, inspection_interval_days, service_label, service_interval_months, service_ref, attributes, sort_order) values
  ('fire_extinguisher', 'ถังดับเพลิง', 'flame', '#E15759', 30, 'ทดสอบแรงดันถัง (Hydrostatic test)', 60, 'กฎกระทรวงกำหนดมาตรฐานฯ ป้องกันและระงับอัคคีภัย พ.ศ. 2555',
    '[{"key":"agent","label":"ชนิดสารดับเพลิง","type":"select","options":["ผงเคมีแห้ง","CO2","โฟม","น้ำ","Clean agent (HFC/FK)","Wet chemical (Class K)","อื่น ๆ"]},{"key":"size","label":"ขนาด","type":"text","hint":"เช่น 10 lbs, 15 lbs, 5 kg"},{"key":"rating","label":"Fire rating","type":"text","hint":"เช่น 4A10B"}]'::jsonb, 10),
  ('eyewash', 'อ่างล้างตา / ฝักบัวฉุกเฉิน', 'droplets', '#4E79A7', 7, 'ตรวจสอบเต็มรูปแบบประจำปี', 12, 'ANSI/ISEA Z358.1', '[{"key":"kind","label":"ชนิด","type":"select","options":["อ่างล้างตา","ฝักบัวฉุกเฉิน","อ่างล้างตา + ฝักบัว","ขวดล้างตาแบบพกพา"]},{"key":"water_source","label":"แหล่งน้ำ","type":"select","options":["ประปา","ถังสำรอง"]}]'::jsonb, 20),
  ('fire_hose', 'สายฉีดน้ำดับเพลิง / ตู้ hose reel', 'waves', '#F28E2B', 30, 'ทดสอบแรงดันสาย', 12, 'NFPA 1962', '[{"key":"kind","label":"ชนิด","type":"select","options":["Hose reel","Hose rack (สายผ้าใบ)","Fire hydrant"]},{"key":"diameter","label":"ขนาดสาย","type":"text","hint":"เช่น 1.5 นิ้ว, 2.5 นิ้ว"},{"key":"length_m","label":"ความยาว (ม.)","type":"number","unit":"ม."}]'::jsonb, 30),
  ('fire_suit', 'ชุดดับเพลิง / SCBA', 'shirt', '#B07AA1', 30, 'ทดสอบถังอากาศ SCBA (Hydrostatic test)', 60, 'NFPA 1852 / ผู้ผลิต', '[{"key":"kind","label":"ชนิด","type":"select","options":["ชุดผจญเพลิงครบชุด","SCBA","ชุด + SCBA"]},{"key":"size","label":"ไซส์ชุด","type":"text"},{"key":"cylinder_type","label":"ชนิดถังอากาศ","type":"select","options":["เหล็ก/อลูมิเนียม","คอมโพสิต","ไม่มี"]}]'::jsonb, 40),
  ('emergency_light', 'ไฟฉุกเฉิน / ป้ายทางออก', 'lightbulb', '#59A14F', 30, 'ทดสอบ 90 นาที ประจำปี', 12, 'NFPA 101 / มอก.', '[{"key":"kind","label":"ชนิด","type":"select","options":["ไฟฉุกเฉิน","ป้ายทางออก","ไฟฉุกเฉิน + ป้าย"]}]'::jsonb, 50),
  ('first_aid', 'ชุดปฐมพยาบาล / AED', 'heart-pulse', '#76B7B2', 30, '', null, '', '[{"key":"kind","label":"ชนิด","type":"select","options":["กล่องปฐมพยาบาล","AED","กล่อง + AED"]}]'::jsonb, 60),
  ('spill_kit', 'Spill kit', 'package', '#9C755F', 30, '', null, '', '[{"key":"kind","label":"ชนิดสารที่รองรับ","type":"select","options":["น้ำมัน","สารเคมี","อเนกประสงค์"]}]'::jsonb, 70)
  returning id, key
)
insert into public.insp_templates (category_id, key, name, items, is_default)
select cat.id, t.key, t.name, t.items::jsonb, t.is_default
from cat
join (values
  -- fire extinguisher
  ('fire_extinguisher', 'dry_chem', 'ผงเคมีแห้ง / โฟม / น้ำ (มีเกจ)', true,
   '[{"key":"pressure","label":"เกจความดันอยู่ในเขตสีเขียว","kind":"pass_fail_na","hint":"เลือก N/A ถ้าไม่มีเกจ","required":true},{"key":"powder","label":"พลิกคว่ำ ผงไม่จับตัวเป็นก้อน (ผงเคมี)","kind":"pass_fail_na"},{"key":"seal_pin","label":"ซีลและสลักนิรภัยครบ","kind":"pass_fail","required":true},{"key":"hose","label":"สายฉีด/ข้อต่อไม่แตกร้าว อุดตัน","kind":"pass_fail","required":true},{"key":"nozzle","label":"หัวฉีดสมบูรณ์","kind":"pass_fail","required":true},{"key":"cylinder","label":"ตัวถังไม่บุบ ไม่เป็นสนิม","kind":"pass_fail","required":true},{"key":"label","label":"ป้ายบ่งชี้/ฉลากชัดเจน อ่านได้","kind":"pass_fail","required":true},{"key":"mount","label":"ที่แขวน/ตู้สมบูรณ์ สูงเหมาะสม","kind":"pass_fail"},{"key":"access","label":"ไม่มีสิ่งกีดขวาง เข้าถึงได้","kind":"pass_fail","required":true}]'),
  ('fire_extinguisher', 'co2', 'CO2 (ชั่งน้ำหนัก)', false,
   '[{"key":"weight","label":"น้ำหนักรวม (kg)","kind":"number","unit":"kg","hint":"เทียบน้ำหนักเต็มบนป้าย — ขาดเกิน 10% ให้ติ๊กไม่ผ่านที่ข้อถัดไป"},{"key":"weight_ok","label":"น้ำหนักไม่ต่ำกว่า 90% ของน้ำหนักเต็ม","kind":"pass_fail","required":true},{"key":"seal_pin","label":"ซีลและสลักนิรภัยครบ","kind":"pass_fail","required":true},{"key":"hose","label":"สายฉีด/ข้อต่อไม่แตกร้าว","kind":"pass_fail","required":true},{"key":"horn","label":"กรวยฉีดไม่แตก หมุนได้","kind":"pass_fail","required":true},{"key":"cylinder","label":"ตัวถังไม่บุบ ไม่เป็นสนิม","kind":"pass_fail","required":true},{"key":"label","label":"ป้ายบ่งชี้/ฉลากชัดเจน","kind":"pass_fail","required":true},{"key":"mount","label":"ที่แขวน/ตู้สมบูรณ์","kind":"pass_fail"},{"key":"access","label":"ไม่มีสิ่งกีดขวาง เข้าถึงได้","kind":"pass_fail","required":true}]'),
  ('fire_extinguisher', 'clean_agent', 'Clean agent / Wet chemical', false,
   '[{"key":"pressure","label":"เกจความดันอยู่ในเขตสีเขียว","kind":"pass_fail_na","required":true},{"key":"weight","label":"น้ำหนักรวม (kg)","kind":"number","unit":"kg"},{"key":"seal_pin","label":"ซีลและสลักนิรภัยครบ","kind":"pass_fail","required":true},{"key":"hose","label":"สายฉีด/ข้อต่อไม่แตกร้าว","kind":"pass_fail","required":true},{"key":"nozzle","label":"หัวฉีดสมบูรณ์","kind":"pass_fail","required":true},{"key":"cylinder","label":"ตัวถังไม่บุบ ไม่เป็นสนิม","kind":"pass_fail","required":true},{"key":"label","label":"ป้ายบ่งชี้/ฉลากชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"ไม่มีสิ่งกีดขวาง เข้าถึงได้","kind":"pass_fail","required":true}]'),
  ('fire_extinguisher', 'wheeled', 'ถังล้อเลื่อน', false,
   '[{"key":"pressure","label":"เกจความดัน/ถังขับดันอยู่ในเกณฑ์","kind":"pass_fail_na","required":true},{"key":"wheels","label":"ล้อและโครงหมุนได้ ไม่ติดขัด","kind":"pass_fail","required":true},{"key":"hose","label":"สายฉีดยาว ไม่แตกร้าว ม้วนเรียบร้อย","kind":"pass_fail","required":true},{"key":"nozzle","label":"หัวฉีดสมบูรณ์","kind":"pass_fail","required":true},{"key":"seal_pin","label":"ซีลและสลักนิรภัยครบ","kind":"pass_fail","required":true},{"key":"cylinder","label":"ตัวถังไม่บุบ ไม่เป็นสนิม","kind":"pass_fail","required":true},{"key":"label","label":"ป้ายบ่งชี้/ฉลากชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"ไม่มีสิ่งกีดขวาง เข้าถึงได้","kind":"pass_fail","required":true}]'),
  -- eyewash
  ('eyewash', 'weekly', 'ตรวจประจำสัปดาห์ (เปิดน้ำไล่ท่อ)', true,
   '[{"key":"flow","label":"เปิดน้ำแล้วไหลทั้งสองหัว/ฝักบัว","kind":"pass_fail","required":true},{"key":"clarity","label":"น้ำใส ไม่มีตะกอน/สนิม (หลังไล่น้ำ)","kind":"pass_fail","required":true},{"key":"pressure","label":"แรงดันน้ำเพียงพอ สม่ำเสมอ","kind":"pass_fail","required":true},{"key":"caps","label":"ฝาครอบหัวจ่ายครบ ปิดอยู่","kind":"pass_fail","required":true},{"key":"valve","label":"วาล์วเปิดง่ายมือเดียว ค้างได้","kind":"pass_fail","required":true},{"key":"drain","label":"ท่อระบายน้ำไม่อุดตัน","kind":"pass_fail"},{"key":"sign","label":"ป้ายบ่งชี้ชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"ทางเข้าถึงโล่ง ไม่มีสิ่งกีดขวาง","kind":"pass_fail","required":true}]'),
  ('eyewash', 'portable', 'ขวดล้างตาแบบพกพา', false,
   '[{"key":"seal","label":"ซีลขวดสมบูรณ์ ไม่เคยเปิด","kind":"pass_fail","required":true},{"key":"expiry","label":"ยังไม่หมดอายุ","kind":"pass_fail","required":true},{"key":"volume","label":"ปริมาณน้ำยาครบ","kind":"pass_fail","required":true},{"key":"sign","label":"ป้ายบ่งชี้ชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"เข้าถึงได้ ไม่มีสิ่งกีดขวาง","kind":"pass_fail","required":true}]'),
  -- fire hose
  ('fire_hose', 'monthly', 'ตรวจด้วยสายตาประจำเดือน', true,
   '[{"key":"cabinet","label":"ตู้/กระจก/บานพับสมบูรณ์ เปิดได้","kind":"pass_fail","required":true},{"key":"hose","label":"สายไม่แตกร้าว ไม่รั่ว ม้วนเรียบร้อย","kind":"pass_fail","required":true},{"key":"nozzle","label":"หัวฉีดครบ ปรับได้","kind":"pass_fail","required":true},{"key":"valve","label":"วาล์ว/ข้อต่อไม่รั่ว หมุนได้","kind":"pass_fail","required":true},{"key":"pressure","label":"เกจแรงดัน (ถ้ามี) อยู่ในเกณฑ์","kind":"pass_fail_na"},{"key":"sign","label":"ป้ายบ่งชี้ชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"ไม่มีสิ่งกีดขวาง เข้าถึงได้","kind":"pass_fail","required":true}]'),
  -- fire suit / SCBA
  ('fire_suit', 'monthly', 'ตรวจประจำเดือน', true,
   '[{"key":"complete","label":"ชุดครบ: เสื้อ กางเกง หมวก ถุงมือ รองเท้า ผ้าคลุมศีรษะ","kind":"pass_fail","required":true},{"key":"condition","label":"ชุดไม่ขาด ไม่ไหม้ ตะเข็บ/ซิปสมบูรณ์","kind":"pass_fail","required":true},{"key":"scba_pressure","label":"แรงดันถังอากาศ SCBA ≥ 90%","kind":"pass_fail_na"},{"key":"scba_mask","label":"หน้ากาก/สายรัด/วาล์วสมบูรณ์","kind":"pass_fail_na"},{"key":"scba_alarm","label":"สัญญาณเตือนอากาศต่ำทำงาน","kind":"pass_fail_na"},{"key":"storage","label":"จัดเก็บถูกต้อง พร้อมใช้","kind":"pass_fail","required":true},{"key":"access","label":"เข้าถึงได้ ไม่มีสิ่งกีดขวาง","kind":"pass_fail","required":true}]'),
  -- emergency light
  ('emergency_light', 'monthly', 'กดทดสอบประจำเดือน', true,
   '[{"key":"test","label":"กดปุ่ม Test แล้วหลอดติด","kind":"pass_fail","required":true},{"key":"lamp","label":"หลอด/LED ทุกดวงติดครบ","kind":"pass_fail","required":true},{"key":"charge","label":"ไฟแสดงสถานะชาร์จติด","kind":"pass_fail","required":true},{"key":"body","label":"ตัวเครื่อง/ป้ายไม่แตก ไม่หลุด","kind":"pass_fail","required":true},{"key":"visible","label":"มองเห็นชัด ไม่มีสิ่งบัง","kind":"pass_fail","required":true}]'),
  -- first aid / AED
  ('first_aid', 'monthly', 'ตรวจประจำเดือน', true,
   '[{"key":"inventory","label":"รายการเวชภัณฑ์ครบตามบัญชี","kind":"pass_fail","required":true},{"key":"expiry","label":"ไม่มีรายการหมดอายุ","kind":"pass_fail","required":true},{"key":"aed_status","label":"AED ไฟสถานะพร้อมใช้ (สีเขียว)","kind":"pass_fail_na"},{"key":"aed_pads","label":"แผ่น pad / แบตเตอรี่ AED ยังไม่หมดอายุ","kind":"pass_fail_na"},{"key":"box","label":"กล่อง/ตู้สะอาด ปิดสนิท","kind":"pass_fail","required":true},{"key":"sign","label":"ป้ายบ่งชี้ชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"เข้าถึงได้ ไม่มีสิ่งกีดขวาง","kind":"pass_fail","required":true}]'),
  -- spill kit
  ('spill_kit', 'monthly', 'ตรวจประจำเดือน', true,
   '[{"key":"inventory","label":"วัสดุดูดซับ/ถุง/PPE ครบตามบัญชี","kind":"pass_fail","required":true},{"key":"seal","label":"ซีลภาชนะสมบูรณ์","kind":"pass_fail","required":true},{"key":"sign","label":"ป้ายบ่งชี้ชัดเจน","kind":"pass_fail","required":true},{"key":"access","label":"เข้าถึงได้ ไม่มีสิ่งกีดขวาง","kind":"pass_fail","required":true}]')
) as t(cat_key, key, name, is_default, items) on t.cat_key = cat.key;

comment on table public.insp_assets is 'Equipment inspection registry (every category). Secret qr_token per asset → public form /inspect/i/<token>.';
comment on view public.insp_asset_status is 'Per-asset due state for routine inspection and the legal/periodic service.';

-- SHE Data Center: per-company document centre replacing the Superhuman "OHSE DATA CENTER" doc.
-- Sections (tree) + one register table for documents / monitoring results / licenses.
-- SHE manage at tools.eashe.org/ohse; employees read the employee-visible part in the LINE MINI App
-- (eashe.org/liff/docs) after entering the company access code.
-- All access goes through service_role API routes (RLS on, no anon/authenticated grants).

create table public.ohse_sections (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  parent_id uuid references public.ohse_sections(id) on delete cascade,
  code text not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  kind text not null default 'documents' check (kind in ('folder', 'documents', 'monitoring', 'licenses', 'link')),
  employee_visible boolean not null default false,
  link_url text check (link_url is null or link_url ~ '^https://'),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create index ohse_sections_company_idx on public.ohse_sections (company_id, sort_order);

create table public.ohse_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  section_id uuid not null references public.ohse_sections(id) on delete restrict,
  doc_no text,
  title text not null check (length(btrim(title)) between 1 and 300),
  revision text,
  doc_date date,
  signed_by text,
  agency text,
  expires_on date,
  result text check (result in ('pass', 'not_pass')),
  note text,
  file_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  link_url text check (link_url is null or link_url ~ '^https://'),
  status text not null default 'current' check (status in ('current', 'superseded')),
  superseded_by uuid references public.ohse_documents(id) on delete set null,
  employee_visible boolean, -- null = follow the section
  source text not null default 'manual' check (source in ('manual', 'superhuman')),
  source_ref text,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_ref)
);
create index ohse_documents_section_idx on public.ohse_documents (section_id, status, sort_order);
create index ohse_documents_company_idx on public.ohse_documents (company_id, status);
create index ohse_documents_expiry_idx on public.ohse_documents (company_id, expires_on) where expires_on is not null;

create table public.ohse_company_settings (
  company_id text primary key,
  access_code_hash text,          -- sha256 hex of the employee access code (null = employee view closed)
  updated_by text,
  updated_at timestamptz not null default now()
);

-- One-off migration helpers (Superhuman import). Tickets are single purpose, short-lived, hash only.
create table public.ohse_import_tickets (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  company_id text not null,
  expires_at timestamptz not null,
  created_by text,
  created_at timestamptz not null default now()
);
create table public.ohse_import_staging (
  id bigint generated always as identity primary key,
  company_id text not null,
  page_code text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ohse_sections enable row level security;
alter table public.ohse_documents enable row level security;
alter table public.ohse_company_settings enable row level security;
alter table public.ohse_import_tickets enable row level security;
alter table public.ohse_import_staging enable row level security;

grant select, insert, update, delete on public.ohse_sections to service_role;
grant select, insert, update, delete on public.ohse_documents to service_role;
grant select, insert, update, delete on public.ohse_company_settings to service_role;
grant select, insert, update, delete on public.ohse_import_tickets to service_role;
grant select, insert, update, delete on public.ohse_import_staging to service_role;
grant usage, select on sequence public.ohse_import_staging_id_seq to service_role;

-- Private bucket for files (served only through short-lived signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ohse-docs', 'ohse-docs', false, 52428800, array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint'
])
on conflict (id) do nothing;

-- Home card
alter table public.tools_home_cards drop constraint tools_home_cards_id_check;
alter table public.tools_home_cards add constraint tools_home_cards_id_check
  check (id in ('ppe','chemical','permit','inspection','she-workforce','procurement','visitor','inspect','first-aid','ohse'));
insert into public.tools_home_cards (id, name, description, is_visible) values
  ('ohse', 'SHE Data Center', 'ศูนย์รวมเอกสาร SHE — ประกาศ นโยบาย Procedure WI แบบฟอร์ม ผลตรวจวัด ใบอนุญาต พนักงานค้นและเปิดอ่านผ่าน LINE ได้', false)
on conflict (id) do nothing;

-- AMT section tree (mirrors the Superhuman "OHSE DATA CENTER", Nov 2026)
do $$
declare
  c constant text := 'amt';
  p uuid;
begin
  insert into public.ohse_sections (company_id, code, title, kind, employee_visible, sort_order) values
    (c, '1',  'ประกาศ (Announcement)', 'documents', true, 10),
    (c, '2',  'การแต่งตั้งบุคลากร (Appointment of personnel)', 'documents', false, 20),
    (c, '3',  'วัตถุประสงค์และเป้าหมาย (KPI)', 'documents', true, 30),
    (c, '4',  'กฎหมายและข้อบังคับ (Law and regulation)', 'folder', false, 40),
    (c, '5',  'ผลการตรวจวัดและเฝ้าระวัง (Measuring and monitoring results)', 'documents', false, 50),
    (c, '6',  'ISO14001:2015 vs ISO45001:2018', 'documents', false, 60),
    (c, '7',  'เอกสาร (Document)', 'folder', true, 70),
    (c, '8',  'ใบอนุญาต (License)', 'licenses', false, 80),
    (c, '9',  'กิจกรรมด้าน OHSE และพลังงาน (Activity)', 'folder', true, 90),
    (c, '10', 'การจัดการของเสีย (Waste Management)', 'documents', true, 100),
    (c, '11', 'SDS เอกสารข้อมูลความปลอดภัยสารเคมี', 'documents', true, 110),
    (c, '12', 'เหตุฉุกเฉิน (Emergency)', 'documents', true, 120),
    (c, '13', 'ขออนุญาตบุคคลภายนอกเข้าพื้นที่', 'link', true, 130),
    (c, '14', 'ผู้รับเหมา (Contractor)', 'documents', true, 140),
    (c, '15', 'ขออนุญาตจอดรถในโรงงาน', 'link', true, 150),
    (c, '16', 'ตรวจถังดับเพลิง', 'link', false, 160),
    (c, '17', 'ระบบการจัดการพลังงาน (Energy Management System)', 'documents', true, 170),
    (c, 'H',  'คู่มืออาชีวอนามัย ความปลอดภัย และสิ่งแวดล้อม (OHSE Handbook)', 'documents', true, 5);

  update public.ohse_sections set link_url = 'https://tools.eashe.org/inspect' where company_id = c and code = '16';

  select id into p from public.ohse_sections where company_id = c and code = '4';
  insert into public.ohse_sections (company_id, parent_id, code, title, kind, employee_visible, sort_order) values
    (c, p, '4.1', 'กฎหมายสิ่งแวดล้อม (Environmental Law)', 'documents', false, 1),
    (c, p, '4.2', 'กฎหมายอาชีวอนามัยและความปลอดภัย (OSH Law)', 'documents', false, 2);

  select id into p from public.ohse_sections where company_id = c and code = '5';
  insert into public.ohse_sections (company_id, parent_id, code, title, kind, employee_visible, sort_order) values
    (c, p, '5.1', 'สิ่งแวดล้อม (Environment)', 'folder', false, 1),
    (c, p, '5.2', 'อาชีวอนามัยและความปลอดภัย (OSH)', 'folder', false, 2);
  select id into p from public.ohse_sections where company_id = c and code = '5.1';
  insert into public.ohse_sections (company_id, parent_id, code, title, kind, employee_visible, sort_order) values
    (c, p, '5.1.1', 'น้ำเสียและน้ำทิ้ง (Wastewater & Discharge water)', 'monitoring', false, 1),
    (c, p, '5.1.2', 'น้ำผิวดิน (Surface water)', 'monitoring', false, 2),
    (c, p, '5.1.3', 'ดิน (Soil)', 'monitoring', false, 3),
    (c, p, '5.1.4', 'น้ำใต้ดิน (Ground water)', 'monitoring', false, 4),
    (c, p, '5.1.5', 'เสียงและการสั่นสะเทือน (Sound and vibration)', 'monitoring', false, 5),
    (c, p, '5.1.6', 'ปล่องระบาย (Stack)', 'monitoring', false, 6),
    (c, p, '5.1.7', 'คุณภาพอากาศ (Air quality)', 'monitoring', false, 7);
  select id into p from public.ohse_sections where company_id = c and code = '5.2';
  insert into public.ohse_sections (company_id, parent_id, code, title, kind, employee_visible, sort_order) values
    (c, p, '5.2.1', 'แสง (Light)', 'monitoring', false, 1),
    (c, p, '5.2.2', 'เสียง (Sound)', 'monitoring', false, 2),
    (c, p, '5.2.3', 'ความร้อน (Heat)', 'monitoring', false, 3),
    (c, p, '5.2.4', 'สารเคมี (Chemical)', 'monitoring', false, 4),
    (c, p, '5.2.5', 'รังสี (Radiation)', 'monitoring', false, 5),
    (c, p, '5.2.6', 'สุขภาพ (Health)', 'monitoring', false, 6);

  select id into p from public.ohse_sections where company_id = c and code = '7';
  insert into public.ohse_sections (company_id, parent_id, code, title, kind, employee_visible, sort_order) values
    (c, p, '7.1', 'คู่มือ (Manual)', 'documents', true, 1),
    (c, p, '7.2', 'ขั้นตอนการปฏิบัติงาน (Procedure)', 'documents', true, 2),
    (c, p, '7.3', 'วิธีการปฏิบัติงาน (Work Instruction)', 'documents', true, 3),
    (c, p, '7.4', 'แบบฟอร์ม (Form)', 'documents', true, 4),
    (c, p, '7.5', 'เอกสารสนับสนุน (Support document)', 'documents', true, 5),
    (c, p, '7.6', 'เอกสารอ้างอิง (Reference document)', 'documents', true, 6);

  select id into p from public.ohse_sections where company_id = c and code = '9';
  insert into public.ohse_sections (company_id, parent_id, code, title, kind, employee_visible, sort_order) values
    (c, p, '9.1', 'คณะกรรมการ คปอ. (OSH Committee)', 'documents', true, 1),
    (c, p, '9.2', 'ตรวจพื้นที่ความปลอดภัย สิ่งแวดล้อม และ 5ส.', 'documents', false, 2),
    (c, p, '9.3', 'ประชาสัมพันธ์ด้านสิ่งแวดล้อม', 'documents', true, 3),
    (c, p, '9.4', 'ประชาสัมพันธ์ด้านอาชีวอนามัยและความปลอดภัย', 'documents', true, 4);
end $$;

comment on table public.ohse_sections is 'SHE Data Center section tree per company (kind decides the register columns).';
comment on table public.ohse_documents is 'SHE Data Center register: documents, monitoring results (result), licenses (expires_on). status=superseded keeps revision history.';
comment on table public.ohse_import_staging is 'Raw rows captured from Superhuman during the Nov 2026 migration; safe to drop after verification.';

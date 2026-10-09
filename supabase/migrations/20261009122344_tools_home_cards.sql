-- Tools homepage presentation settings. Separate from eashe.org's project portal.
create table public.tools_home_cards (
  id text primary key check (id in ('ppe','chemical','permit','inspection','she-workforce')),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 500),
  is_visible boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.tools_home_cards (id,name,description) values
  ('ppe','PPE Inventory','จัดการสต็อกอุปกรณ์ป้องกันส่วนบุคคล (PPE) รับเข้า เบิกออก ดูรายงาน'),
  ('chemical','Chemical Management','ทะเบียนสารเคมี แนบ SDS โปสเตอร์สรุปความปลอดภัย และตารางเก็บร่วม/แยกตามคู่มือ กรอ.'),
  ('permit','Work Permit','ระบบใบอนุญาตทำงาน Hot Work, Confined Space, Working at Height'),
  ('inspection','Safety Inspection','ตรวจสอบความปลอดภัย Checklist ภาพถ่าย และติดตามการแก้ไข'),
  ('she-workforce','SHE Workforce','บริหารบุคลากรด้านความปลอดภัย อาชีวอนามัย สิ่งแวดล้อม ใบอนุญาต และวิเคราะห์ภาระงาน');
alter table public.tools_home_cards enable row level security;
revoke all on public.tools_home_cards from public, anon, authenticated, service_role;
grant select on public.tools_home_cards to service_role;
grant update (name,description,is_visible,revision,updated_at,updated_by) on public.tools_home_cards to service_role;
comment on table public.tools_home_cards is 'Global tools.eashe.org homepage cards. Public API reads visible cards; only verified Tools admins may edit. Hiding does not change tool access permissions.';

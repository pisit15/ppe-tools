-- Chemical Management: การตั้งค่ารายบริษัท (เบอร์ฉุกเฉินบนโปสเตอร์)
-- emergency_contacts: [{ "label": "ศูนย์พิษวิทยา รพ.รามาธิบดี", "phone": "1367" }, ...]
-- show_emergency: false = ไม่แสดงบรรทัดฉุกเฉินบนโปสเตอร์เลย

create table if not exists chem_company_settings (
  company_id text primary key,
  emergency_contacts jsonb not null default '[]'::jsonb,
  show_emergency boolean not null default true,
  updated_at timestamptz not null default now()
);

drop trigger if exists chem_company_settings_touch on chem_company_settings;
create trigger chem_company_settings_touch before update on chem_company_settings for each row execute function chem_touch_updated_at();

alter table chem_company_settings enable row level security;
drop policy if exists "Allow all chem_company_settings" on chem_company_settings;
create policy "Allow all chem_company_settings" on chem_company_settings for all using (true) with check (true);

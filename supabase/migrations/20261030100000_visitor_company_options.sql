-- Per-company option lists for the visitor request form (work areas and departments differ by site).
-- AMT is seeded with the lists from Jotform 241632326118046; other companies start empty and the form
-- falls back to free text until the SHE team fills them in at /visitor/settings.
create table public.visitor_company_options (
  company_id text primary key references public.company_settings(company_id),
  areas text[] not null default '{}',
  departments text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text,
  check (cardinality(areas) <= 100),
  check (cardinality(departments) <= 100)
);
alter table public.visitor_company_options enable row level security;
revoke all on public.visitor_company_options from public, anon, authenticated, service_role;
grant select, insert, update on public.visitor_company_options to service_role;

insert into public.visitor_company_options (company_id, areas, departments, updated_by) values ('amt',
  array['FB01 ชั้น 1','FB01 ชั้น 1.5','FB01 ชั้น 1.5.5','FB01 ชั้น 2','FB01 ชั้น 2.5','อาคาร Electrolyte','อาคาร Workshop','อาคาร UT','อาคาร CCR','อาคาร Warehouse ใหม่','ห้องขยะ (Solid Waste)','Waste Water Treatment','Sub Station','ESS','Raw Material Loading','พื้นที่รอบนอกอาคาร','อื่น ๆ'],
  array['Accounting','Administration','Battery Manufacturing','Cell Assembly','Customer Service','Domestic Sales','Electrode','Equipment Development','Facility Maintenance','Formation','Human Resources','Manufacturing Planning','MES','MIS','NMP','Pack','Module','Process Engineering','Procurement','Production Development','Production Plant Maintenance','Project 2 G','Quality Control','Quality Engineering','Quality Management System','Research & Development','Safety & Environment','Supplier Quality Management','Supply Chain Management','Warehouse & Logistics','Others (อื่นๆ)'],
  'migration 2026-10-30')
on conflict (company_id) do nothing;

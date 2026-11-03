-- Per-company "ตรวจที่ทางเข้า" matrix (gate check): what the guard checks per visitor type.
-- null = use the built-in AMT default (PPE: helmet / vest / shoes). Shape: see GateCheckConfig in src/lib/visitor/types.ts.
alter table public.visitor_company_options add column if not exists gate_check jsonb;
comment on column public.visitor_company_options.gate_check is 'GateCheckConfig JSON: { title, items[], rows[{ key,label,en,purposes[],areaMode,areas[],checks[] }] }; null = AMT default';

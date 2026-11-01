-- Equipment inspection via LINE OA: inspectors send a photo of the asset (QR label visible)
-- to the EA SHE Center OA; the webhook decodes the QR and records a pass. Replies only (no push quota).
--
-- One row per LINE user who has used this: which inspector they are (per company) and the
-- short-lived context used to attach follow-up photos / "ไม่ผ่าน" text to the last record.
create table public.insp_line_users (
  line_user_id text primary key,
  company_id text references public.company_settings(company_id),
  inspector_code text not null default '' check (length(inspector_code) <= 40),
  inspector_name text not null default '' check (length(inspector_name) <= 120),
  linked_via text not null default 'code' check (linked_via in ('code', 'account')),
  last_inspection_id uuid references public.insp_inspections(id) on delete set null,
  last_asset_id uuid references public.insp_assets(id) on delete set null,
  last_at timestamptz,
  inspected_on_override date,
  override_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger insp_line_users_touch before update on public.insp_line_users for each row execute function public.insp_touch();

alter table public.insp_line_users enable row level security;
revoke all on public.insp_line_users from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.insp_line_users to service_role;

-- 'line' as an inspection source
alter table public.insp_inspections drop constraint insp_inspections_source_check;
alter table public.insp_inspections add constraint insp_inspections_source_check check (source in ('qr', 'app', 'import', 'line'));

-- Reply-token work must finish fast; keep the LINE message id to make retries idempotent.
alter table public.insp_photos add column line_message_id text unique;

comment on table public.insp_line_users is 'LINE users allowed to record equipment inspections by sending photos to the OA; identity = inspector code (department mode) or linked SHE account.';

-- Single-use, short-lived tickets that let a sync job import PR data without an admin browser login
-- (approved by the owner 2026-10-22). Only the SHA-256 hash is stored; the finalize step spends it.
create table public.proc_import_tickets (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null default 'procurement_import' check (purpose = 'procurement_import'),
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at <= created_at + interval '1 hour')
);
alter table public.proc_import_tickets enable row level security;
revoke all on public.proc_import_tickets from public, anon, authenticated;
grant select, insert on public.proc_import_tickets to service_role;
grant update (used_at) on public.proc_import_tickets to service_role;
comment on table public.proc_import_tickets is 'Hashed single-use tickets (max 1 hour) for /api/procurement/import. Service role only.';

-- Procurement analytics (PR / PO / quotations) for the SHE team.
-- Source: Odoo purchase.request / purchase.order(.line) pulled read-only by the daily sync,
-- plus quotation data read from attached PDFs. Rows are replaced wholesale by imports.
-- Access: service_role only. API routes allow admin + personal SHE accounts (see src/lib/procurement/access.ts).

create table public.proc_pr (
  odoo_id integer primary key,
  pr_no text not null unique,
  requester text not null,
  request_date date,
  company text not null default '',
  operating_unit text not null default '',
  request_type text not null default '',
  state text not null check (state in ('draft','to_approve','approved','rejected','done')),
  title text not null default '',
  description text not null default '',
  estimated_cost numeric(16,2) not null default 0,
  po_amount numeric(16,2) not null default 0,
  po_count integer not null default 0,
  po_list text not null default '',
  vendors text not null default '',
  n_lines integer not null default 0,
  n_attachments integer not null default 0,
  drive_folder_id text,
  synced_at timestamptz not null default now()
);

create table public.proc_pr_lines (
  odoo_id integer primary key,
  pr_odoo_id integer not null references public.proc_pr(odoo_id) on delete cascade,
  pr_no text not null,
  name text not null default '',
  product text not null default '',
  qty numeric(16,4) not null default 0,
  uom text not null default '',
  est_unit_price numeric(16,4) not null default 0,
  analytic_account text not null default '',
  date_required date,
  specifications text not null default ''
);

create table public.proc_po_lines (
  odoo_id integer primary key,
  po_no text not null,
  pr_odoo_id integer not null references public.proc_pr(odoo_id) on delete cascade,
  pr_no text not null,
  requester text not null,
  vendor text not null default '',
  product text not null default '',
  item text not null default '',
  qty numeric(16,4) not null default 0,
  uom text not null default '',
  unit_price numeric(16,4) not null default 0,
  subtotal numeric(16,2) not null default 0,
  currency text not null default 'THB',
  order_date date,
  po_state text not null default ''
);

create table public.proc_quotes (
  id integer primary key,
  pr_no text not null,
  requester text not null,
  file_path text not null,
  doc_type text not null default '',
  vendor text not null default '',
  vendor_group text not null default '',
  quote_no text,
  quote_date date,
  customer text,
  currency text not null default 'THB',
  subtotal numeric(16,2),
  discount numeric(16,2),
  vat numeric(16,2),
  total numeric(16,2),
  notes text,
  n_items integer not null default 0,
  duplicate_file boolean not null default false
);

create table public.proc_quote_items (
  id integer primary key,
  quote_id integer not null references public.proc_quotes(id) on delete cascade,
  pr_no text not null,
  vendor_group text not null default '',
  quote_date date,
  name text not null default '',
  spec text,
  qty numeric(16,4),
  unit text,
  unit_price numeric(16,4),
  amount numeric(16,2),
  duplicate_file boolean not null default false,
  check_note text not null default ''
);

create table public.proc_sync_runs (
  id bigint generated always as identity primary key,
  source text not null,
  counts jsonb not null,
  data_as_of timestamptz,
  imported_by text not null,
  imported_at timestamptz not null default now()
);

create index proc_pr_lines_pr on public.proc_pr_lines(pr_odoo_id);
create index proc_po_lines_pr on public.proc_po_lines(pr_odoo_id);
create index proc_po_lines_vendor on public.proc_po_lines(vendor);
create index proc_quotes_pr on public.proc_quotes(pr_no);
create index proc_quote_items_quote on public.proc_quote_items(quote_id);
create index proc_quote_items_vendor on public.proc_quote_items(vendor_group);

alter table public.proc_pr enable row level security;
alter table public.proc_pr_lines enable row level security;
alter table public.proc_po_lines enable row level security;
alter table public.proc_quotes enable row level security;
alter table public.proc_quote_items enable row level security;
alter table public.proc_sync_runs enable row level security;
revoke all on public.proc_pr, public.proc_pr_lines, public.proc_po_lines, public.proc_quotes, public.proc_quote_items, public.proc_sync_runs from public, anon, authenticated;
grant select, insert, update, delete on public.proc_pr, public.proc_pr_lines, public.proc_po_lines, public.proc_quotes, public.proc_quote_items to service_role;
grant select, insert on public.proc_sync_runs to service_role;
grant usage, select on sequence public.proc_sync_runs_id_seq to service_role;

comment on table public.proc_pr is 'Odoo purchase requests of the SHE team (read-only mirror). Commercially sensitive: service_role only.';
comment on table public.proc_quote_items is 'Line items read from quotation PDFs attached to PRs. duplicate_file = same PDF attached to an earlier PR.';

-- Home card for the new tool (hidden until an admin turns it on).
alter table public.tools_home_cards drop constraint if exists tools_home_cards_id_check;
alter table public.tools_home_cards add constraint tools_home_cards_id_check check (id in ('ppe','chemical','permit','inspection','she-workforce','procurement'));
insert into public.tools_home_cards (id,name,description,is_visible) values
  ('procurement','PR & Supplier Price','ค้นหาราคาสินค้า/บริการที่ทีม SHE เคยซื้อและเคยได้ใบเสนอราคา เทียบผู้ขาย และดู PR ย้อนหลัง', false)
on conflict (id) do nothing;

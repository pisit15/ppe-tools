-- LINE ingestion: a photo for an asset already inspected (pass) this round is held until the sender confirms with "ตรวจซ้ำ".
alter table public.insp_line_users
  add column pending_asset_id uuid references public.insp_assets(id) on delete set null,
  add column pending_message_id text,
  add column pending_at timestamptz;

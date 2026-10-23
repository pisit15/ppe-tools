-- Links a tools.eashe.org login (username, case-insensitive) to the requester name used in Odoo PRs,
-- so non-admin users see only their own PR summary. Admins see everyone.
create table public.proc_requester_accounts (
  username text primary key check (username = lower(username) and length(username) between 1 and 100),
  requester text not null check (length(btrim(requester)) between 1 and 200),
  updated_at timestamptz not null default now()
);
create index proc_requester_accounts_requester on public.proc_requester_accounts(requester);
alter table public.proc_requester_accounts enable row level security;
revoke all on public.proc_requester_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.proc_requester_accounts to service_role;
comment on table public.proc_requester_accounts is 'Login username -> Odoo PR requester name (proc_pr.requester). Service role only.';

insert into public.proc_requester_accounts (username, requester) values
  ('ammara', 'Ammara Chongthummin'),
  ('angnatcha', 'Angnatcha Bunto'),
  ('apinan', 'Apinan Petkool'),
  ('dusit', 'Dusit Songtrakulsak'),
  ('film', 'Wanadchaporn Buengmum'),
  ('jack', 'Teppratan Kiawdee'),
  ('teppratan', 'Teppratan Kiawdee'),
  ('komsant', 'Komsant Prapapondilok'),
  ('napalai', 'Napalai Yooyangget'),
  ('narakorn', 'Narakorn Lunthat'),
  ('nimnual', 'Nimnual Mongkoldee'),
  ('orathai', 'Orathai Paela'),
  ('pachara', 'Pachara Tariya'),
  ('suwimol', 'Suwimol Poungkaew'),
  ('vanida', 'Vanida Hongkan'),
  ('varrisara', 'Varrisara Chatchawan'),
  ('worapol', 'Worapol Sookaswet'),
  ('worapol1', 'Worapol Sookaswet'),
  ('worapol2', 'Worapol Sookaswet')
on conflict (username) do nothing;

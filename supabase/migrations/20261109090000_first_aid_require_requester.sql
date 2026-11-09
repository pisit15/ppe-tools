-- Per-point rule: must the person collecting be named? (ห้องพยาบาล: usually yes; self-service cabinet: company's choice)
alter table public.fa_locations add column if not exists require_requester boolean not null default false;

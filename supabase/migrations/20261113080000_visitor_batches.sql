-- Multi-day visits: one request per day, linked by batch_id so SHE can approve the whole set and the requester tracks it as one.
alter table public.visitor_requests add column if not exists batch_id uuid;
create index if not exists visitor_requests_batch_idx on public.visitor_requests (batch_id) where batch_id is not null;
comment on column public.visitor_requests.batch_id is 'Requests submitted together for several dates share a batch_id (null = single day)';

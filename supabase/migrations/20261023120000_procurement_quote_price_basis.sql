-- What a quotation's total covers, so quotes priced per month are never compared with yearly or one-off totals.
alter table public.proc_quotes
  add column price_basis text check (price_basis in ('month', 'year', 'once'));

comment on column public.proc_quotes.price_basis is
  'month = total is a monthly price of a recurring service; year = covers a year; once = one-off purchase/job; null = unknown';

-- Optional company-assigned identifier. Existing records remain null; no inferred codes.
-- Existing table authorization/RLS and update-concurrency checks remain in force.
alter table public.chem_substances
  add column document_code text
  constraint chem_substances_document_code_check
  check (document_code is null or (char_length(document_code) <= 120 and char_length(btrim(document_code)) > 0));

comment on column public.chem_substances.document_code is
  'Company-assigned registry / SDS document code; editable independently of saved poster revisions.';
notify pgrst, 'reload schema';

-- Preserve existing IDs and signed document references for contractor accounts.
alter table public.wp_contractors
 add column requester_type text not null default 'contractor' check (requester_type in ('employee','contractor')),
 add column department text not null default '',
 add constraint wp_requester_affiliation check (
   (requester_type='employee' and length(btrim(department))>0)
   or (requester_type='contractor' and length(btrim(contractor_name))>0)
 );

-- Company-level background image for the public request form (and default for the guard board).
-- Stored as a downscaled JPEG data URL (<= 600 KB) so no public storage bucket is needed.
alter table public.visitor_company_options
  add column form_background text check (form_background is null or (form_background like 'data:image/jpeg;base64,%' and length(form_background) <= 800000)),
  add column form_background_dim smallint not null default 75 check (form_background_dim between 0 and 95);
comment on column public.visitor_company_options.form_background is 'JPEG data URL shown behind the visitor request form; null = plain background.';
comment on column public.visitor_company_options.form_background_dim is 'Opacity (%) of the light overlay on top of the image so the form stays readable.';

-- Match the AAB form identifier in the supplied reference image.
-- Do not overwrite any template that an Admin has already edited.
update public.chem_poster_templates
set config=jsonb_set(config,'{formCode}','"AAB-AABX-OHS-FM-031"'::jsonb), revision=revision+1, updated_at=now()
where name='AAB · ตาราง SDS หน้างาน' and revision=1 and company_id='all'
  and config->>'formCode'='AAB-AABS-OHS-FM-031';

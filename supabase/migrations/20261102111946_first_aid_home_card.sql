-- Keep platform card identifiers constrained while registering the new module.
alter table public.tools_home_cards drop constraint if exists tools_home_cards_id_check;
alter table public.tools_home_cards add constraint tools_home_cards_id_check check (
  id in ('ppe','chemical','permit','inspection','she-workforce','procurement','visitor','inspect','first-aid')
);
insert into public.tools_home_cards(id,name,description,is_visible)
values (
  'first-aid',
  'First Aid & Medicine Control',
  'ดูแลจุดปฐมพยาบาล สต็อกยาและเวชภัณฑ์ วันหมดอายุ และการเบิกใช้ ทั้งเจ้าหน้าที่จ่ายให้และผู้เบิกบันทึกเอง',
  true
) on conflict (id) do nothing;

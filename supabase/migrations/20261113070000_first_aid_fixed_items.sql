-- Fixed equipment (scissors, thermometer, BP monitor, AED): kept at a point, never dispensed.
-- dispense_mode gains 'fixed'. Such items can be received, transferred and written off (damaged / lost / past due),
-- but an issue movement is refused at the database, whichever caller posts it.
alter table public.fa_items drop constraint if exists fa_items_dispense_mode_check;
alter table public.fa_items add constraint fa_items_dispense_mode_check check (dispense_mode in ('unit','shared','fixed'));

create or replace function public.fa_block_fixed_issue() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if exists (select 1 from public.fa_documents d where d.company_id=new.company_id and d.id=new.document_id and d.kind='issue')
     and exists (select 1 from public.fa_items i where i.company_id=new.company_id and i.id=new.item_id and i.dispense_mode='fixed') then
    raise exception 'รายการนี้เป็นอุปกรณ์ประจำจุด ไม่ต้องเบิก — หากชำรุดหรือสูญหายให้ตัดออกจากหน้ารายการยา';
  end if;
  return new;
end;
$$;
revoke all on function public.fa_block_fixed_issue() from public, anon, authenticated;
grant execute on function public.fa_block_fixed_issue() to service_role;

drop trigger if exists fa_movements_block_fixed_issue on public.fa_movements;
create trigger fa_movements_block_fixed_issue before insert on public.fa_movements
  for each row execute function public.fa_block_fixed_issue();

-- A configured point must have assigned items before its audit snapshot can be ready.
create or replace function public.fa_record_inspection(
  p_company_id text,p_location_id uuid,p_actor_key text,p_notes text,p_has_issue boolean,p_create_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_result public.fa_inspections%rowtype; v_existing public.fa_inspections%rowtype; v_today date:=(now() at time zone 'Asia/Bangkok')::date; v_low jsonb; v_expired jsonb;
begin
  if p_create_id is null then raise exception 'ไม่พบรหัสป้องกันรายการซ้ำ'; end if;
  if length(btrim(coalesce(p_actor_key,''))) not between 1 and 250 or length(coalesce(p_notes,''))>2000 then raise exception 'ข้อมูลผลตรวจไม่ถูกต้อง'; end if;
  perform 1 from public.fa_company_settings where company_id=p_company_id for update;
  if not found then raise exception 'ไม่พบข้อมูลบริษัท'; end if;
  perform 1 from public.fa_locations where company_id=p_company_id and id=p_location_id and active for update;
  if not found then raise exception 'ไม่พบจุดปฐมพยาบาลของบริษัทนี้'; end if;
  select * into v_existing from public.fa_inspections where id=p_create_id;
  if found then
    if v_existing.company_id is distinct from p_company_id or v_existing.location_id is distinct from p_location_id or v_existing.actor_key is distinct from p_actor_key or v_existing.notes is distinct from btrim(coalesce(p_notes,'')) or v_existing.has_issue is distinct from coalesce(p_has_issue,false) then
      raise exception 'เลขคำขอนี้ใช้กับผลตรวจอื่นแล้ว กรุณาเริ่มรายการใหม่';
    end if;
    return to_jsonb(v_existing);
  end if;
  select coalesce(jsonb_agg(t.item_id),'[]'::jsonb) into v_low from public.fa_location_items t
    where t.company_id=p_company_id and t.location_id=p_location_id and t.min>(
      select coalesce(sum(l.quantity),0) from public.fa_lots l where l.company_id=t.company_id and l.location_id=t.location_id and l.item_id=t.item_id and (l.expiry is null or l.expiry>=v_today)
    );
  select coalesce(jsonb_agg(l.id),'[]'::jsonb) into v_expired from public.fa_lots l where l.company_id=p_company_id and l.location_id=p_location_id and l.quantity>0 and l.expiry<v_today;
  insert into public.fa_inspections(id,company_id,location_id,date,notes,has_issue,ready,low_items,expired_lots,actor_key)
    values(p_create_id,p_company_id,p_location_id,v_today,btrim(coalesce(p_notes,'')),coalesce(p_has_issue,false),not coalesce(p_has_issue,false) and exists(select 1 from public.fa_location_items where company_id=p_company_id and location_id=p_location_id) and jsonb_array_length(v_low)=0 and jsonb_array_length(v_expired)=0,v_low,v_expired,p_actor_key) returning * into v_result;
  update public.fa_locations set last_checked=v_today,inspection_issue=coalesce(p_has_issue,false) where company_id=p_company_id and id=p_location_id;
  return to_jsonb(v_result);
end;
$$;
revoke all on function public.fa_record_inspection(text,uuid,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.fa_record_inspection(text,uuid,text,text,boolean,uuid) to service_role;


-- Existing server callers may still use the original signature. New callers use
-- the six-argument form with a stable client-generated request identifier.
create or replace function public.fa_record_inspection(
  p_company_id text,p_location_id uuid,p_actor_key text,p_notes text,p_has_issue boolean
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  return public.fa_record_inspection(p_company_id,p_location_id,p_actor_key,p_notes,p_has_issue,gen_random_uuid());
end;
$$;
revoke all on function public.fa_record_inspection(text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fa_record_inspection(text,uuid,text,text,boolean) to service_role;

-- Stock operations take this same company lock before reading item units. The
-- guard must run in the database: an API preflight alone races a first receipt.
create or replace function public.fa_guard_item_fields()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.unit is not distinct from old.unit and new.track_expiry is not distinct from old.track_expiry then return new; end if;
  perform 1 from public.fa_company_settings where company_id=old.company_id for update;
  if not found then raise exception 'ไม่พบข้อมูลบริษัท'; end if;
  if new.unit is distinct from old.unit and (
    exists(select 1 from public.fa_lots where company_id=old.company_id and item_id=old.id)
    or exists(select 1 from public.fa_movements where company_id=old.company_id and item_id=old.id)
  ) then
    raise exception 'รายการนี้มีสต็อกหรือประวัติแล้ว ไม่สามารถเปลี่ยนหน่วยนับได้ กรุณาสร้างรายการใหม่';
  end if;
  if not old.track_expiry and new.track_expiry and exists(
    select 1 from public.fa_lots where company_id=old.company_id and item_id=old.id and expiry is null and quantity>0
  ) then
    raise exception 'มีล็อตที่ยังไม่ระบุวันหมดอายุ กรุณาจัดการก่อนเปิดติดตามวันหมดอายุ';
  end if;
  return new;
end;
$$;
revoke all on function public.fa_guard_item_fields() from public,anon,authenticated;
grant execute on function public.fa_guard_item_fields() to service_role;
create trigger fa_items_guard_fields before update of unit,track_expiry on public.fa_items
for each row execute function public.fa_guard_item_fields();

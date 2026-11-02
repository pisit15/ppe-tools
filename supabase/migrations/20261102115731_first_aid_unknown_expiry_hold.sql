-- Imported tracked stock without confirmed expiry stays visible but cannot be issued.
-- Equipment that does not track expiry remains available; no grants are widened.
create or replace function public.fa_post_transaction(
  p_company_id text,
  p_actor_key text,
  p_actor_name text,
  p_idempotency_key uuid,
  p_payload jsonb,
  p_public_token_hash text default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_kind text;
  v_mode text;
  v_location public.fa_locations%rowtype;
  v_destination public.fa_locations%rowtype;
  v_item public.fa_items%rowtype;
  v_document public.fa_documents%rowtype;
  v_existing public.fa_documents%rowtype;
  v_lot public.fa_lots%rowtype;
  v_line jsonb;
  v_lines jsonb;
  v_requester jsonb := '{}'::jsonb;
  v_recipient jsonb := '{}'::jsonb;
  v_name text;
  v_department text;
  v_code text;
  v_actor_key text;
  v_actor_name text;
  v_on_behalf boolean;
  v_note text;
  v_date date;
  v_expiry date;
  v_lot_code text;
  v_item_id uuid;
  v_lot_id uuid;
  v_quantity integer;
  v_remaining integer;
  v_taken integer;
  v_available bigint;
  v_lot_count integer;
  v_allocations jsonb;
  v_result jsonb;
begin
  if p_company_id is null or p_company_id !~ '^[A-Za-z0-9_-]+$' or p_company_id in ('admin','all','default') then
    raise exception 'กรุณาเลือกบริษัทที่ถูกต้อง';
  end if;
  if p_idempotency_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'ข้อมูลรายการไม่ถูกต้อง';
  end if;
  v_kind := p_payload->>'kind';
  if v_kind is null or v_kind not in ('issue','receive','transfer','dispose') then raise exception 'กรุณาเลือกประเภทรายการ'; end if;
  v_lines := p_payload->'lines';
  if v_lines is null or jsonb_typeof(v_lines)<>'array' then raise exception 'กรุณาระบุรายการ'; end if;
  if jsonb_array_length(v_lines) not between 1 and 8 then raise exception 'บันทึกได้ครั้งละ 1–8 รายการ'; end if;
  if coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'กรุณาระบุวันที่ให้ถูกต้อง'; end if;
  v_date := (p_payload->>'date')::date;
  if v_date > v_today then raise exception 'วันที่รายการต้องไม่เกินวันที่ปัจจุบัน'; end if;
  v_note := btrim(coalesce(p_payload->>'note',''));
  if length(v_note)>1000 then raise exception 'หมายเหตุต้องไม่เกิน 1,000 ตัวอักษร'; end if;
  if v_kind='dispose' and v_note='' then raise exception 'กรุณาระบุเหตุผลที่ตัดจำหน่าย'; end if;
  v_on_behalf := coalesce((p_payload->>'onBehalf')::boolean,false);

  -- This lock serializes all stock writes for one company. A failed statement
  -- rolls back every line, the document and all allocations together.
  insert into public.fa_company_settings(company_id) values(p_company_id) on conflict do nothing;
  perform 1 from public.fa_company_settings where company_id=p_company_id for update;
  select * into v_location from public.fa_locations where company_id=p_company_id and id=(p_payload->>'locationId')::uuid and active for update;
  if not found then raise exception 'ไม่พบจุดปฐมพยาบาลของบริษัทนี้'; end if;
  if v_kind='transfer' then
    select * into v_destination from public.fa_locations where company_id=p_company_id and id=(p_payload->>'destinationId')::uuid and active for update;
    if not found or v_destination.id=v_location.id then raise exception 'กรุณาเลือกจุดปลายทางที่ต่างจากต้นทางในบริษัทเดียวกัน'; end if;
  end if;

  if p_public_token_hash is not null then
    if p_public_token_hash !~ '^[a-f0-9]{64}$' or v_location.public_token_hash is distinct from p_public_token_hash
      or v_location.issue_mode<>'self_service' or v_kind<>'issue' or p_payload->>'mode' is distinct from 'self_service' then
      raise exception 'จุดนี้ไม่เปิดให้บันทึกการหยิบใช้ด้วยตนเอง';
    end if;
    v_mode := 'self_service';
  else
    if coalesce(p_payload->>'mode','staff')<>'staff' or length(btrim(coalesce(p_actor_key,''))) not between 1 and 250 or length(btrim(coalesce(p_actor_name,''))) not between 1 and 160 then
      raise exception 'ไม่พบผู้บันทึกรายการที่ถูกต้อง';
    end if;
    v_mode := 'staff';
  end if;

  if v_kind='issue' then
    if jsonb_typeof(p_payload->'requester') is distinct from 'object' then raise exception 'กรุณาระบุผู้เบิก'; end if;
    v_name := btrim(coalesce(p_payload->'requester'->>'name',''));
    v_department := btrim(coalesce(p_payload->'requester'->>'department',''));
    v_code := btrim(coalesce(p_payload->'requester'->>'code',''));
    if length(v_name) not between 1 and 120 or length(v_department) not between 1 and 120 or length(v_code)>40 then raise exception 'กรุณาระบุชื่อและหน่วยงานของผู้เบิก'; end if;
    v_requester := jsonb_build_object('id',p_payload->'requester'->'id','code',v_code,'name',v_name,'department',v_department,'identityMethod','self_declared');
    v_recipient := v_requester;
    if v_on_behalf then
      if jsonb_typeof(p_payload->'recipientPerson') is distinct from 'object' then raise exception 'กรุณาระบุผู้รับจริงเมื่อเบิกแทน'; end if;
      v_name := btrim(coalesce(p_payload->'recipientPerson'->>'name',''));
      v_department := btrim(coalesce(p_payload->'recipientPerson'->>'department',''));
      v_code := btrim(coalesce(p_payload->'recipientPerson'->>'code',''));
      if length(v_name) not between 1 and 120 or length(v_department) not between 1 and 120 or length(v_code)>40 then raise exception 'กรุณาระบุชื่อและหน่วยงานของผู้รับจริง'; end if;
      v_recipient := jsonb_build_object('id',p_payload->'recipientPerson'->'id','code',v_code,'name',v_name,'department',v_department,'identityMethod','self_declared');
      if (nullif(v_requester->>'id','') is not null and v_requester->>'id'=v_recipient->>'id') or
        (regexp_replace(lower(v_requester->>'name'),'\s','','g')=regexp_replace(lower(v_name),'\s','','g') and regexp_replace(lower(v_requester->>'department'),'\s','','g')=regexp_replace(lower(v_department),'\s','','g')) then
        raise exception 'ผู้รับจริงต้องต่างจากผู้เบิกเมื่อเลือกเบิกแทน';
      end if;
    end if;
  end if;
  if v_mode='self_service' then
    v_actor_key := 'self_declared';
    v_actor_name := v_requester->>'name';
  else
    v_actor_key := btrim(p_actor_key); v_actor_name:=btrim(p_actor_name);
  end if;

  select * into v_existing from public.fa_documents where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_payload is distinct from p_payload or v_existing.actor_key is distinct from v_actor_key then raise exception 'เลขคำขอนี้ใช้กับรายการอื่นแล้ว กรุณาเริ่มรายการใหม่'; end if;
    select jsonb_build_object('document',to_jsonb(v_existing)-'request_payload','movements',coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb)) into v_result
      from public.fa_movements m where m.company_id=p_company_id and m.document_id=v_existing.id;
    return v_result;
  end if;
  if v_mode='self_service' and (select count(*) from public.fa_documents where company_id=p_company_id and location_id=v_location.id and recording_mode='self_service' and created_at>now()-interval '1 minute')>=30 then
    raise exception 'มีรายการจำนวนมาก กรุณารอสักครู่แล้วลองใหม่';
  end if;

  insert into public.fa_documents(company_id,idempotency_key,kind,location_id,destination_id,date,actor_key,actor_name,recording_mode,requester,recipient_person,on_behalf,note,request_payload)
    values(p_company_id,p_idempotency_key,v_kind,v_location.id,case when v_kind='transfer' then v_destination.id else null end,v_date,v_actor_key,v_actor_name,v_mode,v_requester,v_recipient,v_on_behalf,v_note,p_payload)
    returning * into v_document;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    if jsonb_typeof(v_line)<>'object' or jsonb_typeof(v_line->'quantity') is distinct from 'number' or coalesce(v_line->>'quantity','') !~ '^[0-9]+$' or length(v_line->>'quantity')>7 then raise exception 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0'; end if;
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity not between 1 and 1000000 then raise exception 'จำนวนต้องอยู่ระหว่าง 1–1,000,000'; end if;
    v_item_id := (v_line->>'itemId')::uuid;
    select * into v_item from public.fa_items where company_id=p_company_id and id=v_item_id and active;
    if not found then raise exception 'ไม่พบรายการยาและเวชภัณฑ์ของบริษัทนี้'; end if;
    v_lot_id := nullif(v_line->>'lotId','')::uuid;
    v_allocations := '[]'::jsonb;

    if v_kind='receive' then
      v_expiry := nullif(p_payload->>'expiry','')::date;
      if v_item.track_expiry and v_expiry is null then raise exception 'กรุณาระบุวันหมดอายุ'; end if;
      if v_expiry<v_today then raise exception 'ไม่สามารถรับเข้าล็อตที่หมดอายุแล้ว'; end if;
      v_lot_code := btrim(coalesce(p_payload->>'lotCode',''));
      if v_lot_code='' then v_lot_code:='IN-'||to_char(v_date,'YYYYMMDD')||'-'||left(v_document.id::text,8); end if;
      if length(v_lot_code)>120 then raise exception 'เลขล็อตต้องไม่เกิน 120 ตัวอักษร'; end if;
      insert into public.fa_lots(company_id,item_id,location_id,code,expiry,quantity)
        values(p_company_id,v_item_id,v_location.id,v_lot_code,v_expiry,v_quantity)
        on conflict(company_id,location_id,item_id,code,expiry) do update set quantity=public.fa_lots.quantity+excluded.quantity
        returning * into v_lot;
      v_allocations:=jsonb_build_array(jsonb_build_object('lotId',v_lot.id,'code',v_lot.code,'expiry',v_lot.expiry,'quantity',v_quantity));
      insert into public.fa_location_items(company_id,location_id,item_id,min) values(p_company_id,v_location.id,v_item_id,v_item.min) on conflict do nothing;
    else
      if v_lot_id is not null then
        perform 1 from public.fa_lots where company_id=p_company_id and id=v_lot_id and item_id=v_item_id and location_id=v_location.id;
        if not found then raise exception 'ล็อตที่เลือกไม่ตรงกับรายการหรือจุดปฐมพยาบาล'; end if;
      end if;
      select coalesce(sum(quantity),0),count(*) into v_available,v_lot_count from public.fa_lots
        where company_id=p_company_id and item_id=v_item_id and location_id=v_location.id and quantity>0
          and (v_kind='dispose' or expiry>=v_today or (expiry is null and not v_item.track_expiry));
      if v_mode='self_service' and v_lot_count>1 and v_lot_id is null then raise exception 'กรุณาเลือกล็อตที่หยิบจริงให้ตรงกับบรรจุภัณฑ์'; end if;
      if v_lot_id is not null then
        select coalesce(sum(quantity),0) into v_available from public.fa_lots where company_id=p_company_id and id=v_lot_id and quantity>0 and (v_kind='dispose' or expiry>=v_today or (expiry is null and not v_item.track_expiry));
      end if;
      if v_available<v_quantity then raise exception 'ยอดพร้อมใช้ไม่เพียงพอหรือล็อตที่เลือกหมดอายุแล้ว'; end if;
      v_remaining:=v_quantity;
      for v_lot in select * from public.fa_lots where company_id=p_company_id and item_id=v_item_id and location_id=v_location.id and quantity>0
        and (v_kind='dispose' or expiry>=v_today or (expiry is null and not v_item.track_expiry)) and (v_lot_id is null or id=v_lot_id)
        order by expiry nulls last,created_at,id for update loop
        exit when v_remaining=0;
        v_taken:=least(v_remaining,v_lot.quantity);
        update public.fa_lots set quantity=quantity-v_taken where company_id=p_company_id and id=v_lot.id;
        v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('lotId',v_lot.id,'code',v_lot.code,'expiry',v_lot.expiry,'quantity',v_taken));
        v_remaining:=v_remaining-v_taken;
        if v_kind='transfer' then
          insert into public.fa_lots(company_id,item_id,location_id,code,expiry,quantity)
            values(p_company_id,v_item_id,v_destination.id,v_lot.code,v_lot.expiry,v_taken)
            on conflict(company_id,location_id,item_id,code,expiry) do update set quantity=public.fa_lots.quantity+excluded.quantity;
        end if;
      end loop;
      if v_remaining<>0 then raise exception 'ยอดคงเหลือเปลี่ยนแปลง กรุณาโหลดข้อมูลใหม่'; end if;
      if v_kind='transfer' then insert into public.fa_location_items(company_id,location_id,item_id,min) values(p_company_id,v_destination.id,v_item_id,v_item.min) on conflict do nothing; end if;
    end if;
    insert into public.fa_movements(company_id,document_id,item_id,location_id,destination_id,quantity,allocations)
      values(p_company_id,v_document.id,v_item_id,v_location.id,case when v_kind='transfer' then v_destination.id else null end,v_quantity,v_allocations);
  end loop;
  select jsonb_build_object('document',to_jsonb(v_document)-'request_payload','movements',coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb)) into v_result
    from public.fa_movements m where m.company_id=p_company_id and m.document_id=v_document.id;
  return v_result;
end;
$$;
revoke all on function public.fa_post_transaction(text,text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.fa_post_transaction(text,text,text,uuid,jsonb,text) to service_role;

-- A configured point must have assigned items before its audit snapshot can be ready.
create or replace function public.fa_record_inspection(
  p_company_id text,p_location_id uuid,p_actor_key text,p_notes text,p_has_issue boolean,p_create_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_result public.fa_inspections%rowtype; v_existing public.fa_inspections%rowtype; v_today date:=(now() at time zone 'Asia/Bangkok')::date; v_low jsonb; v_expired jsonb; v_pending boolean;
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
      select coalesce(sum(l.quantity),0) from public.fa_lots l where l.company_id=t.company_id and l.location_id=t.location_id and l.item_id=t.item_id and (l.expiry>=v_today or (l.expiry is null and exists(select 1 from public.fa_items i where i.company_id=l.company_id and i.id=l.item_id and not i.track_expiry)))
    );
  select coalesce(jsonb_agg(l.id),'[]'::jsonb) into v_expired from public.fa_lots l where l.company_id=p_company_id and l.location_id=p_location_id and l.quantity>0 and l.expiry<v_today;
  select exists(select 1 from public.fa_lots l join public.fa_items i on i.company_id=l.company_id and i.id=l.item_id where l.company_id=p_company_id and l.location_id=p_location_id and l.quantity>0 and l.expiry is null and i.track_expiry) into v_pending;
  insert into public.fa_inspections(id,company_id,location_id,date,notes,has_issue,ready,low_items,expired_lots,actor_key)
    values(p_create_id,p_company_id,p_location_id,v_today,btrim(coalesce(p_notes,'')),coalesce(p_has_issue,false),not coalesce(p_has_issue,false) and exists(select 1 from public.fa_location_items where company_id=p_company_id and location_id=p_location_id) and jsonb_array_length(v_low)=0 and jsonb_array_length(v_expired)=0 and not v_pending,v_low,v_expired,p_actor_key) returning * into v_result;
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


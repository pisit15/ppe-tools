-- Shared-use items (eye wash bottle, liniment tube): one container is opened at a point and used many times.
-- Stock unit stays the container; each use is recorded as a movement with usage='use' that does not touch lots.
-- Opening a new container is usage='open': FEFO-deducts one container and remembers it on fa_location_items so the
-- post-opening shelf life (open_life_days) can be enforced separately from the label expiry.
alter table public.fa_items add column if not exists dispense_mode text not null default 'unit' check (dispense_mode in ('unit','shared'));
alter table public.fa_items add column if not exists open_life_days integer check (open_life_days is null or open_life_days between 1 and 3650);
alter table public.fa_location_items add column if not exists opened_at date;
alter table public.fa_location_items add column if not exists opened_lot_code text not null default '' check (length(opened_lot_code) <= 120);
alter table public.fa_location_items add column if not exists opened_expiry date;
alter table public.fa_movements add column if not exists usage text not null default 'stock' check (usage in ('stock','use','open'));

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
  v_usage text;
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
    v_usage := coalesce(nullif(v_line->>'usage',''),'stock');
    if v_usage not in ('stock','use','open') then raise exception 'รูปแบบการใช้ไม่ถูกต้อง'; end if;
    if v_usage<>'stock' and (v_kind<>'issue' or v_item.dispense_mode<>'shared') then raise exception 'รายการนี้ไม่ได้ตั้งค่าเป็นแบบแบ่งใช้'; end if;
    if v_usage='open' and v_quantity<>1 then raise exception 'เปิดใช้ได้ครั้งละ 1 %', v_item.unit; end if;

    if v_usage='use' then
      -- Shared container already opened at this point: count the use, leave lots untouched.
      insert into public.fa_location_items(company_id,location_id,item_id,min) values(p_company_id,v_location.id,v_item_id,v_item.min) on conflict do nothing;
    elsif v_kind='receive' then
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
      if v_mode='self_service' and v_lot_count>1 and v_lot_id is null and v_usage<>'open' then raise exception 'กรุณาเลือกล็อตที่หยิบจริงให้ตรงกับบรรจุภัณฑ์'; end if;
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
        if v_usage='open' then
          -- The container just taken out of stock is now the one in use at this point.
          insert into public.fa_location_items(company_id,location_id,item_id,min,opened_at,opened_lot_code,opened_expiry)
            values(p_company_id,v_location.id,v_item_id,v_item.min,v_date,v_lot.code,v_lot.expiry)
            on conflict(company_id,location_id,item_id) do update set opened_at=excluded.opened_at,opened_lot_code=excluded.opened_lot_code,opened_expiry=excluded.opened_expiry;
        end if;
      end loop;
      if v_remaining<>0 then raise exception 'ยอดคงเหลือเปลี่ยนแปลง กรุณาโหลดข้อมูลใหม่'; end if;
      if v_kind='transfer' then insert into public.fa_location_items(company_id,location_id,item_id,min) values(p_company_id,v_destination.id,v_item_id,v_item.min) on conflict do nothing; end if;
    end if;
    insert into public.fa_movements(company_id,document_id,item_id,location_id,destination_id,quantity,allocations,usage)
      values(p_company_id,v_document.id,v_item_id,v_location.id,case when v_kind='transfer' then v_destination.id else null end,v_quantity,v_allocations,v_usage);
  end loop;
  select jsonb_build_object('document',to_jsonb(v_document)-'request_payload','movements',coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb)) into v_result
    from public.fa_movements m where m.company_id=p_company_id and m.document_id=v_document.id;
  return v_result;
end;
$$;
revoke all on function public.fa_post_transaction(text,text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.fa_post_transaction(text,text,text,uuid,jsonb,text) to service_role;

-- One cart submission commits all item requests together. Existing per-item keys
-- keep retries idempotent; reservation and receipt remain in ppe_request_action.
create function public.ppe_request_batch(p_actor_table text,p_actor_id text,p_company text,p_items jsonb,p_note text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item jsonb; results jsonb:='[]'::jsonb; available bigint;
begin
  if p_actor_table is distinct from 'ppe_requesters' then raise exception 'เฉพาะบัญชีผู้ขอเบิกส่งคำขอได้'; end if;
  if not exists(select 1 from public.ppe_requesters where id::text=p_actor_id and company_id=p_company and is_active) then raise exception 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'รายการสินค้าไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'เลือกได้ครั้งละ 1-50 รายการ'; end if;
  if (select count(distinct x->>'product_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items)
    or (select count(distinct x->>'submission_key') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'รายการสินค้าและรหัสส่งคำขอต้องไม่ซ้ำกัน'; end if;
  -- Lock products in a consistent order across carts and other stock writers.
  perform 1 from public.ppe_products where company_id=p_company and id in
    (select (x->>'product_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.ppe_requests where requester_id=p_actor_id::uuid and submission_key=(item->>'submission_key')::uuid) then
      select available_stock into available from public.ppe_stock_availability where company_id=p_company and product_id=(item->>'product_id')::uuid;
      if coalesce(available,0)<coalesce((item->>'quantity')::integer,1) then raise exception 'ยอดพร้อมเบิกเปลี่ยนแปลง กรุณารีเฟรชและตรวจจำนวนในตะกร้า'; end if;
    end if;
    results:=results || jsonb_build_array(public.ppe_request_action(p_actor_table,p_actor_id,p_company,'submit',null,
      (item->>'product_id')::uuid,(item->>'quantity')::integer,p_note,(item->>'submission_key')::uuid));
  end loop;
  return results;
end $$;
revoke all on function public.ppe_request_batch(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.ppe_request_batch(text,text,text,jsonb,text) to service_role;

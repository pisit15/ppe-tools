-- Request reasons are optional; manager rejection/cancellation reasons remain required.
alter table public.ppe_requests drop constraint ppe_requests_reason_check;
alter table public.ppe_requests add constraint ppe_requests_reason_check check (length(reason) <= 1000);
alter table public.ppe_requests alter column reason set default '';

create or replace function public.ppe_request_action(p_actor_table text, p_actor_id text, p_company text,
  p_action text, p_request_id uuid default null, p_product_id uuid default null,
  p_quantity integer default null, p_note text default '', p_key uuid default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare a jsonb; r public.ppe_requests; u public.ppe_requesters; p public.ppe_products;
  actor_key text; actor_label text; is_requester boolean; available bigint; delta integer; result_id uuid;
begin
  case p_actor_table
    when 'ppe_requesters' then select to_jsonb(x) into a from public.ppe_requesters x where id::text=p_actor_id and is_active;
    when 'company_users' then select to_jsonb(x) into a from public.company_users x where id::text=p_actor_id and is_active;
    when 'tools_users' then select to_jsonb(x) into a from public.tools_users x where id::text=p_actor_id and is_active;
    when 'admin_accounts' then select to_jsonb(x) into a from public.admin_accounts x where id::text=p_actor_id and is_active;
    else raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end case;
  if a is null or p_company is null or p_company in ('all','admin','') then raise exception 'ไม่มีสิทธิ์ใช้งาน'; end if;
  if p_actor_table <> 'admin_accounts' and (a->>'company_id') is distinct from p_company then raise exception 'ไม่มีสิทธิ์เข้าถึงบริษัทนี้'; end if;
  if p_actor_table <> 'admin_accounts' and jsonb_typeof(a->'allowed_modules')='array' and jsonb_array_length(a->'allowed_modules')>0 and not (a->'allowed_modules' ? 'ppe') then raise exception 'ไม่มีสิทธิ์ใช้งาน PPE'; end if;
  is_requester := p_actor_table='ppe_requesters';
  actor_key := p_actor_table || ':' || p_actor_id;
  actor_label := coalesce(nullif(a->>'display_name',''),a->>'username',actor_key);
  p_note := coalesce(p_note,'');
  if length(coalesce(p_note,''))>1000 then raise exception 'ข้อความยาวเกินไป'; end if;
  if p_action='submit' then
    if not is_requester or p_key is null or p_quantity is null or p_quantity<=0 or p_quantity>1000000 then raise exception 'ข้อมูลคำขอไม่ถูกต้อง'; end if;
    select * into p from public.ppe_products where id=p_product_id and company_id=p_company and is_active for update;
    if not found then raise exception 'ไม่พบสินค้าในบริษัทนี้'; end if;
    insert into public.ppe_requests(company_id,requester_id,product_id,quantity,reason,submission_key)
    values(p_company,p_actor_id::uuid,p_product_id,p_quantity,trim(p_note),p_key)
    on conflict(requester_id,submission_key) do nothing returning id into result_id;
    if result_id is null then
      select * into r from public.ppe_requests where requester_id=p_actor_id::uuid and submission_key=p_key;
      if r.product_id<>p_product_id or r.quantity<>p_quantity or r.reason<>trim(p_note) then raise exception 'รหัสคำขอซ้ำกับข้อมูลอื่น'; end if;
      return to_jsonb(r);
    end if;
    select * into r from public.ppe_requests where id=result_id;
    insert into public.ppe_request_events(request_id,company_id,action,actor,actor_name,quantity,note)
      values(r.id,p_company,p_action,actor_key,actor_label,p_quantity,p_note);
    return to_jsonb(r);
  end if;

  select * into r from public.ppe_requests where id=p_request_id and company_id=p_company for update;
  if not found or (is_requester and r.requester_id::text<>p_actor_id) then raise exception 'ไม่พบคำขอหรือไม่มีสิทธิ์'; end if;
  select * into p from public.ppe_products where id=r.product_id and company_id=p_company for update;
  select * into u from public.ppe_requesters where id=r.requester_id;
  if p_action='approve' then
    if is_requester then raise exception 'เฉพาะผู้ดูแลอนุมัติได้'; end if;
    if r.status='approved' and r.approved_quantity=p_quantity then return to_jsonb(r); end if;
    if r.status<>'pending' or not u.is_active or not p.is_active or p_quantity is null or p_quantity<=0 or p_quantity>r.quantity then raise exception 'สถานะหรือจำนวนอนุมัติไม่ถูกต้อง'; end if;
    select available_stock into available from public.ppe_stock_availability where product_id=r.product_id;
    if coalesce(available,0)<p_quantity then raise exception 'สต็อกพร้อมเบิกไม่พอ กรุณาตรวจสอบยอดจองล่าสุด'; end if;
    update public.ppe_requests set status='approved',approved_quantity=p_quantity,approved_at=now(),manager_note=coalesce(p_note,''),updated_at=now() where id=r.id;
  elsif p_action='dispatch' then
    if is_requester then raise exception 'เฉพาะผู้ดูแลจัดจ่ายได้'; end if;
    if r.status='ready' then return to_jsonb(r); end if;
    if r.status<>'approved' then raise exception 'ต้องอนุมัติก่อนจัดจ่าย'; end if;
    update public.ppe_requests set status='ready',dispatched_at=now(),updated_at=now() where id=r.id;
  elsif p_action='receive' then
    if not is_requester then raise exception 'ผู้ขอเบิกต้องยืนยันรับด้วยบัญชีตัวเอง'; end if;
    -- Cumulative receipt quantity is idempotent, including retry after timeout.
    if p_quantity is not null and p_quantity=r.received_quantity and p_quantity>0 then return to_jsonb(r); end if;
    if r.status<>'ready' or p_quantity is null or p_quantity<=r.received_quantity or p_quantity>r.approved_quantity then raise exception 'จำนวนรับหรือสถานะไม่ถูกต้อง กรุณาโหลดข้อมูลล่าสุด'; end if;
    delta := p_quantity-r.received_quantity;
    -- Release exactly the received reservation before writing the stock ledger;
    -- both changes commit together or both roll back on failure.
    update public.ppe_requests set received_quantity=p_quantity,status=case when p_quantity=approved_quantity then 'received' else 'ready' end,
      received_at=now(),updated_at=now() where id=r.id;
    insert into public.ppe_transactions(company_id,product_id,transaction_type,quantity,unit,transaction_date,employee_code,employee_name,department,notes,recorded_by,ppe_request_id)
      values(p_company,r.product_id,'stock_out',delta,p.unit,(now() at time zone 'Asia/Bangkok')::date,u.employee_code,u.display_name,u.department,
        'ยืนยันรับจากคำขอ PPE ' || r.id::text,actor_label,r.id);
  elsif p_action in ('reject','cancel') then
    if p_action='reject' and (is_requester or r.status<>'pending') then raise exception 'ไม่สามารถปฏิเสธคำขอนี้'; end if;
    if p_action='cancel' and (r.status not in ('pending','approved','ready') or (is_requester and r.status<>'pending')) then raise exception 'ไม่สามารถยกเลิกคำขอนี้'; end if;
    if not is_requester and length(trim(coalesce(p_note,'')))=0 then raise exception 'กรุณาระบุเหตุผล'; end if;
    update public.ppe_requests set status=case when p_action='reject' then 'rejected' else 'cancelled' end,manager_note=coalesce(p_note,''),updated_at=now() where id=r.id;
  else raise exception 'การดำเนินการไม่ถูกต้อง';
  end if;
  insert into public.ppe_request_events(request_id,company_id,action,actor,actor_name,quantity,note)
    values(r.id,p_company,p_action,actor_key,actor_label,case when p_action='receive' then delta else p_quantity end,coalesce(p_note,''));
  select * into r from public.ppe_requests where id=r.id;
  return to_jsonb(r);
end $$;
revoke all on function public.ppe_request_action(text,text,text,text,uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.ppe_request_action(text,text,text,text,uuid,uuid,integer,text,uuid) to service_role;

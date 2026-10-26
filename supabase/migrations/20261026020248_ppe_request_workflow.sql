-- PPE-only identities. All access goes through verified server sessions.
create table public.ppe_requesters (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  username text not null unique check (username = lower(username)),
  password text not null,
  display_name text not null,
  employee_code text not null,
  department text not null default '',
  is_active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, employee_code)
);
alter table public.ppe_products add constraint ppe_products_id_company_key unique (id, company_id);
create table public.ppe_requests (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  requester_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0 and quantity <= 1000000),
  approved_quantity integer not null default 0 check (approved_quantity >= 0 and approved_quantity <= quantity),
  received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= approved_quantity),
  status text not null default 'pending' check (status in ('pending','approved','ready','received','rejected','cancelled')),
  reason text not null check (length(reason) between 1 and 1000),
  manager_note text not null default '',
  submission_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  foreign key (requester_id,company_id) references public.ppe_requesters(id,company_id),
  foreign key (product_id,company_id) references public.ppe_products(id,company_id),
  unique (requester_id,submission_key)
);
create table public.ppe_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ppe_requests(id),
  company_id text not null,
  action text not null,
  actor text not null,
  actor_name text not null,
  quantity integer,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.ppe_transactions add column ppe_request_id uuid references public.ppe_requests(id);
create index ppe_transactions_request_idx on public.ppe_transactions(ppe_request_id) where ppe_request_id is not null;
create index ppe_requests_company_created_idx on public.ppe_requests(company_id,created_at desc);
create index ppe_requests_requester_created_idx on public.ppe_requests(requester_id,created_at desc);
create index ppe_requests_reserved_idx on public.ppe_requests(product_id) where status in ('approved','ready');
create index ppe_request_events_request_idx on public.ppe_request_events(request_id,created_at);
create index ppe_requesters_company_idx on public.ppe_requesters(company_id);
alter table public.ppe_requesters enable row level security;
alter table public.ppe_requests enable row level security;
alter table public.ppe_request_events enable row level security;
revoke all on public.ppe_requesters, public.ppe_requests, public.ppe_request_events from anon, authenticated;
grant select,insert,update,delete on public.ppe_requesters, public.ppe_requests, public.ppe_request_events to service_role;

create view public.ppe_stock_availability with (security_invoker = true) as
select s.*, coalesce(r.reserved_quantity,0)::bigint as reserved_quantity,
  (s.current_stock - coalesce(r.reserved_quantity,0))::bigint as available_stock
from public.ppe_stock_summary s
left join (select product_id,company_id,sum(approved_quantity-received_quantity) as reserved_quantity
  from public.ppe_requests where status in ('approved','ready') group by product_id,company_id) r
  on r.product_id=s.product_id and r.company_id=s.company_id;
revoke all on public.ppe_stock_availability from anon, authenticated;
grant select on public.ppe_stock_availability to service_role;
-- Revoke legacy view access in the follow-up migration AFTER the new API deploys.
grant select on public.ppe_stock_summary to service_role;
revoke all on public.ppe_products,public.ppe_transactions,public.ppe_employees,public.ppe_departments,public.ppe_order_settings,public.ppe_order_remarks from anon,authenticated;
grant select,insert,update,delete on public.ppe_products,public.ppe_transactions,public.ppe_employees,public.ppe_departments,public.ppe_order_settings,public.ppe_order_remarks to service_role;

-- Server-only RPC; never accepts identity from the browser. Revalidates account
-- and company in the database so each state transition is authorized atomically.
create function public.ppe_request_action(p_actor_table text, p_actor_id text, p_company text,
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
  if length(coalesce(p_note,''))>1000 then raise exception 'ข้อความยาวเกินไป'; end if;
  if p_action='submit' then
    if not is_requester or p_key is null or p_quantity is null or p_quantity<=0 or p_quantity>1000000 or length(trim(coalesce(p_note,'')))=0 then raise exception 'ข้อมูลคำขอไม่ถูกต้อง'; end if;
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

-- Coordinate every ledger writer (including manual stock-out/import/edit) with
-- approvals by locking the same product row. Never spend another user's hold.
create function public.ppe_guard_stock() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare pid uuid; cid text; old_effect bigint:=0; new_effect bigint:=0; stock bigint; held bigint;
begin
  if TG_OP<>'INSERT' and OLD.ppe_request_id is not null then raise exception 'รายการยืนยันรับแก้ไขหรือลบไม่ได้ ให้บันทึกรับคืนแยกต่างหาก'; end if;
  if TG_OP='UPDATE' and (NEW.product_id is distinct from OLD.product_id or NEW.company_id is distinct from OLD.company_id) then raise exception 'ไม่อนุญาตเปลี่ยนสินค้าหรือบริษัทของรายการสต็อก'; end if;
  if TG_OP='DELETE' then pid:=OLD.product_id; cid:=OLD.company_id; else pid:=NEW.product_id; cid:=NEW.company_id; end if;
  perform 1 from public.ppe_products where id=pid and company_id=cid for update;
  if not found then raise exception 'สินค้าไม่ได้อยู่ในบริษัทนี้'; end if;
  if TG_OP<>'INSERT' then old_effect:=case when OLD.transaction_type in ('stock_in','return') then OLD.quantity else -OLD.quantity end; end if;
  if TG_OP<>'DELETE' then
    if NEW.quantity<=0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
    new_effect:=case when NEW.transaction_type in ('stock_in','return') then NEW.quantity else -NEW.quantity end;
    if NEW.ppe_request_id is not null and (TG_OP<>'INSERT' or NEW.transaction_type<>'stock_out' or not exists(
      select 1 from public.ppe_requests q where q.id=NEW.ppe_request_id and q.company_id=cid and q.product_id=pid
      and q.received_quantity=NEW.quantity+(select coalesce(sum(t.quantity),0) from public.ppe_transactions t where t.ppe_request_id=q.id)
    )) then raise exception 'คำขอไม่ตรงกับยอดยืนยันรับ'; end if;
  end if;
  if new_effect<old_effect then
    select coalesce(sum(case when transaction_type in ('stock_in','return') then quantity else -quantity end),0) into stock from public.ppe_transactions where product_id=pid and company_id=cid;
    select coalesce(sum(approved_quantity-received_quantity),0) into held from public.ppe_requests where product_id=pid and company_id=cid and status in ('approved','ready');
    if stock+new_effect-old_effect<held then raise exception 'สต็อกพร้อมเบิกไม่พอ (มีรายการจองหรือยอดคงเหลือไม่เพียงพอ)'; end if;
  end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function public.ppe_guard_stock() from public,anon,authenticated;
create trigger ppe_stock_reservation_guard before insert or update or delete on public.ppe_transactions for each row execute function public.ppe_guard_stock();

create function public.ppe_guard_product_reservations() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if NEW.company_id is distinct from OLD.company_id then raise exception 'ไม่อนุญาตย้ายสินค้าข้ามบริษัท'; end if;
  if (NEW.is_active is distinct from OLD.is_active or NEW.unit is distinct from OLD.unit) and exists(select 1 from public.ppe_requests where product_id=OLD.id and status in ('approved','ready')) then raise exception 'มีคำขอจองสินค้าอยู่ กรุณาจัดการคำขอก่อน'; end if;
  return NEW;
end $$;
revoke all on function public.ppe_guard_product_reservations() from public,anon,authenticated;
create trigger ppe_product_reservation_guard before update on public.ppe_products for each row execute function public.ppe_guard_product_reservations();

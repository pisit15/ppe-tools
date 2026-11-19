-- First Aid · 20 Nov 2026
-- 1) A dispense ticket recorded by mistake can be cancelled. Its quantities go back to the lots they came from and the
--    ticket stays in the history, marked cancelled with who did it and why. Before this the only fix was a stock count,
--    which corrected the balance but left the wrong ticket in the history and in the illness report.
-- 2) Problems reported at a cabinet ("out of stock", "expired", "damaged") get their own table so the safety officer
--    sees them as a list and can close them. Before this they were a sentence in the note of a dispense ticket, and a
--    cabinet with nothing to pick could not report at all.

-- ---------- 1) cancelled dispense tickets ----------
alter table public.fa_documents
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_key text,
  add column if not exists voided_by_name text,
  add column if not exists void_reason text;
alter table public.fa_documents drop constraint if exists fa_documents_void_fields;
alter table public.fa_documents add constraint fa_documents_void_fields check (
  (voided_at is null and voided_by_key is null and voided_by_name is null and void_reason is null)
  or (voided_at is not null and length(btrim(voided_by_key)) between 1 and 250 and length(btrim(voided_by_name)) between 1 and 160 and length(btrim(void_reason)) between 1 and 300)
);

create or replace function public.fa_void_issue(
  p_company_id text,p_document_id uuid,p_actor_key text,p_actor_name text,p_reason text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_doc public.fa_documents%rowtype;
  v_mov record;
  v_alloc jsonb;
  v_qty integer;
  v_restored integer := 0;
  v_reason text := btrim(coalesce(p_reason,''));
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_company_id is null or p_company_id !~ '^[A-Za-z0-9_-]+$' or p_company_id in ('admin','all','default') then raise exception 'กรุณาเลือกบริษัทที่ถูกต้อง'; end if;
  if length(btrim(coalesce(p_actor_key,''))) not between 1 and 250 or length(btrim(coalesce(p_actor_name,''))) not between 1 and 160 then raise exception 'ไม่พบผู้บันทึกรายการที่ถูกต้อง'; end if;
  if length(v_reason) not between 1 and 300 then raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (ไม่เกิน 300 ตัวอักษร)'; end if;
  -- The same company lock every stock write takes, so a cancel never interleaves with a dispense or a count.
  perform 1 from public.fa_company_settings where company_id=p_company_id for update;
  if not found then raise exception 'ไม่พบข้อมูลบริษัท'; end if;
  select * into v_doc from public.fa_documents where company_id=p_company_id and id=p_document_id for update;
  if not found then raise exception 'ไม่พบใบจ่ายยานี้'; end if;
  if v_doc.kind<>'issue' then raise exception 'ยกเลิกได้เฉพาะใบจ่ายยา'; end if;
  -- Pressing cancel twice (or a retried request) is not an error and does not return the stock twice.
  if v_doc.voided_at is not null then return jsonb_build_object('documentId',v_doc.id,'restored',0,'already',true); end if;
  if v_doc.actor_key like 'excel-import:%' then raise exception 'รายการที่นำเข้าจากไฟล์เดิมยกเลิกไม่ได้'; end if;
  if v_doc.date<v_today-7 then raise exception 'ยกเลิกได้ภายใน 7 วันหลังวันที่จ่าย — เกินกว่านั้นให้แก้ยอดที่หน้าตรวจนับ'; end if;
  -- Opening a new shared container also changed which container is "in use" at the point; that is not undone here.
  if exists (select 1 from public.fa_movements where company_id=p_company_id and document_id=v_doc.id and usage='open') then
    raise exception 'ใบที่มีการเปิดขวดใหม่ยกเลิกไม่ได้ — แก้ยอดที่หน้าตรวจนับ';
  end if;
  for v_mov in select * from public.fa_movements where company_id=p_company_id and document_id=v_doc.id order by created_at,id loop
    if v_mov.usage='use' then continue; end if; -- a use from the opened container never touched stock
    if jsonb_typeof(v_mov.allocations)<>'array' or jsonb_array_length(v_mov.allocations)=0 then raise exception 'รายการนี้ไม่มีข้อมูลล็อต ยกเลิกไม่ได้ — แก้ยอดที่หน้าตรวจนับ'; end if;
    for v_alloc in select value from jsonb_array_elements(v_mov.allocations) loop
      if coalesce(v_alloc->>'quantity','') !~ '^[0-9]{1,7}$' or coalesce(v_alloc->>'lotId','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'ข้อมูลล็อตของรายการนี้ไม่สมบูรณ์ ยกเลิกไม่ได้'; end if;
      v_qty := (v_alloc->>'quantity')::integer;
      if v_qty<1 then raise exception 'ข้อมูลล็อตของรายการนี้ไม่สมบูรณ์ ยกเลิกไม่ได้'; end if;
      update public.fa_lots set quantity=quantity+v_qty
        where company_id=p_company_id and id=(v_alloc->>'lotId')::uuid and item_id=v_mov.item_id and location_id=v_mov.location_id;
      if not found then raise exception 'ไม่พบล็อตเดิมของรายการนี้ ยกเลิกไม่ได้ — แก้ยอดที่หน้าตรวจนับ'; end if;
      v_restored := v_restored+v_qty;
    end loop;
  end loop;
  update public.fa_documents set voided_at=now(),voided_by_key=btrim(p_actor_key),voided_by_name=btrim(p_actor_name),void_reason=v_reason
    where company_id=p_company_id and id=v_doc.id;
  return jsonb_build_object('documentId',v_doc.id,'restored',v_restored,'already',false);
end;
$$;
revoke all on function public.fa_void_issue(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fa_void_issue(text,uuid,text,text,text) to service_role;

-- The usage counters on the home card must not count cancelled tickets. Same function as before, plus "voided_at is null".
create or replace function public.fa_usage_summary(
  p_company_id text,p_as_of date default ((now() at time zone 'Asia/Bangkok'))::date
) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_month jsonb; v_days jsonb;
begin
  if p_company_id is null or p_company_id !~ '^[A-Za-z0-9_-]+$' or p_company_id in ('admin','all','default') then raise exception 'กรุณาเลือกบริษัทที่ถูกต้อง'; end if;
  if p_as_of is null or p_as_of>(now() at time zone 'Asia/Bangkok')::date then raise exception 'วันที่รายงานไม่ถูกต้อง'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('locationId',x.location_id,'count',x.total) order by x.location_id),'[]'::jsonb) into v_month
  from (
    select m.location_id,count(*) total
    from public.fa_movements m join public.fa_documents d on d.company_id=m.company_id and d.id=m.document_id
    where m.company_id=p_company_id and d.kind='issue' and d.voided_at is null
      and d.date>=date_trunc('month',p_as_of::timestamp)::date and d.date<=p_as_of
    group by m.location_id
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('locationId',x.location_id,'date',x.date,'count',x.total) order by x.date,x.location_id),'[]'::jsonb) into v_days
  from (
    select m.location_id,d.date,count(*) total
    from public.fa_movements m join public.fa_documents d on d.company_id=m.company_id and d.id=m.document_id
    where m.company_id=p_company_id and d.kind='issue' and d.voided_at is null and d.date>=p_as_of-6 and d.date<=p_as_of
    group by m.location_id,d.date
  ) x;
  return jsonb_build_object('monthUsesByLocation',v_month,'dailyUsesByLocation',v_days);
end;
$$;
revoke all on function public.fa_usage_summary(text,date) from public,anon,authenticated;
grant execute on function public.fa_usage_summary(text,date) to service_role;

-- ---------- 2) problems reported at a point ----------
create table if not exists public.fa_issue_reports (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.fa_company_settings(company_id),
  location_id uuid not null,
  -- Chosen by the page that sends the report: a retried request finds its own row instead of adding a second one.
  create_id uuid not null,
  kind text not null check (kind in ('out','expired','damaged','other')),
  detail text not null default '' check (length(detail) <= 500),
  reporter_name text not null default '' check (length(reporter_name) <= 120),
  reporter_department text not null default '' check (length(reporter_department) <= 120),
  source text not null check (source in ('qr','staff')),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by_key text check (closed_by_key is null or length(closed_by_key) <= 250),
  closed_by_name text check (closed_by_name is null or length(closed_by_name) <= 160),
  closed_note text not null default '' check (length(closed_note) <= 500),
  created_at timestamptz not null default now(),
  unique (company_id,create_id),
  foreign key (company_id,location_id) references public.fa_locations(company_id,id),
  check ((status='closed') = (closed_at is not null))
);
create index if not exists fa_issue_reports_company_status on public.fa_issue_reports(company_id,status,created_at desc);
create index if not exists fa_issue_reports_location_day on public.fa_issue_reports(company_id,location_id,created_at desc);

-- Server-only, like every other First Aid table: row level security on with no policy, nothing for anon/authenticated.
alter table public.fa_issue_reports enable row level security;
revoke all on public.fa_issue_reports from public,anon,authenticated;
grant select,insert,update,delete on public.fa_issue_reports to service_role;

-- First Aid · 24 Nov 2026
-- A stock receipt recorded by mistake (wrong quantity, lot or expiry date) can be cancelled, the same way a dispense
-- ticket can since 20 Nov. The received quantity is taken back out of the lot it went into and the receipt stays in the
-- history, marked cancelled with who did it and why. Before this the only fix was a stock count, which corrected the
-- total but left the wrong receipt in the history, added a "disposed" line that never happened, and took the quantity
-- from the earliest-expiring lot rather than from the lot that was entered wrongly.
--
-- No new table or column: the cancel marks on fa_documents (voided_at, voided_by_key, voided_by_name, void_reason) and
-- their check constraint already exist. One new function, callable by service_role only.

create or replace function public.fa_void_receive(
  p_company_id text,p_document_id uuid,p_actor_key text,p_actor_name text,p_reason text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_doc public.fa_documents%rowtype;
  v_mov record;
  v_alloc jsonb;
  v_qty integer;
  v_lot public.fa_lots%rowtype;
  v_item_name text;
  v_removed integer := 0;
  v_reason text := btrim(coalesce(p_reason,''));
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_company_id is null or p_company_id !~ '^[A-Za-z0-9_-]+$' or p_company_id in ('admin','all','default') then raise exception 'กรุณาเลือกบริษัทที่ถูกต้อง'; end if;
  if length(btrim(coalesce(p_actor_key,''))) not between 1 and 250 or length(btrim(coalesce(p_actor_name,''))) not between 1 and 160 then raise exception 'ไม่พบผู้บันทึกรายการจาก session'; end if;
  if length(v_reason) not between 1 and 300 then raise exception 'กรุณาระบุเหตุผลที่ยกเลิก (ไม่เกิน 300 ตัวอักษร)'; end if;
  -- The same company lock every stock write takes, so a cancel never interleaves with a dispense, a transfer or a count.
  perform 1 from public.fa_company_settings where company_id=p_company_id for update;
  if not found then raise exception 'ไม่พบข้อมูลบริษัท'; end if;
  select * into v_doc from public.fa_documents where company_id=p_company_id and id=p_document_id for update;
  if not found then raise exception 'ไม่พบรายการรับเข้านี้'; end if;
  if v_doc.kind<>'receive' then raise exception 'ยกเลิกได้เฉพาะรายการรับเข้า'; end if;
  -- Pressing cancel twice (or a retried request) is not an error and does not take the stock out twice.
  if v_doc.voided_at is not null then return jsonb_build_object('documentId',v_doc.id,'removed',0,'already',true); end if;
  if v_doc.actor_key like 'excel-import:%' then raise exception 'รายการที่นำเข้าจากไฟล์เดิมยกเลิกไม่ได้'; end if;
  -- A stock count writes its upward corrections as receipts. Those belong to the count; a wrong count is fixed by counting again.
  if v_doc.note like 'ตรวจนับ %' then raise exception 'ยอดที่ปรับจากการตรวจนับยกเลิกไม่ได้ — ตรวจนับใหม่เพื่อแก้ยอด'; end if;
  if v_doc.date<v_today-7 then raise exception 'ยกเลิกได้ภายใน 7 วันหลังวันที่รับเข้า — เกินกว่านั้นให้แก้ยอดที่หน้าตรวจนับ'; end if;
  for v_mov in select * from public.fa_movements where company_id=p_company_id and document_id=v_doc.id order by created_at,id loop
    if jsonb_typeof(v_mov.allocations)<>'array' or jsonb_array_length(v_mov.allocations)=0 then raise exception 'รายการนี้ไม่มีข้อมูลล็อต ยกเลิกไม่ได้ — แก้ยอดที่หน้าตรวจนับ'; end if;
    for v_alloc in select value from jsonb_array_elements(v_mov.allocations) loop
      if coalesce(v_alloc->>'quantity','') !~ '^[0-9]{1,7}$' or coalesce(v_alloc->>'lotId','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'ข้อมูลล็อตของรายการนี้ไม่สมบูรณ์ ยกเลิกไม่ได้'; end if;
      v_qty := (v_alloc->>'quantity')::integer;
      if v_qty<1 then raise exception 'ข้อมูลล็อตของรายการนี้ไม่สมบูรณ์ ยกเลิกไม่ได้'; end if;
      select * into v_lot from public.fa_lots
        where company_id=p_company_id and id=(v_alloc->>'lotId')::uuid and item_id=v_mov.item_id and location_id=v_mov.location_id for update;
      if not found then raise exception 'ไม่พบล็อตของรายการนี้ ยกเลิกไม่ได้ — แก้ยอดที่หน้าตรวจนับ'; end if;
      -- What was received must still be in the lot. If some of it has been dispensed, transferred or written off since,
      -- taking the whole receipt back would push the lot below what those later records used.
      if v_lot.quantity<v_qty then
        select name into v_item_name from public.fa_items where company_id=p_company_id and id=v_mov.item_id;
        raise exception '% ล็อต % เหลือ % จากที่รับเข้า % — มีการจ่าย โอน หรือตัดออกไปแล้ว จึงยกเลิกไม่ได้ ให้แก้ยอดที่หน้าตรวจนับ',
          coalesce(v_item_name,'รายการนี้'),v_lot.code,v_lot.quantity,v_qty;
      end if;
      update public.fa_lots set quantity=quantity-v_qty where company_id=p_company_id and id=v_lot.id;
      v_removed := v_removed+v_qty;
    end loop;
  end loop;
  update public.fa_documents set voided_at=now(),voided_by_key=btrim(p_actor_key),voided_by_name=btrim(p_actor_name),void_reason=v_reason
    where company_id=p_company_id and id=v_doc.id;
  return jsonb_build_object('documentId',v_doc.id,'removed',v_removed,'already',false);
end;
$$;
revoke all on function public.fa_void_receive(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fa_void_receive(text,uuid,text,text,text) to service_role;

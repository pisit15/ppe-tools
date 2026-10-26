# ขอเบิกและยืนยันรับ PPE

ผู้ดูแลบริษัทเปิดเมนู **ผู้ใช้งาน PPE** เพื่อสร้างบัญชี กำหนดรหัสพนักงานและรหัสผ่านเริ่มต้น ชื่อเข้าใช้เต็มแสดงเป็น `ppe.<บริษัท>.<ชื่อผู้ใช้>` ผู้ดูแลรีเซ็ตรหัสผ่านหรือปิดบัญชีได้ การเปลี่ยนรหัสผ่านและปิดบัญชีทำให้ session เดิมใช้ต่อไม่ได้

บัญชีย่อยเข้าเว็บ `/ppe` ด้วยชื่อเข้าใช้เต็ม เห็นเฉพาะสต็อกบริษัทตัวเองและคำขอของตัวเอง เข้าโมดูลอื่นหรือจัดการสต็อกไม่ได้

หน้าเลือกอุปกรณ์แสดงเฉพาะยอดพร้อมเบิกมากกว่า 0 (คงเหลือลบยอดจอง) จึงซ่อนทั้งของหมดและของที่ถูกจองครบ ผู้ดูแลยังดูสินค้าทั้งหมดได้ที่เมนูจัดการสต็อก

หน้าเลือกสินค้าใช้รูปจากข้อมูลสินค้าเดิม กดดูรูปใหญ่ได้ สินค้าที่ไม่มีรูปจะแสดงข้อความแทน ผู้ดูแลเพิ่มหรือแก้รูปได้ในหน้าจัดการสต็อก

1. ผู้ใช้เลือกอุปกรณ์และจำนวนได้หลายรายการ (สูงสุด 50 รายการต่อครั้ง) เปิด **ตรวจตะกร้า / ส่งคำขอ** เพื่อแก้จำนวน นำสินค้าออก และระบุเหตุผล ก่อนกดส่งพร้อมกัน ระบบบันทึกคำขอแยกตามสินค้าในธุรกรรมเดียว หากรายการใดไม่ผ่านจะไม่บันทึกทั้งชุด การลองส่งชุดเดิมซ้ำไม่สร้างคำขอซ้ำ
2. ผู้ดูแลเปิด **คำขอเบิก PPE** อนุมัติจำนวนไม่เกินที่ขอ ระบบจองจำนวนนี้ทันที โดยยังไม่ลด Stock on hand
3. ผู้ดูแลกด **จัดจ่าย / รอผู้ใช้รับ** เมื่อเตรียมส่งมอบแล้ว
4. เจ้าของคำขอกด **ยืนยันรับอุปกรณ์** ระบุจำนวนที่ได้รับจริง ระบบตัดสต็อกและปล่อยยอดจองเท่าจำนวนที่รับในธุรกรรมเดียวกัน รับบางส่วนได้

ยอดพร้อมเบิก = Stock on hand − ยอดจองที่ยังไม่ได้รับ การเบิกออกแบบเดิมและการแก้ประวัติไม่สามารถใช้ยอดจองของคำขอได้ การกดยืนยันรับซ้ำไม่ตัดสต็อกซ้ำ

หลังอนุมัติ ผู้ดูแลและเจ้าของคำขอสามารถกด **Export ใบจอง PDF** ได้ เอกสารแสดงบริษัท ผู้ขอ ผู้อนุมัติ อุปกรณ์ ยอดอนุมัติ รับแล้ว และจองคงเหลือจากข้อมูลล่าสุด พร้อมวันเวลาออกเอกสาร คำขอที่ยกเลิกหรือรับครบจะแสดงสถานะนั้นและยอดจองคงเหลือ 0 การดาวน์โหลดไม่ตัดสต็อกและไม่ถือเป็นการยืนยันรับ

ผู้ใช้ยกเลิกคำขอที่ยังไม่อนุมัติได้ ผู้ดูแลยกเลิกยอดค้างพร้อมเหตุผลได้ ยอดที่รับไปแล้วคงอยู่ในประวัติ การคืนอุปกรณ์ให้บันทึกรับคืนใหม่ ไม่แก้หรือลบรายการยืนยันรับ ทุกขั้นตอนมีประวัติผู้ดำเนินการและเวลา

## Deployment

Apply `20261026020248_ppe_request_workflow.sql` before releasing the application. After the application using `ppe_stock_availability` is live, apply `20261026020729_ppe_private_stock_view.sql` to close the old anonymous view. All PPE database access then goes through authenticated server routes with company and requester checks. The workflow RPC also validates the account and locks the product row to serialize reservations and ledger changes.

Apply `20261026024306_ppe_request_batch.sql` before releasing the multi-item catalog. The batch RPC validates the requester and company, locks products in consistent order, checks available quantities for new submissions, and uses existing per-item idempotency keys. It does not reserve or deduct stock when requests are submitted.

## Verification

`npm run test:ppe` runs PostgreSQL workflow, rollback, permissions and purchase-calculation tests. `npm run test:ppe:requests` runs real Next.js routes and browser actions against an isolated local PostgreSQL fixture, including two companies, manager/requester separation, partial receipts, retry safety, password reset and disabled sessions. No production accounts are created by these tests.

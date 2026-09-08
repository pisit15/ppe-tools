# admin.eashe.org — Super Admin Console

คอนโซลกลางสำหรับ **super_admin เท่านั้น** อยู่ใน repo `ppe-tools` เดียวกับ tools.eashe.org
แต่แยกออกมาด้วยโดเมนของตัวเอง

## สถาปัตยกรรม

```
admin.eashe.org/*        → proxy rewrite → /superadmin/*          (ต้องมี session cookie)
admin.eashe.org/api/superadmin/*  → ผ่าน (ทุก route เช็คสิทธิ์ซ้ำฝั่ง server)
admin.eashe.org/api/*    → 404  (ไม่เปิด API ของ tools ให้โดเมนนี้)
tools.eashe.org/superadmin, /api/superadmin → 404
localhost/superadmin/*   → เข้าได้ตรง ๆ สำหรับ dev
```

ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/proxy.ts` | routing ตาม host + กัน path ที่ไม่เกี่ยวออกไป (Next.js 16 ใช้ `proxy.ts` แทน `middleware.ts` เดิม) |
| `src/lib/superAdminSession.ts` | สร้าง/ตรวจ session token ด้วย Web Crypto (ใช้ได้ทั้ง Edge และ Node) |
| `src/lib/superAdminGuard.ts` | `requireSuperAdmin()` — ตรวจ cookie **และ** เช็ค `admin_accounts` ซ้ำทุกครั้ง |
| `src/app/superadmin/**` | หน้า UI ทั้งหมด (`/` launcher, `/team/*`, `/system` + หน้าอื่นของ System Console) |
| `src/app/api/superadmin/**` | API ทั้งหมด |
| `src/components/superadmin/SuperAdminShell.tsx` | launcher/sidebar shell + context (`base`, `user`, `href`) |
| `src/components/superadmin/ui.tsx` | VIZ palette, Toast, Modal, Card, ตาราง/ฟอร์ม primitives, `saFetch` |
| `src/components/superadmin/CompanyPicker.tsx` | searchable dropdown สำหรับบริษัทและรายการยาว ๆ |

## ความปลอดภัย

- รหัสผ่านใน `admin_accounts` แฮชด้วย bcrypt แล้ว (migration `006_superadmin_hardening.sql`)
  ถ้ายังเจอแถวที่เป็น plaintext ระบบจะยอมให้ล็อกอินครั้งเดียวแล้วแฮชทับให้อัตโนมัติ
- Session เก็บใน **httpOnly cookie** `ea_sa_session` (HMAC-SHA256, อายุ 8 ชม.)
  ไม่ใช่ `sessionStorage` เหมือนหน้า `/admin` เดิม — JavaScript ในหน้าเว็บอ่านไม่ได้
- ทุก API route เรียก `requireSuperAdmin()` ก่อนเสมอ ถ้าถอดสิทธิ์หรือปิดบัญชีใน DB
  ผู้ใช้คนนั้นจะถูกตัดสิทธิ์ทันทีโดยไม่ต้องรอ cookie หมดอายุ
- ข้อความตอนล็อกอินผิดเป็นข้อความเดียวกันหมด ไม่บอกว่ามี username นี้อยู่จริงหรือไม่
- ทุกครั้งที่ล็อกอินสำเร็จจะถูกบันทึกใน `login_events` (`role = 'super_admin'`)

## Environment variables (Vercel → project `ppe-tools`)

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | มีอยู่แล้ว |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | มีอยู่แล้ว |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | มีอยู่แล้ว |
| `SUPERADMIN_SESSION_SECRET` | แนะนำ | ถ้าไม่ตั้ง จะใช้ `SUPABASE_SERVICE_ROLE_KEY` เป็น secret แทน — ตั้งแยกจะดีกว่า เพราะเปลี่ยน secret เพื่อไล่ทุก session ออกได้โดยไม่ต้องหมุน service key |

สร้าง secret: `openssl rand -base64 48`

## ขั้นตอนเปิดใช้โดเมน

1. **Vercel** → project `ppe-tools` → Settings → Domains → Add → `admin.eashe.org`
2. **DNS ของ eashe.org** → เพิ่ม record ตามที่ Vercel บอก (ปกติคือ `CNAME admin → cname.vercel-dns.com`)
3. รอ Vercel ออก SSL certificate (ไม่กี่นาที)
4. เปิด `https://admin.eashe.org` → ต้องเด้งไปหน้า `/login`
5. ล็อกอินด้วยบัญชี role `super_admin` (ตอนนี้มีบัญชีเดียวคือ `admin`)

> ถ้ายังไม่เพิ่มโดเมน โค้ดส่วนนี้จะไม่มีผลกับ tools.eashe.org เลย — `/superadmin` ถูกตอบ 404 จาก proxy

## โครงสร้างหน้า

หน้าแรก (`/`) เป็น **project launcher** — การ์ดโปรเจกต์ ไม่มี sidebar
เข้าโปรเจกต์แล้วจึงมี sidebar เฉพาะของโปรเจกต์นั้น พร้อมลิงก์ "← ทุกโปรเจกต์" กลับหน้าแรก

### โปรเจกต์ 1 — Team Management (`/team`)

| หน้า | ทำอะไรได้ |
|---|---|
| ภาพรวมทีม `/team` | จำนวนบุคลากร SHE ทั้งกลุ่ม, ความครบของตำแหน่งตามกฎหมายรายบริษัท (แถบความคืบหน้า), รายการใบอนุญาตที่หมดอายุแล้ว/ใกล้หมดใน 90 วัน, เตือนรายการที่ยังไม่กรอกวันหมดอายุ |
| บุคลากร SHE `/team/personnel` | CRUD `she_personnel` ข้ามบริษัท — ค้นหา กรองตามบริษัท กรองเฉพาะทีม SHE สลับสถานะทำงาน/อยู่ในทีม และแสดงจำนวนใบอนุญาตที่ถือครองต่อคน |
| ใบอนุญาต / ใบรับรอง `/team/licenses` | 2 แท็บ — `personnel_licenses` (ใบอนุญาตตามกฎหมาย ผูกกับบุคลากร SHE) และ `employee_certificates` (ใบรับรองพนักงาน) พร้อม badge สถานะวันหมดอายุ |

เกณฑ์เตือน: **≤ 90 วัน = ใกล้หมดอายุ** (แก้ที่ค่า `SOON_DAYS` ใน `src/app/api/superadmin/team/overview/route.ts`
และ `src/app/superadmin/team/licenses/page.tsx`)

"ตำแหน่งตามกฎหมายครบ" นับจาก `legal_requirement_types` ที่ `is_required = true` ของบริษัทนั้น
โดยถือว่าครบเมื่อมีบุคลากรที่ยัง active อย่างน้อย 1 คนที่ `has_license = true` ในตำแหน่งนั้น

### โปรเจกต์ 2 — System Console (`/system`)

| หน้า | ทำอะไรได้ |
|---|---|
| ภาพรวมระบบ `/system` | จำนวนบริษัท/ผู้ใช้/ผู้ดูแล, ปริมาณข้อมูลรายระบบ, login + audit ล่าสุด, เตือนรหัสผ่าน plaintext |
| ผู้ใช้ทุกระบบ `/users` | CRUD `company_users`, `tools_users`, `company_credentials` — ค้นหา กรองตามบริษัท เปิด/ปิดบัญชี รีเซ็ตรหัสผ่าน |
| บริษัท `/companies` | CRUD `company_settings` (ลบไม่ได้ถ้ายังมีผู้ใช้ผูกอยู่) |
| ผู้ดูแลระบบ `/admins` | CRUD `admin_accounts` — กันลด/ปิด/ลบตัวเอง และกันไม่ให้เหลือ super_admin ศูนย์บัญชี |
| ประวัติการใช้งาน `/activity` | `login_events` + `audit_log` กรองตามช่วงเวลาและคำค้น |
| ตั้งค่าส่วนกลาง `/settings` | `app_settings`, `plan_years`, `edit_deadlines`, `notification_recipients`, ล็อก/ปลดล็อกงบประมาณและแผนอบรม |

### เพิ่มโปรเจกต์ใหม่

1. เพิ่มการ์ดใน `PROJECTS` ที่ `src/app/superadmin/page.tsx`
2. เพิ่ม section (title + nav) ใน `SECTIONS` ที่ `src/components/superadmin/SuperAdminShell.tsx`
   — `matches()` ของ section ใหม่ต้องมาก่อน section `system` ซึ่งเป็น fallback
3. สร้างหน้าใต้ `src/app/superadmin/<project>/` และ API ใต้ `src/app/api/superadmin/<project>/`
   ทุก route เรียก `requireSuperAdmin()` เป็นบรรทัดแรก

## ที่ยังค้างอยู่

- `company_users` (42 บัญชี), `company_credentials` และ `company_auth` **ยังเก็บรหัสผ่านเป็น plaintext**
  ตั้งใจไม่แฮชในรอบนี้ เพราะตารางเหล่านี้ถูกอ่านโดยแอป `safety-env-dashboard` (eashe.org)
  ซึ่งไม่ได้อยู่ในโฟลเดอร์นี้ ต้องเช็คก่อนว่าโค้ดล็อกอินของแอปนั้นรองรับ bcrypt แล้ว
  เมื่อยืนยันแล้ว: เปลี่ยน `hashPasswords: false` → `true` ใน `src/app/api/superadmin/users/route.ts`
  แล้วรัน migration แฮชแบบเดียวกับ `006`
- หน้า `/admin` เดิมบน tools.eashe.org ยังใช้ HMAC token + sessionStorage อยู่ ยังไม่ได้ย้ายมาใช้ cookie

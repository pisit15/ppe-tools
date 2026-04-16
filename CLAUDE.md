# EA SHE PPE Dashboard — Claude Instructions

## What This Is
ระบบจัดการ PPE (Personal Protective Equipment) ที่ **tools.eashe.org/ppe** สำหรับบริษัท AMT
ใช้ติดตามสต๊อก, เบิก-รับคืน, รายงาน และวิเคราะห์การใช้อุปกรณ์ความปลอดภัย

## Tech Stack
- **Next.js 16+** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**
- **Supabase PostgreSQL** (database + auth)
- **Vercel** auto-deploy จาก `main` branch
- **UI Language**: Thai | **Code Language**: English

## Critical Constraints

### ALWAYS
- ใช้ `company_id = 'amt'` ทุก query ทั้ง GET และ POST
- อ่านค่า enum จาก `src/lib/constants.ts` ก่อนใช้งาน — ไฟล์นั้นคือ single source of truth
- อ่าน type definitions จาก `src/lib/types.ts` ก่อนสร้าง/แก้ไข data structures
- ใช้ VIZ color palette (ดูด้านล่าง) สำหรับทุก UI component
- ใช้ `'use client'` + `export const dynamic = 'force-dynamic'` ที่ต้นไฟล์ทุก page
- Handle Supabase errors ด้วย try/catch + return JSON error response
- ใช้ `.select('*, ppe_products(name, type, image_url)')` เมื่อ query transactions

### NEVER
- ห้ามใช้ `alert()` / `confirm()` / `prompt()` — ใช้ Toast notification (inline state)
- ห้าม import external chart libraries (recharts, chart.js, d3, etc.) — ใช้ custom SVG/Canvas
- ห้ามใช้ native `<select>` สำหรับ list ที่มี >20 items — ใช้ searchable dropdown pattern
- ห้ามใช้ `any` ใน TypeScript — ใช้ proper types จาก `src/lib/types.ts`
- ห้ามสร้าง DB column/table ใหม่โดยไม่อัปเดต `src/lib/types.ts`
- ห้ามใช้ `focusRingColor` หรือ CSS property ที่ไม่มีจริงใน inline styles
- ห้ามลบ/เปลี่ยน migration API (`/api/ppe/bulk-import`) โดยไม่ถาม

## VIZ Color Palette (Tableau-inspired)
ประกาศใน component level ทุกหน้า:
```typescript
const VIZ = {
  primary: '#4E79A7',    // Headers, links, KPI numbers
  secondary: '#F28E2B',  // Warnings, secondary actions  
  accent: '#E15759',     // Alerts, stock-out, danger
  positive: '#59A14F',   // Stock-in, positive values, success
  neutral: '#BAB0AC',    // Borders, muted text
  muted: '#D4D4D4',      // Disabled states
  bg: '#EEEEEE',         // Background fills
  text: '#333333',       // Primary body text
  lightText: '#666666',  // Secondary/caption text
  grid: '#EEEEEE',       // Chart gridlines
};
```

## UI Patterns

### Card Style
```
className="bg-white rounded-xl border border-gray-100 shadow-sm p-6"
```
KPI cards: เพิ่ม colored left border `style={{ borderLeft: '4px solid ${VIZ.primary}' }}`

### Searchable Dropdown (ยังไม่มี shared component — inline ในแต่ละ page)
Pattern: `useState` สำหรับ search term + `useRef` สำหรับ click-outside + `useMemo` สำหรับ filtered list
ดูตัวอย่างที่ `src/app/ppe/stock-in/page.tsx` บรรทัด 36-80 (product search)
และ `src/app/ppe/stock-out/page.tsx` (มี 2 ตัว: product + employee)
> **TODO**: ถ้าต้องใช้ searchable dropdown อีก ให้ extract เป็น shared component `src/components/ui/SearchableDropdown.tsx`

### Toast Notification
```typescript
const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
// Auto-dismiss after 3s
useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
```

### Table Pattern
- Sortable columns (click header to toggle asc/desc)
- Pagination (30 items/page)
- Search input ด้วย `text-gray-900 placeholder:text-gray-400`

## Canonical API Route Example
`src/app/api/ppe/transactions/route.ts` เป็น reference pattern:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { CreateTransactionInput } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id') || 'default';
    const limit = parseInt(searchParams.get('limit') || '100');

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    
    let query = db
      .from('ppe_transactions')
      .select('*, ppe_products(name, type, image_url)')
      .eq('company_id', companyId);

    const { data, error } = await query
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTransactionInput;
    // validate required fields
    if (!body.company_id || !body.transaction_type || !body.quantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db
      .from('ppe_transactions')
      .insert([body])
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to create transaction', detail: msg },
      { status: 500 }
    );
  }
}
```
**Pattern สำคัญ**: `let db; try { db = getSupabaseServer(); } catch { db = supabase; }` — ทุก route ต้องมี fallback นี้

## Database Schema (Quick Reference)

| Table | Key Columns | Notes |
|-------|------------|-------|
| `ppe_products` | id, company_id, name, type, unit, min_stock, is_active | 209 rows (AMT) |
| `ppe_transactions` | id, company_id, product_id, transaction_type, quantity, employee_code, transaction_date | 935+ rows, FK → ppe_products |
| `ppe_employees` | id, company_id, employee_code, name, department, is_active | 135 rows |
| `ppe_stock_summary` | product_id, name, type, total_in, total_out, current_stock, min_stock | **VIEW** (read-only) |

Enum ทั้งหมดอยู่ใน `src/lib/constants.ts` — อ่านจากไฟล์นั้นเสมอ ไม่ hardcode

## File Map

```
src/app/ppe/
├── page.tsx            # Dashboard: KPI cards, charts, recent activity, low stock
├── layout.tsx          # Shared layout with sidebar navigation
├── inventory/page.tsx  # Product list & stock management (needs redesign)
├── stock-in/page.tsx   # Stock-in & return form with searchable product picker
├── stock-out/page.tsx  # Stock-out & borrow form with product + employee pickers
├── employees/page.tsx  # Employee CRUD with department filter cards
├── history/page.tsx    # Transaction history with charts & filterable table
└── reports/
    ├── page.tsx        # Reports overview with stock summary table
    └── product/page.tsx # Per-product detail report

src/app/api/ppe/
├── products/route.ts      # CRUD products
├── transactions/route.ts  # CRUD transactions (canonical example)
├── employees/route.ts     # CRUD employees
├── stock/route.ts         # Stock summary queries
└── bulk-import/route.ts   # Batch data import

src/lib/
├── constants.ts  # PPE_TYPES, UNIT_TYPES, TRANSACTION_TYPES, DEPARTMENTS, COLORS
├── types.ts      # All TypeScript types
└── supabase.ts   # Supabase client (browser + server)

src/components/
├── AuthProvider.tsx    # Auth context
├── PPELoginPage.tsx   # PPE login UI
├── Sidebar.tsx        # Navigation sidebar
└── (no shared UI components yet — searchable dropdown is inline per page)
```

## Git Workflow
- ทำงานบน `main` ตรง (ไม่มี feature branch — deploy ทุก push)
- Commit message: ภาษาอังกฤษ, สั้นกระชับ, บอก "what changed"
```bash
git -c user.email="pisit15@users.noreply.github.com" -c user.name="pisit15" commit -m "redesign history page with charts and product names"
git push origin main
```
- Push ทุกครั้งหลัง commit (Vercel auto-deploy)
- ก่อน push ให้ verify ว่า TypeScript compile ผ่าน

## Testing & Validation
- โปรเจกต์นี้ยังไม่มี test suite
- เมื่อแก้ logic ให้ verify ด้วยการ build: `npm run build`
- ตรวจ TypeScript errors: `npx tsc --noEmit`
- ตรวจ runtime ด้วยการเปิด browser ที่ tools.eashe.org/ppe หลัง deploy

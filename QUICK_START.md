# Quick Start Guide

## Setup (5 minutes)

1. **Clone or navigate to project:**
   ```bash
   cd /sessions/vigilant-adoring-fermat/ppe-tools
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp .env.local.example .env.local
   ```

4. **Edit `.env.local` with your Supabase credentials:**
   - Get values from Supabase project Settings > API
   - Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

5. **Run development server:**
   ```bash
   npm run dev
   ```

6. **Open in browser:**
   - http://localhost:3000 (Landing page)
   - http://localhost:3000/ppe (Dashboard with default company)

## Database Setup (5 minutes)

1. Go to Supabase project > SQL Editor
2. Paste contents of `supabase/migrations/001_ppe_tables.sql`
3. Click "Run" to execute SQL
4. Verify tables created in Tables section

## First Steps After Setup

1. **Add PPE Products:**
   - Navigate to `/ppe/inventory?company_id=default`
   - Click "เพิ่มสินค้า" (Add Product)
   - Create a few products (gloves, helmet, etc.)

2. **Add Employees:**
   - Navigate to `/ppe/employees?company_id=default`
   - Click "เพิ่มพนักงาน" (Add Employee)
   - Add a few test employees

3. **Record Stock In:**
   - Navigate to `/ppe/stock-in?company_id=default`
   - Select a product, enter quantity, click "บันทึกรับเข้า"

4. **Record Stock Out:**
   - Navigate to `/ppe/stock-out?company_id=default`
   - Select product, employee, quantity, click "บันทึกการเบิก"

5. **View Dashboard:**
   - Navigate to `/ppe?company_id=default`
   - See stats, low-stock alerts, quick links

## Commands

```bash
# Development
npm run dev          # Start dev server on localhost:3000

# Production
npm run build        # Build for production
npm start           # Start production server

# Linting
npm run lint        # Run ESLint

# TypeScript
npm run build       # Also checks TypeScript
```

## Project Files

| File | Purpose |
|------|---------|
| `supabase/migrations/001_ppe_tables.sql` | Database schema |
| `src/lib/supabase.ts` | Supabase client & helpers |
| `src/lib/types.ts` | TypeScript interfaces |
| `src/lib/constants.ts` | App constants (PPE types, units, etc.) |
| `src/components/Sidebar.tsx` | Navigation sidebar |
| `src/app/ppe/page.tsx` | Dashboard |
| `src/app/ppe/inventory/page.tsx` | Product management |
| `src/app/ppe/stock-in/page.tsx` | Receive form |
| `src/app/ppe/stock-out/page.tsx` | Issue form |
| `src/app/ppe/history/page.tsx` | Transaction history |
| `src/app/ppe/employees/page.tsx` | Employee management |
| `src/app/ppe/reports/page.tsx` | Analytics |
| `.env.local` | Environment variables |

## Features

- Dashboard with real-time stats
- Low-stock alerts
- Product inventory management
- Stock in/out forms
- Employee directory
- Transaction history with filters
- Analytics and reports
- Multi-company support
- Thai language UI

## Multi-Company Usage

Add `?company_id=COMPANY_NAME` to URLs:
- `http://localhost:3000/ppe?company_id=default`
- `http://localhost:3000/ppe?company_id=eashe`
- `http://localhost:3000/ppe?company_id=subsidiary`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `.env.local` has all required vars |
| DB connection error | Verify Supabase URL/keys in `.env.local` |
| Tables not found | Run migration SQL in Supabase |
| Port 3000 already in use | Use `npm run dev -- -p 3001` |
| Yarn/PNPM issues | Use `npm` instead |

## API Endpoints

All endpoints support `?company_id=XXX` query parameter:

```
GET  /api/ppe/products              # List products
POST /api/ppe/products              # Create product

GET  /api/ppe/transactions          # List transactions
POST /api/ppe/transactions          # Create transaction

GET  /api/ppe/stock                 # Get stock summary
GET  /api/ppe/stock?low_stock=true  # Get low-stock items

GET  /api/ppe/employees             # List employees
POST /api/ppe/employees             # Create employee
```

## Documentation

- `README.md` - Full documentation
- `DEPLOYMENT.md` - Production deployment guide
- `PROJECT_STRUCTURE.md` - Detailed structure overview

## Support

For issues:
1. Check troubleshooting in this guide
2. Review Supabase docs: https://supabase.com/docs
3. Check Next.js docs: https://nextjs.org/docs
4. Review code comments in source files

---

Ready to deploy? See `DEPLOYMENT.md`

# Project Structure Overview

## Directory Layout

```
/sessions/vigilant-adoring-fermat/ppe-tools/
├── supabase/
│   └── migrations/
│       └── 001_ppe_tables.sql              # Database schema (Tables, Views, Indexes, RLS)
│
├── src/
│   ├── app/
│   │   ├── api/ppe/
│   │   │   ├── products/route.ts           # GET/POST products
│   │   │   ├── transactions/route.ts       # GET/POST stock movements
│   │   │   ├── stock/route.ts              # GET stock summary view
│   │   │   └── employees/route.ts          # GET/POST employees
│   │   │
│   │   ├── ppe/
│   │   │   ├── layout.tsx                  # Shared PPE layout with sidebar
│   │   │   ├── page.tsx                    # Dashboard (stats & alerts)
│   │   │   ├── inventory/page.tsx          # Product CRUD interface
│   │   │   ├── stock-in/page.tsx           # Receive/return form
│   │   │   ├── stock-out/page.tsx          # Issue/borrow form
│   │   │   ├── history/page.tsx            # Transaction history with filters
│   │   │   ├── employees/page.tsx          # Employee management
│   │   │   └── reports/page.tsx            # Analytics & summaries
│   │   │
│   │   ├── layout.tsx                      # Root layout (metadata, no font)
│   │   ├── page.tsx                        # Home/landing page
│   │   └── globals.css                     # Tailwind & global styles
│   │
│   ├── components/
│   │   ├── Sidebar.tsx                     # Navigation sidebar with company selector
│   │   └── PPELayout.tsx                   # Wrapper combining Sidebar + content
│   │
│   └── lib/
│       ├── supabase.ts                     # Supabase client & helper functions
│       ├── types.ts                        # TypeScript interfaces (15 types)
│       └── constants.ts                    # PPE types, units, departments, colors
│
├── .env.local.example                      # Environment template
├── .env.local                              # Local environment (create from template)
├── .gitignore                              # Git ignore rules
├── README.md                               # Main documentation
├── DEPLOYMENT.md                           # Deployment instructions
├── PROJECT_STRUCTURE.md                    # This file
│
├── package.json                            # Dependencies
├── tsconfig.json                           # TypeScript config
├── tailwind.config.ts                      # Tailwind CSS config
├── next.config.ts                          # Next.js config
├── postcss.config.mjs                      # PostCSS config
├── eslint.config.mjs                       # ESLint config
│
└── public/                                 # Static assets
```

## Key Files

### Core Supabase Database
- **supabase/migrations/001_ppe_tables.sql**: Complete database schema
  - 4 main tables: ppe_products, ppe_transactions, ppe_employees, (+ implicit users)
  - 1 view: ppe_stock_summary (computed current stock levels)
  - Indexes for performance
  - RLS policies (requires configuration)

### Type Definitions
- **src/lib/types.ts**: 15 TypeScript interfaces
  - Models: PPEProduct, PPETransaction, PPEEmployee, PPEStockSummary
  - Input types: CreateProductInput, UpdateProductInput, etc.
  - Response types: DashboardStats

### Constants
- **src/lib/constants.ts**: Configuration constants
  - PPE_TYPES: 10 categories with Thai labels and emojis
  - UNIT_TYPES: 6 measurement units
  - TRANSACTION_TYPES: 4 transaction types
  - DEPARTMENTS: 6 department options
  - Color palette matching eashe.org

### API Routes (RESTful)
- `POST /api/ppe/products` - Create product
- `GET /api/ppe/products?company_id=X` - List products
- `POST /api/ppe/transactions` - Create transaction
- `GET /api/ppe/transactions?company_id=X` - List transactions (with filters)
- `GET /api/ppe/stock?company_id=X` - Get stock summary
- `GET /api/ppe/stock?company_id=X&low_stock=true` - Get low-stock items
- `POST /api/ppe/employees` - Create employee
- `GET /api/ppe/employees?company_id=X` - List employees

### Pages/Routes
- `/` - Home/landing page with feature overview
- `/ppe` - Dashboard with stats and low-stock alerts
- `/ppe/inventory` - Product catalog (CRUD)
- `/ppe/stock-in` - Receive/return form
- `/ppe/stock-out` - Issue/borrow form
- `/ppe/history` - Transaction history with date range filter
- `/ppe/employees` - Employee directory
- `/ppe/reports` - Analytics and summaries

### Components
- **Sidebar.tsx**: Navigation with company selector
- **PPELayout.tsx**: Combines Sidebar with page content

## Database Schema

### Tables

#### ppe_products
- id (UUID, PK)
- company_id (TEXT) - multi-tenant
- name, type, unit
- image_url, min_stock
- is_active, created_at, updated_at

#### ppe_transactions
- id (UUID, PK)
- company_id, product_id
- transaction_type ('stock_in' | 'return' | 'stock_out' | 'borrow')
- quantity, unit, transaction_date
- po_number, employee_code, employee_name, department
- notes, recorded_by, created_at

#### ppe_employees
- id (UUID, PK)
- company_id, employee_code (unique per company)
- name, position, department
- is_active, created_at

#### ppe_stock_summary (VIEW)
- Computed from ppe_products LEFT JOIN ppe_transactions
- Shows: product_id, name, type, unit, image_url, min_stock
- Calculates: total_in, total_out, current_stock

## Environment Variables

Required:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Optional:
- NEXT_PUBLIC_APP_NAME
- NEXT_PUBLIC_DOMAIN

## Build & Runtime

- **Build output**: `.next/` directory
- **TypeScript**: Strict mode enabled
- **CSS**: Tailwind CSS (no custom imports except globals.css)
- **Dynamic rendering**: All PPE pages are `force-dynamic` (useSearchParams requirement)
- **Static routes**: Home page only

## Dependencies

Core:
- next@16.2.3 (App Router, TypeScript)
- react@19.0.0
- react-dom@19.0.0

Styling:
- tailwindcss@4.0.0
- @tailwindcss/postcss@4.0.0

Database:
- @supabase/supabase-js@2.x

Icons:
- lucide-react@latest

## Multi-Company Implementation

All queries pass `?company_id=COMPANY_NAME` to APIs.

Tables filter by `company_id`:
- Products are company-specific
- Transactions are company-specific
- Employees are company-specific

Default: `company_id=default`

Example with different companies:
- `/ppe?company_id=default` - Default company
- `/ppe?company_id=eashe` - EASHE Corp
- `/ppe?company_id=subsidiary` - Subsidiary Co

## Design System

Colors (from eashe.org):
- Primary: #4E79A7 (Blue)
- Secondary: #F28E2B (Orange)
- Accent: #E15759 (Red)
- Positive: #2B8C3E (Green)

Language: Thai (full UI localization)

Responsive: Mobile-first, Tailwind CSS breakpoints

## Performance Optimizations

- Indexed queries on company_id, product_id, transaction_date
- Stock summary view (pre-computed)
- Client-side filtering (history page)
- Dynamic rendering for search params
- No unnecessary re-renders (React.memo eligible)

## Security Considerations

- Supabase authentication (configurable)
- Row Level Security policies (optional, requires setup)
- Environment variables for secrets
- No sensitive data in URLs
- CORS enabled for Supabase origin only

## Testing

Run TypeScript check:
```bash
npm run build
```

Run dev server:
```bash
npm run dev
```

No unit tests included (add as needed with Jest/Vitest)

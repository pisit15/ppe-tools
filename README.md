# PPE Inventory System

A comprehensive Personal Protective Equipment (PPE) Inventory Management System built with Next.js 14, TypeScript, Supabase, and Tailwind CSS.

Deployed to: **tools.eashe.org**

## Features

- **Inventory Management**: Track PPE products with categories, units, and stock levels
- **Stock In/Out**: Record stock movements (receive, return, issue, borrow)
- **Employee Management**: Manage employee records with departments
- **Multi-Company Support**: Isolate data by company_id for multi-tenant operations
- **Dashboard**: Real-time inventory overview with low-stock alerts
- **History Tracking**: Complete transaction history with filtering and search
- **Reports**: Summarized analytics and statistics on inventory
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Thai Language**: Full Thai language support for UI and data

## Tech Stack

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Icons**: Lucide React
- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase (configurable)
- **Hosting**: Vercel (or any Node.js host)

## Project Structure

```
ppe-tools/
├── src/
│   ├── app/
│   │   ├── api/ppe/
│   │   │   ├── products/route.ts       # Product CRUD
│   │   │   ├── transactions/route.ts   # Transaction CRUD
│   │   │   ├── stock/route.ts          # Stock summary
│   │   │   └── employees/route.ts      # Employee CRUD
│   │   ├── ppe/
│   │   │   ├── page.tsx                # Dashboard
│   │   │   ├── inventory/page.tsx      # Product catalog
│   │   │   ├── stock-in/page.tsx       # Receive form
│   │   │   ├── stock-out/page.tsx      # Issue form
│   │   │   ├── history/page.tsx        # Transaction history
│   │   │   ├── employees/page.tsx      # Employee list
│   │   │   └── reports/page.tsx        # Analytics
│   │   ├── layout.tsx                  # Root layout
│   │   └── page.tsx                    # Home/landing
│   ├── components/
│   │   ├── Sidebar.tsx                 # Navigation sidebar
│   │   └── PPELayout.tsx               # PPE page wrapper
│   └── lib/
│       ├── supabase.ts                 # Supabase client & helpers
│       ├── types.ts                    # TypeScript types
│       └── constants.ts                # App constants
├── supabase/
│   └── migrations/
│       └── 001_ppe_tables.sql          # Database schema
├── .env.local.example                  # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase project (free tier available at supabase.com)
- Git

### Installation

1. Clone the repository:
```bash
cd /sessions/vigilant-adoring-fermat/ppe-tools
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

4. Edit `.env.local` with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Database Setup

1. Log in to your Supabase project
2. Go to SQL Editor
3. Copy and paste the contents of `supabase/migrations/001_ppe_tables.sql`
4. Execute the SQL

This will create all required tables:
- `ppe_products` - Product catalog
- `ppe_transactions` - Stock movements
- `ppe_employees` - Employee records
- `ppe_stock_summary` - View for current stock levels

### Development

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Data Models

### PPE Product
- `id` - UUID primary key
- `company_id` - Multi-tenant identifier
- `name` - Product name
- `type` - Category (gloves, helmet, mask, etc.)
- `unit` - Base unit (piece, pair, box, etc.)
- `image_url` - Product image
- `min_stock` - Minimum stock threshold
- `is_active` - Soft delete flag
- `created_at`, `updated_at` - Timestamps

### PPE Transaction
- `id` - UUID primary key
- `company_id` - Multi-tenant identifier
- `product_id` - Reference to product
- `transaction_type` - 'stock_in' | 'return' | 'stock_out' | 'borrow'
- `quantity` - Number of items
- `unit` - Unit of measurement
- `transaction_date` - Date of transaction
- `po_number` - Purchase order (for stock_in)
- `employee_code` - For stock_out/borrow
- `employee_name` - Employee name
- `department` - Employee department
- `notes` - Additional notes
- `recorded_by` - Who recorded the transaction
- `created_at` - Timestamp

### PPE Employee
- `id` - UUID primary key
- `company_id` - Multi-tenant identifier
- `employee_code` - Unique code
- `name` - Full name
- `position` - Job title
- `department` - Department
- `is_active` - Active status
- `created_at` - Timestamp

## API Routes

All API routes accept `company_id` as a query parameter to support multi-tenant operations.

### Products
- `GET /api/ppe/products?company_id=XXX` - List products
- `POST /api/ppe/products` - Create product

### Transactions
- `GET /api/ppe/transactions?company_id=XXX` - List transactions (with optional filters)
- `POST /api/ppe/transactions` - Create transaction

### Stock Summary
- `GET /api/ppe/stock?company_id=XXX` - Get stock levels
- `GET /api/ppe/stock?company_id=XXX&low_stock=true` - Get low-stock items

### Employees
- `GET /api/ppe/employees?company_id=XXX` - List employees
- `POST /api/ppe/employees` - Create employee

## Multi-Company Support

The system supports multiple companies through the `company_id` field. Use the company selector in the sidebar to switch between companies. Pass `?company_id=COMPANY_NAME` in all URLs.

Default company: `default`
Example: `http://localhost:3000/ppe?company_id=eashe`

## Color Palette

Matches eashe.org design system:
- Primary: #4E79A7 (Blue)
- Secondary: #F28E2B (Orange)
- Accent: #E15759 (Red)
- Positive: #2B8C3E (Green)

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Docker

```bash
docker build -t ppe-tools .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  ppe-tools
```

## Future Enhancements

- [ ] User authentication and role-based access
- [ ] Advanced reporting with charts and graphs
- [ ] CSV/PDF export functionality
- [ ] Email notifications for low stock
- [ ] Barcode scanning support
- [ ] Mobile app
- [ ] Integration with accounting system
- [ ] Audit logging
- [ ] Automated reorder suggestions

## Contributing

Contributions are welcome! Please follow these steps:

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions, please refer to the Supabase documentation or create an issue in the repository.

## Related Projects

- **eashe.org** - Main safety dashboard (shared Supabase database)
- Supabase: https://supabase.com
- Next.js: https://nextjs.org

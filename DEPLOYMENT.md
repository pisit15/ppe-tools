# Deployment Guide - PPE Inventory System

## Prerequisites

- Node.js 18+
- Supabase account
- Git
- Vercel account (or any hosting provider)

## Step 1: Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor
3. Copy and paste the contents of `supabase/migrations/001_ppe_tables.sql`
4. Execute the SQL to create all tables
5. Get your API credentials:
   - Go to Settings > API
   - Copy Project URL
   - Copy Anon Key (public)
   - Copy Service Role Key (keep secret)

## Step 2: Environment Variables

Create `.env.local` with:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_NAME=PPE Inventory System
NEXT_PUBLIC_DOMAIN=tools.eashe.org
```

## Step 3: Local Testing

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Step 4: Deployment to Vercel

### Via Git (Recommended)

1. Push code to GitHub
2. Go to https://vercel.com
3. Import project from GitHub
4. Add environment variables in Vercel dashboard:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
5. Deploy

### Via CLI

```bash
npm i -g vercel
vercel
# Follow the prompts
```

### Custom Domain

1. In Vercel > Project Settings > Domains
2. Add `tools.eashe.org`
3. Update DNS records with Vercel's nameservers (or add CNAME)
4. Wait for DNS propagation (5-48 hours)

## Step 5: Post-Deployment

1. Test all features:
   - View dashboard at `/ppe?company_id=default`
   - Create a product in inventory
   - Record a stock in transaction
   - Record a stock out transaction
   - View history and reports

2. Populate initial data:
   - Add PPE products
   - Add employees
   - Set company preferences

3. Configure Supabase Row Level Security (optional):
   - Add policies to `ppe_products`, `ppe_transactions`, `ppe_employees`
   - Based on company_id for multi-tenant isolation

## Troubleshooting

### Build fails with Supabase error
Make sure `.env.local` exists with all required variables before building.

### Database connection errors
- Verify Supabase URL and keys are correct
- Check that tables were created successfully
- Verify network access to Supabase

### Font loading errors
- Google Fonts may be blocked in some environments
- The app uses system fonts as fallback

### Deployment slow
- First deployment can take 5-10 minutes
- Subsequent deployments are faster

## Monitoring

### In Vercel
- Check deployment logs
- Monitor function duration
- Check error rates

### In Supabase
- Monitor database usage
- Check query performance
- View API logs

## Scaling

For high traffic:
1. Enable Supabase connection pooling
2. Add caching headers in Next.js
3. Consider CDN for static assets
4. Monitor and optimize slow queries

## Maintenance

### Regular Tasks
- Backup Supabase data weekly
- Review logs for errors
- Update dependencies monthly
- Test disaster recovery

### Updating Code
```bash
git pull origin main
npm install
npm run build
npm run test
# Deploy via Vercel or manually
```

## Support

- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs
- GitHub Issues: Create issue in repository

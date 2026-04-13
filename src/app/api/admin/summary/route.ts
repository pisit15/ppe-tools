import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase config');
  }
  return createClient(url, serviceKey);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Get all products grouped by company
    const { data: products } = await supabase
      .from('ppe_products')
      .select('company_id')
      .eq('is_active', true);

    // Get all stock summary
    const { data: stocks } = await supabase
      .from('ppe_stock_summary')
      .select('company_id, current_stock, min_stock');

    // Get all employees
    const { data: employees } = await supabase
      .from('ppe_employees')
      .select('company_id')
      .eq('is_active', true);

    // Get company names from tools_users
    const { data: authUsers } = await supabase
      .from('tools_users')
      .select('company_id, company_name')
      .neq('role', 'admin');

    // Build company name map
    const companyNames: Record<string, string> = {};
    if (authUsers) {
      for (const u of authUsers) {
        if (!companyNames[u.company_id]) {
          companyNames[u.company_id] = u.company_name;
        }
      }
    }

    // Aggregate by company
    const companyMap: Record<string, {
      total_products: number;
      total_stock: number;
      low_stock_count: number;
      total_employees: number;
    }> = {};

    const ensureCompany = (id: string) => {
      if (!companyMap[id]) {
        companyMap[id] = { total_products: 0, total_stock: 0, low_stock_count: 0, total_employees: 0 };
      }
    };

    if (products) {
      for (const p of products) {
        ensureCompany(p.company_id);
        companyMap[p.company_id].total_products++;
      }
    }

    if (stocks) {
      for (const s of stocks) {
        ensureCompany(s.company_id);
        companyMap[s.company_id].total_stock += s.current_stock || 0;
        if (s.current_stock < s.min_stock) {
          companyMap[s.company_id].low_stock_count++;
        }
      }
    }

    if (employees) {
      for (const e of employees) {
        ensureCompany(e.company_id);
        companyMap[e.company_id].total_employees++;
      }
    }

    const companies = Object.entries(companyMap).map(([id, data]) => ({
      company_id: id,
      company_name: companyNames[id] || id,
      ...data,
    }));

    return NextResponse.json({ companies });
  } catch (err) {
    console.error('Admin summary error:', err);
    return NextResponse.json({ companies: [] }, { status: 500 });
  }
}

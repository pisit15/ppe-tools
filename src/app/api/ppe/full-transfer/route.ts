import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export const maxDuration = 60; // Allow up to 60 seconds

interface ProductInput {
  name: string;
  type: string;
  unit: string;
  min_stock: number;
  is_active: boolean;
}

interface EmployeeInput {
  employee_code: string;
  name: string;
  position: string;
  department: string;
  is_active: boolean;
}

interface TransactionInput {
  product_name: string;
  transaction_type: string;
  quantity: number;
  unit: string;
  transaction_date: string;
  po_number?: string;
  employee_code?: string;
  employee_name?: string;
  department?: string;
  notes?: string;
  recorded_by?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();
    const { company_id, step, data } = body;

    if (!company_id || !step) {
      return NextResponse.json({ error: 'Missing company_id or step' }, { status: 400 });
    }

    const results: Record<string, unknown> = { step };

    // Step 1: Import products
    if (step === 'products') {
      const products = data as ProductInput[];
      const rows = products.map(p => ({ ...p, company_id }));

      // Insert in chunks of 50
      const productMap: Record<string, string> = {};
      let inserted = 0;
      let errors = 0;

      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const { data: result, error } = await supabase
          .from('ppe_products')
          .insert(chunk)
          .select('id, name');

        if (error) {
          errors += chunk.length;
          results.error_detail = error.message;
        } else if (result) {
          inserted += result.length;
          for (const p of result) {
            productMap[p.name] = p.id;
          }
        }
      }

      results.inserted = inserted;
      results.errors = errors;
      results.product_map = productMap;
    }

    // Step 2: Import employees
    else if (step === 'employees') {
      const employees = data as EmployeeInput[];
      const rows = employees.map(e => ({ ...e, company_id }));

      let inserted = 0;
      let errors = 0;

      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const { data: result, error } = await supabase
          .from('ppe_employees')
          .insert(chunk)
          .select('id');

        if (error) {
          errors += chunk.length;
          results.error_detail = error.message;
        } else if (result) {
          inserted += result.length;
        }
      }

      results.inserted = inserted;
      results.errors = errors;
    }

    // Step 3: Import transactions (stock_in or stock_out)
    else if (step === 'transactions') {
      const { product_map, transactions } = data as {
        product_map: Record<string, string>;
        transactions: TransactionInput[];
      };

      // Map product_name to product_id
      const rows = transactions.map(t => {
        const productId = product_map[t.product_name] || null;
        const { product_name, ...rest } = t;
        return {
          ...rest,
          company_id,
          product_id: productId,
        };
      });

      let inserted = 0;
      let errors = 0;
      let missingProducts = 0;

      // Filter out rows with null product_id if the column is required
      const validRows = rows.filter(r => {
        if (!r.product_id) {
          missingProducts++;
          return false;
        }
        return true;
      });

      for (let i = 0; i < validRows.length; i += 50) {
        const chunk = validRows.slice(i, i + 50);
        const { data: result, error } = await supabase
          .from('ppe_transactions')
          .insert(chunk)
          .select('id');

        if (error) {
          errors += chunk.length;
          results.error_detail = error.message;
        } else if (result) {
          inserted += result.length;
        }
      }

      results.inserted = inserted;
      results.errors = errors;
      results.missing_products = missingProducts;
      results.total_submitted = transactions.length;
    }

    return NextResponse.json({ success: true, ...results }, { status: 201 });

  } catch (error: unknown) {
    console.error('Full transfer error:', error);
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: 'Transfer failed', detail: msg }, { status: 500 });
  }
}

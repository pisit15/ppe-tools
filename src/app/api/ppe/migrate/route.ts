import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

/**
 * POST /api/ppe/migrate
 * Body: { action: 'delete' | 'import-products' | 'import-transactions', company_id, data? }
 *
 * Temporary endpoint for data migration. Remove after use.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();
    const { action, company_id } = body;

    if (!company_id) {
      return NextResponse.json({ error: 'company_id required' }, { status: 400 });
    }

    // ACTION: DELETE all data for a company
    if (action === 'delete') {
      // Delete transactions first (foreign key dependency)
      const { error: txErr, count: txCount } = await supabase
        .from('ppe_transactions')
        .delete({ count: 'exact' })
        .eq('company_id', company_id);

      if (txErr) {
        return NextResponse.json({ error: 'Failed to delete transactions', detail: txErr.message }, { status: 500 });
      }

      // Delete products
      const { error: prodErr, count: prodCount } = await supabase
        .from('ppe_products')
        .delete({ count: 'exact' })
        .eq('company_id', company_id);

      if (prodErr) {
        return NextResponse.json({ error: 'Failed to delete products', detail: prodErr.message }, { status: 500 });
      }

      // Delete employees
      const { error: empErr, count: empCount } = await supabase
        .from('ppe_employees')
        .delete({ count: 'exact' })
        .eq('company_id', company_id);

      return NextResponse.json({
        success: true,
        deleted: {
          transactions: txCount,
          products: prodCount,
          employees: empCount ?? (empErr ? `error: ${empErr.message}` : 0),
        },
      });
    }

    // ACTION: IMPORT products (returns name->id mapping)
    if (action === 'import-products') {
      const { data: products } = body; // array of { name, type, unit, min_stock, is_active }
      if (!Array.isArray(products)) {
        return NextResponse.json({ error: 'data must be array of products' }, { status: 400 });
      }

      const rows = products.map((p: Record<string, unknown>) => ({
        company_id,
        name: p.name,
        type: p.type || 'others',
        unit: p.unit || 'piece',
        min_stock: p.min_stock || 0,
        is_active: true,
        image_url: null,
      }));

      // Insert in chunks
      const chunkSize = 50;
      const mapping: Record<string, string> = {};
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { data: inserted, error } = await supabase
          .from('ppe_products')
          .insert(chunk)
          .select('id, name');

        if (error) {
          errors.push(`Chunk ${i}: ${error.message}`);
        } else if (inserted) {
          for (const p of inserted) {
            mapping[p.name] = p.id;
          }
        }
      }

      return NextResponse.json({
        success: true,
        total: rows.length,
        inserted: Object.keys(mapping).length,
        errors,
        mapping,
      });
    }

    // ACTION: IMPORT transactions
    if (action === 'import-transactions') {
      const { data: transactions } = body;
      if (!Array.isArray(transactions)) {
        return NextResponse.json({ error: 'data must be array of transactions' }, { status: 400 });
      }

      const rows = transactions.map((t: Record<string, unknown>) => ({
        company_id,
        product_id: t.product_id || null,
        transaction_type: t.transaction_type,
        quantity: t.quantity,
        unit: t.unit || 'piece',
        transaction_date: t.transaction_date,
        po_number: t.po_number || null,
        employee_code: t.employee_code || null,
        employee_name: t.employee_name || null,
        department: t.department || null,
        notes: t.notes || null,
        recorded_by: t.recorded_by || null,
      }));

      const chunkSize = 50;
      let totalInserted = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { data: inserted, error } = await supabase
          .from('ppe_transactions')
          .insert(chunk)
          .select('id');

        if (error) {
          errors.push(`Chunk ${i}: ${error.message}`);
        } else {
          totalInserted += inserted?.length || 0;
        }
      }

      return NextResponse.json({
        success: true,
        total: rows.length,
        inserted: totalInserted,
        errors,
      });
    }

    // ACTION: IMPORT employees
    if (action === 'import-employees') {
      const { data: employees } = body;
      if (!Array.isArray(employees)) {
        return NextResponse.json({ error: 'data must be array' }, { status: 400 });
      }

      const rows = employees.map((e: Record<string, unknown>) => ({
        company_id,
        employee_code: String(e.employee_code),
        name: e.name,
        department: e.department || null,
        position: e.position || null,
        is_active: true,
      }));

      const chunkSize = 50;
      let totalInserted = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { data: inserted, error } = await supabase
          .from('ppe_employees')
          .insert(chunk)
          .select('id');

        if (error) {
          errors.push(`Chunk ${i}: ${error.message}`);
        } else {
          totalInserted += inserted?.length || 0;
        }
      }

      return NextResponse.json({
        success: true,
        total: rows.length,
        inserted: totalInserted,
        errors,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: unknown) {
    console.error('Migration error:', error);
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: 'Migration failed', detail: msg }, { status: 500 });
  }
}

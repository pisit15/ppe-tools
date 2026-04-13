import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();
    const { table, data, company_id } = body;

    if (!table || !data || !Array.isArray(data) || !company_id) {
      return NextResponse.json(
        { error: 'Missing required fields: table, data (array), company_id' },
        { status: 400 }
      );
    }

    const validTables = ['ppe_products', 'ppe_employees', 'ppe_transactions'];
    if (!validTables.includes(table)) {
      return NextResponse.json(
        { error: `Invalid table. Must be one of: ${validTables.join(', ')}` },
        { status: 400 }
      );
    }

    // Ensure all rows have company_id
    const rows = data.map((row: Record<string, unknown>) => ({
      ...row,
      company_id,
    }));

    // Insert in chunks of 100 to avoid Supabase limits
    const chunkSize = 100;
    const results = [];
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { data: inserted, error } = await supabase
        .from(table)
        .insert(chunk)
        .select();

      if (error) {
        totalErrors += chunk.length;
        results.push({ chunk: Math.floor(i / chunkSize), error: error.message, code: error.code });
      } else {
        totalInserted += (inserted?.length || 0);
        if (table === 'ppe_products' && inserted) {
          // Return product name->id mapping
          for (const p of inserted) {
            results.push({ name: p.name, id: p.id });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      table,
      total_submitted: rows.length,
      total_inserted: totalInserted,
      total_errors: totalErrors,
      results: table === 'ppe_products' ? results : results.filter(r => r.error),
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Bulk import error:', error);
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json(
      { error: 'Bulk import failed', detail: msg },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id') || 'default';
    const showLowStock = searchParams.get('low_stock') === 'true';

    let query = supabase.from('ppe_stock_summary').select('*');

    // Admin view: companyId 'all' or 'admin' returns data across all companies
    if (companyId !== 'all' && companyId !== 'admin') {
      query = query.eq('company_id', companyId);
    }

    if (showLowStock) {
      query = query.lt('current_stock', 'min_stock');
    }

    const { data, error } = await query.order('name');

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching stock summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock summary' },
      { status: 500 }
    );
  }
}

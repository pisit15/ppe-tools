import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor } from '@/lib/ppe-access';
import { assertCompany, apiError } from '@/lib/toolsSession';
import type { PPEStockSummary } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request, true);
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id') || 'default';
    const showLowStock = searchParams.get('low_stock') === 'true';
    const showOutOfStock = searchParams.get('out_of_stock') === 'true';

    assertCompany(actor, companyId === 'admin' && actor.isAdmin ? 'all' : companyId);
    let query = getSupabaseServer().from('ppe_stock_availability').select('*');

    // Admin view: companyId 'all' or 'admin' returns data across all companies
    if (companyId !== 'all' && companyId !== 'admin') {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query.order('name');

    if (error) throw error;

    // PostgREST cannot compare two columns via .lt(), so filter in JS.
    // low_stock: current_stock < min_stock AND min_stock > 0 (actively breached threshold)
    // out_of_stock: current_stock <= 0 (no units left regardless of min_stock)
    let rows = (data as PPEStockSummary[]) || [];
    if (showLowStock) {
      rows = rows.filter(
        (r) => (r.min_stock ?? 0) > 0 && (r.current_stock ?? 0) < (r.min_stock ?? 0)
      );
    }
    if (showOutOfStock) {
      rows = rows.filter((r) => (r.current_stock ?? 0) <= 0);
    }

    return NextResponse.json({ data: rows });
  } catch (error) {
    return apiError(error);
  }
}

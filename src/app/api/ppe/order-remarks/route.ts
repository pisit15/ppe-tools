import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

// Remark + actual-order quantity per product per calculation period.
// period = end month of the 3-month window, e.g. '2026-08'.

function getDb() {
  try { return getSupabaseServer(); } catch { return supabase; }
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    const period = request.nextUrl.searchParams.get('period');
    if (!companyId || !period) {
      return NextResponse.json({ error: 'Missing company_id or period' }, { status: 400 });
    }
    const db = getDb();
    const { data, error } = await db
      .from('ppe_order_remarks')
      .select('*')
      .eq('company_id', companyId)
      .eq('period', period);
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching order remarks:', error);
    return NextResponse.json({ error: 'Failed to fetch order remarks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      company_id?: string;
      product_id?: string;
      period?: string;
      remark?: string;
      actual_order_qty?: number | null;
    };
    if (!body.company_id || !body.product_id || !body.period) {
      return NextResponse.json(
        { error: 'Missing company_id, product_id or period' },
        { status: 400 }
      );
    }
    const db = getDb();
    const { data, error } = await db
      .from('ppe_order_remarks')
      .upsert(
        [{
          company_id: body.company_id,
          product_id: body.product_id,
          period: body.period,
          remark: body.remark ?? '',
          actual_order_qty: body.actual_order_qty ?? null,
          updated_at: new Date().toISOString(),
        }],
        { onConflict: 'company_id,product_id,period' }
      )
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    console.error('Error saving order remark:', error);
    return NextResponse.json({ error: 'Failed to save order remark' }, { status: 500 });
  }
}

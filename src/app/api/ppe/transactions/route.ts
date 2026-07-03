import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { CreateTransactionInput } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id') || 'default';
    const productId = searchParams.get('product_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit') || '100');

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    const buildQuery = () => {
      let query = db
        .from('ppe_transactions')
        .select('*, ppe_products(name, type, image_url)');

      // Admin view: 'all' / 'admin' returns data across all companies
      if (companyId !== 'all' && companyId !== 'admin') {
        query = query.eq('company_id', companyId);
      }

      if (productId) {
        query = query.eq('product_id', productId);
      }

      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }

      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }

      return query.order('transaction_date', { ascending: false });
    };

    // Supabase caps each response at 1000 rows (PostgREST max-rows),
    // so fetch in pages until we reach `limit` or run out of rows.
    const PAGE_SIZE = 1000;
    const rows: unknown[] = [];
    let offset = 0;
    while (offset < limit) {
      const end = Math.min(offset + PAGE_SIZE, limit) - 1;
      const { data, error } = await buildQuery().range(offset, end);
      if (error) throw error;
      if (data) rows.push(...data);
      if (!data || data.length < end - offset + 1) break;
      offset += PAGE_SIZE;
    }

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTransactionInput;
    const {
      company_id,
      product_id,
      transaction_type,
      quantity,
      unit,
      transaction_date,
      po_number,
      employee_code,
      employee_name,
      department,
      notes,
      recorded_by,
    } = body;

    if (!company_id || !transaction_type || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields (company_id, transaction_type, quantity)' },
        { status: 400 }
      );
    }

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db
      .from('ppe_transactions')
      .insert([
        {
          company_id,
          product_id,
          transaction_type,
          quantity,
          unit,
          transaction_date: transaction_date || new Date().toISOString().split('T')[0],
          po_number,
          employee_code,
          employee_name,
          department,
          notes,
          recorded_by,
        },
      ])
      .select();

    if (error) throw error;

    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating transaction:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to create transaction', detail: msg },
      { status: 500 }
    );
  }
}

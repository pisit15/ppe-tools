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

    let query = supabase
      .from('ppe_transactions')
      .select('*')
      .eq('company_id', companyId);

    if (productId) {
      query = query.eq('product_id', productId);
    }

    if (startDate) {
      query = query.gte('transaction_date', startDate);
    }

    if (endDate) {
      query = query.lte('transaction_date', endDate);
    }

    const { data, error } = await query
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ data });
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

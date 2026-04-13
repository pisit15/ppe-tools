import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { CreateProductInput } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('company_id') || 'default';

    const { data, error } = await supabase
      .from('ppe_products')
      .select('*')
      .eq('company_id', companyId)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateProductInput;
    const { company_id, name, type, unit, image_url, min_stock, is_active } = body;

    if (!company_id || !name || !type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use service role key if available, fall back to anon key
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db
      .from('ppe_products')
      .insert([
        {
          company_id,
          name,
          type,
          unit: unit || 'ชิ้น',
          image_url,
          min_stock: min_stock || 0,
          is_active: is_active !== false,
        },
      ])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create product', detail: error.message, code: error.code, hint: error.hint },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating product:', error);
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json(
      { error: 'Failed to create product', detail: msg },
      { status: 500 }
    );
  }
}

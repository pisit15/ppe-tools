import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

function getDb() {
  let db;
  try { db = getSupabaseServer(); } catch { db = supabase; }
  return db;
}

export async function GET() {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('site_visit_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    const { data, error } = await db
      .from('site_visit_categories')
      .insert([body])
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to create category', detail: msg }, { status: 500 });
  }
}

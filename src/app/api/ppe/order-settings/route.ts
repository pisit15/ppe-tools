import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { PPEOrderSettings } from '@/lib/types';

// Per-company lead time breakdown for the order calculation page.
// Total days / 30 = lead time in months (matches the team's Excel).

const DEFAULTS: Omit<PPEOrderSettings, 'company_id'> = {
  quotation_days: 0.5,
  pr_days: 0.5,
  wams_open_days: 1,
  wams_process_days: 14,
  delivery_days: 14,
};

function getDb() {
  try { return getSupabaseServer(); } catch { return supabase; }
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id') || 'default';
    const db = getDb();
    const { data, error } = await db
      .from('ppe_order_settings')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    const row = (data || [])[0] || { company_id: companyId, ...DEFAULTS };
    return NextResponse.json({ data: row });
  } catch (error) {
    console.error('Error fetching order settings:', error);
    return NextResponse.json({ error: 'Failed to fetch order settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as PPEOrderSettings;
    if (!body.company_id) {
      return NextResponse.json({ error: 'Missing company_id' }, { status: 400 });
    }
    const row = {
      company_id: body.company_id,
      quotation_days: Number(body.quotation_days) || 0,
      pr_days: Number(body.pr_days) || 0,
      wams_open_days: Number(body.wams_open_days) || 0,
      wams_process_days: Number(body.wams_process_days) || 0,
      delivery_days: Number(body.delivery_days) || 0,
      updated_at: new Date().toISOString(),
    };
    const db = getDb();
    const { data, error } = await db
      .from('ppe_order_settings')
      .upsert([row], { onConflict: 'company_id' })
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    console.error('Error saving order settings:', error);
    return NextResponse.json({ error: 'Failed to save order settings' }, { status: 500 });
  }
}

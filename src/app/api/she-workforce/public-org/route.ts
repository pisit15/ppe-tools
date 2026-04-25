import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── GET ?code=XXXX → validate code & return read-only tree ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get('code') || '').trim();
    if (!code) {
      return NextResponse.json({ error: 'code required' }, { status: 400 });
    }

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    const { data: codeRow, error: codeErr } = await db
      .from('org_view_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (codeErr || !codeRow) {
      return NextResponse.json({ error: 'รหัสไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 401 });
    }
    if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'รหัสหมดอายุแล้ว' }, { status: 401 });
    }

    let query = db
      .from('she_personnel')
      .select('id, company_id, full_name, nick_name, position, department, responsibility, status, details, parent_id, chart_sort_order, chart_node_color, is_active')
      .eq('is_active', true);

    if (codeRow.company_id) {
      query = query.eq('company_id', codeRow.company_id);
    }

    const { data, error } = await query
      .order('chart_sort_order', { ascending: true })
      .order('full_name', { ascending: true });
    if (error) throw error;

    const { data: companies } = await db
      .from('companies')
      .select('company_id, company_name')
      .order('company_name');

    return NextResponse.json({
      data: data || [],
      companies: companies || [],
      scope: codeRow.company_id ? 'company' : 'all',
      label: codeRow.label,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Server error', detail: msg }, { status: 500 });
  }
}

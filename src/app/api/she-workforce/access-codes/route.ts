import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── GET: list active access codes ──
export async function GET() {
  try {
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    const { data, error } = await db
      .from('org_view_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to fetch codes', detail: msg }, { status: 500 });
  }
}

// ── POST: create / revoke / delete ──
type Action =
  | { action: 'create'; label?: string; company_id?: string | null; expires_at?: string | null; created_by?: string }
  | { action: 'revoke'; id: string }
  | { action: 'delete'; id: string };

function gen4digit(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Action;
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    if (body.action === 'create') {
      // Try up to 8 times to avoid collision on the unique 4-digit code
      let code = '';
      for (let i = 0; i < 8; i++) {
        code = gen4digit();
        const { data: existing } = await db
          .from('org_view_codes')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!existing) break;
      }
      const { data, error } = await db
        .from('org_view_codes')
        .insert({
          code,
          label: body.label || null,
          company_id: body.company_id || null,
          expires_at: body.expires_at || null,
          created_by: body.created_by || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ data }, { status: 201 });
    }

    if (body.action === 'revoke') {
      const { data, error } = await db
        .from('org_view_codes')
        .update({ is_active: false })
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (body.action === 'delete') {
      const { error } = await db.from('org_view_codes').delete().eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Operation failed', detail: msg }, { status: 500 });
  }
}

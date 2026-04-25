import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── GET: fetch personnel tree (optionally filtered by company) ──
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company_id');

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    let query = db
      .from('she_personnel')
      .select('id, company_id, full_name, nick_name, position, department, responsibility, status, details, parent_id, chart_sort_order, chart_node_color, is_active')
      .eq('is_active', true);

    if (companyId && companyId !== 'all') {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query
      .order('chart_sort_order', { ascending: true })
      .order('full_name', { ascending: true });

    if (error) throw error;

    // Companies list (for grouping/UI)
    const { data: companies } = await db
      .from('companies')
      .select('company_id, company_name')
      .order('company_name');

    return NextResponse.json({ data: data || [], companies: companies || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching org tree:', msg);
    return NextResponse.json({ error: 'Failed to fetch org tree', detail: msg }, { status: 500 });
  }
}

// ── POST: action-based (update_parent, reorder, upsert, delete) ──
type Action =
  | { action: 'update_parent'; id: string; parent_id: string | null }
  | { action: 'reorder'; ids: string[] }
  | { action: 'upsert'; data: Record<string, unknown> }
  | { action: 'delete'; id: string };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Action;
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    switch (body.action) {
      case 'update_parent': {
        if (!body.id) {
          return NextResponse.json({ error: 'id required' }, { status: 400 });
        }
        if (body.parent_id === body.id) {
          return NextResponse.json({ error: 'cannot set self as parent' }, { status: 400 });
        }
        const { data, error } = await db
          .from('she_personnel')
          .update({ parent_id: body.parent_id })
          .eq('id', body.id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ data });
      }

      case 'reorder': {
        if (!Array.isArray(body.ids)) {
          return NextResponse.json({ error: 'ids array required' }, { status: 400 });
        }
        const updates = body.ids.map((id, idx) =>
          db.from('she_personnel').update({ chart_sort_order: idx }).eq('id', id)
        );
        await Promise.all(updates);
        return NextResponse.json({ ok: true });
      }

      case 'upsert': {
        const record = body.data;
        if ('id' in record && record.id) {
          const { data, error } = await db
            .from('she_personnel')
            .update({ ...record, updated_at: new Date().toISOString() })
            .eq('id', record.id as string)
            .select()
            .single();
          if (error) throw error;
          return NextResponse.json({ data });
        } else {
          const { data, error } = await db
            .from('she_personnel')
            .insert(record)
            .select()
            .single();
          if (error) throw error;
          return NextResponse.json({ data }, { status: 201 });
        }
      }

      case 'delete': {
        if (!body.id) {
          return NextResponse.json({ error: 'id required' }, { status: 400 });
        }
        // Detach children (they become orphans / re-parented to NULL)
        await db
          .from('she_personnel')
          .update({ parent_id: null })
          .eq('parent_id', body.id);

        const { error } = await db
          .from('she_personnel')
          .delete()
          .eq('id', body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Org POST error:', msg);
    return NextResponse.json({ error: 'Operation failed', detail: msg }, { status: 500 });
  }
}

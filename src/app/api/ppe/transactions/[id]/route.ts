import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// ── PATCH: update a transaction ──────────────────────────
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await request.json() as Record<string, unknown>;

    // Whitelist editable fields — never let caller change id / created_at / company_id
    const editable: Record<string, unknown> = {};
    const allowed = ['product_id', 'transaction_type', 'quantity', 'unit',
      'transaction_date', 'po_number', 'employee_code', 'employee_name',
      'department', 'notes', 'recorded_by'] as const;
    for (const key of allowed) {
      if (key in body) editable[key] = body[key];
    }

    if (Object.keys(editable).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    const { data, error } = await db
      .from('ppe_transactions')
      .update(editable)
      .eq('id', id)
      .select('*, ppe_products(name, type, image_url)')
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error updating transaction:', msg);
    return NextResponse.json({ error: 'Failed to update transaction', detail: msg }, { status: 500 });
  }
}

// ── DELETE: remove a transaction ─────────────────────────
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }

    const { error } = await db
      .from('ppe_transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error deleting transaction:', msg);
    return NextResponse.json({ error: 'Failed to delete transaction', detail: msg }, { status: 500 });
  }
}

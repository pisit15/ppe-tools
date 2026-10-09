import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { UpdateChemSubstanceInput } from '@/lib/types';
import { sanitizeSubstance, SUBSTANCE_SELECT } from '@/lib/chemical/sanitize';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db.from('chem_substances').select(SUBSTANCE_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'ไม่พบสารเคมี' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching substance:', error);
    return NextResponse.json({ error: 'Failed to fetch substance' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = sanitizeSubstance((await request.json()) as UpdateChemSubstanceInput);
    if (body.name !== undefined && !body.name?.trim()) {
      return NextResponse.json({ error: 'ชื่อสารเคมีห้ามว่าง' }, { status: 400 });
    }
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { data, error } = await db.from('chem_substances').update(body).eq('id', id).select(SUBSTANCE_SELECT);
    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ error: 'ไม่พบสารเคมี' }, { status: 404 });
    return NextResponse.json({ data: data[0] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

/** ลบแบบ soft (is_active=false) — ข้อมูล SDS/ประวัติยังอยู่ */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    let db;
    try { db = getSupabaseServer(); } catch { db = supabase; }
    const { error } = await db.from('chem_substances').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'ลบไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

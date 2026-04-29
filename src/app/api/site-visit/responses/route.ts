import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

function getDb() {
  let db;
  try { db = getSupabaseServer(); } catch { db = supabase; }
  return db;
}

export async function GET(request: NextRequest) {
  try {
    const assessmentId = request.nextUrl.searchParams.get('assessment_id');
    if (!assessmentId) {
      return NextResponse.json({ error: 'Missing assessment_id' }, { status: 400 });
    }
    const db = getDb();
    const { data, error } = await db
      .from('site_visit_responses')
      .select('*, site_visit_items(question, item_no, category_id, max_score)')
      .eq('assessment_id', parseInt(assessmentId));
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return NextResponse.json({ error: 'Failed to fetch responses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();
    // Support bulk upsert: body.responses = [{assessment_id, item_id, score, comment, ...}]
    if (body.responses && Array.isArray(body.responses)) {
      const { data, error } = await db
        .from('site_visit_responses')
        .upsert(body.responses, { onConflict: 'assessment_id,item_id' })
        .select();
      if (error) throw error;
      return NextResponse.json({ data }, { status: 201 });
    }
    // Single response
    if (!body.assessment_id || !body.item_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const { data, error } = await db
      .from('site_visit_responses')
      .upsert([{
        assessment_id: body.assessment_id,
        item_id: body.item_id,
        score: body.score ?? 0,
        comment: body.comment || '',
        corrective_action: body.corrective_action || '',
        due_date: body.due_date || null,
        is_na: body.is_na || false,
      }], { onConflict: 'assessment_id,item_id' })
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to save response', detail: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';

function getDb() {
  let db;
  try { db = getSupabaseServer(); } catch { db = supabase; }
  return db;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const companyId = sp.get('company_id');
    const assessmentType = sp.get('assessment_type');
    const status = sp.get('status');
    const limit = parseInt(sp.get('limit') || '50');

    const db = getDb();
    let query = db
      .from('site_visit_assessments')
      .select('*')
      .order('assessment_date', { ascending: false })
      .limit(limit);

    if (companyId) query = query.eq('company_id', companyId);
    if (assessmentType) query = query.eq('assessment_type', assessmentType);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return NextResponse.json({ error: 'Failed to fetch assessments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.company_id || !body.assessment_type) {
      return NextResponse.json({ error: 'Missing required fields: company_id, assessment_type' }, { status: 400 });
    }
    const db = getDb();
    const { data, error } = await db
      .from('site_visit_assessments')
      .insert([{
        company_id: body.company_id,
        assessment_type: body.assessment_type,
        assessment_date: body.assessment_date || new Date().toISOString().split('T')[0],
        assessor_name: body.assessor_name || '',
        auditee_name: body.auditee_name || '',
        notes: body.notes || '',
        status: body.status || 'draft',
        total_score: body.total_score || 0,
        max_possible_score: body.max_possible_score || 0,
      }])
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to create assessment', detail: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Missing assessment id' }, { status: 400 });
    }
    const db = getDb();
    const { id, ...updates } = body;
    const { data, error } = await db
      .from('site_visit_assessments')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to update assessment', detail: msg }, { status: 500 });
  }
}

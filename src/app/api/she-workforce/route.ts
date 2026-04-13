import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET — fetch SHE workforce data for a company
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const type = searchParams.get('type') || 'all'; // personnel|requirements|licenses|workload|all

    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const result: Record<string, unknown> = {};

    if (type === 'all' || type === 'personnel') {
      const { data, error } = await supabase
        .from('she_personnel')
        .select('*')
        .eq('company_id', companyId)
        .order('full_name');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      result.personnel = data || [];
    }

    if (type === 'all' || type === 'requirements') {
      const { data, error } = await supabase
        .from('legal_requirement_types')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      result.requirements = data || [];
    }

    if (type === 'all' || type === 'licenses') {
      const { data, error } = await supabase
        .from('personnel_licenses')
        .select('*, she_personnel!inner(company_id)')
        .eq('she_personnel.company_id', companyId);
      if (error) {
        // Fallback: simpler query
        const { data: fallback } = await supabase
          .from('personnel_licenses')
          .select('*');
        result.licenses = (fallback || []).filter((l: Record<string, unknown>) => {
          // filter by personnel that belong to company
          const personnel = (result.personnel as Record<string, unknown>[]) || [];
          return personnel.some((p: Record<string, unknown>) => p.id === l.personnel_id);
        });
      } else {
        result.licenses = data || [];
      }
    }

    if (type === 'all' || type === 'workload') {
      const { data, error } = await supabase
        .from('she_workload')
        .select('*')
        .eq('company_id', companyId)
        .order('function_name');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      result.workload = data || [];
    }

    // Also fetch employee count from manhours for latest available month
    if (type === 'all') {
      const currentYear = new Date().getFullYear();
      const { data: mh } = await supabase
        .from('man_hours')
        .select('employee_count, contractor_count, month')
        .eq('company_id', companyId)
        .eq('year', currentYear)
        .order('month', { ascending: false })
        .limit(1);
      result.latestManHours = mh?.[0] || null;
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST — create/update personnel, requirements, licenses, or workload
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'upsert_personnel': {
        const record = body.data;
        if (record.id) {
          record.updated_at = new Date().toISOString();
          const { data, error } = await supabase
            .from('she_personnel')
            .update(record)
            .eq('id', record.id)
            .select()
            .single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json(data);
        } else {
          const { data, error } = await supabase
            .from('she_personnel')
            .insert(record)
            .select()
            .single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json(data);
        }
      }

      case 'delete_personnel': {
        const { id } = body;
        const { error } = await supabase.from('she_personnel').delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'upsert_requirement': {
        const record = body.data;
        if (record.id) {
          record.updated_at = new Date().toISOString();
          const { data, error } = await supabase
            .from('legal_requirement_types')
            .update(record)
            .eq('id', record.id)
            .select()
            .single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json(data);
        } else {
          const { data, error } = await supabase
            .from('legal_requirement_types')
            .insert(record)
            .select()
            .single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json(data);
        }
      }

      case 'delete_requirement': {
        const { id } = body;
        const { error } = await supabase.from('legal_requirement_types').delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'upsert_license': {
        const record = body.data;
        const { data, error } = await supabase
          .from('personnel_licenses')
          .upsert(record, { onConflict: 'personnel_id,requirement_type_id' })
          .select()
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
      }

      case 'bulk_upsert_licenses': {
        const records = body.data as Array<Record<string, unknown>>;
        const { data, error } = await supabase
          .from('personnel_licenses')
          .upsert(records, { onConflict: 'personnel_id,requirement_type_id' })
          .select();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
      }

      case 'upsert_workload': {
        const record = body.data;
        if (record.id) {
          record.updated_at = new Date().toISOString();
          const { data, error } = await supabase
            .from('she_workload')
            .update(record)
            .eq('id', record.id)
            .select()
            .single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json(data);
        } else {
          const { data, error } = await supabase
            .from('she_workload')
            .insert(record)
            .select()
            .single();
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json(data);
        }
      }

      case 'delete_workload': {
        const { id } = body;
        const { error } = await supabase.from('she_workload').delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

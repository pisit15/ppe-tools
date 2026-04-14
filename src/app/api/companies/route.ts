import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabase();

    // Try to fetch from company_settings table first
    const { data: companies, error: settingsError } = await supabase
      .from('company_settings')
      .select('company_id, company_name')
      .order('company_name');

    if (!settingsError && companies && companies.length > 0) {
      return NextResponse.json(companies);
    }

    // Fallback: get distinct company_id from she_personnel
    const { data: personnel, error: personnelError } = await supabase
      .from('she_personnel')
      .select('company_id')
      .order('company_id');

    if (personnelError) {
      return NextResponse.json({ error: personnelError.message }, { status: 500 });
    }

    // Get unique company IDs
    const uniqueCompanies = Array.from(
      new Map(
        (personnel || [])
          .filter((p: Record<string, unknown>) => p.company_id)
          .map((p: Record<string, unknown>) => [
            p.company_id,
            {
              company_id: p.company_id as string,
              company_name: (p.company_id as string).toUpperCase(),
            },
          ])
      ).values()
    );

    return NextResponse.json(uniqueCompanies);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

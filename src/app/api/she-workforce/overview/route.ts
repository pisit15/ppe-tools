import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET — fetch overview of all companies' SHE workforce for executive dashboard
export async function GET() {
  try {
    const supabase = getSupabaseServer();

    // Fetch all personnel grouped by company
    const { data: allPersonnel, error: pErr } = await supabase
      .from('she_personnel')
      .select('*')
      .eq('is_active', true)
      .order('company_id');
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    // Fetch all legal requirements
    const { data: allReqs, error: rErr } = await supabase
      .from('legal_requirement_types')
      .select('*')
      .eq('is_active', true)
      .order('company_id');
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    // Fetch all licenses
    const { data: allLicenses, error: lErr } = await supabase
      .from('personnel_licenses')
      .select('*')
      .eq('has_license', true);
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

    // Fetch latest man_hours for employee counts
    const currentYear = new Date().getFullYear();
    const { data: allMH } = await supabase
      .from('man_hours')
      .select('company_id, employee_count, contractor_count, month')
      .eq('year', currentYear)
      .order('month', { ascending: false });

    // Group by company
    const companyMap: Record<string, {
      personnelCount: number;
      byResponsibility: Record<string, number>;
      byEmploymentType: Record<string, number>;
      requirementsCount: number;
      licensedCount: number;
      employeeCount: number;
      contractorCount: number;
    }> = {};

    // Process personnel
    for (const p of (allPersonnel || [])) {
      const cid = p.company_id;
      if (!companyMap[cid]) {
        companyMap[cid] = {
          personnelCount: 0,
          byResponsibility: {},
          byEmploymentType: {},
          requirementsCount: 0,
          licensedCount: 0,
          employeeCount: 0,
          contractorCount: 0,
        };
      }
      companyMap[cid].personnelCount++;
      const resp = p.responsibility || 'ไม่ระบุ';
      companyMap[cid].byResponsibility[resp] = (companyMap[cid].byResponsibility[resp] || 0) + 1;
      const empType = p.employment_type || 'permanent';
      companyMap[cid].byEmploymentType[empType] = (companyMap[cid].byEmploymentType[empType] || 0) + 1;
    }

    // Process requirements
    for (const r of (allReqs || [])) {
      const cid = r.company_id;
      if (companyMap[cid]) companyMap[cid].requirementsCount++;
    }

    // Process licenses
    const personnelById = new Map((allPersonnel || []).map((p: Record<string, unknown>) => [p.id, p]));
    for (const l of (allLicenses || [])) {
      const person = personnelById.get(l.personnel_id) as Record<string, unknown> | undefined;
      if (person) {
        const cid = person.company_id as string;
        if (companyMap[cid]) companyMap[cid].licensedCount++;
      }
    }

    // Process employee counts (latest month per company)
    const seenCompany = new Set<string>();
    for (const mh of (allMH || [])) {
      const cid = mh.company_id;
      if (!seenCompany.has(cid)) {
        seenCompany.add(cid);
        if (companyMap[cid]) {
          companyMap[cid].employeeCount = mh.employee_count || 0;
          companyMap[cid].contractorCount = mh.contractor_count || 0;
        }
      }
    }

    return NextResponse.json({
      companies: companyMap,
      totalPersonnel: (allPersonnel || []).length,
      totalRequirements: (allReqs || []).length,
      totalLicenses: (allLicenses || []).length,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

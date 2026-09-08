import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

// Dropdown data for the Team Management forms, in one round-trip.
// `company_id` narrows the lists; without it every company is returned.
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    const scoped = companyId && companyId !== 'all' ? companyId : null;
    const db = saDb();

    let typesQuery = db
      .from('legal_requirement_types')
      .select('id, company_id, name, short_name, category, is_required, sort_order')
      .eq('is_active', true);
    if (scoped) typesQuery = typesQuery.eq('company_id', scoped);

    let personnelQuery = db
      .from('she_personnel')
      .select('id, company_id, full_name, nick_name, position')
      .eq('is_active', true);
    if (scoped) personnelQuery = personnelQuery.eq('company_id', scoped);

    let employeesQuery = db
      .from('company_employees')
      .select('id, company_id, emp_code, first_name, last_name, department, position')
      .eq('is_active', true);
    if (scoped) employeesQuery = employeesQuery.eq('company_id', scoped);

    const [types, personnel, employees, companies] = await Promise.all([
      typesQuery.order('sort_order'),
      personnelQuery.order('full_name'),
      employeesQuery.order('first_name'),
      db.from('company_settings').select('company_id, company_name').order('company_id'),
    ]);

    return NextResponse.json({
      requirementTypes: types.data || [],
      personnel: personnel.data || [],
      employees: employees.data || [],
      companies: companies.data || [],
    });
  } catch (err) {
    return saError(err, 'โหลดข้อมูลอ้างอิงไม่สำเร็จ');
  }
}

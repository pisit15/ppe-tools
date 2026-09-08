import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

const SOON_DAYS = 90;

type PersonRow = {
  id: string;
  company_id: string;
  full_name: string;
  nick_name: string | null;
  is_active: boolean;
  is_she_team: boolean;
};

type LicenseRow = {
  id: string;
  personnel_id: string;
  requirement_type_id: string;
  has_license: boolean;
  license_no: string | null;
  expiry_date: string | null;
};

type TypeRow = {
  id: string;
  company_id: string;
  name: string;
  short_name: string | null;
  category: string | null;
  is_required: boolean;
};

type CertRow = {
  id: string;
  company_id: string;
  emp_code: string | null;
  certificate_name: string;
  expiry_date: string | null;
  no_expiry: boolean;
  company_employees: { first_name: string | null; last_name: string | null } | null;
};

// Days until expiry; negative means already expired. null = no expiry recorded.
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const db = saDb();

    const [people, licenses, types, certs, companies] = await Promise.all([
      db.from('she_personnel').select('id, company_id, full_name, nick_name, is_active, is_she_team'),
      db
        .from('personnel_licenses')
        .select('id, personnel_id, requirement_type_id, has_license, license_no, expiry_date'),
      db
        .from('legal_requirement_types')
        .select('id, company_id, name, short_name, category, is_required')
        .eq('is_active', true),
      db
        .from('employee_certificates')
        .select(
          'id, company_id, emp_code, certificate_name, expiry_date, no_expiry, company_employees(first_name, last_name)'
        ),
      db.from('company_settings').select('company_id, company_name'),
    ]);

    const peopleRows = (people.data || []) as PersonRow[];
    const licenseRows = (licenses.data || []) as LicenseRow[];
    const typeRows = (types.data || []) as TypeRow[];
    const certRows = (certs.data || []) as unknown as CertRow[];

    const companyNames: Record<string, string> = {};
    for (const row of companies.data || []) {
      companyNames[String(row.company_id)] = String(row.company_name);
    }

    const personById = new Map(peopleRows.map((p) => [p.id, p]));
    const typeById = new Map(typeRows.map((t) => [t.id, t]));

    // --- per-company rollup ------------------------------------------------
    type CompanyStat = {
      company_id: string;
      company_name: string;
      personnel: number;
      she_team: number;
      required_types: number;
      covered_types: number;
    };
    const byCompany: Record<string, CompanyStat> = {};
    const ensure = (id: string): CompanyStat => {
      if (!byCompany[id]) {
        byCompany[id] = {
          company_id: id,
          company_name: companyNames[id] || id,
          personnel: 0,
          she_team: 0,
          required_types: 0,
          covered_types: 0,
        };
      }
      return byCompany[id];
    };

    for (const person of peopleRows) {
      if (!person.is_active) continue;
      const stat = ensure(person.company_id);
      stat.personnel += 1;
      if (person.is_she_team) stat.she_team += 1;
    }

    // A required legal role counts as covered when at least one active person
    // in that company actually holds the licence.
    const heldTypeByCompany = new Set<string>();
    for (const license of licenseRows) {
      if (!license.has_license) continue;
      const person = personById.get(license.personnel_id);
      if (!person || !person.is_active) continue;
      heldTypeByCompany.add(`${person.company_id}::${license.requirement_type_id}`);
    }

    for (const type of typeRows) {
      if (!type.is_required) continue;
      const stat = ensure(type.company_id);
      stat.required_types += 1;
      if (heldTypeByCompany.has(`${type.company_id}::${type.id}`)) stat.covered_types += 1;
    }

    // --- expiry watchlist --------------------------------------------------
    type ExpiryItem = {
      id: string;
      kind: 'legal' | 'certificate';
      person: string;
      company_id: string;
      company_name: string;
      title: string;
      expiry_date: string;
      days: number;
    };
    const watchlist: ExpiryItem[] = [];

    for (const license of licenseRows) {
      const days = daysUntil(license.expiry_date);
      if (days === null) continue;
      const person = personById.get(license.personnel_id);
      const type = typeById.get(license.requirement_type_id);
      watchlist.push({
        id: license.id,
        kind: 'legal',
        person: person?.full_name || '-',
        company_id: person?.company_id || '-',
        company_name: companyNames[person?.company_id || ''] || person?.company_id || '-',
        title: type?.short_name || type?.name || 'ใบอนุญาต',
        expiry_date: license.expiry_date as string,
        days,
      });
    }

    for (const cert of certRows) {
      if (cert.no_expiry) continue;
      const days = daysUntil(cert.expiry_date);
      if (days === null) continue;
      const employee = cert.company_employees;
      watchlist.push({
        id: cert.id,
        kind: 'certificate',
        person: employee
          ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || cert.emp_code || '-'
          : cert.emp_code || '-',
        company_id: cert.company_id,
        company_name: companyNames[cert.company_id] || cert.company_id,
        title: cert.certificate_name,
        expiry_date: cert.expiry_date as string,
        days,
      });
    }

    watchlist.sort((a, b) => a.days - b.days);

    const expired = watchlist.filter((item) => item.days < 0).length;
    const expiringSoon = watchlist.filter(
      (item) => item.days >= 0 && item.days <= SOON_DAYS
    ).length;

    // Rows with no expiry date at all — a data gap, not a compliance state.
    const legalWithoutExpiry = licenseRows.filter(
      (row) => row.has_license && !row.expiry_date
    ).length;
    const certsWithoutExpiry = certRows.filter(
      (row) => !row.no_expiry && !row.expiry_date
    ).length;

    return NextResponse.json({
      soonDays: SOON_DAYS,
      totals: {
        personnel: peopleRows.filter((p) => p.is_active).length,
        sheTeam: peopleRows.filter((p) => p.is_active && p.is_she_team).length,
        companies: Object.keys(byCompany).length,
        legalLicenses: licenseRows.length,
        legalHeld: licenseRows.filter((row) => row.has_license).length,
        certificates: certRows.length,
        expired,
        expiringSoon,
        missingExpiryDates: legalWithoutExpiry + certsWithoutExpiry,
      },
      companies: Object.values(byCompany).sort((a, b) =>
        a.company_id.localeCompare(b.company_id)
      ),
      watchlist: watchlist.filter((item) => item.days <= SOON_DAYS).slice(0, 25),
    });
  } catch (err) {
    return saError(err, 'โหลดภาพรวมทีมไม่สำเร็จ');
  }
}

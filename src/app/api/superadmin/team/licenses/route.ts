import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

// Two kinds of credential live in two tables:
//   legal       personnel_licenses      — ใบอนุญาตตามกฎหมาย ผูกกับ she_personnel
//   certificate employee_certificates   — ใบรับรอง/ใบเซอร์ ผูกกับ company_employees
type Kind = 'legal' | 'certificate';

const LEGAL_SELECT =
  'id, personnel_id, requirement_type_id, has_license, license_no, issue_date, expiry_date, notes, updated_at, ' +
  'she_personnel(id, full_name, nick_name, company_id, position, is_active), ' +
  'legal_requirement_types(id, name, short_name, category, is_required)';

const CERT_SELECT =
  'id, company_id, employee_id, emp_code, certificate_name, issued_date, expiry_date, no_expiry, certificate_number, issuer, notes, updated_at, ' +
  'company_employees(id, first_name, last_name, emp_code, department, position, is_active)';

const LEGAL_EDITABLE = [
  'personnel_id',
  'requirement_type_id',
  'has_license',
  'license_no',
  'issue_date',
  'expiry_date',
  'notes',
];

const CERT_EDITABLE = [
  'company_id',
  'employee_id',
  'emp_code',
  'certificate_name',
  'issued_date',
  'expiry_date',
  'no_expiry',
  'certificate_number',
  'issuer',
  'notes',
];

// Shape of the embedded she_personnel join, used only to filter by company —
// supabase-js cannot infer embedded rows, so it is declared here.
type LegalJoinRow = { she_personnel: { company_id?: string } | null };

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function kindOf(request: NextRequest): Kind {
  return request.nextUrl.searchParams.get('kind') === 'certificate' ? 'certificate' : 'legal';
}

// Empty date inputs arrive as '' — Postgres rejects that for a date column,
// so normalise blanks to null before writing.
function pickEditable(body: Record<string, unknown>, fields: string[]) {
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      patch[field] = trimmed === '' ? null : trimmed;
    } else {
      patch[field] = value;
    }
  }
  return patch;
}

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const kind = kindOf(request);
  const companyId = request.nextUrl.searchParams.get('company_id');

  try {
    const db = saDb();

    if (kind === 'certificate') {
      let query = db.from('employee_certificates').select(CERT_SELECT);
      if (companyId && companyId !== 'all') query = query.eq('company_id', companyId);
      const { data, error } = await query.order('expiry_date', {
        ascending: true,
        nullsFirst: false,
      });
      if (error) throw error;
      return NextResponse.json({ kind, data: data || [] });
    }

    // personnel_licenses has no company_id of its own — filter through the
    // embedded she_personnel row instead.
    const { data, error } = await db
      .from('personnel_licenses')
      .select(LEGAL_SELECT)
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const rows = ((data || []) as unknown as LegalJoinRow[]).filter((row) => {
      if (!companyId || companyId === 'all') return true;
      return row.she_personnel?.company_id === companyId;
    });

    return NextResponse.json({ kind, data: rows });
  } catch (err) {
    return saError(err, 'โหลดข้อมูลใบอนุญาตไม่สำเร็จ');
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const kind = kindOf(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const db = saDb();

    if (kind === 'certificate') {
      const employeeId = String(body.employee_id || '').trim();
      const name = String(body.certificate_name || '').trim();
      if (!employeeId || !name) return badRequest('กรุณาเลือกพนักงานและกรอกชื่อใบรับรอง');

      const row: Record<string, unknown> = {
        ...pickEditable(body, CERT_EDITABLE),
        employee_id: employeeId,
        certificate_name: name,
        no_expiry: Boolean(body.no_expiry),
      };
      if (row.no_expiry) row.expiry_date = null;

      const { data, error } = await db
        .from('employee_certificates')
        .insert(row)
        .select(CERT_SELECT)
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    const personnelId = String(body.personnel_id || '').trim();
    const requirementTypeId = String(body.requirement_type_id || '').trim();
    if (!personnelId || !requirementTypeId) {
      return badRequest('กรุณาเลือกบุคลากรและประเภทใบอนุญาต');
    }

    const { data: existing } = await db
      .from('personnel_licenses')
      .select('id')
      .eq('personnel_id', personnelId)
      .eq('requirement_type_id', requirementTypeId);
    if ((existing || []).length > 0) {
      return badRequest('บุคลากรคนนี้มีรายการใบอนุญาตประเภทนี้อยู่แล้ว', 409);
    }

    const row: Record<string, unknown> = {
      ...pickEditable(body, LEGAL_EDITABLE),
      personnel_id: personnelId,
      requirement_type_id: requirementTypeId,
      has_license: Boolean(body.has_license),
    };

    const { data, error } = await db
      .from('personnel_licenses')
      .insert(row)
      .select(LEGAL_SELECT)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'เพิ่มรายการไม่สำเร็จ');
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const kind = kindOf(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || '');
    if (!id) return badRequest('ไม่พบ id ของรายการ');

    const table = kind === 'certificate' ? 'employee_certificates' : 'personnel_licenses';
    const select = kind === 'certificate' ? CERT_SELECT : LEGAL_SELECT;
    const patch = pickEditable(body, kind === 'certificate' ? CERT_EDITABLE : LEGAL_EDITABLE);

    if (kind === 'certificate' && body.no_expiry !== undefined) {
      patch.no_expiry = Boolean(body.no_expiry);
      if (patch.no_expiry) patch.expiry_date = null;
    }
    if (kind === 'legal' && body.has_license !== undefined) {
      patch.has_license = Boolean(body.has_license);
    }

    if (Object.keys(patch).length === 0) return badRequest('ไม่มีข้อมูลที่จะแก้ไข');
    patch.updated_at = new Date().toISOString();

    const { data, error } = await saDb()
      .from(table)
      .update(patch)
      .eq('id', id)
      .select(select)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'แก้ไขรายการไม่สำเร็จ');
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const kind = kindOf(request);

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return badRequest('ไม่พบ id ของรายการ');

    const table = kind === 'certificate' ? 'employee_certificates' : 'personnel_licenses';
    const { error } = await saDb().from(table).delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return saError(err, 'ลบรายการไม่สำเร็จ');
  }
}

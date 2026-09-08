import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

// SHE personnel across every company. The same table powers /she-workforce on
// tools.eashe.org — this console is the group-wide, cross-company editor.
const COLUMNS =
  'id, company_id, bu, full_name, nick_name, position, responsibility, department, employment_type, phone, email, is_active, is_she_team, created_at, updated_at';

const EDITABLE = [
  'company_id',
  'bu',
  'full_name',
  'nick_name',
  'position',
  'responsibility',
  'department',
  'employment_type',
  'phone',
  'email',
  'is_active',
  'is_she_team',
];

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function pickEditable(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (body[field] === undefined) continue;
    const value = body[field];
    patch[field] = typeof value === 'string' ? value.trim() : value;
  }
  return patch;
}

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const params = request.nextUrl.searchParams;
    const companyId = params.get('company_id');
    const sheTeamOnly = params.get('she_team_only') === '1';

    let query = saDb().from('she_personnel').select(COLUMNS);
    if (companyId && companyId !== 'all') query = query.eq('company_id', companyId);
    if (sheTeamOnly) query = query.eq('is_she_team', true);

    const { data, error } = await query.order('company_id').order('full_name');
    if (error) throw error;

    // License counts per person so the table can show coverage without a
    // second round-trip from the browser.
    const { data: licenses } = await saDb()
      .from('personnel_licenses')
      .select('personnel_id, has_license');
    const licenseCounts: Record<string, { total: number; held: number }> = {};
    for (const row of licenses || []) {
      const key = String(row.personnel_id);
      if (!licenseCounts[key]) licenseCounts[key] = { total: 0, held: 0 };
      licenseCounts[key].total += 1;
      if (row.has_license) licenseCounts[key].held += 1;
    }

    return NextResponse.json({ data: data || [], licenseCounts });
  } catch (err) {
    return saError(err, 'โหลดรายชื่อบุคลากรไม่สำเร็จ');
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = String(body.company_id || '').trim();
    const fullName = String(body.full_name || '').trim();
    if (!companyId || !fullName) return badRequest('กรุณากรอกบริษัทและชื่อ-นามสกุล');

    const row = {
      ...pickEditable(body),
      company_id: companyId,
      full_name: fullName,
      employment_type: String(body.employment_type || 'permanent').trim() || 'permanent',
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      is_she_team: body.is_she_team === undefined ? true : Boolean(body.is_she_team),
    };

    const { data, error } = await saDb().from('she_personnel').insert(row).select(COLUMNS).single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'เพิ่มบุคลากรไม่สำเร็จ');
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || '');
    if (!id) return badRequest('ไม่พบ id ของบุคลากร');

    const patch = pickEditable(body);
    if (Object.keys(patch).length === 0) return badRequest('ไม่มีข้อมูลที่จะแก้ไข');
    patch.updated_at = new Date().toISOString();

    const { data, error } = await saDb()
      .from('she_personnel')
      .update(patch)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'แก้ไขบุคลากรไม่สำเร็จ');
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return badRequest('ไม่พบ id ของบุคลากร');

    const db = saDb();
    // personnel_licenses and she_workload cascade / null out on delete, so warn
    // rather than silently discarding license history.
    const { data: licenses } = await db
      .from('personnel_licenses')
      .select('id')
      .eq('personnel_id', id);
    if ((licenses || []).length > 0 && request.nextUrl.searchParams.get('force') !== '1') {
      return NextResponse.json(
        {
          error: `บุคลากรคนนี้มีข้อมูลใบอนุญาต ${(licenses || []).length} รายการ การลบจะลบใบอนุญาตไปด้วย`,
          needsForce: true,
        },
        { status: 409 }
      );
    }

    const { error } = await db.from('she_personnel').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return saError(err, 'ลบบุคลากรไม่สำเร็จ');
  }
}

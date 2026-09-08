import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

const COLUMNS =
  'company_id, company_name, full_name, group_name, bu, sheet_id, safety_sheet, envi_sheet, created_at, updated_at';
const EDITABLE = [
  'company_name',
  'full_name',
  'group_name',
  'bu',
  'sheet_id',
  'safety_sheet',
  'envi_sheet',
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
    const db = saDb();
    const { data, error } = await db.from('company_settings').select(COLUMNS).order('company_id');
    if (error) throw error;

    // How many accounts each company has, so an empty company is obvious.
    const [{ data: cu }, { data: tu }] = await Promise.all([
      db.from('company_users').select('company_id'),
      db.from('tools_users').select('company_id'),
    ]);
    const userCounts: Record<string, number> = {};
    for (const row of [...(cu || []), ...(tu || [])]) {
      const id = String(row.company_id);
      userCounts[id] = (userCounts[id] || 0) + 1;
    }

    return NextResponse.json({ data: data || [], userCounts });
  } catch (err) {
    return saError(err, 'โหลดรายชื่อบริษัทไม่สำเร็จ');
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = String(body.company_id || '').trim().toLowerCase();
    const companyName = String(body.company_name || '').trim();

    if (!companyId || !companyName) return badRequest('กรุณากรอกรหัสบริษัทและชื่อบริษัท');
    if (!/^[a-z0-9_-]+$/.test(companyId)) {
      return badRequest('รหัสบริษัทใช้ได้เฉพาะ a-z, 0-9, - และ _');
    }

    const db = saDb();
    const { data: existing } = await db
      .from('company_settings')
      .select('company_id')
      .eq('company_id', companyId);
    if ((existing || []).length > 0) return badRequest(`รหัสบริษัท "${companyId}" มีอยู่แล้ว`, 409);

    const { data, error } = await db
      .from('company_settings')
      .insert({ ...pickEditable(body), company_id: companyId, company_name: companyName })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'เพิ่มบริษัทไม่สำเร็จ');
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = String(body.company_id || '').trim();
    if (!companyId) return badRequest('ไม่พบรหัสบริษัท');

    const patch = pickEditable(body);
    if (Object.keys(patch).length === 0) return badRequest('ไม่มีข้อมูลที่จะแก้ไข');
    patch.updated_at = new Date().toISOString();

    const { data, error } = await saDb()
      .from('company_settings')
      .update(patch)
      .eq('company_id', companyId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'แก้ไขบริษัทไม่สำเร็จ');
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    if (!companyId) return badRequest('ไม่พบรหัสบริษัท');

    const db = saDb();
    // Refuse while accounts still point at this company — deleting the row
    // would strand them with no way to log in and no obvious cause.
    const [{ data: cu }, { data: tu }] = await Promise.all([
      db.from('company_users').select('id').eq('company_id', companyId),
      db.from('tools_users').select('id').eq('company_id', companyId),
    ]);
    const remaining = (cu || []).length + (tu || []).length;
    if (remaining > 0) {
      return badRequest(`ยังมีผู้ใช้ ${remaining} บัญชีผูกกับบริษัทนี้ กรุณาย้ายหรือลบผู้ใช้ก่อน`, 409);
    }

    const { error } = await db.from('company_settings').delete().eq('company_id', companyId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return saError(err, 'ลบบริษัทไม่สำเร็จ');
  }
}

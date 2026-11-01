import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { db, requireInspectStaff } from '@/lib/inspect/access';
import { bad, opt, str } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const { data, error } = await db().from('insp_inspectors').select('*').eq('company_id', company).order('code');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

/** POST { company_id, rows: [{code,name,department}] } → upsert by code */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const body = await request.json().catch(() => null) as { company_id?: string; rows?: unknown[] } | null;
    const company = String(body?.company_id || '');
    assertCompany(actor, company, true);
    const rows = Array.isArray(body?.rows) ? body!.rows : [];
    if (!rows.length || rows.length > 500) throw bad('กรุณาใส่รายชื่อผู้ตรวจ 1–500 คน');
    const clean = rows.map((r, i) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const code = str(o.code, 20, `รหัสผู้ตรวจแถว ${i + 1}`);
      if (!/^[A-Za-z0-9-]{3,20}$/.test(code)) throw bad(`รหัส "${code}" ต้องเป็นตัวอักษร/ตัวเลข 3–20 ตัว`);
      return { company_id: company, code, name: str(o.name, 120, `ชื่อผู้ตรวจแถว ${i + 1}`), department: opt(o.department, 80, 'แผนก'), is_active: o.is_active === false ? false : true };
    });
    const { data, error } = await db().from('insp_inspectors').upsert(clean, { onConflict: 'company_id,code' }).select('*');
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return apiError(error); }
}

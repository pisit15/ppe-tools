import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { companyOptions, db } from '@/lib/visitor/server';
import type { VisitorCompanyOptionsRow } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

/** SHE: option lists (work areas, departments) of a company. */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const company = request.nextUrl.searchParams.get('company') || actor.companyId;
    assertCompany(actor, company, true);
    return NextResponse.json({ data: { company_id: company, ...(await companyOptions(company)) } });
  } catch (error) {
    return apiError(error);
  }
}

function cleanList(v: unknown, label: string) {
  if (!Array.isArray(v)) throw new AccessError(`รายการ${label}ไม่ถูกต้อง`, 400);
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const t = item.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > 80) throw new AccessError(`${label} "${t.slice(0, 20)}…" ยาวเกิน 80 ตัวอักษร`, 400);
    if (!out.includes(t)) out.push(t);
  }
  if (out.length > 100) throw new AccessError(`${label}ได้ไม่เกิน 100 รายการ`, 400);
  return out;
}

const MAX_BG = 800_000; // chars of data URL (~600 KB JPEG)

/**
 * SHE: replace a company's settings. Body { company_id, areas, departments, form_background?, form_background_dim? }
 * form_background: JPEG data URL (client downscales), '' or null clears it, undefined leaves it unchanged.
 */
export async function PUT(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const body = (await request.json().catch(() => null)) as { company_id?: unknown; areas?: unknown; departments?: unknown; form_background?: unknown; form_background_dim?: unknown } | null;
    const company = body?.company_id;
    assertCompany(actor, company, true);
    const areas = cleanList(body?.areas, 'พื้นที่');
    const departments = cleanList(body?.departments, 'แผนก');
    const patch: Record<string, unknown> = { company_id: company, areas, departments, updated_at: new Date().toISOString(), updated_by: actor.displayName || actor.username };
    if (body?.form_background !== undefined) {
      const bg = body.form_background;
      if (bg === null || bg === '') patch.form_background = null;
      else if (typeof bg === 'string' && bg.startsWith('data:image/jpeg;base64,') && bg.length <= MAX_BG) patch.form_background = bg;
      else throw new AccessError('ภาพพื้นหลังต้องเป็น JPEG และไม่เกิน 600 KB', 400);
    }
    if (body?.form_background_dim !== undefined) {
      const dim = Number(body.form_background_dim);
      if (!Number.isInteger(dim) || dim < 0 || dim > 95) throw new AccessError('ค่าความทึบต้องอยู่ระหว่าง 0–95', 400);
      patch.form_background_dim = dim;
    }
    const { data, error } = await db().from('visitor_company_options')
      .upsert(patch, { onConflict: 'company_id' })
      .select('*').single();
    if (error) throw error;
    return NextResponse.json({ data: data as VisitorCompanyOptionsRow });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { assertExistingCompany } from '@/lib/chemical/access';
import { getSupabaseServer } from '@/lib/supabase';
import type { ChemCompanySettings, ChemEmergencyContact } from '@/lib/types';

import { requireToolsActor, assertCompany, apiError, AccessError } from '@/lib/toolsSession';

export const dynamic = 'force-dynamic';

function db() {
  return getSupabaseServer();
}

const DEFAULTS = (companyId: string): ChemCompanySettings => ({ company_id: companyId, emergency_contacts: [], show_emergency: true });

/** GET ?company_id= → การตั้งค่าของบริษัท (คืนค่าเริ่มต้นถ้ายังไม่เคยบันทึก) */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const companyId = request.nextUrl.searchParams.get('company_id') || '';
    assertCompany(actor, companyId);
    if (companyId === 'all') {
      const { data, error } = await db().from('chem_company_settings').select('*');
      if (error) throw error;
      return NextResponse.json({ data: DEFAULTS('all'), policies: data });
    }
    const { data, error } = await db().from('chem_company_settings').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ data: (data as ChemCompanySettings | null) || DEFAULTS(companyId) });
  } catch (error) {
    return apiError(error);
  }
}

function cleanContacts(raw: unknown): ChemEmergencyContact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(c => ({ label: String((c as ChemEmergencyContact)?.label ?? '').trim(), phone: String((c as ChemEmergencyContact)?.phone ?? '').trim() }))
    .filter(c => c.label || c.phone)
    .slice(0, 10);
}

/** PUT { company_id, emergency_contacts?, show_emergency? } → upsert */
export async function PUT(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const body = (await request.json()) as Partial<ChemCompanySettings>;
    if (!body.company_id || body.company_id === 'all') return NextResponse.json({ error: 'กรุณาเลือกบริษัท' }, { status: 400 });
    assertCompany(actor, body.company_id, true);
    await assertExistingCompany(body.company_id);
    const row: Record<string, unknown> = { company_id: body.company_id };
    if (body.sds_review_years !== undefined) {
      const years = body.sds_review_years;
      if (years !== null && (!Number.isInteger(years) || years < 1 || years > 50)) throw new AccessError('รอบทบทวนต้องเป็นจำนวนเต็ม 1–50 ปี หรือยังไม่กำหนด', 400);
      if (years !== null && !body.sds_review_policy?.trim()) throw new AccessError('กรุณาระบุชื่อนโยบายที่กำหนดรอบทบทวน', 400);
      row.sds_review_years = years;
      row.sds_review_policy = years === null ? null : body.sds_review_policy?.trim();
    }
    if (body.emergency_contacts !== undefined) row.emergency_contacts = cleanContacts(body.emergency_contacts);
    if (body.show_emergency !== undefined) row.show_emergency = !!body.show_emergency;
    const { data, error } = await db().from('chem_company_settings').upsert([row], { onConflict: 'company_id' }).select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] as ChemCompanySettings });
  } catch (error: unknown) {
    return apiError(error);
  }
}

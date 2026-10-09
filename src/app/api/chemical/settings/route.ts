import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseServer } from '@/lib/supabase';
import type { ChemCompanySettings, ChemEmergencyContact } from '@/lib/types';

export const dynamic = 'force-dynamic';

function db() {
  try { return getSupabaseServer(); } catch { return supabase; }
}

const DEFAULTS = (companyId: string): ChemCompanySettings => ({ company_id: companyId, emergency_contacts: [], show_emergency: true });

/** GET ?company_id= → การตั้งค่าของบริษัท (คืนค่าเริ่มต้นถ้ายังไม่เคยบันทึก) */
export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id') || '';
    if (!companyId || companyId === 'all') return NextResponse.json({ data: DEFAULTS(companyId || 'all') });
    const { data, error } = await db().from('chem_company_settings').select('*').eq('company_id', companyId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ data: (data as ChemCompanySettings | null) || DEFAULTS(companyId) });
  } catch (error) {
    console.error('Error fetching chem settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
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
    const body = (await request.json()) as Partial<ChemCompanySettings>;
    if (!body.company_id || body.company_id === 'all') return NextResponse.json({ error: 'กรุณาเลือกบริษัท' }, { status: 400 });
    const row: Record<string, unknown> = { company_id: body.company_id };
    if (body.emergency_contacts !== undefined) row.emergency_contacts = cleanContacts(body.emergency_contacts);
    if (body.show_emergency !== undefined) row.show_emergency = !!body.show_emergency;
    const { data, error } = await db().from('chem_company_settings').upsert([row], { onConflict: 'company_id' }).select();
    if (error) throw error;
    return NextResponse.json({ data: data[0] as ChemCompanySettings });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

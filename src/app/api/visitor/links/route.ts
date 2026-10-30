import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { db, newToken } from '@/lib/visitor/server';
import type { VisitorLinkRow } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

/** SHE: secret request links of a company (token included — this is the thing they hand out). */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const company = request.nextUrl.searchParams.get('company') || actor.companyId;
    assertCompany(actor, company, true);
    const { data, error } = await db().from('visitor_links').select('*').eq('company_id', company).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data: (data || []) as VisitorLinkRow[] });
  } catch (error) {
    return apiError(error);
  }
}

/** Create a new link: { company_id, label } */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const body = (await request.json().catch(() => null)) as { company_id?: unknown; label?: unknown } | null;
    const company = body?.company_id;
    assertCompany(actor, company, true);
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 80) : '';
    const { count, error: countError } = await db().from('visitor_links').select('id', { count: 'exact', head: true }).eq('company_id', company).eq('active', true);
    if (countError) throw countError;
    if ((count || 0) >= 20) throw new AccessError('มีลิงก์ที่ใช้งานอยู่ครบ 20 ลิงก์แล้ว กรุณายกเลิกลิงก์เก่าก่อน', 409);
    const { data, error } = await db().from('visitor_links').insert([{ company_id: company, token: newToken(24), label, created_by: actor.displayName || actor.username }]).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data: data as VisitorLinkRow }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

/** Revoke: { id } — links are never deleted (requests reference them). */
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
    const id = String(body?.id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new AccessError('ไม่พบลิงก์', 404);
    const { data: link, error: findError } = await db().from('visitor_links').select('*').eq('id', id).maybeSingle();
    if (findError) throw findError;
    if (!link) throw new AccessError('ไม่พบลิงก์', 404);
    assertCompany(actor, (link as VisitorLinkRow).company_id, true);
    const { data, error } = await db().from('visitor_links').update({ active: false, revoked_at: new Date().toISOString(), revoked_by: actor.displayName || actor.username }).eq('id', id).select('*').single();
    if (error) throw error;
    return NextResponse.json({ data: data as VisitorLinkRow });
  } catch (error) {
    return apiError(error);
  }
}

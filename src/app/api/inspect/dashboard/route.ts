import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { requireInspectStaff } from '@/lib/inspect/access';
import { dashboard } from '@/lib/inspect/server';
import { bangkokToday, periodOf } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireInspectStaff(request);
    const company = request.nextUrl.searchParams.get('company') || (actor.isAdmin ? 'amt' : actor.companyId);
    assertCompany(actor, company, true);
    const p = request.nextUrl.searchParams.get('period');
    const period = p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p) ? p : periodOf(bangkokToday());
    return NextResponse.json({ data: await dashboard(company, period) });
  } catch (error) { return apiError(error); }
}

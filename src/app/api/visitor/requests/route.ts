import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { REQUEST_SELECT, db, sortPersons } from '@/lib/visitor/server';
import type { VisitorRequestWithPersons, VisitorStatus } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';
const STATUSES: VisitorStatus[] = ['submitted', 'need_info', 'approved', 'rejected', 'cancelled'];

/** SHE: list requests. ?company=amt|all (admin) &status=submitted,need_info &from=YYYY-MM-DD &to= &q= */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const sp = request.nextUrl.searchParams;
    const company = sp.get('company') || (actor.isAdmin ? 'all' : actor.companyId);
    assertCompany(actor, company);
    const statuses = (sp.get('status') || '').split(',').map(s => s.trim()).filter((s): s is VisitorStatus => STATUSES.includes(s as VisitorStatus));
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    const q = (sp.get('q') || '').trim().slice(0, 80);
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') || '300', 10) || 300));

    let query = db().from('visitor_requests').select(REQUEST_SELECT);
    if (company !== 'all') query = query.eq('company_id', company);
    if (statuses.length) query = query.in('status', statuses);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('arrival_date', from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte('arrival_date', to);
    if (q) {
      const like = `%${q.replace(/[%_,()]/g, ' ')}%`;
      query = query.or(`request_no.ilike.${like},visitor_company.ilike.${like},informer_name.ilike.${like},informer_employee_code.ilike.${like}`);
    }
    const { data, error } = await query.order('arrival_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return NextResponse.json({ data: (data as VisitorRequestWithPersons[]).map(sortPersons) });
  } catch (error) {
    return apiError(error);
  }
}

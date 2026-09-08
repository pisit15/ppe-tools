import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const params = request.nextUrl.searchParams;
    const type = params.get('type') === 'audit' ? 'audit' : 'login';
    const companyId = params.get('company_id');
    const search = (params.get('q') || '').trim();
    const days = Number(params.get('days') || '30');
    const limit = Math.min(Number(params.get('limit') || '200'), 1000);

    const db = saDb();
    const since = Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    if (type === 'audit') {
      let query = db
        .from('audit_log')
        .select('id, company_id, plan_type, action, activity_no, month, old_value, new_value, note, performed_by, created_at');
      if (companyId && companyId !== 'all') query = query.eq('company_id', companyId);
      if (since) query = query.gte('created_at', since);
      if (search) query = query.or(`performed_by.ilike.%${search}%,action.ilike.%${search}%`);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return NextResponse.json({ type, data: data || [] });
    }

    let query = db
      .from('login_events')
      .select('id, username, display_name, company_id, role, user_agent, created_at');
    if (companyId && companyId !== 'all') query = query.eq('company_id', companyId);
    if (since) query = query.gte('created_at', since);
    if (search) query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return NextResponse.json({ type, data: data || [] });
  } catch (err) {
    return saError(err, 'โหลดประวัติการใช้งานไม่สำเร็จ');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { companyOptions, db } from '@/lib/visitor/server';
import { gateCheckRowFor } from '@/lib/visitor/constants';
import type { GateCheckConfig, VisitorStatus, VisitorStats } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; company_id: string; arrival_date: string; status: VisitorStatus; purpose: string; purpose_other: string; work_areas: string[];
  visitor_company: string; batch_id: string | null;
  visitor_persons: { arrived_at: string | null; no_show_at: string | null; added_by_guard: boolean }[];
  visitor_vehicles: { decision: string }[];
};

const bump = (m: Map<string, { requests: number; persons: number }>, key: string, persons: number) => {
  const cur = m.get(key) || { requests: 0, persons: 0 };
  cur.requests += 1; cur.persons += persons; m.set(key, cur);
};
const toList = (m: Map<string, { requests: number; persons: number }>) => [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.requests - a.requests);

/** SHE: aggregated visitor statistics. ?company=amt|all &year=2026 &month=1-12 (omit = whole year) */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireVisitorApprover(request);
    const sp = request.nextUrl.searchParams;
    const company = sp.get('company') || (actor.isAdmin ? 'all' : actor.companyId);
    assertCompany(actor, company);
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const year = Math.min(2100, Math.max(2020, parseInt(sp.get('year') || '', 10) || now.getUTCFullYear()));
    const monthRaw = parseInt(sp.get('month') || '', 10);
    const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
    const from = month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`;
    const to = month ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) : `${year}-12-31`;

    let q = db().from('visitor_requests')
      .select('id, company_id, arrival_date, status, purpose, purpose_other, work_areas, visitor_company, batch_id, visitor_persons(arrived_at, no_show_at, added_by_guard), visitor_vehicles(decision)')
      .gte('arrival_date', from).lte('arrival_date', to).order('arrival_date').limit(5000);
    if (company !== 'all') q = q.eq('company_id', company);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as Row[];

    // Visitor group = the company's gate-check row (per-company config), so "ผู้รับเหมา / ขนส่ง / ผู้มาติดต่อ…" matches what the guard sees.
    const configs = new Map<string, GateCheckConfig>();
    for (const c of new Set(rows.map(r => r.company_id))) configs.set(c, (await companyOptions(c)).gate_check);
    const { data: names } = await db().from('company_settings').select('company_id, company_name');
    const nameOf = Object.fromEntries(((names || []) as { company_id: string; company_name: string }[]).map(c => [c.company_id, c.company_name || c.company_id]));

    const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, requests: 0, approved: 0, persons: 0 }));
    const byDay = new Map<string, { requests: number; persons: number }>();
    const byPurpose = new Map<string, { requests: number; persons: number }>();
    const byGroup = new Map<string, { requests: number; persons: number }>();
    const byCompany = new Map<string, { requests: number; persons: number }>();
    const byVisitor = new Map<string, { requests: number; persons: number }>();
    const byStatus: Record<VisitorStatus, number> = { submitted: 0, need_info: 0, approved: 0, rejected: 0, cancelled: 0 };
    const byDow = Array(7).fill(0) as number[];
    const totals = { requests: 0, persons: 0, arrived: 0, no_show: 0, walk_ins: 0, vehicles: 0, vehicles_inside: 0, batches: new Set<string>() };

    for (const r of rows) {
      const persons = r.visitor_persons.length;
      totals.requests += 1; totals.persons += persons;
      totals.arrived += r.visitor_persons.filter(p => p.arrived_at).length;
      totals.no_show += r.visitor_persons.filter(p => p.no_show_at).length;
      totals.walk_ins += r.visitor_persons.filter(p => p.added_by_guard).length;
      totals.vehicles += r.visitor_vehicles.length;
      totals.vehicles_inside += r.visitor_vehicles.filter(v => v.decision === 'allowed').length;
      if (r.batch_id) totals.batches.add(r.batch_id);
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      const m = Number(r.arrival_date.slice(5, 7)) - 1;
      byMonth[m].requests += 1; byMonth[m].persons += persons; if (r.status === 'approved') byMonth[m].approved += 1;
      bump(byDay, r.arrival_date, persons);
      bump(byPurpose, r.purpose === 'อื่นๆ (Others)' ? `อื่นๆ: ${r.purpose_other || '-'}`.slice(0, 60) : r.purpose, persons);
      const g = gateCheckRowFor(configs.get(r.company_id)!, r.purpose, r.work_areas || []);
      bump(byGroup, g ? g.label : 'ไม่เข้าเกณฑ์', persons);
      bump(byCompany, nameOf[r.company_id] || r.company_id, persons);
      bump(byVisitor, r.visitor_company.trim(), persons);
      byDow[new Date(`${r.arrival_date}T00:00:00Z`).getUTCDay()] += 1;
    }

    const payload: VisitorStats = {
      company, year, month, from, to,
      totals: { ...totals, batches: totals.batches.size },
      by_status: byStatus,
      by_month: byMonth,
      by_day: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      by_purpose: toList(byPurpose),
      by_group: toList(byGroup),
      by_company: toList(byCompany),
      by_visitor_company: toList(byVisitor).slice(0, 15),
      by_dow: byDow,
    };
    return NextResponse.json({ data: payload });
  } catch (error) {
    return apiError(error);
  }
}

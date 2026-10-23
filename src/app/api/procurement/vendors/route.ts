import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { actorScope, getDataset } from '@/lib/procurement/data';
import { canSee } from '@/lib/procurement/scope';
import { prKey, vendorId } from '@/lib/procurement/analysis';
import { isSpendCat } from '@/lib/procurement/categories';
import { inRange, parsePeriod, periodInfo } from '@/lib/procurement/period';
import { vendorDetail, vendorReport } from '@/lib/procurement/report';

export const dynamic = 'force-dynamic';

// GET ?y=2026&cat=goods  -> vendors in the period (+ same span last year), spend by category, year x category matrix
// GET ?name=...&y=2026   -> one vendor in the period: row, yearly trend, price points, related PRs
export async function GET(request: NextRequest) {
  try {
    const actor = await requireProcurementActor(request);
    const d = await getDataset();
    const p = request.nextUrl.searchParams;
    const sel = parsePeriod(p.get('y'), d.meta.years);
    const name = p.get('name');
    if (!name) {
      const rawCat = p.get('cat');
      const cat = isSpendCat(rawCat) ? rawCat : null;
      return NextResponse.json({ ...vendorReport(d, sel, cat), meta: d.meta });
    }

    const key = vendorId(name);
    const detail = vendorDetail(d, sel, key);
    if (!detail.overall) return NextResponse.json({ error: 'ไม่พบผู้ขายนี้' }, { status: 404 });
    const range = periodInfo(sel, d.meta, 'po').range;
    const mine = d.points.filter(pt => pt.vendor_key === key && !pt.duplicate && inRange(pt.period_date, range))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const prNos = new Set(mine.map(pt => prKey(pt.pr_no, pt.requester)));
    const scope = actorScope(actor, d);
    const prs = d.prs.filter(pr => prNos.has(prKey(pr.pr_no, pr.requester)) && canSee(scope, d.sitesByPr.get(pr.odoo_id) ?? [], pr.requester))
      .sort((a, b) => (b.request_date || '').localeCompare(a.request_date || ''));
    const names = [...new Set([
      ...d.po.filter(l => vendorId(l.vendor) === key).map(l => l.vendor),
      ...d.quotes.filter(q => vendorId(q.vendor_group || q.vendor) === key).map(q => q.vendor_group || q.vendor),
    ])];
    return NextResponse.json({ ...detail, sel, names, points: mine, prs, meta: d.meta });
  } catch (error) {
    return apiError(error);
  }
}

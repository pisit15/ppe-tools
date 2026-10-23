import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { actorScope, getDataset } from '@/lib/procurement/data';
import { canSee } from '@/lib/procurement/scope';
import { prKey, vendorKey, vendorSummaries } from '@/lib/procurement/analysis';

export const dynamic = 'force-dynamic';

// GET            -> all vendor summaries
// GET ?name=...  -> one vendor: summary + every price point + related PRs
export async function GET(request: NextRequest) {
  try {
    const actor = await requireProcurementActor(request);
    const d = await getDataset();
    const { prs, po, quotes, points, meta } = d;
    const vendors = vendorSummaries(prs, po, quotes);
    const name = request.nextUrl.searchParams.get('name');
    if (!name) return NextResponse.json({ vendors, meta });

    const key = vendorKey(name) || name;
    const summary = vendors.find(v => (vendorKey(v.vendor) || v.vendor) === key);
    if (!summary) return NextResponse.json({ error: 'ไม่พบผู้ขายนี้' }, { status: 404 });
    const mine = points.filter(p => (vendorKey(p.vendor) || p.vendor) === key && !p.duplicate)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const prNos = new Set(mine.map(p => prKey(p.pr_no, p.requester)));
    const scope = actorScope(actor, d);
    const relatedPrs = prs.filter(p => prNos.has(prKey(p.pr_no, p.requester)) && canSee(scope, d.sitesByPr.get(p.odoo_id) ?? [], p.requester)).sort((a, b) => (b.request_date || '').localeCompare(a.request_date || ''));
    const names = [...new Set([...po.filter(l => vendorKey(l.vendor) === key).map(l => l.vendor), ...quotes.filter(q => vendorKey(q.vendor_group || q.vendor) === key).map(q => q.vendor_group || q.vendor)])];
    return NextResponse.json({ summary, names, points: mine, prs: relatedPrs, meta });
  } catch (error) {
    return apiError(error);
  }
}

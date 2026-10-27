import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { getDataset } from '@/lib/procurement/data';
import { searchPrices, topProducts } from '@/lib/procurement/analysis';
import { inRange, parsePeriod, periodInfo } from '@/lib/procurement/period';

export const dynamic = 'force-dynamic';

// Group filtering happens in searchPrices before statistics and the display limit.
export async function GET(request: NextRequest) {
  try {
    await requireProcurementActor(request);
    const p = request.nextUrl.searchParams;
    const q = (p.get('q') || '').slice(0, 200);
    const unit = p.get('unit') || undefined;
    const group = p.get('group') || undefined;
    const tax = ['ex_vat', 'inc_vat', 'unknown'].includes(p.get('tax') || '') ? p.get('tax')! : undefined;
    const basis = ['unit', 'once', 'month', 'year', 'unknown'].includes(p.get('basis') || '') ? p.get('basis')! : undefined;
    const rawPage = Number(p.get('page') || 1);
    const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = 600;
    const { points, po, meta } = await getDataset();
    const sel = parsePeriod(p.get('y'), meta.years);
    const range = periodInfo(sel, meta, 'po').range;
    if (!q.trim()) return NextResponse.json({ meta, sel, top: topProducts(po.filter(l => inRange(l.order_date, range))) });
    const inPeriod = range ? points.filter(pt => inRange(pt.period_date, range)) : points;
    const opts = { unit, group, tax, basis, includeDuplicates: p.get('dup') === '1' };
    let result = searchPrices(inPeriod, q, { ...opts, offset: (requestedPage - 1) * pageSize });
    const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    if (page !== requestedPage) result = searchPrices(inPeriod, q, { ...opts, offset: (page - 1) * pageSize });
    // Matches outside the period, so the page can offer "show all years" instead of a silent empty result.
    const outside = range ? Math.max(0, searchPrices(points, q, opts).total - result.total) : 0;
    return NextResponse.json({ ...result, meta, sel, outside, page, page_count: pageCount, page_size: pageSize });
  } catch (error) {
    return apiError(error);
  }
}

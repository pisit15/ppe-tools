import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { getDataset } from '@/lib/procurement/data';
import { searchPrices, topProducts } from '@/lib/procurement/analysis';
import { inRange, parsePeriod, periodInfo } from '@/lib/procurement/period';

export const dynamic = 'force-dynamic';

// GET ?q=&unit=&dup=1&y=2026 -> prices (PO lines + quotation lines) in the period; empty q -> most-bought products
export async function GET(request: NextRequest) {
  try {
    await requireProcurementActor(request);
    const p = request.nextUrl.searchParams;
    const q = (p.get('q') || '').slice(0, 200);
    const unit = p.get('unit') || undefined;
    const { points, po, meta } = await getDataset();
    const sel = parsePeriod(p.get('y'), meta.years);
    const range = periodInfo(sel, meta, 'po').range;
    if (!q.trim()) return NextResponse.json({ meta, sel, top: topProducts(po.filter(l => inRange(l.order_date, range))) });
    const inPeriod = range ? points.filter(pt => inRange(pt.period_date, range)) : points;
    const opts = { unit, includeDuplicates: p.get('dup') === '1' };
    const result = searchPrices(inPeriod, q, opts);
    // Matches outside the period, so the page can offer "show all years" instead of a silent empty result.
    const outside = range ? searchPrices(points, q, opts).total - result.total : 0;
    return NextResponse.json({ ...result, meta, sel, outside });
  } catch (error) {
    return apiError(error);
  }
}

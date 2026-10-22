import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { getDataset } from '@/lib/procurement/data';
import { searchPrices } from '@/lib/procurement/analysis';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireProcurementActor(request);
    const p = request.nextUrl.searchParams;
    const q = (p.get('q') || '').slice(0, 200);
    const unit = p.get('unit') || undefined;
    const { points, meta } = await getDataset();
    const result = searchPrices(points, q, { unit, includeDuplicates: p.get('dup') === '1' });
    return NextResponse.json({ ...result, meta });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { getDataset } from '@/lib/procurement/data';
import { prKey } from '@/lib/procurement/analysis';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireProcurementActor(request);
    const d = await getDataset();
    const { prs, quotes, meta } = d;
    const quoteCount = new Map<string, number>();
    for (const q of quotes) if (!q.duplicate_file) quoteCount.set(prKey(q.pr_no, q.requester), (quoteCount.get(prKey(q.pr_no, q.requester)) || 0) + 1);
    const rows = prs.map(p => ({ ...p, quote_count: quoteCount.get(prKey(p.pr_no, p.requester)) || 0 }));
    return NextResponse.json({ prs: rows, meta, isAdmin: actor.isAdmin });
  } catch (error) {
    return apiError(error);
  }
}

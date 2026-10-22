import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { vendorKey } from '@/lib/procurement/analysis';
import type { ProcPoLine, ProcPr, ProcPrLine, ProcQuote, ProcQuoteItem } from '@/lib/procurement/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireProcurementActor(request);
    const sp = request.nextUrl.searchParams;
    const no = (sp.get('no') || '').trim();
    const by = (sp.get('by') || '').trim();
    if (!/^PR\d{6,12}$/.test(no)) return NextResponse.json({ error: 'เลขที่ PR ไม่ถูกต้อง' }, { status: 400 });
    const db = getSupabaseServer();
    // PR numbers repeat across Odoo companies: narrow by requester when given.
    let query = db.from('proc_pr').select('*').eq('pr_no', no);
    if (by) query = query.eq('requester', by);
    const { data: matches, error } = await query.order('odoo_id');
    if (error) throw error;
    if (!matches?.length) return NextResponse.json({ error: 'ไม่พบ PR นี้' }, { status: 404 });
    if (matches.length > 1) {
      return NextResponse.json({ choices: (matches as ProcPr[]).map(p => ({ pr_no: p.pr_no, requester: p.requester, company: p.company, title: p.title, request_date: p.request_date })) });
    }
    const pr = matches[0] as ProcPr;
    const [lines, po, quotes] = await Promise.all([
      db.from('proc_pr_lines').select('*').eq('pr_odoo_id', pr.odoo_id).order('odoo_id'),
      db.from('proc_po_lines').select('*').eq('pr_odoo_id', pr.odoo_id).order('po_no').order('odoo_id'),
      db.from('proc_quotes').select('*').eq('pr_no', no).eq('requester', pr.requester).order('id'),
    ]);
    for (const r of [lines, po, quotes]) if (r.error) throw r.error;
    const quoteRows = (quotes.data ?? []) as ProcQuote[];
    const items = quoteRows.length
      ? await db.from('proc_quote_items').select('*').in('quote_id', quoteRows.map(q => q.id)).order('id')
      : { data: [] as ProcQuoteItem[], error: null };
    if (items.error) throw items.error;
    const poRows = (po.data ?? []) as ProcPoLine[];
    const chosen = new Set(poRows.filter(l => l.po_state !== 'cancel').map(l => vendorKey(l.vendor)));
    return NextResponse.json({
      pr,
      lines: (lines.data ?? []) as ProcPrLine[],
      po: poRows,
      quotes: quoteRows.map(q => ({ ...q, selected: chosen.has(vendorKey(q.vendor_group || q.vendor)) })),
      items: (items.data ?? []) as ProcQuoteItem[],
    });
  } catch (error) {
    return apiError(error);
  }
}

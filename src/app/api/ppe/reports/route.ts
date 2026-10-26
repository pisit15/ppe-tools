import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor } from '@/lib/ppe-access';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { reportPeriod } from '@/lib/ppe-usage';
import type { UsageMovement } from '@/lib/ppe-usage';
import type { PPEStockSummary } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request,true);
    const company = request.nextUrl.searchParams.get('company_id') || actor.companyId;
    assertCompany(actor,company);
    let period: ReturnType<typeof reportPeriod>;
    try { period = reportPeriod(request.nextUrl.searchParams.get('from') || '',request.nextUrl.searchParams.get('to') || ''); }
    catch { throw new AccessError('กรุณาเลือกเดือนเริ่มต้นและสิ้นสุดที่ถูกต้อง',400); }
    const db = getSupabaseServer();
    const movements = () => {
      const q = db.from('ppe_transactions').select('*,ppe_products(name,unit)');
      return company === 'all' ? q : q.eq('company_id',company);
    };
    async function allMovements() {
      const rows: UsageMovement[] = [];
      for (let offset=0;;offset+=1000) {
        const {data,error} = await movements().gte('transaction_date',period.previousStart).lte('transaction_date',period.end).order('id').range(offset,offset+999);
        if (error) throw error;
        rows.push(...(data || []) as UsageMovement[]);
        if (!data || data.length < 1000) return rows;
      }
    }
    async function allStocks() {
      const rows: PPEStockSummary[] = [];
      for (let offset=0;;offset+=1000) {
        let q = db.from('ppe_stock_availability').select('*');
        if (company !== 'all') q = q.eq('company_id',company);
        const {data,error} = await q.order('product_id').range(offset,offset+999);
        if (error) throw error;
        rows.push(...(data || []) as PPEStockSummary[]);
        if (!data || data.length < 1000) return rows;
      }
    }
    let earliest = db.from('ppe_transactions').select('transaction_date');
    if (company !== 'all') earliest = earliest.eq('company_id',company);
    const [transactions,stocks,first] = await Promise.all([allMovements(),allStocks(),earliest.order('transaction_date').limit(1)]);
    if (first.error) throw first.error;
    return NextResponse.json({transactions,stocks,firstDate:first.data?.[0]?.transaction_date || null},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return apiError(error); }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor, ppeCompany } from '@/lib/ppe-access';
import { apiError } from '@/lib/toolsSession';

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request);
    const company = ppeCompany(request, actor);
    const db = getSupabaseServer();
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('ppe_stock_availability')
        .select('product_id,name,type,unit,image_url,current_stock,reserved_quantity,available_stock')
        .eq('company_id', company).order('name').order('product_id').range(offset, offset + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return NextResponse.json({ data: rows });
  } catch (e) { return apiError(e); }
}

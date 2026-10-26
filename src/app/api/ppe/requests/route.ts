import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { requirePPEActor, ppeCompany, ppeDatabaseError } from '@/lib/ppe-access';
import { AccessError, apiError } from '@/lib/toolsSession';

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request);
    const company = ppeCompany(request, actor);
    const page = Math.floor(Math.max(1, Math.min(10000, Number(request.nextUrl.searchParams.get('page')) || 1)));
    let query = getSupabaseServer().from('ppe_requests').select('*,ppe_products(name,unit),ppe_requesters(display_name,employee_code,department),ppe_request_events(id,action,actor_name,quantity,note,created_at)', { count: 'exact' }).eq('company_id', company);
    if (actor.accountTable === 'ppe_requesters') query = query.eq('requester_id', actor.id);
    const status = request.nextUrl.searchParams.get('status');
    if (status && status !== 'all') query = query.eq('status', status);
    const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range((page - 1) * 30, page * 30 - 1);
    if (error) throw error;
    return NextResponse.json({ data, count, page });
  } catch (e) { return apiError(e); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePPEActor(request);
    const company = ppeCompany(request, actor);
    const body = await request.json();
    if (!['submit', 'approve', 'dispatch', 'receive', 'reject', 'cancel'].includes(body.action)) throw new AccessError('การดำเนินการไม่ถูกต้อง', 400);
    if (body.quantity !== undefined && (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000000)) throw new AccessError('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0', 400);
    const { data, error } = await getSupabaseServer().rpc('ppe_request_action', {
      p_actor_table: actor.accountTable, p_actor_id: actor.id, p_company: company,
      p_action: body.action, p_request_id: body.request_id || null, p_product_id: body.product_id || null,
      p_quantity: body.quantity ?? null, p_note: typeof body.note === 'string' ? body.note : '', p_key: body.submission_key || null,
    });
    if (error) ppeDatabaseError(error);
    return NextResponse.json({ data });
  } catch (e) { return apiError(e); }
}

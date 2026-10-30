import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertSameOrigin } from '@/lib/toolsSession';
import { addEvent, boardPayload, db } from '@/lib/visitor/server';
import type { VisitorPersonRow } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

const COMPANY = /^[a-zA-Z0-9_-]{1,40}$/;

/** Public guard-post board (owner decision: no login, no token). Approved requests only, today + tomorrow. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  try {
    const { company } = await params;
    if (!COMPANY.test(company)) throw new AccessError('ไม่พบบริษัท', 404);
    return NextResponse.json({ data: await boardPayload(company.toLowerCase()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

type BoardAction = 'arrive' | 'leave' | 'undo_arrive' | 'undo_leave';

/** Guard marks a visitor arrived / left (per person). Only on approved requests shown on the board. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  try {
    assertSameOrigin(request);
    const { company } = await params;
    if (!COMPANY.test(company)) throw new AccessError('ไม่พบบริษัท', 404);
    const body = (await request.json().catch(() => null)) as { person_id?: unknown; action?: unknown } | null;
    const personId = String(body?.person_id || '');
    const action = String(body?.action || '') as BoardAction;
    if (!/^[0-9a-f-]{36}$/.test(personId) || !['arrive', 'leave', 'undo_arrive', 'undo_leave'].includes(action)) throw new AccessError('คำสั่งไม่ถูกต้อง', 400);

    const client = db();
    const { data: person, error } = await client.from('visitor_persons').select('*, visitor_requests!inner(id, company_id, status, arrival_date)').eq('id', personId).maybeSingle();
    if (error) throw error;
    const p = person as (VisitorPersonRow & { visitor_requests: { id: string; company_id: string; status: string; arrival_date: string } }) | null;
    if (!p || p.visitor_requests.company_id !== company.toLowerCase() || p.visitor_requests.status !== 'approved') throw new AccessError('ไม่พบรายชื่อนี้ในรายการที่อนุมัติ', 404);

    const now = new Date().toISOString();
    const patch: Partial<Pick<VisitorPersonRow, 'arrived_at' | 'left_at'>> =
      action === 'arrive' ? { arrived_at: p.arrived_at || now }
      : action === 'leave' ? { arrived_at: p.arrived_at || now, left_at: now }
      : action === 'undo_leave' ? { left_at: null }
      : { arrived_at: null, left_at: null };
    const { error: updError } = await client.from('visitor_persons').update(patch).eq('id', personId);
    if (updError) throw updError;
    const eventAction = action === 'arrive' ? 'arrived' : action === 'leave' ? 'left' : action === 'undo_arrive' ? 'undo_arrived' : 'undo_left';
    await addEvent(p.visitor_requests.id, 'guard-board', eventAction, `${p.seq}. ${p.name}`);
    return NextResponse.json({ data: { ...p, ...patch, visitor_requests: undefined } });
  } catch (error) {
    return apiError(error);
  }
}

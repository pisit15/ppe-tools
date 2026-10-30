import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { validateDecision } from '@/lib/visitor/validation';
import { REQUEST_SELECT, addEvent, db, sortPersons } from '@/lib/visitor/server';
import { notifyDecision } from '@/lib/visitor/notify';
import type { VisitorEventRow, VisitorRequestDetail, VisitorRequestWithPersons, VisitorStatus } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/;

async function load(id: string): Promise<VisitorRequestDetail> {
  if (!UUID.test(id)) throw new AccessError('ไม่พบคำขอ', 404);
  const client = db();
  const { data, error } = await client.from('visitor_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบคำขอ', 404);
  const { data: events, error: evError } = await client.from('visitor_events').select('*').eq('request_id', id).order('at');
  if (evError) throw evError;
  return { ...sortPersons(data as VisitorRequestWithPersons), visitor_events: (events || []) as VisitorEventRow[] };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireVisitorApprover(request);
    const row = await load((await params).id);
    assertCompany(actor, row.company_id);
    return NextResponse.json({ data: row });
  } catch (error) {
    return apiError(error);
  }
}

const NEXT: Record<string, VisitorStatus> = { approve: 'approved', reject: 'rejected', need_info: 'need_info', cancel: 'cancelled' };
const EVENT: Record<string, string> = { approve: 'approved', reject: 'rejected', need_info: 'need_info', cancel: 'cancelled' };

/** SHE decision. Final states (rejected/cancelled) cannot be changed; approved can still be cancelled. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireVisitorApprover(request);
    const row = await load((await params).id);
    assertCompany(actor, row.company_id, true);
    const decision = validateDecision(await request.json().catch(() => null));
    if (['rejected', 'cancelled'].includes(row.status)) throw new AccessError('คำขอนี้ปิดแล้ว แก้ไขไม่ได้', 409);
    if (row.status === 'approved' && decision.action !== 'cancel' && decision.action !== 'approve') throw new AccessError('คำขอที่อนุมัติแล้วทำได้เฉพาะยกเลิกหรือแก้เงื่อนไข', 409);

    const actorName = actor.displayName || actor.username;
    const { error } = await db().from('visitor_requests').update({
      status: NEXT[decision.action],
      decision_note: decision.note || '',
      conditions: decision.action === 'approve' ? (decision.conditions || '') : row.conditions,
      decided_by: actorName,
      decided_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) throw error;
    await addEvent(row.id, actorName, EVENT[decision.action], [decision.note, decision.action === 'approve' && decision.conditions ? `เงื่อนไข: ${decision.conditions}` : ''].filter(Boolean).join(' · '));
    const updated = await load(row.id);
    // Tell the company's LINE group — but not when an already-approved request only had its conditions edited.
    if (!(row.status === 'approved' && decision.action === 'approve')) await notifyDecision(updated);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error);
  }
}

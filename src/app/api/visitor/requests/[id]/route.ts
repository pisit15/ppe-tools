import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertCompany } from '@/lib/toolsSession';
import { requireVisitorApprover } from '@/lib/visitor/access';
import { validateDecision } from '@/lib/visitor/validation';
import { REQUEST_SELECT, addEvent, batchSiblings, db, decideBatch, sortPersons } from '@/lib/visitor/server';
import { notifyDecision } from '@/lib/visitor/notify';
import type { VisitorEventRow, VisitorRequestDetail, VisitorRequestWithPersons, VisitorStatus } from '@/lib/visitor/types';
import { VEHICLE_DECISION_LABEL } from '@/lib/visitor/constants';

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
  const row = sortPersons(data as VisitorRequestWithPersons);
  return { ...row, visitor_events: (events || []) as VisitorEventRow[], batch: await batchSiblings(row) };
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
    const actorName = actor.displayName || actor.username;
    // Per-vehicle entry decision (can accompany approve, or stand alone with action 'vehicles').
    if (decision.vehicles?.length) {
      const own = new Set(row.visitor_vehicles.map(v => v.id));
      const changed: string[] = [];
      for (const v of decision.vehicles) {
        if (!own.has(v.id)) throw new AccessError('ไม่พบรถคันนี้ในคำขอ', 400);
        const before = row.visitor_vehicles.find(x => x.id === v.id);
        if (before && before.decision === v.decision) continue;
        const { error } = await db().from('visitor_vehicles').update({ decision: v.decision, decided_by: actorName, decided_at: new Date().toISOString() }).eq('id', v.id);
        if (error) throw error;
        changed.push(`${before?.plate || ''}: ${VEHICLE_DECISION_LABEL[v.decision]}`);
      }
      if (changed.length) await addEvent(row.id, actorName, 'vehicle_decision', changed.join(' · ').slice(0, 1000));
      if (decision.action === 'vehicles') return NextResponse.json({ data: await load(row.id) });
    }
    if (row.status === 'approved' && decision.action !== 'cancel' && decision.action !== 'approve') throw new AccessError('คำขอที่อนุมัติแล้วทำได้เฉพาะยกเลิกหรือแก้เงื่อนไข', 409);

    const { error } = await db().from('visitor_requests').update({
      status: NEXT[decision.action],
      decision_note: decision.note || '',
      conditions: decision.action === 'approve' ? (decision.conditions || '') : row.conditions,
      decided_by: actorName,
      decided_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) throw error;
    await addEvent(row.id, actorName, EVENT[decision.action], [decision.note, decision.action === 'approve' && decision.conditions ? `เงื่อนไข: ${decision.conditions}` : ''].filter(Boolean).join(' · '));
    let batchCount = 0;
    if (decision.apply_to_batch && row.batch_id && decision.action !== 'vehicles') {
      batchCount = await decideBatch(row.batch_id, row.id, decision.action, actorName, { note: decision.note, conditions: decision.action === 'approve' ? (decision.conditions || '') : undefined, vehicleChoice: decision.vehicles?.length === 1 && decision.vehicles[0].decision !== 'pending' ? decision.vehicles[0].decision : undefined });
    }
    const updated = { ...(await load(row.id)), batch_applied: batchCount };
    // Tell the company's LINE group — but not when an already-approved request only had its conditions edited.
    if (!(row.status === 'approved' && decision.action === 'approve')) await notifyDecision(updated);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * SHE: permanently delete a request (test entries, duplicates). Body { confirm: '<request_no>' } must match —
 * the UI makes the user type it. Persons / vehicles / events cascade; notify log keeps a null reference.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireVisitorApprover(request);
    const row = await load((await params).id);
    assertCompany(actor, row.company_id, true);
    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
    if (String(body?.confirm || '').trim().toUpperCase() !== row.request_no.toUpperCase()) throw new AccessError('กรุณาพิมพ์เลขคำขอให้ตรงเพื่อยืนยันการลบ', 400);
    const { error } = await db().from('visitor_requests').delete().eq('id', row.id);
    if (error) throw error;
    console.info('visitor request deleted', row.request_no, 'by', actor.displayName || actor.username);
    return NextResponse.json({ data: { deleted: row.request_no } });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, assertSameOrigin } from '@/lib/toolsSession';
import { REQUEST_SELECT, addEvent, boardPayload, db, sortPersons } from '@/lib/visitor/server';
import { notifyArrivalWaiting } from '@/lib/visitor/notify';
import { VISITOR_LIMITS } from '@/lib/visitor/constants';
import type { BoardAction, VisitorPersonRow, VisitorRequestWithPersons } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

const COMPANY = /^[a-zA-Z0-9_-]{1,40}$/;
const UUID = /^[0-9a-f-]{36}$/;
type ReqMeta = { id: string; company_id: string; status: string; arrival_date: string };

/** Public guard-post board (owner decision: no login, no token). Approved requests only, yesterday..tomorrow. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  try {
    const { company } = await params;
    if (!COMPANY.test(company)) throw new AccessError('ไม่พบบริษัท', 404);
    return NextResponse.json({ data: await boardPayload(company.toLowerCase()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

async function approvedRequest(company: string, requestId: string): Promise<ReqMeta> {
  if (!UUID.test(requestId)) throw new AccessError('คำสั่งไม่ถูกต้อง', 400);
  const { data, error } = await db().from('visitor_requests').select('id, company_id, status, arrival_date').eq('id', requestId).maybeSingle();
  if (error) throw error;
  const r = data as ReqMeta | null;
  if (!r || r.company_id !== company || r.status !== 'approved') throw new AccessError('ไม่พบคำขอนี้ในรายการที่อนุมัติ', 404);
  return r;
}

/**
 * Guard actions. Per person: arrive / leave / undo_* / no_show / undo_no_show.
 * Per request: add_person (someone not on the list came with an approved group — approval covers the
 * visit as a whole, so the guard may add them; flagged added_by_guard) and no_show_all.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ company: string }> }) {
  try {
    assertSameOrigin(request);
    const { company: raw } = await params;
    if (!COMPANY.test(raw)) throw new AccessError('ไม่พบบริษัท', 404);
    const company = raw.toLowerCase();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action || '');
    const client = db();
    const now = new Date().toISOString();

    if (action === 'add_person') {
      const req = await approvedRequest(company, String(body?.request_id || ''));
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const detail = typeof body?.detail === 'string' ? body.detail.trim().slice(0, 120) : '';
      if (!name || name.length > 120) throw new AccessError('กรุณากรอกชื่อผู้มาติดต่อ', 400);
      const { data: existing, error: cErr } = await client.from('visitor_persons').select('seq').eq('request_id', req.id).order('seq', { ascending: false }).limit(1);
      if (cErr) throw cErr;
      const { count, error: nErr } = await client.from('visitor_persons').select('id', { count: 'exact', head: true }).eq('request_id', req.id);
      if (nErr) throw nErr;
      if ((count || 0) >= VISITOR_LIMITS.maxPersons) throw new AccessError(`รายชื่อเต็ม (${VISITOR_LIMITS.maxPersons} คน)`, 409);
      const seq = ((existing?.[0] as { seq: number } | undefined)?.seq || 0) + 1;
      const { data: person, error } = await client.from('visitor_persons')
        .insert([{ request_id: req.id, seq, name, detail, arrived_at: now, added_by_guard: true, added_at: now }]).select('*').single();
      if (error) throw error;
      await addEvent(req.id, 'guard-board', 'guard_added', `${seq}. ${name}${detail ? ` (${detail})` : ''} — เพิ่มหน้างาน, มาถึง`);
      return NextResponse.json({ data: person as VisitorPersonRow }, { status: 201 });
    }

    if (action === 'notify_arrival') {
      // Guard: visitors are at the gate but SHE has not decided yet → ping the company's chat (once per 10 minutes per request).
      const id = String(body?.request_id || '');
      if (!UUID.test(id)) throw new AccessError('คำสั่งไม่ถูกต้อง', 400);
      const { data, error } = await client.from('visitor_requests').select(REQUEST_SELECT).eq('id', id).eq('company_id', company).in('status', ['submitted', 'need_info']).maybeSingle();
      if (error) throw error;
      if (!data) throw new AccessError('คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว — รีเฟรชจอ', 409);
      const req = sortPersons(data as VisitorRequestWithPersons);
      const { data: last } = await client.from('visitor_events').select('at').eq('request_id', req.id).eq('action', 'guard_notified').order('at', { ascending: false }).limit(1);
      const lastAt = (last?.[0] as { at: string } | undefined)?.at;
      if (lastAt && Date.now() - Date.parse(lastAt) < 10 * 60 * 1000) throw new AccessError('แจ้งไปแล้วเมื่อสักครู่ — รอ SHE ตอบ (แจ้งซ้ำได้ทุก 10 นาที)', 429);
      const result = await notifyArrivalWaiting(req);
      await addEvent(req.id, 'guard-board', 'guard_notified', result.sent ? 'ผู้มาติดต่อมาถึงป้อม — แจ้งกลุ่ม SHE แล้ว' : 'ผู้มาติดต่อมาถึงป้อม (ส่งแจ้งเตือนไม่สำเร็จ/ไม่ได้ตั้งค่า)');
      return NextResponse.json({ data: { sent: result.sent, configured: result.configured ?? false } });
    }

    if (action === 'no_show_all') {
      const req = await approvedRequest(company, String(body?.request_id || ''));
      const { data: updated, error } = await client.from('visitor_persons').update({ no_show_at: now })
        .eq('request_id', req.id).is('arrived_at', null).is('no_show_at', null).select('seq, name');
      if (error) throw error;
      const rows = (updated || []) as { seq: number; name: string }[];
      if (rows.length) await addEvent(req.id, 'guard-board', 'no_show', `ไม่มา ${rows.length} คน: ${rows.map(r => r.name).join(', ')}`.slice(0, 1000));
      return NextResponse.json({ data: { marked: rows.length } });
    }

    const personId = String(body?.person_id || '');
    const ACTIONS: BoardAction[] = ['arrive', 'leave', 'undo_arrive', 'undo_leave', 'no_show', 'undo_no_show'];
    if (!UUID.test(personId) || !ACTIONS.includes(action as BoardAction)) throw new AccessError('คำสั่งไม่ถูกต้อง', 400);
    const { data: person, error } = await client.from('visitor_persons').select('*, visitor_requests!inner(id, company_id, status, arrival_date)').eq('id', personId).maybeSingle();
    if (error) throw error;
    const p = person as (VisitorPersonRow & { visitor_requests: ReqMeta }) | null;
    if (!p || p.visitor_requests.company_id !== company || p.visitor_requests.status !== 'approved') throw new AccessError('ไม่พบรายชื่อนี้ในรายการที่อนุมัติ', 404);

    const patch: Partial<Pick<VisitorPersonRow, 'arrived_at' | 'left_at' | 'no_show_at'>> =
      action === 'arrive' ? { arrived_at: p.arrived_at || now, no_show_at: null }
      : action === 'leave' ? { arrived_at: p.arrived_at || now, left_at: now, no_show_at: null }
      : action === 'undo_leave' ? { left_at: null }
      : action === 'no_show' ? { no_show_at: now, arrived_at: null, left_at: null }
      : action === 'undo_no_show' ? { no_show_at: null }
      : { arrived_at: null, left_at: null };
    const { error: updError } = await client.from('visitor_persons').update(patch).eq('id', personId);
    if (updError) throw updError;
    const EVENT: Record<BoardAction, string> = { arrive: 'arrived', leave: 'left', undo_arrive: 'undo_arrived', undo_leave: 'undo_left', no_show: 'no_show', undo_no_show: 'undo_no_show' };
    await addEvent(p.visitor_requests.id, 'guard-board', EVENT[action as BoardAction], `${p.seq}. ${p.name}`);
    return NextResponse.json({ data: { ...p, ...patch, visitor_requests: undefined } });
  } catch (error) {
    return apiError(error);
  }
}

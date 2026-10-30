import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError } from '@/lib/toolsSession';
import { REQUEST_SELECT, companyName, db, sortPersons } from '@/lib/visitor/server';
import type { TrackPayload, VisitorRequestWithPersons } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

/** Public: status of one request by its track code (given to the requester after submit). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) throw new AccessError('ไม่พบคำขอ', 404);
    const { data, error } = await db().from('visitor_requests').select(REQUEST_SELECT).eq('track_code', code).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('ไม่พบคำขอ', 404);
    const r = sortPersons(data as VisitorRequestWithPersons);
    const payload: TrackPayload = {
      request_no: r.request_no, status: r.status, visitor_company: r.visitor_company, arrival_date: r.arrival_date,
      time_from: r.time_from, time_to: r.time_to, purpose: r.purpose, decision_note: r.decision_note, conditions: r.conditions,
      decided_at: r.decided_at, created_at: r.created_at, company_name: await companyName(r.company_id),
      persons: r.visitor_persons.map(p => ({ seq: p.seq, name: p.name, detail: p.detail })),
    };
    return NextResponse.json({ data: payload });
  } catch (error) {
    return apiError(error);
  }
}

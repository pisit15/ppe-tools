import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/toolsSession';
import { validateCreate } from '@/lib/visitor/validation';
import { createRequest } from '@/lib/visitor/server';
import { notifyNewRequest } from '@/lib/visitor/notify';

export const dynamic = 'force-dynamic';

/** Public: submit a visitor access request through a secret company link (no login). */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = validateCreate(await request.json().catch(() => null));
    const rows = await createRequest(input);
    const row = rows[0];
    await notifyNewRequest(row, rows.length > 1 ? rows.map(r => r.arrival_date) : undefined); // one card per batch; LINE/Telegram group of the company, if configured; never throws
    return NextResponse.json({ data: { request_no: row.request_no, track_code: row.track_code, status: row.status, batch: rows.map(r => ({ request_no: r.request_no, arrival_date: r.arrival_date, track_code: r.track_code })) } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

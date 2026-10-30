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
    const row = await createRequest(input);
    await notifyNewRequest(row); // LINE group of the company, if configured; never throws
    return NextResponse.json({ data: { request_no: row.request_no, track_code: row.track_code, status: row.status } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

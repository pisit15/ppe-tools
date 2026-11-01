import { NextRequest, NextResponse } from 'next/server';
import { runRetention } from '@/lib/inspect/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Nightly (vercel.json): delete inspection photos past each company's retention.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runRetention(300);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('inspect retention failed', error);
    return NextResponse.json({ error: 'retention failed' }, { status: 500 });
  }
}

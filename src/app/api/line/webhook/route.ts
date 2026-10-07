import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { verifyLineSignature } from '@/lib/line/signature';
import { replyText } from '@/lib/line/api';
import { handleFollow, handleText } from '@/lib/line/bot';

export const dynamic = 'force-dynamic';

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

export async function POST(request: NextRequest) {
  const secret = process.env.LINE_CHANNEL_SECRET || '';
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!secret || !token) {
    return NextResponse.json({ error: 'LINE bot is not configured' }, { status: 503 });
  }

  const raw = await request.text();
  if (!verifyLineSignature(raw, request.headers.get('x-line-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw).events || []) as LineEvent[];
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // LINE's "Verify" button sends an empty event list.
  if (events.length === 0) return NextResponse.json({ ok: true });

  const db = getSupabaseServer();
  for (const ev of events) {
    try {
      const userId = ev.source?.userId;
      // 1:1 chats only — never answer company data into group chats.
      if (!ev.replyToken || !userId || ev.source?.type !== 'user') continue;

      let texts: string[] | null = null;
      if (ev.type === 'follow') {
        texts = await handleFollow(db, userId);
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        texts = await handleText(db, userId, ev.message.text || '');
      } else if (ev.type === 'message') {
        texts = ['ตอนนี้รองรับเฉพาะข้อความตัวอักษร พิมพ์ "เมนู" เพื่อดูคำสั่ง'];
      }
      if (texts?.length) await replyText(ev.replyToken, texts, token);
    } catch (err) {
      console.error('LINE event failed', err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true });
}

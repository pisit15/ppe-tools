import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { verifyLineSignature } from '@/lib/line/signature';
import { replyMessages } from '@/lib/line/api';
import { text, textFallback } from '@/lib/line/flex';
import type { LineMessage } from '@/lib/line/flex';
import { handleFollow, handlePostback, handleText } from '@/lib/line/bot';
import { recordGroupJoin, recordGroupLeave, touchGroup } from '@/lib/line/groups';

export const dynamic = 'force-dynamic';

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
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
      // Group chats: only register the group (for visitor-request notifications) — never answer company data there.
      const groupId = ev.source?.groupId || ev.source?.roomId;
      if (groupId && (ev.source?.type === 'group' || ev.source?.type === 'room')) {
        if (ev.type === 'join') {
          const g = await recordGroupJoin(db, groupId, token);
          if (ev.replyToken) await replyMessages(ev.replyToken, [text(`EA HSE Center เข้ากลุ่ม${g.group_name ? ` "${g.group_name}"` : ''}แล้ว
ทีม SHE เลือกกลุ่มนี้ได้ที่ tools.eashe.org/visitor/settings → การแจ้งเตือน LINE
รหัสกลุ่ม: ${groupId}`)], token);
        } else if (ev.type === 'leave') {
          await recordGroupLeave(db, groupId);
        } else {
          await touchGroup(db, groupId);
        }
        continue;
      }
      // 1:1 chats only beyond this point.
      if (!ev.replyToken || !userId || ev.source?.type !== 'user') continue;

      let messages: LineMessage[] | null = null;
      if (ev.type === 'follow') {
        messages = await handleFollow(db, userId);
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        messages = await handleText(db, userId, ev.message.text || '');
      } else if (ev.type === 'postback') {
        messages = await handlePostback(db, userId, ev.postback?.data || '');
      } else if (ev.type === 'message') {
        messages = [text('ตอนนี้รองรับเฉพาะข้อความตัวอักษร พิมพ์ "เมนู" เพื่อดูคำสั่ง')];
      }
      if (messages?.length) {
        const status = await replyMessages(ev.replyToken, messages, token);
        // If LINE rejects a card (400), try once more as plain text so the user still gets an answer.
        if (status === 400 && messages.some(m => m.type === 'flex')) {
          await replyMessages(ev.replyToken, textFallback(messages), token);
        }
      }
    } catch (err) {
      console.error('LINE event failed', err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true });
}

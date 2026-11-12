import { NextRequest, NextResponse } from 'next/server';
import { AccessError, apiError, requireToolsActor } from '@/lib/toolsSession';
import { getMe, getWebhookInfo, setWebhook, telegramConfigured, webhookSecret } from '@/lib/telegram/api';

export const dynamic = 'force-dynamic';

/** Admin: bot identity + current webhook. */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    if (!actor.isAdmin) throw new AccessError('เฉพาะผู้ดูแลระบบ');
    if (!telegramConfigured()) return NextResponse.json({ data: { configured: false } });
    const [me, hook] = await Promise.all([getMe(), getWebhookInfo()]);
    return NextResponse.json({ data: { configured: true, secret_set: Boolean(webhookSecret()), bot: me.result || null, bot_error: me.error || null, webhook: hook.result || null } });
  } catch (error) { return apiError(error); }
}

/** Admin: point the bot's webhook at this deployment. One-time after setting TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET. */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    if (!actor.isAdmin) throw new AccessError('เฉพาะผู้ดูแลระบบ');
    if (!telegramConfigured()) throw new AccessError('เซิร์ฟเวอร์ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN', 400);
    const secret = webhookSecret();
    if (!secret) throw new AccessError('เซิร์ฟเวอร์ยังไม่ได้ตั้ง TELEGRAM_WEBHOOK_SECRET', 400);
    const url = `${(process.env.LINE_LINK_BASE_URL || 'https://tools.eashe.org').replace(/\/+$/, '')}/api/telegram/webhook`;
    const r = await setWebhook(url, secret);
    if (!r.ok) throw new AccessError(`ตั้ง webhook ไม่สำเร็จ: ${r.error || r.status}`, 502);
    const me = await getMe();
    return NextResponse.json({ data: { ok: true, url, bot: me.result || null } });
  } catch (error) { return apiError(error); }
}

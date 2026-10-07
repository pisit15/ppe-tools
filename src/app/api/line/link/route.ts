import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { verifyCredentials } from '@/lib/line/accounts';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;
const CODE_RE = /^[A-Z2-9]{10}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || '').trim().toUpperCase();
    const username = String(body.username || '');
    const password = String(body.password || '');
    const companyId = body.company_id ? String(body.company_id) : undefined;

    if (!CODE_RE.test(code)) {
      return NextResponse.json({ success: false, error: 'ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากแชต LINE' }, { status: 400 });
    }

    const db = getSupabaseServer();
    const { data: row } = await db.from('line_link_codes').select('*').eq('code', code).maybeSingle();
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { success: false, error: 'ลิงก์หมดอายุหรือใช้ไปแล้ว ส่งข้อความใดก็ได้ในแชต LINE เพื่อรับลิงก์ใหม่' },
        { status: 410 },
      );
    }

    // Count the attempt before checking the password (limits guessing per code).
    await db.from('line_link_codes').update({ attempts: row.attempts + 1 }).eq('code', code);

    const result = await verifyCredentials(db, username, password, companyId);
    if (!result.ok) {
      if (result.companies) {
        return NextResponse.json({ success: false, needCompanySelection: true, companies: result.companies });
      }
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    const a = result.account;
    const { error: linkErr } = await db.from('line_links').upsert({
      line_user_id: row.line_user_id,
      account_source: a.source,
      account_id: a.accountId,
      username: a.username,
      company_id: a.companyId,
      linked_at: new Date().toISOString(),
    });
    if (linkErr) throw linkErr;

    await db.from('line_link_codes').update({ used_at: new Date().toISOString() }).eq('code', code);

    return NextResponse.json({ success: true, displayName: a.displayName });
  } catch (err) {
    console.error('LINE link failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: 'เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 });
  }
}

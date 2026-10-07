// Server-only: credential check for LINE linking and lookup of linked accounts.
// Credential rules match /api/auth/login (admin_accounts → company_users →
// tools_users, bcrypt or legacy plaintext, per-company disambiguation).
import bcrypt from 'bcryptjs';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountSource = 'admin_accounts' | 'company_users' | 'tools_users';

export type LinkedAccount = {
  source: AccountSource;
  accountId: string;
  username: string;
  displayName: string;
  companyId: string; // 'admin' for admin_accounts
  isGroupAdmin: boolean; // sees every company
};

export type VerifyResult =
  | { ok: true; account: LinkedAccount }
  | { ok: false; error: string; companies?: { companyId: string; companyName: string }[] };

type Row = Record<string, unknown>;

function passwordMatches(supplied: string, stored: unknown): boolean {
  if (typeof stored !== 'string' || stored.length === 0) return false;
  if (/^\$2[aby]\$/.test(stored)) {
    try {
      return bcrypt.compareSync(supplied, stored);
    } catch {
      return false;
    }
  }
  return stored === supplied;
}

const BAD = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

export async function verifyCredentials(
  db: SupabaseClient,
  username: string,
  password: string,
  companyId?: string,
): Promise<VerifyResult> {
  const name = username.trim();
  if (!name || !password) return { ok: false, error: 'กรุณาใส่ชื่อผู้ใช้และรหัสผ่าน' };

  const { data: admins } = await db.from('admin_accounts').select('*').ilike('username', name).eq('is_active', true);
  const admin = (admins || []).find((a: Row) => passwordMatches(password, a.password));
  if (admin) {
    return {
      ok: true,
      account: {
        source: 'admin_accounts',
        accountId: String(admin.id),
        username: String(admin.username),
        displayName: String(admin.display_name || admin.username),
        companyId: 'admin',
        isGroupAdmin: true,
      },
    };
  }

  let source: AccountSource = 'company_users';
  const { data: cu } = await db.from('company_users').select('*').ilike('username', name).eq('is_active', true);
  let matches: Row[] = (cu || []).filter((r: Row) => passwordMatches(password, r.password));
  if (matches.length === 0) {
    source = 'tools_users';
    const { data: tu } = await db.from('tools_users').select('*').ilike('username', name).eq('is_active', true);
    matches = (tu || []).filter((r: Row) => passwordMatches(password, r.password));
  }
  if (matches.length === 0) return { ok: false, error: BAD };

  const ids = [...new Set(matches.map(m => String(m.company_id)))];
  let chosen: Row | undefined;
  if (companyId) {
    chosen = matches.find(m => String(m.company_id) === companyId);
    if (!chosen) return { ok: false, error: BAD };
  } else if (ids.length > 1) {
    const names = await companyNames(db, ids);
    return { ok: false, error: 'กรุณาเลือกบริษัท', companies: ids.map(id => ({ companyId: id, companyName: names[id] || id })) };
  } else {
    chosen = matches[0];
  }

  return {
    ok: true,
    account: {
      source,
      accountId: String(chosen.id),
      username: String(chosen.username),
      displayName: String(chosen.display_name || chosen.username),
      companyId: String(chosen.company_id),
      isGroupAdmin: false,
    },
  };
}

export async function companyNames(db: SupabaseClient, ids?: string[]): Promise<Record<string, string>> {
  let q = db.from('company_settings').select('company_id, company_name');
  if (ids) q = q.in('company_id', ids);
  const { data } = await q;
  const out: Record<string, string> = {};
  for (const r of (data || []) as Row[]) out[String(r.company_id)] = String(r.company_name || r.company_id);
  return out;
}

/**
 * Returns the account linked to this LINE user, re-checking that the account
 * still exists and is active. A deactivated account stops working immediately.
 */
export async function getLinkedAccount(db: SupabaseClient, lineUserId: string): Promise<LinkedAccount | null> {
  const { data: link } = await db.from('line_links').select('*').eq('line_user_id', lineUserId).maybeSingle();
  if (!link) return null;

  const source = link.account_source as AccountSource;
  const { data: acc } = await db.from(source).select('*').eq('id', link.account_id).eq('is_active', true).maybeSingle();
  if (!acc) return null;
  if (source !== 'admin_accounts' && String(acc.company_id) !== String(link.company_id)) return null;

  await db.from('line_links').update({ last_seen_at: new Date().toISOString() }).eq('line_user_id', lineUserId);

  return {
    source,
    accountId: String(acc.id),
    username: String(acc.username),
    displayName: String(acc.display_name || acc.username),
    companyId: source === 'admin_accounts' ? 'admin' : String(acc.company_id),
    isGroupAdmin: source === 'admin_accounts',
  };
}

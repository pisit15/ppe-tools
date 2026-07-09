// Server-only HMAC token for admin API authorization.
// Issued by /api/auth/login when an admin_accounts user logs in, verified by
// admin-only API routes. Uses SUPABASE_SERVICE_ROLE_KEY as the signing secret
// (server-side only, never shipped to the browser).
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('hex');
}

export function issueAdminToken(username: string): string | null {
  const key = getSecret();
  if (!key) return null;
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${Buffer.from(username).toString('base64url')}.${exp}.${sign(`${username}.${exp}`, key)}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const key = getSecret();
  if (!key) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [userB64, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  let username: string;
  try {
    username = Buffer.from(userB64, 'base64url').toString();
  } catch {
    return false;
  }
  const expected = sign(`${username}.${exp}`, key);
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function tokenFromRequest(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return headers.get('x-admin-token');
}

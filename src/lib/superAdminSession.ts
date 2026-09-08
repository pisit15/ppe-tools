// Signed, httpOnly session for the super admin console (admin.eashe.org).
// Uses Web Crypto (not node:crypto) so the exact same code runs inside the
// Edge middleware and inside Node API routes.

export const SA_COOKIE = 'ea_sa_session';
export const SA_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export type SuperAdminSession = {
  username: string;
  role: string;
  exp: number; // epoch seconds
};

function getSecret(): string | null {
  return (
    process.env.SUPERADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToArrayBuffer(value: string): ArrayBuffer {
  const bytes = b64urlDecode(value);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function b64urlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(): Promise<CryptoKey | null> {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(
  username: string,
  role: string
): Promise<string | null> {
  const key = await importKey();
  if (!key) return null;
  const payload: SuperAdminSession = {
    username,
    role,
    exp: Math.floor(Date.now() / 1000) + SA_TTL_SECONDS,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  );
  return `${body}.${b64urlEncode(signature)}`;
}

export async function verifySessionToken(
  token: string | null | undefined
): Promise<SuperAdminSession | null> {
  if (!token) return null;
  const key = await importKey();
  if (!key) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToArrayBuffer(signature),
      new TextEncoder().encode(body)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body))
    ) as SuperAdminSession;
    if (!decoded || typeof decoded.exp !== 'number') return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    if (decoded.role !== 'super_admin') return null;
    return decoded;
  } catch {
    return null;
  }
}

export const SA_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SA_TTL_SECONDS,
};

// Verifies the x-line-signature header LINE sends with every webhook call:
// base64(HMAC-SHA256(channelSecret, rawBody)). Must run on the raw body,
// before any JSON parsing.
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

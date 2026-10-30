// Server-only: fetch a user-supplied SDS link without opening an SSRF hole.
//   - https only, no credentials in the URL, default port only
//   - every hop (max 3 redirects) is DNS-resolved and rejected if it points at a
//     private / loopback / link-local / CGNAT / metadata / multicast address
//   - body is streamed with a hard byte cap (Content-Length is checked first)
//   - the file type is decided by magic bytes (PDF / PNG / JPEG), not headers
// Residual risk: DNS rebinding between our lookup and fetch's own lookup. The
// window is small and the response must still be a PDF/image to be used.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SdsExtractionError } from './sds-extraction';

const MAX_REDIRECTS = 3;

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||           // this-net, private, loopback, multicast/reserved
    (a === 100 && b >= 64 && b <= 127) ||                      // CGNAT
    (a === 169 && b === 254) ||                                 // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||                                   // 192.0.0.0/24 + 192.0.2.0/24 docs
    (a === 198 && (b === 18 || b === 19))                       // benchmarking
  );
}

function ipBlocked(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Blocked(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  return (
    v6 === '::' || v6 === '::1' ||
    v6.startsWith('fc') || v6.startsWith('fd') ||               // unique local
    /^fe[89ab]/.test(v6) ||                                     // link-local
    v6.startsWith('ff')                                         // multicast
  );
}

const fail = (message: string) => new SdsExtractionError(message, 'URL_NOT_ALLOWED', 400);

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw fail('ลิงก์ SDS ไม่ถูกต้อง'); }
  if (url.protocol !== 'https:') throw fail('รองรับเฉพาะลิงก์ https:// — ถ้าเป็นลิงก์อื่นให้ดาวน์โหลดไฟล์แล้วแนบจากเครื่อง');
  if (url.username || url.password) throw fail('ลิงก์ SDS ต้องไม่มีชื่อผู้ใช้/รหัสผ่าน');
  if (url.port && url.port !== '443') throw fail('ลิงก์ SDS ต้องใช้พอร์ตมาตรฐาน');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw fail('ไม่อนุญาตลิงก์ไปยังเครือข่ายภายใน');
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw fail('ไม่พบเว็บไซต์ของลิงก์ SDS นี้');
  if (addresses.some(a => ipBlocked(a.address))) throw fail('ไม่อนุญาตลิงก์ไปยังเครือข่ายภายใน');
  return url;
}

function sniffMediaType(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

export async function fetchSdsFromUrl(raw: string, maxBytes: number): Promise<{ buf: Buffer; mediaType: string; label: string }> {
  let url = await assertPublicUrl(raw);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { accept: 'application/pdf,image/*;q=0.8' } });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_REDIRECTS) throw fail('ลิงก์ SDS เปลี่ยนเส้นทางหลายครั้งเกินไป กรุณาดาวน์โหลดไฟล์แล้วแนบจากเครื่อง');
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new SdsExtractionError('เปิดลิงก์ SDS ไม่สำเร็จ กรุณาใช้ลิงก์ไฟล์ที่เปิดได้หรือเลือกไฟล์จากเครื่อง', 'SOURCE_UNAVAILABLE', 422);

  const tooLarge = () => new SdsExtractionError(`ไฟล์ใหญ่เกิน ${Math.round(maxBytes / 1048576)} MB สำหรับการสกัดอัตโนมัติ`, 'FILE_TOO_LARGE', 413);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) { await res.body?.cancel().catch(() => undefined); throw tooLarge(); }

  const reader = res.body?.getReader();
  if (!reader) throw new SdsExtractionError('เปิดลิงก์ SDS ไม่สำเร็จ', 'SOURCE_UNAVAILABLE', 422);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => undefined); throw tooLarge(); }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  const mediaType = sniffMediaType(buf);
  if (!mediaType) throw new SdsExtractionError('ลิงก์นี้ไม่ใช่ไฟล์ PDF หรือรูปภาพ กรุณาใช้ลิงก์ไปยังไฟล์ SDS โดยตรง', 'UNSUPPORTED_TYPE', 415);
  return { buf, mediaType, label: url.toString() };
}

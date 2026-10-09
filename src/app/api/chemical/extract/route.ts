import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import type { SdsExtraction } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * สกัดข้อมูลจาก SDS (PDF) ด้วย Claude → JSON ตาม SdsExtraction
 * รับได้ 3 แบบ:
 *   FormData { file }                — ไฟล์ที่ผู้ใช้เพิ่งเลือก (ยังไม่อัปโหลด)
 *   JSON { path }                    — ไฟล์ใน bucket chemical-sds
 *   JSON { url }                     — ลิงก์ PDF ภายนอก (ต้องเปิดได้โดยไม่ล็อกอิน)
 * ต้องตั้ง ANTHROPIC_API_KEY ใน Vercel — ถ้าไม่มีจะตอบ 503 พร้อมคำอธิบาย (ปุ่มใน UI จะซ่อน)
 */

const MODEL = process.env.SDS_EXTRACT_MODEL || 'claude-sonnet-5';
const MAX_BYTES = 20 * 1024 * 1024;

const SYSTEM = `You are an EHS specialist extracting structured data from a chemical Safety Data Sheet (SDS/MSDS), which may be in Thai or English.
Return ONLY a JSON object (no prose, no markdown fences) with these keys. Omit a key if the SDS does not state it; never invent values.
{
  "name": string,                 // product / trade name (Section 1)
  "chemical_name": string,        // chemical name or main ingredient (Section 1/3)
  "cas_no": string,               // CAS number of main ingredient (Section 3)
  "un_no": string,                // UN number digits only (Section 14), e.g. "1090"
  "supplier": string,             // manufacturer/supplier name (Section 1)
  "physical_state": "solid"|"liquid"|"gas"|"aerosol",   // Section 9
  "ghs_pictograms": ["GHS01".."GHS09"],   // Section 2 — map symbols: exploding bomb=GHS01, flame=GHS02, flame over circle=GHS03, gas cylinder=GHS04, corrosion=GHS05, skull=GHS06, exclamation=GHS07, health hazard=GHS08, environment=GHS09
  "signal_word": "Danger"|"Warning"|"None",
  "hazard_classes": [string],     // e.g. "Flammable liquids, Category 2" (Section 2.1)
  "h_codes": ["H225", ...],       // hazard statement codes (Section 2.2)
  "p_codes": ["P210", "P305+P351+P338", ...],   // precautionary codes (Section 2.2)
  "flash_point_c": number,        // °C closed cup if available (Section 9)
  "boiling_point_c": number,      // °C (Section 9)
  "storage_conditions": string,   // Section 7 storage — concise Thai summary, max 300 chars
  "ppe_required": [string],       // Section 8 — short Thai item names, e.g. "ถุงมือไนไตรล์", "แว่นตานิรภัย", "หน้ากากป้องกันไอสารอินทรีย์"
  "first_aid": { "inhalation": string, "skin": string, "eye": string, "ingestion": string },   // Section 4 — concise Thai, each max 200 chars
  "fire_fighting": string,        // Section 5 — suitable extinguishing media + special hazards, concise Thai, max 250 chars
  "spill_response": string,       // Section 6 — concise Thai, max 250 chars
  "emergency_contact": string,    // Section 1 emergency phone if stated
  "sds_revision_date": "YYYY-MM-DD",   // Section 16 / header revision date
  "sds_language": "th"|"en"|"other",
  "extraction_notes": string      // anything uncertain, unreadable pages, or conflicts (Thai)
}
Write all free-text summaries in Thai regardless of SDS language. Keep H/P codes exactly as printed.`;

async function readSource(request: NextRequest): Promise<{ base64: string; mediaType: string; label: string }> {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('ไม่พบไฟล์');
    if (file.size > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 20 MB สำหรับการสกัดอัตโนมัติ');
    const buf = Buffer.from(await file.arrayBuffer());
    return { base64: buf.toString('base64'), mediaType: file.type || 'application/pdf', label: file.name };
  }
  const body = (await request.json()) as { path?: string; url?: string };
  if (body.path) {
    const db = getSupabaseServer();
    const { data, error } = await db.storage.from('chemical-sds').download(body.path);
    if (error || !data) throw new Error('ดาวน์โหลดไฟล์จากระบบไม่สำเร็จ');
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 20 MB สำหรับการสกัดอัตโนมัติ');
    return { base64: buf.toString('base64'), mediaType: data.type || 'application/pdf', label: body.path };
  }
  if (body.url) {
    const res = await fetch(body.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`เปิดลิงก์ไม่สำเร็จ (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 20 MB สำหรับการสกัดอัตโนมัติ');
    const mt = (res.headers.get('content-type') || 'application/pdf').split(';')[0];
    return { base64: buf.toString('base64'), mediaType: mt, label: body.url };
  }
  throw new Error('ต้องระบุไฟล์, path หรือ url');
}

/** GET → บอก UI ว่าเปิดใช้การสกัดอัตโนมัติได้หรือไม่ */
export async function GET() {
  return NextResponse.json({ available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์ — กรอกข้อมูลด้วยตนเองไปก่อน', code: 'NO_API_KEY' },
      { status: 503 },
    );
  }
  try {
    const src = await readSource(request);
    const isPdf = src.mediaType.includes('pdf');
    const content: Array<Record<string, unknown>> = [
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: src.base64 } }
        : { type: 'image', source: { type: 'base64', media_type: src.mediaType, data: src.base64 } },
      { type: 'text', text: 'Extract the SDS data as specified. Return only the JSON object.' },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI service error ${res.status}: ${t.slice(0, 300)}`);
    }
    const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (payload.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('\n').trim();
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start < 0 || end < 0) throw new Error('AI ไม่ได้ตอบเป็น JSON');
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as SdsExtraction;

    // ทำให้สะอาด: รหัสเป็นตัวพิมพ์ใหญ่ไม่มีช่องว่าง, pictogram ที่รู้จักเท่านั้น
    const norm = (arr?: unknown): string[] => Array.isArray(arr) ? arr.map(x => String(x).toUpperCase().replace(/\s+/g, '')).filter(Boolean) : [];
    parsed.h_codes = norm(parsed.h_codes).filter(c => /^H\d{3}[A-Z]?$/.test(c));
    parsed.p_codes = norm(parsed.p_codes).filter(c => /^P\d{3}(\+P\d{3})*$/.test(c));
    parsed.ghs_pictograms = norm(parsed.ghs_pictograms).filter(c => /^GHS0[1-9]$/.test(c)) as SdsExtraction['ghs_pictograms'];
    if (parsed.signal_word && !['Danger', 'Warning', 'None'].includes(parsed.signal_word)) {
      const s = String(parsed.signal_word).toLowerCase();
      parsed.signal_word = s.includes('danger') || s.includes('อันตราย') ? 'Danger' : s.includes('warn') || s.includes('ระวัง') ? 'Warning' : 'None';
    }
    if (parsed.physical_state && !['solid', 'liquid', 'gas', 'aerosol'].includes(parsed.physical_state)) delete parsed.physical_state;
    if (parsed.un_no) parsed.un_no = String(parsed.un_no).replace(/^UN\s*/i, '');

    return NextResponse.json({ data: parsed, source: src.label, model: MODEL });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'สกัดข้อมูลไม่สำเร็จ', detail: msg }, { status: 500 });
  }
}

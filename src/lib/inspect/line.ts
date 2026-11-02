// Equipment inspection through the LINE OA (1:1 chat): a photo with the QR label visible
// records a "pass" for that asset; follow-up text marks it failed or sets the inspection date.
// Replies only — never uses the push quota.
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { getLinkedAccount } from '@/lib/line/accounts';
import { text, type LineMessage } from '@/lib/line/flex';
import { INSPECT_BUCKET } from './constants';
import { companySettings, defaultTemplateFor, lastInspectionInRound, loadCategories, newToken } from './server';
import { bangkokToday, periodOf } from './validation';
import type { InspAssetRow, InspAssetStatusRow, InspInspectionRow, InspLineUserRow, InspResultValue, InspTemplateRow } from './types';

const CONTEXT_MS = 10 * 60 * 1000;      // follow-up photo / "ไม่ผ่าน" text applies to the last record within 10 min
const OVERRIDE_MS = 12 * 60 * 60 * 1000; // "วันที่ 31/10" stays in force for 12 h
const MAX_PHOTOS = 3;
const PENDING_MS = 30 * 60 * 1000;  // held photo (already passed this round) waits for "ตรวจซ้ำ" up to 30 min
const HELP = 'วิธีบันทึกผลตรวจทาง LINE\n1) ถ่ายรูปอุปกรณ์ให้เห็น QR ชัด (ห่างไม่เกิน ~70 ซม.) แล้วส่งมาที่นี่ทีละรูป\n2) ระบบตอบกลับว่าบันทึกถังไหนแล้ว — ส่ง QR ก่อนเสมอ รูปเพิ่มส่งตามหลัง\n3) ถ้าไม่ผ่าน พิมพ์ต่อว่า "ไม่ผ่าน <สิ่งที่พบ>" ภายใน 10 นาที\n4) ถ้าตรวจวันก่อนหน้า พิมพ์ "วันที่ 31/10" ก่อนส่งรูป\n5) ถังที่ตรวจผ่านแล้วในรอบนี้ ระบบจะถามก่อน — พิมพ์ "ตรวจซ้ำ" เพื่อยืนยัน\nรูปที่ 2–3 ของถังเดิมส่งต่อได้เลย (ภายใน 10 นาที)';

type Ctx = { db: SupabaseClient; lineUserId: string; accessToken: string };

// ---------------------------------------------------------------- identity

async function lineUser(db: SupabaseClient, lineUserId: string): Promise<InspLineUserRow | null> {
  const { data } = await db.from('insp_line_users').select('*').eq('line_user_id', lineUserId).maybeSingle();
  return (data as InspLineUserRow | null) || null;
}

/** Staff account linked through the existing LINE link flow → usable for every company it may see. */
async function staffFor(db: SupabaseClient, lineUserId: string, companyId: string): Promise<{ name: string; code: string } | null> {
  const acc = await getLinkedAccount(db, lineUserId);
  if (!acc) return null;
  if (!acc.isGroupAdmin && acc.companyId !== companyId) return null;
  if (acc.modules && !acc.modules.includes('inspect')) return null;
  return { name: acc.displayName, code: 'SHE' };
}

async function resolveIdentity(ctx: Ctx, companyId: string): Promise<{ ok: true; code: string; name: string; row: InspLineUserRow } | { ok: false; messages: LineMessage[] }> {
  const { db, lineUserId } = ctx;
  const settings = await companySettings(companyId);
  const existing = await lineUser(db, lineUserId);
  if (existing && existing.company_id === companyId && existing.inspector_code) {
    if (existing.linked_via === 'code') {
      const { data: insp } = await db.from('insp_inspectors').select('id').eq('company_id', companyId).eq('code', existing.inspector_code).eq('is_active', true).maybeSingle();
      if (!insp) return { ok: false, messages: [text(`รหัสผู้ตรวจ ${existing.inspector_code} ถูกปิดใช้งานแล้ว กรุณาติดต่อทีม SHE`)] };
    }
    return { ok: true, code: existing.inspector_code, name: existing.inspector_name, row: existing };
  }
  // Linked SHE account?
  const staff = await staffFor(db, lineUserId, companyId);
  if (staff) {
    const { data } = await db.from('insp_line_users').upsert({ line_user_id: lineUserId, company_id: companyId, inspector_code: staff.code, inspector_name: staff.name, linked_via: 'account' }, { onConflict: 'line_user_id' }).select('*').single();
    return { ok: true, code: staff.code, name: staff.name, row: data as InspLineUserRow };
  }
  if (settings.inspection_mode !== 'department') {
    return { ok: false, messages: [text('บริษัทนี้ให้ทีม SHE เป็นผู้ตรวจ — เชื่อมบัญชี LINE กับบัญชี SHE ก่อน (พิมพ์ "เชื่อมบัญชี") แล้วส่งรูปอีกครั้ง')] };
  }
  return { ok: false, messages: [text('ยังไม่ได้ลงทะเบียนผู้ตรวจ\nพิมพ์รหัสผู้ตรวจของคุณ เช่น\nรหัส 0058\nแล้วส่งรูปอีกครั้ง')] };
}

// ---------------------------------------------------------------- text commands

/** Returns null when the text is not an inspection command (the general bot handles it). */
export async function handleInspectText(ctx: Ctx, raw: string): Promise<LineMessage[] | null> {
  const { db, lineUserId } = ctx;
  const t = raw.trim();
  const codeMatch = t.match(/^(?:รหัส(?:ผู้ตรวจ)?\s*)?([A-Za-z0-9-]{3,20})(?:\s+([A-Za-z0-9_-]{2,20}))?$/i);
  const isCodeCmd = /^รหัส/i.test(t) || (/^[A-Za-z0-9-]{3,20}$/.test(t) && /\d/.test(t) && !(await lineUser(db, lineUserId)));
  if (codeMatch && isCodeCmd) {
    const code = codeMatch[1].toUpperCase();
    const companyHint = codeMatch[2]?.toLowerCase();
    let q = db.from('insp_inspectors').select('company_id, code, name, department').ilike('code', code).eq('is_active', true);
    if (companyHint) q = q.eq('company_id', companyHint);
    const { data } = await q;
    const rows = (data || []) as { company_id: string; code: string; name: string; department: string }[];
    if (rows.length === 0) return [text(`ไม่พบรหัสผู้ตรวจ ${code}${companyHint ? ` ใน ${companyHint.toUpperCase()}` : ''} — ตรวจรหัสอีกครั้ง หรือให้ทีม SHE เพิ่มชื่อคุณในทะเบียนผู้ตรวจ`)];
    if (rows.length > 1) return [text(`รหัส ${code} มีในหลายบริษัท พิมพ์ระบุบริษัท เช่น\n${rows.map(r => `รหัส ${code} ${r.company_id.toUpperCase()}`).join('\n')}`)];
    const r = rows[0];
    await db.from('insp_line_users').upsert({ line_user_id: lineUserId, company_id: r.company_id, inspector_code: r.code, inspector_name: r.name, linked_via: 'code' }, { onConflict: 'line_user_id' });
    return [text(`ลงทะเบียนแล้ว: ${r.name}${r.department ? ` (${r.department})` : ''} · ${r.company_id.toUpperCase()}\n\n${HELP}`)];
  }

  const dateMatch = t.match(/^วันที่\s*(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (dateMatch) {
    const today = bangkokToday();
    let y = dateMatch[3] ? Number(dateMatch[3]) : Number(today.slice(0, 4));
    if (y > 2400) y -= 543; else if (y < 100) y += 2000;
    const iso = `${y}-${String(Number(dateMatch[2])).padStart(2, '0')}-${String(Number(dateMatch[1])).padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(iso)) || iso > today || Date.parse(today) - Date.parse(iso) > 45 * 86400000) return [text('วันที่ไม่ถูกต้อง (ย้อนหลังได้ไม่เกิน 45 วัน และไม่เกินวันนี้)')];
    const cur = await lineUser(db, lineUserId);
    await db.from('insp_line_users').upsert({ line_user_id: lineUserId, company_id: cur?.company_id ?? null, inspector_code: cur?.inspector_code ?? '', inspector_name: cur?.inspector_name ?? '', linked_via: cur?.linked_via ?? 'code', inspected_on_override: iso, override_set_at: new Date().toISOString() }, { onConflict: 'line_user_id' });
    return [text(`รูปที่ส่งต่อจากนี้ (12 ชม.) จะบันทึกเป็นวันที่ตรวจ ${thai(iso)}\nพิมพ์ "วันนี้" เพื่อยกเลิก`)];
  }
  if (/^วันนี้$/.test(t)) {
    await db.from('insp_line_users').update({ inspected_on_override: null, override_set_at: null }).eq('line_user_id', lineUserId);
    return [text('ใช้วันที่ปัจจุบันเป็นวันที่ตรวจ')];
  }

  if (/^(ผ่าน|ok|pass|✅)$/i.test(t)) {
    const cur = await lineUser(db, lineUserId);
    if (cur?.last_inspection_id && cur.last_at && Date.now() - Date.parse(cur.last_at) < CONTEXT_MS) {
      const { data: a } = await db.from('insp_assets').select('code').eq('id', cur.last_asset_id || '').maybeSingle();
      return [text(`${a?.code || 'รายการล่าสุด'} บันทึกเป็น "ผ่าน" อยู่แล้ว ✅ ไม่ต้องพิมพ์ยืนยัน — ส่งรูปถังถัดไปได้เลย`)];
    }
    return [text('รูปที่ส่งมาจะถูกบันทึกเป็น "ผ่าน" อัตโนมัติ — พิมพ์เฉพาะกรณี "ไม่ผ่าน <สิ่งที่พบ>"')];
  }

  const failMatch = t.match(/^(?:ไม่ผ่าน|ไม่ผ่า|fail|x)\s*[:\-]?\s*([\s\S]*)$/i);
  if (failMatch) {
    const cur = await lineUser(db, lineUserId);
    if (!cur?.last_inspection_id || !cur.last_at || Date.now() - Date.parse(cur.last_at) > CONTEXT_MS) return [text('ไม่มีรายการตรวจล่าสุดใน 10 นาทีนี้ — ส่งรูปถังก่อน แล้วพิมพ์ "ไม่ผ่าน <สิ่งที่พบ>" ตาม')];
    const note = failMatch[1].trim().slice(0, 1000);
    const { data: insp } = await db.from('insp_inspections').select('id, note, asset_id').eq('id', cur.last_inspection_id).maybeSingle();
    if (!insp) return [text('ไม่พบรายการตรวจล่าสุด')];
    const merged = [insp.note, note].filter(Boolean).join(' · ');
    await db.from('insp_inspections').update({ overall: 'fail', note: merged }).eq('id', insp.id);
    const { data: a } = await db.from('insp_assets').select('code').eq('id', insp.asset_id).maybeSingle();
    return [text(`บันทึก ${a?.code || ''} เป็น "ไม่ผ่าน"${note ? `\n${note}` : ''}\nทีม SHE จะระบุข้อที่ไม่ผ่านและปิดงานเมื่อแก้ไขแล้ว`)];
  }

  if (/^(ตรวจซ้ำ|ยืนยัน|repeat|yes)$/i.test(t)) {
    const cur = await lineUser(db, lineUserId);
    if (!cur?.pending_asset_id || !cur.pending_message_id || !cur.pending_at || Date.now() - Date.parse(cur.pending_at) > PENDING_MS) return [text('ไม่มีรูปที่รอยืนยันอยู่ (เกิน 30 นาที หรือยังไม่ได้ส่งรูป) — ส่งรูปถังใหม่อีกครั้ง')];
    const { data: assetRow } = await db.from('insp_assets').select('*').eq('id', cur.pending_asset_id).maybeSingle();
    if (!assetRow) return [text('ไม่พบอุปกรณ์ที่รอยืนยัน')];
    const buf = await fetchContent(cur.pending_message_id, ctx.accessToken);
    await db.from('insp_line_users').update({ pending_asset_id: null, pending_message_id: null, pending_at: null }).eq('line_user_id', lineUserId);
    if (!buf) return [text('ดึงรูปเดิมจาก LINE ไม่ได้แล้ว กรุณาส่งรูปใหม่ แล้วพิมพ์ "ตรวจซ้ำ" อีกครั้ง')];
    return recordPass(ctx, assetRow as InspAssetRow, buf, cur.pending_message_id, true);
  }
  if (/^(ตรวจ|ตรวจอุปกรณ์|วิธีตรวจ|inspect)$/i.test(t)) {
    const cur = await lineUser(db, lineUserId);
    return [text(`${cur?.inspector_name ? `ผู้ตรวจ: ${cur.inspector_name} (${cur.company_id?.toUpperCase()})\n\n` : ''}${HELP}`)];
  }
  return null;
}

// ---------------------------------------------------------------- image

export async function handleInspectImage(ctx: Ctx, messageId: string): Promise<LineMessage[]> {
  const { db, accessToken } = ctx;
  // Idempotent: LINE may redeliver the same event.
  const { data: dup } = await db.from('insp_photos').select('asset_id').eq('line_message_id', messageId).maybeSingle();
  if (dup) return [text('รูปนี้บันทึกไปแล้ว')];

  const buf = await fetchContent(messageId, accessToken);
  if (!buf) return [text('ดึงรูปจาก LINE ไม่สำเร็จ กรุณาส่งใหม่')];

  const { token, debug } = await decodeToken(buf);
  if (!token) {
    const follow = await attachFollowUp(ctx, messageId, buf);
    if (follow.length) return follow;
    // Rule (owner, 2 Nov): QR photo always comes first; a photo without a readable QR and without a recent asset is not kept.
    return [text(`อ่าน QR ในรูปนี้ไม่ได้ และยังไม่มีถังล่าสุดให้แนบ — ส่งรูปที่เห็น QR ของถังก่อน แล้วค่อยส่งรูปเพิ่มตาม\n(ถ่ายให้ QR อยู่กลางภาพ ≤ 70 ซม. ไม่ย้อนแสง)\n(ระบบ: ${debug})`)];
  }

  const { data: assetRow } = await db.from('insp_assets').select('*').eq('qr_token', token).maybeSingle();
  const asset = assetRow as InspAssetRow | null;
  if (!asset) return [text('QR นี้ไม่อยู่ในทะเบียน (อาจถูกพิมพ์ใหม่แล้ว) — แจ้งทีม SHE')];
  if (asset.status !== 'active') return [text(`${asset.code} ถูกปิดใช้งานแล้ว (${asset.status === 'disposed' ? 'ปลดระวาง' : 'พักใช้งาน'})`)];

  return recordPass(ctx, asset, buf, messageId, false);
}

/** Record a pass for the asset (or hold the photo when it already passed this round and the sender has not confirmed). */
async function recordPass(ctx: Ctx, asset: InspAssetRow, buf: Buffer, messageId: string, confirmed: boolean): Promise<LineMessage[]> {
  const { db, lineUserId } = ctx;
  const who = await resolveIdentity(ctx, asset.company_id);
  if (!who.ok) return who.messages;

  // Same asset again within the context window → extra photo for that record
  const cur = who.row;
  if (cur.last_asset_id === asset.id && cur.last_inspection_id && cur.last_at && Date.now() - Date.parse(cur.last_at) < CONTEXT_MS) {
    const n = await addPhoto(db, asset, cur.last_inspection_id, buf, messageId);
    if (n === null) return [text(`${asset.code} มีรูปครบ ${MAX_PHOTOS} รูปแล้ว`)];
    await db.from('insp_line_users').update({ last_at: new Date().toISOString() }).eq('line_user_id', lineUserId);
    return [text(`เพิ่มรูปที่ ${n} ให้ ${asset.code} แล้ว`)];
  }

  const [{ categories, templates }, statusRes] = await Promise.all([loadCategories(asset.company_id, true), db.from('insp_asset_status').select('*').eq('asset_id', asset.id).maybeSingle()]);
  const category = categories.find(c => c.id === asset.category_id);
  const template: InspTemplateRow | null = (asset.template_id && templates.find(t => t.id === asset.template_id)) || defaultTemplateFor(templates, asset.category_id, asset.company_id);
  if (!template) return [text('หมวดของอุปกรณ์นี้ยังไม่มีรายการตรวจ — แจ้งทีม SHE')];

  // Already passed this round → hold the photo and ask (a previous FAIL may be re-inspected without asking)
  if (!confirmed) {
    const { last, inRound } = await lastInspectionInRound(asset.id, category?.inspection_interval_days || 30);
    if (inRound && last?.overall === 'pass') {
      await db.from('insp_line_users').update({ pending_asset_id: asset.id, pending_message_id: messageId, pending_at: new Date().toISOString() }).eq('line_user_id', lineUserId);
      return [text(`${asset.code} ตรวจผ่านแล้วในรอบนี้ (${thai(last.inspected_on)} โดย ${last.inspector_name}) — ปกติไม่ต้องตรวจซ้ำ\nถ้าต้องการบันทึกอีกครั้ง พิมพ์ "ตรวจซ้ำ" ภายใน 30 นาที`)];
    }
  }

  const results: Record<string, InspResultValue> = {};
  for (const it of template.items) results[it.key] = it.kind === 'number' ? null : 'pass';

  const override = cur.inspected_on_override && cur.override_set_at && Date.now() - Date.parse(cur.override_set_at) < OVERRIDE_MS ? cur.inspected_on_override : null;
  const inspected_on = override || bangkokToday();
  const { data: created, error } = await db.from('insp_inspections').insert([{
    company_id: asset.company_id, asset_id: asset.id, template_id: template.id, template_version: template.version,
    inspected_on, period: periodOf(inspected_on), inspector_code: who.code, inspector_name: who.name,
    results, overall: 'pass', fail_items: [], note: confirmed ? 'ตรวจซ้ำ (ยืนยันทาง LINE)' : '', source: 'line',
  }]).select('*').single();
  if (error || !created) { console.error('line inspection insert failed', error?.message); return [text('บันทึกไม่สำเร็จ กรุณาลองใหม่')]; }
  const row = created as InspInspectionRow;
  await addPhoto(db, asset, row.id, buf, messageId);
  await db.from('insp_line_users').update({ last_inspection_id: row.id, last_asset_id: asset.id, last_at: new Date().toISOString(), pending_asset_id: null, pending_message_id: null, pending_at: null }).eq('line_user_id', lineUserId);

  const st = statusRes.data as InspAssetStatusRow | null;
  const where = [asset.department, asset.floor && `ชั้น ${asset.floor}`, asset.location].filter(Boolean).join(' · ');
  const lines = [`✅ ${asset.code}${where ? ` · ${where}` : ''}`, `บันทึกแล้ว — ผ่าน · ${thai(inspected_on)} · ${who.name}${confirmed ? ' (ตรวจซ้ำ)' : ''}`];
  if (st?.next_service_due_on && st.next_service_due_on < bangkokToday()) lines.push(`⚠️ เลยกำหนดทดสอบตามรอบ (${thai(st.next_service_due_on)}) — แจ้ง SHE`);
  if (st && Number(st.open_failures) > 0) lines.push(`⚠️ มีรายการไม่ผ่านค้างแก้ไข ${st.open_failures} รายการ`);
  lines.push('ถ้าไม่ผ่าน พิมพ์: ไม่ผ่าน <สิ่งที่พบ>');
  return [text(lines.join('\n'))];
}

/** A photo that has no readable QR but arrives right after a successful one → extra photo of that asset. */
async function attachFollowUp(ctx: Ctx, messageId: string, buf: Buffer): Promise<LineMessage[]> {
  const cur = await lineUser(ctx.db, ctx.lineUserId);
  if (!cur?.last_asset_id || !cur.last_inspection_id || !cur.last_at || Date.now() - Date.parse(cur.last_at) > CONTEXT_MS) return [];
  const { data } = await ctx.db.from('insp_assets').select('*').eq('id', cur.last_asset_id).maybeSingle();
  if (!data) return [];
  const n = await addPhoto(ctx.db, data as InspAssetRow, cur.last_inspection_id, buf, messageId);
  if (n === null) return [];
  await ctx.db.from('insp_line_users').update({ last_at: new Date().toISOString() }).eq('line_user_id', ctx.lineUserId);
  return [text(`(นับเป็นรูปที่ ${n} ของ ${(data as InspAssetRow).code})`)];
}

async function addPhoto(db: SupabaseClient, asset: InspAssetRow, inspectionId: string, buf: Buffer, messageId: string): Promise<number | null> {
  const { count } = await db.from('insp_photos').select('id', { count: 'exact', head: true }).eq('inspection_id', inspectionId).is('deleted_at', null);
  if ((count || 0) >= MAX_PHOTOS) return null;
  const img = sharp(buf).rotate();
  const out = await img.resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  const path = `${asset.company_id}/${asset.id}/${newToken(12)}.webp`;
  const { error } = await db.storage.from(INSPECT_BUCKET).upload(path, out.data, { contentType: 'image/webp', upsert: false });
  if (error) { console.error('line photo upload failed', error.message); return null; }
  const { error: iErr } = await db.from('insp_photos').insert([{ company_id: asset.company_id, asset_id: asset.id, inspection_id: inspectionId, storage_path: path, bytes: out.data.length, width: out.info.width, height: out.info.height, line_message_id: messageId }]);
  if (iErr) { console.error('line photo row failed', iErr.message); return null; }
  return (count || 0) + 1;
}

async function fetchContent(messageId: string, accessToken: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) { console.error('LINE content failed', res.status); return null; }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 12 * 1024 * 1024) return null;
    return Buffer.from(ab);
  } catch (e) { console.error('LINE content error', e instanceof Error ? e.message : e); return null; }
}

/** Decode the inspect QR from a photo: full frame at 1600 px, then centre crop ×2, then 2400 px. */
async function decodeToken(buf: Buffer): Promise<{ token: string | null; debug: string }> {
  const notes: string[] = [`${Math.round(buf.length / 1024)} KB`];
  let base: ReturnType<typeof sharp>;
  let meta: { width?: number; height?: number; format?: string };
  try { base = sharp(buf).rotate(); meta = await base.metadata(); notes.push(`${meta.format} ${meta.width}×${meta.height}`); }
  catch (e) { return { token: null, debug: `sharp: ${e instanceof Error ? e.message : String(e)}` }; }
  const longest = Math.max(meta.width || 0, meta.height || 0) || 1600;
  const attempts: (() => Promise<{ data: Buffer; info: { width: number; height: number } }>)[] = [
    () => base.clone().resize({ width: Math.min(1600, longest), height: Math.min(1600, longest), fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    async () => {
      const r = await base.clone().resize({ width: Math.min(1600, longest), height: Math.min(1600, longest), fit: 'inside' }).toBuffer({ resolveWithObject: true });
      const w = r.info.width, h = r.info.height; const cw = Math.round(w * 0.6), ch = Math.round(h * 0.6);
      return sharp(r.data).extract({ left: Math.round((w - cw) / 2), top: Math.round((h - ch) / 2), width: cw, height: ch }).resize({ width: cw * 2, height: ch * 2, kernel: 'nearest' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    },
    () => base.clone().resize({ width: Math.min(2400, longest), height: Math.min(2400, longest), fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ];
  for (const run of attempts) {
    try {
      const { data, info } = await run();
      const hit = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, { inversionAttempts: 'attemptBoth' });
      const m = hit?.data.match(/\/inspect\/i\/([A-Za-z0-9_-]{20,64})/);
      if (m) return { token: m[1], debug: notes.join(', ') };
      notes.push(hit ? `พบ QR แต่ไม่ใช่ของระบบ: ${hit.data.slice(0, 40)}` : 'ไม่พบ QR');
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); console.error('qr decode attempt failed', msg); notes.push(`err: ${msg.slice(0, 80)}`); }
  }
  return { token: null, debug: notes.join(', ') };
}

const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function thai(ymd: string) { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${TH[m - 1]} ${y + 543}`; }

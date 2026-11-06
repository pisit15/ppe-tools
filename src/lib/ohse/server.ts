import { createHash, randomBytes } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, requireToolsActor, type ToolsActor } from '@/lib/toolsSession';
import { OHSE_BUCKET, OHSE_IMPORT_ORIGIN, OHSE_MIME, OHSE_MODULE_ID } from './constants';
import type { OhseDocumentInput, OhseDocumentRow, OhseSectionInput, OhseSectionKind, OhseSectionRow, OhseSectionView } from './types';

export const db = () => getSupabaseServer();

/** Same rule as visitor/inspect: tools admins, personal SHE accounts; allowed_modules must include 'ohse' when restricted. */
export function isOhseStaff(actor: ToolsActor) {
  if (actor.isAdmin) return true;
  const modules = actor.row.allowed_modules;
  if (Array.isArray(modules) && modules.length > 0 && !modules.includes(OHSE_MODULE_ID)) return false;
  if (actor.accountTable === 'tools_users') return true;
  return actor.accountTable === 'company_users' && actor.username.trim().toLowerCase() !== actor.companyId.trim().toLowerCase();
}

export async function requireOhseStaff(request: NextRequest) {
  const actor = await requireToolsActor(request);
  if (!isOhseStaff(actor)) throw new AccessError('SHE Data Center เปิดให้เฉพาะบัญชีส่วนตัวของทีม SHE');
  return actor;
}

// ── validation ────────────────────────────────────────────────────────────
const KINDS: OhseSectionKind[] = ['folder', 'documents', 'monitoring', 'licenses', 'link'];
const ymd = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown, max: number, field: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new AccessError(`${field} ไม่ถูกต้อง`, 400);
  const t = v.trim();
  if (t.length > max) throw new AccessError(`${field} ยาวเกิน ${max} ตัวอักษร`, 400);
  return t || null;
}
function date(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !ymd.test(v)) throw new AccessError(`${field} ต้องเป็นวันที่`, 400);
  return v;
}
function url(v: unknown): string | null {
  const t = text(v, 1000, 'ลิงก์');
  if (t && !/^https:\/\//.test(t)) throw new AccessError('ลิงก์ต้องขึ้นต้นด้วย https://', 400);
  return t;
}

export function cleanDocumentInput(body: unknown, partial: boolean): OhseDocumentInput {
  if (!body || typeof body !== 'object') throw new AccessError('ข้อมูลไม่ถูกต้อง', 400);
  const b = body as Record<string, unknown>;
  const out: OhseDocumentInput = {};
  const has = (k: string) => k in b;
  if (!partial || has('section_id')) {
    if (typeof b.section_id !== 'string' || !b.section_id) throw new AccessError('กรุณาเลือกหมวด', 400);
    out.section_id = b.section_id;
  }
  if (!partial || has('title')) {
    const t = text(b.title, 300, 'ชื่อเอกสาร');
    if (!t) throw new AccessError('กรุณาใส่ชื่อเอกสาร', 400);
    out.title = t;
  }
  if (has('doc_no')) out.doc_no = text(b.doc_no, 80, 'เลขที่เอกสาร');
  if (has('revision')) out.revision = text(b.revision, 40, 'Rev.');
  if (has('doc_date')) out.doc_date = date(b.doc_date, 'วันที่');
  if (has('signed_by')) out.signed_by = text(b.signed_by, 200, 'ผู้ลงนาม');
  if (has('agency')) out.agency = text(b.agency, 200, 'หน่วยงาน');
  if (has('expires_on')) out.expires_on = date(b.expires_on, 'วันหมดอายุ');
  if (has('result')) {
    if (b.result !== null && b.result !== '' && b.result !== 'pass' && b.result !== 'not_pass') throw new AccessError('ผลตรวจไม่ถูกต้อง', 400);
    out.result = (b.result || null) as OhseDocumentRow['result'];
  }
  if (has('note')) out.note = text(b.note, 2000, 'หมายเหตุ');
  if (has('link_url')) out.link_url = url(b.link_url);
  if (has('employee_visible')) {
    if (b.employee_visible !== null && typeof b.employee_visible !== 'boolean') throw new AccessError('การแสดงผลไม่ถูกต้อง', 400);
    out.employee_visible = b.employee_visible as boolean | null;
  }
  if (has('sort_order')) out.sort_order = Number.isFinite(Number(b.sort_order)) ? Math.trunc(Number(b.sort_order)) : 0;
  if (has('file_path')) {
    out.file_path = text(b.file_path, 500, 'ไฟล์');
    out.file_name = text(b.file_name, 300, 'ชื่อไฟล์');
    out.file_size = b.file_size == null ? null : Math.max(0, Math.trunc(Number(b.file_size)) || 0);
    out.mime_type = text(b.mime_type, 120, 'ชนิดไฟล์');
  }
  return out;
}

export function cleanSectionInput(body: unknown, partial: boolean): OhseSectionInput {
  if (!body || typeof body !== 'object') throw new AccessError('ข้อมูลไม่ถูกต้อง', 400);
  const b = body as Record<string, unknown>;
  const out: OhseSectionInput = {};
  const has = (k: string) => k in b;
  if (!partial || has('title')) {
    const t = text(b.title, 200, 'ชื่อหมวด');
    if (!t) throw new AccessError('กรุณาใส่ชื่อหมวด', 400);
    out.title = t;
  }
  if (!partial || has('code')) {
    const c = text(b.code, 20, 'รหัสหมวด');
    if (!c || !/^[A-Za-z0-9.\-]+$/.test(c)) throw new AccessError('รหัสหมวดใช้ได้เฉพาะตัวเลข ตัวอักษร จุด และขีด', 400);
    out.code = c;
  }
  if (!partial || has('kind')) {
    const k = (b.kind ?? 'documents') as OhseSectionKind;
    if (!KINDS.includes(k)) throw new AccessError('ประเภทหมวดไม่ถูกต้อง', 400);
    out.kind = k;
  }
  if (has('parent_id')) out.parent_id = typeof b.parent_id === 'string' && b.parent_id ? b.parent_id : null;
  if (has('employee_visible')) {
    if (typeof b.employee_visible !== 'boolean') throw new AccessError('การแสดงผลไม่ถูกต้อง', 400);
    out.employee_visible = b.employee_visible;
  }
  if (has('link_url')) out.link_url = url(b.link_url);
  if (has('description')) out.description = text(b.description, 2000, 'คำอธิบาย');
  if (has('sort_order')) out.sort_order = Number.isFinite(Number(b.sort_order)) ? Math.trunc(Number(b.sort_order)) : 0;
  return out;
}

// ── queries ───────────────────────────────────────────────────────────────
export async function listSections(companyId: string): Promise<OhseSectionView[]> {
  const client = db();
  const [{ data: secs, error }, { data: docs, error: dErr }] = await Promise.all([
    client.from('ohse_sections').select('*').eq('company_id', companyId).order('sort_order').order('code'),
    client.from('ohse_documents').select('section_id').eq('company_id', companyId).eq('status', 'current'),
  ]);
  if (error) throw error;
  if (dErr) throw dErr;
  const counts = new Map<string, number>();
  for (const d of (docs || []) as { section_id: string }[]) counts.set(d.section_id, (counts.get(d.section_id) || 0) + 1);
  return ((secs || []) as OhseSectionRow[]).map(s => ({ ...s, doc_count: counts.get(s.id) || 0 }));
}

export async function getSection(companyId: string, id: string): Promise<OhseSectionRow> {
  const { data, error } = await db().from('ohse_sections').select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบหมวด', 404);
  return data as OhseSectionRow;
}

export async function getDocument(companyId: string, id: string): Promise<OhseDocumentRow> {
  const { data, error } = await db().from('ohse_documents').select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบเอกสาร', 404);
  return data as OhseDocumentRow;
}

// ── storage ───────────────────────────────────────────────────────────────
export function extOf(name: string) {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export async function signUpload(companyId: string, fileName: string) {
  const ext = extOf(fileName);
  if (!OHSE_MIME[ext]) throw new AccessError('รองรับเฉพาะ PDF รูปภาพ Word Excel และ PowerPoint', 400);
  const path = `${companyId}/${new Date().getFullYear()}/${randomBytes(10).toString('base64url')}.${ext}`;
  const { data, error } = await db().storage.from(OHSE_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl, token: data.token, mime: OHSE_MIME[ext] };
}

/** Size of an uploaded object (null if missing). */
export async function objectSize(path: string): Promise<number | null> {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const file = path.slice(path.lastIndexOf('/') + 1);
  const { data, error } = await db().storage.from(OHSE_BUCKET).list(folder, { search: file, limit: 5 });
  if (error) throw error;
  const obj = (data || []).find(o => o.name === file);
  return obj ? Number((obj.metadata as { size?: number } | null)?.size ?? 0) : null;
}

export async function signedFileUrl(path: string, fileName: string | null, seconds = 600) {
  const { data, error } = await db().storage.from(OHSE_BUCKET).createSignedUrl(path, seconds, fileName ? { download: false } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeObject(path: string | null) {
  if (!path) return;
  await db().storage.from(OHSE_BUCKET).remove([path]);
}

// ── one-off Superhuman import (CORS + short-lived ticket, hash stored) ────
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function importCors(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', OHSE_IMPORT_ORIGIN);
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'content-type, x-ohse-ticket');
  res.headers.set('Access-Control-Max-Age', '600');
  res.headers.set('Vary', 'Origin');
  return res;
}

export const importJson = (body: unknown, status = 200) => importCors(NextResponse.json(body, { status }));

export async function requireImportTicket(request: NextRequest): Promise<string> {
  const token = request.headers.get('x-ohse-ticket') || '';
  if (token.length < 24) throw new AccessError('ไม่มีตั๋วนำเข้า', 401);
  const { data, error } = await db().from('ohse_import_tickets').select('company_id, expires_at').eq('token_hash', sha256(token)).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new AccessError('ตั๋วนำเข้าหมดอายุหรือไม่ถูกต้อง', 401);
  return data.company_id as string;
}

export function importError(error: unknown) {
  if (error instanceof AccessError) return importJson({ error: error.message }, error.status);
  console.error('OHSE import failed', error);
  return importJson({ error: error instanceof Error ? error.message : 'import failed' }, 500);
}

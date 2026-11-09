import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, assertCompany, assertSameOrigin, requireModuleActor, type ToolsActor } from '@/lib/toolsSession';
import { FirstAidInputError, allowedKeys, bangkokDate, bool, calendarDate, integer, manualPerson, parseTransaction, readJsonBody, record, text, uuid } from './validation';
import { FA_ANON_DEPARTMENT, FA_ANON_NAME, FA_ICONS, type FaCountInput, type FaIcon, type FaItem, type FirstAidEmployee, type PersonSnapshot, type TransactionInput, type TransactionLine } from './types';

type DB = ReturnType<typeof getSupabaseServer>;
// Database JSON is normalized at the API boundary; no database record is returned wholesale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const LOCATION_COLUMNS = 'id,company_id,name,type,area,issue_mode,last_checked,inspection_issue,active,public_token_hash,require_requester';
const ITEM_COLUMNS = 'id,company_id,name,generic,category,unit,min,track_expiry,active,description,icon,image_path,image_source';
export const FA_IMAGE_BUCKET = 'first-aid-images';
const IMAGE_URL_SECONDS = 60 * 60;
/** Pseudo-location holding imported company-wide history; hidden from pickers. */
export const FA_REGISTER_TYPE = 'ทะเบียนประวัติ';
const DOCUMENT_COLUMNS = 'id,company_id,kind,location_id,destination_id,date,actor_key,actor_name,recording_mode,requester,recipient_person,on_behalf,note,created_at';
const MOVEMENT_COLUMNS = 'id,company_id,document_id,item_id,location_id,destination_id,quantity,allocations,created_at';

export const firstAidJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });

export function firstAidFailure(error: unknown) {
  if (error instanceof AccessError || error instanceof FirstAidInputError) return firstAidJson({ error: error.message }, error.status);
  const e = error as { code?: string; message?: string };
  if (e?.code === 'P0001') return firstAidJson({ error: String(e.message || 'ตรวจสอบข้อมูลรายการอีกครั้ง').slice(0, 200) }, 400);
  if (e?.code === '23505' || e?.code === '40001' || e?.code === '40P01') return firstAidJson({ error: 'ข้อมูลเปลี่ยนแปลงหรือมีรายการซ้ำ กรุณาโหลดใหม่แล้วลองอีกครั้ง' }, 409);
  if (['23503', '23514', '22P02', '22007', '22008'].includes(e?.code || '')) return firstAidJson({ error: 'ข้อมูลไม่ถูกต้อง หรือรายการไม่อยู่ในบริษัทนี้' }, 400);
  console.error('First aid API failed', { code: e?.code || 'unknown' });
  return firstAidJson({ error: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' }, 500);
}

export async function firstAidActor(request: NextRequest, write = false) {
  const actor = await requireModuleActor(request, 'first-aid', 'First Aid & Medicine Control');
  const companyId = request.nextUrl.searchParams.get('company_id') || (!actor.isAdmin ? actor.companyId : '');
  assertCompany(actor, companyId, true);
  if (write) assertSameOrigin(request);
  return { actor, companyId };
}

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

function checkOne<T>(result: { data: T; error: unknown }): NonNullable<T> {
  const data = check(result);
  if (data == null) throw new FirstAidInputError('ไม่พบรายการที่ต้องการ', 404);
  return data as NonNullable<T>;
}

async function allRows(db: DB, table: string, columns: string, companyId: string, filters: Record<string, string | boolean> = {}): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from(table).select(columns).eq('company_id', companyId).order('id').range(offset, offset + 999);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const page = check(await query) || [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function companyEmployees(db: DB, companyId: string): Promise<FirstAidEmployee[]> {
  const company = await allRows(db, 'company_employees', 'id,emp_code,first_name,last_name,department', companyId, { is_active: true });
  const ppe = await allRows(db, 'ppe_employees', 'id,employee_code,name,department', companyId, { is_active: true });
  const seen = new Set<string>();
  const result: FirstAidEmployee[] = [];
  for (const row of company) {
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    if (!name) continue;
    const code = String(row.emp_code || '');
    seen.add(code.toLocaleLowerCase() || name.toLocaleLowerCase());
    result.push({ id: `company:${row.id}`, code, name, department: String(row.department || '') });
  }
  for (const row of ppe) {
    const name = String(row.name || '').trim(); const code = String(row.employee_code || '');
    if (!name || seen.has(code.toLocaleLowerCase() || name.toLocaleLowerCase())) continue;
    seen.add(code.toLocaleLowerCase() || name.toLocaleLowerCase());
    result.push({ id: `ppe:${row.id}`, code, name, department: String(row.department || '') });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

/** Department names only (no people) — from the company's employee registers, for the chips on the QR page. */
export async function companyDepartments(db: DB, companyId: string): Promise<string[]> {
  const [a, b] = await Promise.all([
    db.from('company_employees').select('department').eq('company_id', companyId).eq('is_active', true).limit(2000),
    db.from('ppe_employees').select('department').eq('company_id', companyId).eq('is_active', true).limit(2000),
  ]);
  const names = new Map<string, number>();
  for (const row of [...(check(a) || []), ...(check(b) || [])] as Row[]) { const d = String(row.department || '').trim(); if (d) names.set(d, (names.get(d) || 0) + 1); }
  return [...names.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'th')).map(([d]) => d).slice(0, 40);
}

export function mapLocation(row: Row) {
  const type = String(row.type || 'ตู้ปฐมพยาบาล');
  return { id: row.id, name: row.name, type, area: row.area || '', issueMode: row.issue_mode, lastChecked: row.last_checked, inspectionIssue: row.inspection_issue, hasPublicLink: !!row.public_token_hash, requireRequester: !!row.require_requester, icon: type.includes('กระเป๋า') ? 'briefcase-medical' : type.includes('คลัง') ? 'package' : 'building', isRegister: type === FA_REGISTER_TYPE };
}
/** Fallback pictogram when no picture was set: from unit/category/name. */
export function guessIcon(row: { name?: string; category?: string; unit?: string }): FaIcon {
  const name = String(row.name || '').toLowerCase(); const unit = String(row.unit || ''); const category = String(row.category || '');
  if (/mask|หน้ากาก/.test(name)) return 'mask';
  if (/ถุงมือ|glove/.test(name)) return 'glove';
  if (/plast|พลาสเตอร์|transpore|micropore|tape|เทป/.test(name)) return 'plaster';
  if (/gauze|ก๊อซ|bandage|ผ้า|สำลี|cotton/.test(name)) return 'gauze';
  if (/cream|ครีม|gel|เจล|ointment|ขี้ผึ้ง/.test(name) || unit === 'หลอด') return 'cream';
  if (unit === 'ซอง') return 'sachet';
  if (unit === 'ขวด' || /syrup|solution|น้ำ|drop|หยอด|spray|สเปรย์/.test(name)) return 'bottle';
  if (unit === 'เม็ด' || unit === 'แคปซูล' || category === 'ยา') return 'pill';
  if (category === 'อุปกรณ์' || unit === 'เครื่อง' || unit === 'อัน') return 'device';
  return 'other';
}
function mapItem(row: Row, imageUrl: string | null = null): FaItem {
  return { id: row.id, name: row.name, generic: row.generic || '', description: row.description || '', category: row.category, unit: row.unit, min: row.min, trackExpiry: row.track_expiry, icon: (row.icon as FaIcon) || guessIcon(row), imageUrl, hasImage: !!row.image_path, imageSource: row.image_source || '' };
}
/** Signed read URLs for every item picture (private bucket), in one storage call. */
async function itemImageUrls(db: DB, rows: Row[]): Promise<Map<string, string>> {
  const paths = rows.map(row => row.image_path).filter((p): p is string => !!p);
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await db.storage.from(FA_IMAGE_BUCKET).createSignedUrls(paths, IMAGE_URL_SECONDS);
  for (const entry of data || []) if (entry.signedUrl && entry.path) map.set(entry.path, entry.signedUrl);
  return map;
}
async function mapItems(db: DB, rows: Row[]): Promise<FaItem[]> {
  const urls = await itemImageUrls(db, rows);
  return rows.map(row => mapItem(row, row.image_path ? urls.get(row.image_path) || null : null));
}
function mapLot(row: Row) { return { id: row.id, itemId: row.item_id, locationId: row.location_id, code: row.code, expiry: row.expiry, quantity: row.quantity }; }
function mapThreshold(row: Row) { return { itemId: row.item_id, locationId: row.location_id, min: row.min }; }
function mapInspection(row: Row) { return { id: row.id, locationId: row.location_id, date: row.date, notes: row.notes || '', hasIssue: row.has_issue, ready: row.ready ?? !row.has_issue, lowItems: row.low_items || [], expiredLots: row.expired_lots || [] }; }
function mapVisit(row: Row) { return { id: row.id, date: row.date, person: row.person, service: row.service, note: row.note || '', timeIn: row.time_in || '', timeOut: row.time_out || '' }; }

export function mapEvent(movement: Row, document: Row) {
  const imported = String(document.actor_key || '').startsWith('excel-import:');
  return {
    id: movement.id, documentId: document.id, date: document.date, datePrecision: String(document.actor_key || '').startsWith('excel-import:month:') ? 'month' : 'day', kind: document.kind, itemId: movement.item_id,
    locationId: movement.location_id, destinationId: movement.destination_id || undefined, quantity: movement.quantity,
    allocations: movement.allocations || [], requester: document.kind === 'issue' ? document.requester || null : null, recipientPerson: document.kind === 'issue' ? document.recipient_person || null : null,
    recipient: document.recipient_person?.name || '', onBehalf: !!document.on_behalf, note: document.note || '',
    recordedBy: { id: document.actor_key, name: document.actor_name, identityMethod: imported ? 'legacy_import' : document.recording_mode === 'self_service' ? 'self_declared' : 'authenticated_session' },
    recordingMode: imported ? 'legacy' : document.recording_mode, recordedAt: document.created_at,
  };
}

async function companyInfo(db: DB, companyId: string) {
  const [company, settings] = await Promise.all([
    db.from('company_settings').select('company_id,company_name,full_name').eq('company_id', companyId).maybeSingle(),
    db.from('fa_company_settings').select('infirmary_enabled').eq('company_id', companyId).maybeSingle(),
  ]);
  const row = check(company); const config = check(settings);
  return { id: companyId, name: row?.full_name || row?.company_name || companyId.toUpperCase(), short: row?.company_name || companyId.toUpperCase(), infirmary: !!config?.infirmary_enabled };
}

export async function loadFirstAidState(companyId: string, actor: ToolsActor) {
  const db = getSupabaseServer();
  const [company, locations, items, thresholds, lots, movementResult, inspectionResult, visits, employees, usageResult] = await Promise.all([
    companyInfo(db, companyId), allRows(db, 'fa_locations', LOCATION_COLUMNS, companyId),
    allRows(db, 'fa_items', ITEM_COLUMNS, companyId), allRows(db, 'fa_location_items', 'id,item_id,location_id,min', companyId),
    allRows(db, 'fa_lots', 'id,item_id,location_id,code,expiry,quantity', companyId),
    db.from('fa_movements').select(MOVEMENT_COLUMNS).eq('company_id', companyId).order('created_at', { ascending: false }).limit(501),
    db.from('fa_inspections').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
    actor.isAdmin ? db.from('fa_visits').select('id,date,person,service,note,time_in,time_out').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200).then(check) : Promise.resolve([]),
    companyEmployees(db, companyId), db.rpc('fa_usage_summary', { p_company_id: companyId }),
  ]);
  const departments = await companyDepartments(db, companyId);
  const movements: Row[] = (check(movementResult) || []).slice(0, 500);
  const documentIds = [...new Set(movements.map(row => row.document_id))]; const documents: Row[] = [];
  for (let offset = 0; offset < documentIds.length; offset += 100) documents.push(...check(await db.from('fa_documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId).in('id', documentIds.slice(offset, offset + 100))) || []);
  const byId = new Map(documents.map(row => [row.id, row]));
  const [activeItems, archivedItems] = await Promise.all([mapItems(db, items.filter(row => row.active)), mapItems(db, items.filter(row => !row.active))]);
  return {
    schemaVersion: 4, asOf: bangkokDate(), company, locations: locations.filter(row => row.active).map(mapLocation), archivedLocations: locations.filter(row => !row.active).map(mapLocation), items: activeItems, archivedItems, thresholds: thresholds.map(mapThreshold), lots: lots.map(mapLot),
    events: movements.filter(row => byId.has(row.document_id)).map(row => mapEvent(row, byId.get(row.document_id)!)),
    inspections: (check(inspectionResult) || []).map(mapInspection), visits: (visits || []).map(mapVisit), employees, departments,
    session: { id: `${actor.accountTable}:${actor.id}`, name: actor.displayName, identityMethod: 'authenticated_session' },
    permissions: { canManage: true, canClinical: actor.isAdmin, public: false }, usageSummary: check(usageResult), historyLimit: 500, historyHasMore: (movementResult.data?.length || 0) > 500,
  };
}

async function resolvePerson(db: DB, companyId: string, id: string | undefined, supplied: unknown): Promise<PersonSnapshot> {
  if (!id || id === 'manual') return manualPerson(supplied);
  const match = /^(company|ppe):(.+)$/.exec(id);
  if (!match) throw new FirstAidInputError('รหัสพนักงานไม่ถูกต้อง');
  const employeeId = uuid(match[2], 'รหัสพนักงาน');
  if (match[1] === 'company') {
    const row = check(await db.from('company_employees').select('id,emp_code,first_name,last_name,department').eq('company_id', companyId).eq('id', employeeId).eq('is_active', true).maybeSingle());
    if (!row) throw new FirstAidInputError('ไม่พบพนักงานในบริษัทนี้');
    return { id, code: row.emp_code || '', name: `${row.first_name || ''} ${row.last_name || ''}`.trim(), department: row.department || 'ไม่ได้ระบุแผนก', identityMethod: 'self_declared' };
  }
  const row = check(await db.from('ppe_employees').select('id,employee_code,name,department').eq('company_id', companyId).eq('id', employeeId).eq('is_active', true).maybeSingle());
  if (!row) throw new FirstAidInputError('ไม่พบพนักงานในบริษัทนี้');
  return { id, code: row.employee_code || '', name: row.name, department: row.department || 'ไม่ได้ระบุแผนก', identityMethod: 'self_declared' };
}

/** The person collecting is optional since the 6 Nov 2026 redesign: a blank name is stored as a placeholder, a bare name gets a placeholder department. */
function optionalPerson(supplied: unknown): PersonSnapshot {
  const person = supplied && typeof supplied === 'object' && !Array.isArray(supplied) ? (supplied as Record<string, unknown>) : {};
  const name = text(person.name, 'ชื่อผู้เบิก / ผู้รับ', 120, false);
  if (!name) return { id: null, name: FA_ANON_NAME, department: FA_ANON_DEPARTMENT, identityMethod: 'self_declared' };
  return { id: null, name, department: text(person.department, 'หน่วยงาน / บริษัท', 120, false) || FA_ANON_DEPARTMENT, code: text(person.code, 'รหัสพนักงาน', 40, false), identityMethod: 'self_declared' };
}
async function transactionPayload(db: DB, companyId: string, input: TransactionInput, publicRequest = false) {
  let requester: PersonSnapshot | undefined; let recipientPerson: PersonSnapshot | undefined;
  if (input.kind === 'issue') {
    const supplied = input.requesterPerson || input.requester;
    if (publicRequest) {
      if (input.requesterId && input.requesterId !== 'manual') throw new FirstAidInputError('หน้านี้ให้ระบุชื่อผู้เบิกด้วยตนเอง');
      if (input.onBehalf && input.recipientId && input.recipientId !== 'manual') throw new FirstAidInputError('กรุณาระบุชื่อผู้รับจริงด้วยตนเอง');
      requester = optionalPerson(supplied);
      recipientPerson = input.onBehalf ? manualPerson(input.recipientPerson) : requester;
    } else if (!input.requesterId && !supplied) {
      requester = optionalPerson(undefined); recipientPerson = requester;
    } else {
      requester = input.requesterId && input.requesterId !== 'manual' ? await resolvePerson(db, companyId, input.requesterId, supplied) : optionalPerson(supplied);
      recipientPerson = input.onBehalf ? await resolvePerson(db, companyId, input.recipientId, input.recipientPerson) : requester;
    }
  }
  return { kind: input.kind, locationId: input.locationId, destinationId: input.destinationId || null, date: input.date, lines: input.lines, expiry: input.expiry || null, lotCode: input.lotCode || '', requester: requester || null, recipientPerson: recipientPerson || null, onBehalf: !!input.onBehalf, note: input.note || '', mode: publicRequest ? 'self_service' : 'staff' };
}

async function assertRequesterRule(db: DB, companyId: string, locationId: string, requester: PersonSnapshot | null) {
  const row = check(await db.from('fa_locations').select('require_requester').eq('company_id', companyId).eq('id', locationId).maybeSingle()) as Row | null;
  if (row?.require_requester && (!requester || requester.name === FA_ANON_NAME)) throw new FirstAidInputError('จุดนี้ต้องระบุชื่อผู้เบิกยา');
}

function transactionReceipt(result: Row) {
  if (!result?.document || !Array.isArray(result.movements)) throw new Error('Invalid transaction response');
  return { documentId: result.document.id, events: result.movements.map((movement: Row) => mapEvent(movement, result.document)) };
}

export async function postFirstAidTransaction(request: NextRequest) {
  const { actor, companyId } = await firstAidActor(request, true);
  const input = parseTransaction(await readJsonBody(request)); const db = getSupabaseServer();
  const payload = await transactionPayload(db, companyId, input);
  if (input.kind === 'issue') await assertRequesterRule(db, companyId, input.locationId, payload.requester);
  const data = check(await db.rpc('fa_post_transaction', { p_company_id: companyId, p_actor_key: `${actor.accountTable}:${actor.id}`, p_actor_name: actor.displayName, p_idempotency_key: input.idempotencyKey, p_payload: payload, p_public_token_hash: null }));
  return transactionReceipt(data);
}

/**
 * Self-service picks never choose a lot on the phone. The database insists on an explicit lot when a point
 * holds several lots of one item, so allocate FEFO here and send one line per lot (max 8 lines per document).
 */
async function splitLinesByLot(db: DB, companyId: string, locationId: string, lines: TransactionLine[]): Promise<TransactionLine[]> {
  const today = bangkokDate(); const out: TransactionLine[] = [];
  const itemIds = [...new Set(lines.map(line => line.itemId))];
  const items: Row[] = check(await db.from('fa_items').select('id,track_expiry').eq('company_id', companyId).in('id', itemIds)) || [];
  const lots: Row[] = check(await db.from('fa_lots').select('id,item_id,expiry,quantity,created_at').eq('company_id', companyId).eq('location_id', locationId).in('item_id', itemIds).gt('quantity', 0)) || [];
  for (const line of lines) {
    if (line.lotId) { out.push(line); continue; }
    const tracked = items.find(row => row.id === line.itemId)?.track_expiry !== false;
    const usable = lots.filter(lot => lot.item_id === line.itemId && (lot.expiry ? lot.expiry >= today : !tracked))
      .sort((a, b) => String(a.expiry || '9999-12-31').localeCompare(String(b.expiry || '9999-12-31')) || String(a.created_at).localeCompare(String(b.created_at)));
    if (usable.length <= 1) { out.push(line); continue; }
    let remaining = line.quantity;
    for (const lot of usable) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(lot.quantity));
      out.push({ itemId: line.itemId, quantity: take, lotId: lot.id }); remaining -= take;
    }
    if (remaining > 0) throw new FirstAidInputError('ยอดพร้อมใช้ไม่เพียงพอ');
  }
  if (out.length > 8) throw new FirstAidInputError('หยิบได้ไม่เกิน 8 รายการต่อครั้ง');
  return out;
}

function tokenHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new FirstAidInputError('ไม่พบลิงก์จุดปฐมพยาบาลนี้', 404);
  return createHash('sha256').update(token).digest('hex');
}

async function publicLocation(db: DB, token: string): Promise<Row> {
  const row = check(await db.from('fa_locations').select(LOCATION_COLUMNS).eq('public_token_hash', tokenHash(token)).eq('active', true).maybeSingle());
  if (!row) throw new FirstAidInputError('ลิงก์นี้หมดอายุหรือถูกยกเลิกแล้ว', 404);
  if (row.issue_mode !== 'self_service') throw new FirstAidInputError('จุดนี้ให้เจ้าหน้าที่เป็นผู้บันทึก กรุณาติดต่อเจ้าหน้าที่ประจำจุด', 403);
  return row;
}

export async function loadPublicFirstAidState(token: string) {
  const db = getSupabaseServer(); const location = await publicLocation(db, token); const companyId: string = location.company_id;
  const [company, lots, thresholds, departments] = await Promise.all([
    companyInfo(db, companyId), allRows(db, 'fa_lots', 'id,item_id,location_id,code,expiry,quantity', companyId, { location_id: location.id }),
    allRows(db, 'fa_location_items', 'id,item_id,location_id,min', companyId, { location_id: location.id }), companyDepartments(db, companyId),
  ]);
  const ids = [...new Set([...lots.map(row => row.item_id), ...thresholds.map(row => row.item_id)])];
  const items: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) items.push(...check(await db.from('fa_items').select(ITEM_COLUMNS).eq('company_id', companyId).eq('active', true).in('id', ids.slice(offset, offset + 100))) || []);
  return { schemaVersion: 4, asOf: bangkokDate(), company: { name: company.name, short: company.short, infirmary: false }, locations: [mapLocation({ ...location, public_token_hash: null })], items: await mapItems(db, items), lots: lots.map(mapLot), thresholds: thresholds.map(mapThreshold), departments, events: [], inspections: [], visits: [], employees: [], permissions: { canManage: false, canClinical: false, public: true } };
}

export async function postPublicFirstAidTransaction(request: NextRequest, token: string) {
  assertSameOrigin(request);
  const db = getSupabaseServer(); const location = await publicLocation(db, token);
  const input = parseTransaction(await readJsonBody(request));
  if (input.kind !== 'issue' || input.locationId !== location.id) throw new FirstAidInputError('ลิงก์นี้ใช้บันทึกการหยิบใช้ได้เฉพาะจุดที่ระบุ', 403);
  input.lines = await splitLinesByLot(db, location.company_id, location.id, input.lines);
  const payload = await transactionPayload(db, location.company_id, input, true);
  if (location.require_requester && (!payload.requester || payload.requester.name === FA_ANON_NAME)) throw new FirstAidInputError('จุดนี้ต้องระบุชื่อผู้เบิกยา');
  const data = check(await db.rpc('fa_post_transaction', { p_company_id: location.company_id, p_actor_key: 'self_declared', p_actor_name: payload.requester?.name || '', p_idempotency_key: input.idempotencyKey, p_payload: payload, p_public_token_hash: tokenHash(token) }));
  return transactionReceipt(data);
}

async function scopedRow(db: DB, table: string, companyId: string, id: unknown) {
  const validId = uuid(id);
  const row = check(await db.from(table).select('id').eq('company_id', companyId).eq('id', validId).maybeSingle());
  if (!row) throw new FirstAidInputError('ไม่พบรายการในบริษัทนี้', 404);
  return validId;
}

async function createMasterRow(db: DB, table: 'fa_items' | 'fa_locations' | 'fa_visits', companyId: string, createId: unknown, values: Record<string, unknown>) {
  const id = createId == null ? undefined : uuid(createId, 'รหัสสร้างรายการ');
  if (id) {
    const existing = check(await db.from(table).select('id,' + Object.keys(values).join(',')).eq('company_id', companyId).eq('id', id).maybeSingle()) as Row | null;
    if (existing) {
      if (Object.keys(values).some(key => ['time_in', 'time_out'].includes(key) && existing[key] && values[key] ? String(existing[key]).slice(0, 5) !== String(values[key]).slice(0, 5) : existing[key] !== values[key])) throw new FirstAidInputError('รหัสนี้ถูกใช้สร้างรายการด้วยข้อมูลอื่นแล้ว กรุณาโหลดใหม่', 409);
      return { id };
    }
  }
  return checkOne(await db.from(table).insert({ ...(id ? { id } : {}), company_id: companyId, ...values }).select('id').single());
}

export async function manageFirstAid(request: NextRequest) {
  const { actor, companyId } = await firstAidActor(request, true); const db = getSupabaseServer();
  const body = record(await readJsonBody(request)); const action = text(body.action, 'การดำเนินการ', 40);
  if (!['location', 'item', 'thresholds', 'settings', 'inspection', 'visit', 'rotate-token', 'image-sign', 'image-from-url', 'image-clear', 'lot-expiry', 'count', 'archive-item', 'archive-location'].includes(action)) throw new FirstAidInputError('ไม่รองรับการดำเนินการนี้');
  if (action === 'visit' && !actor.isAdmin) throw new AccessError('เฉพาะผู้ดูแลที่มีสิทธิ์ข้อมูลบริการห้องพยาบาล');
  // Authenticated writes initialize only their selected company's configuration.
  check(await db.from('fa_company_settings').upsert({ company_id: companyId }, { onConflict: 'company_id', ignoreDuplicates: true }));
  if (action === 'location') {
    allowedKeys(body, ['action', 'id', 'createId', 'name', 'type', 'area', 'issueMode', 'requireRequester']);
    if (body.id && body.createId) throw new FirstAidInputError('เลือกแก้ไขหรือสร้างรายการอย่างใดอย่างหนึ่ง');
    if (!['controlled', 'self_service'].includes(String(body.issueMode))) throw new FirstAidInputError('วิธีบันทึกการเบิกไม่ถูกต้อง');
    const values = { name: text(body.name, 'ชื่อจุดปฐมพยาบาล'), type: text(body.type, 'ประเภทจุด', 80), area: text(body.area, 'พื้นที่', 200, false), issue_mode: body.issueMode, require_requester: bool(body.requireRequester, false) };
    const id = body.id ? await scopedRow(db, 'fa_locations', companyId, body.id) : null;
    const row = id ? checkOne(await db.from('fa_locations').update(values).eq('company_id', companyId).eq('id', id).select('id').single()) : await createMasterRow(db, 'fa_locations', companyId, body.createId, values);
    return { ok: true, id: row.id };
  }
  if (action === 'item') {
    allowedKeys(body, ['action', 'id', 'createId', 'name', 'generic', 'category', 'unit', 'min', 'trackExpiry', 'description', 'icon']);
    if (body.id && body.createId) throw new FirstAidInputError('เลือกแก้ไขหรือสร้างรายการอย่างใดอย่างหนึ่ง');
    const icon = text(body.icon, 'ไอคอน', 20, false);
    if (icon && !FA_ICONS.some(entry => entry.id === icon)) throw new FirstAidInputError('ไอคอนไม่ถูกต้อง');
    const values = { name: text(body.name, 'ชื่อรายการ'), generic: text(body.generic, 'รายละเอียด', 200, false), category: text(body.category, 'หมวดหมู่', 80), unit: text(body.unit, 'หน่วยนับ', 40), min: integer(body.min ?? 0, 'จำนวนขั้นต่ำ'), track_expiry: bool(body.trackExpiry, true), description: text(body.description, 'คำอธิบายสั้น', 160, false), icon };
    const id = body.id ? await scopedRow(db, 'fa_items', companyId, body.id) : null;
    if (id) {
      const existing = checkOne(await db.from('fa_items').select('track_expiry,unit').eq('company_id', companyId).eq('id', id).single());
      if (existing.unit !== values.unit) {
        const [lots, movements] = await Promise.all([
          db.from('fa_lots').select('id').eq('company_id', companyId).eq('item_id', id).limit(1),
          db.from('fa_movements').select('id').eq('company_id', companyId).eq('item_id', id).limit(1),
        ]);
        if (check(lots)?.length || check(movements)?.length) throw new FirstAidInputError('รายการนี้มีล็อตหรือประวัติการเคลื่อนไหวแล้ว หากเปลี่ยนหน่วยนับให้สร้างรายการใหม่', 409);
      }
      if (!existing.track_expiry && values.track_expiry) {
        const missing = check(await db.from('fa_lots').select('id').eq('company_id', companyId).eq('item_id', id).is('expiry', null).gt('quantity', 0).limit(1));
        if (missing?.length) throw new FirstAidInputError('มีล็อตที่ยังไม่ระบุวันหมดอายุ กรุณาจัดการก่อนเปิดติดตามวันหมดอายุ');
      }
    }
    const row = id ? checkOne(await db.from('fa_items').update(values).eq('company_id', companyId).eq('id', id).select('id').single()) : await createMasterRow(db, 'fa_items', companyId, body.createId, values);
    return { ok: true, id: row.id };
  }
  if (action === 'thresholds') {
    allowedKeys(body, ['action', 'locationId', 'thresholds']); const locationId = await scopedRow(db, 'fa_locations', companyId, body.locationId);
    if (!Array.isArray(body.thresholds) || !body.thresholds.length || body.thresholds.length > 200) throw new FirstAidInputError('กำหนดเกณฑ์ได้สูงสุด 200 รายการต่อครั้ง');
    const rows = body.thresholds.map(value => { const row = record(value); allowedKeys(row, ['itemId', 'min']); return { company_id: companyId, location_id: locationId, item_id: uuid(row.itemId), min: integer(row.min, 'จำนวนขั้นต่ำ') }; });
    if (new Set(rows.map(row => row.item_id)).size !== rows.length) throw new FirstAidInputError('รายการเกณฑ์ซ้ำกัน');
    check(await db.rpc('fa_save_thresholds', { p_company_id: companyId, p_location_id: locationId, p_items: rows.map(row => ({ itemId: row.item_id, min: row.min })) }));
    return { ok: true };
  }
  if (action === 'settings') {
    allowedKeys(body, ['action', 'infirmary']); if (!actor.isAdmin) throw new AccessError('เฉพาะผู้ดูแลระบบสามารถเปิดส่วนบริการห้องพยาบาล');
    check(await db.from('fa_company_settings').update({ infirmary_enabled: bool(body.infirmary) }).eq('company_id', companyId)); return { ok: true };
  }
  if (action === 'inspection') {
    allowedKeys(body, ['action', 'createId', 'locationId', 'notes', 'hasIssue']);
    const createId = uuid(body.createId, 'รหัสบันทึกผลตรวจ');
    const locationId = await scopedRow(db, 'fa_locations', companyId, body.locationId);
    const result = check(await db.rpc('fa_record_inspection', { p_company_id: companyId, p_location_id: locationId, p_actor_key: `${actor.accountTable}:${actor.id}`, p_notes: text(body.notes, 'หมายเหตุ', 500, false), p_has_issue: bool(body.hasIssue, false), p_create_id: createId }));
    return { ok: true, inspection: result };
  }
  if (action === 'visit') {
    allowedKeys(body, ['action', 'createId', 'date', 'person', 'service', 'note', 'timeIn', 'timeOut']);
    const settings = checkOne(await db.from('fa_company_settings').select('infirmary_enabled').eq('company_id', companyId).single());
    if (!settings.infirmary_enabled) throw new FirstAidInputError('บริษัทยังไม่ได้เปิดบริการห้องพยาบาล');
    const date = calendarDate(body.date); if (date > bangkokDate()) throw new FirstAidInputError('ไม่อนุญาตให้บันทึกบริการล่วงหน้า');
    const time = (value: unknown) => { if (value == null || value === '') return null; if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new FirstAidInputError('เวลาไม่ถูกต้อง'); return value; };
    const row = await createMasterRow(db, 'fa_visits', companyId, body.createId, { date, person: text(body.person, 'ชื่อผู้ใช้บริการ'), service: text(body.service, 'ประเภทบริการ', 80), note: text(body.note, 'บันทึกการดูแล', 2000, false), time_in: time(body.timeIn), time_out: time(body.timeOut), actor_key: `${actor.accountTable}:${actor.id}` });
    return { ok: true, id: row.id };
  }
  if (action === 'archive-item' || action === 'archive-location') {
    allowedKeys(body, ['action', 'id', 'active']);
    const table = action === 'archive-item' ? 'fa_items' : 'fa_locations';
    const id = await scopedRow(db, table, companyId, body.id);
    check(await db.from(table).update({ active: bool(body.active, false) }).eq('company_id', companyId).eq('id', id));
    return { ok: true };
  }
  if (action === 'image-sign') {
    allowedKeys(body, ['action', 'itemId', 'ext']);
    const itemId = await scopedRow(db, 'fa_items', companyId, body.itemId);
    const ext = ['jpg', 'webp', 'png'].includes(String(body.ext)) ? String(body.ext) : 'webp';
    const path = `${companyId}/${itemId}/${randomBytes(8).toString('hex')}.${ext}`;
    const signed = checkOne(await db.storage.from(FA_IMAGE_BUCKET).createSignedUploadUrl(path));
    return { ok: true, path, signedUrl: signed.signedUrl, token: signed.token };
  }
  if (action === 'image-from-url' || action === 'image-clear') {
    allowedKeys(body, ['action', 'itemId', 'url', 'path', 'source']);
    const itemId = await scopedRow(db, 'fa_items', companyId, body.itemId);
    const current = checkOne(await db.from('fa_items').select('image_path').eq('company_id', companyId).eq('id', itemId).single());
    let imagePath: string | null = null; let source = '';
    if (action === 'image-from-url') {
      if (body.path) {
        // Picture already uploaded through image-sign: just register it.
        imagePath = text(body.path, 'ที่อยู่รูป', 300); source = text(body.source, 'ที่มาของรูป', 500, false) || 'upload';
        if (!imagePath.startsWith(`${companyId}/${itemId}/`)) throw new FirstAidInputError('ที่อยู่รูปไม่ถูกต้อง');
      } else {
        imagePath = await importImageFromUrl(db, companyId, itemId, text(body.url, 'ลิงก์รูป', 2000));
        source = String(body.url).slice(0, 500);
      }
    }
    check(await db.from('fa_items').update({ image_path: imagePath, image_source: source, image_updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', itemId));
    if (current.image_path && current.image_path !== imagePath) await db.storage.from(FA_IMAGE_BUCKET).remove([current.image_path]).catch(() => undefined);
    const url = imagePath ? (await db.storage.from(FA_IMAGE_BUCKET).createSignedUrl(imagePath, IMAGE_URL_SECONDS)).data?.signedUrl || null : null;
    return { ok: true, imageUrl: url, hasImage: !!imagePath, imageSource: source };
  }
  if (action === 'lot-expiry') {
    // Confirm (or correct) the expiry of a lot; lots with the same code+expiry at the point are merged.
    allowedKeys(body, ['action', 'lotId', 'expiry']);
    const lotId = await scopedRow(db, 'fa_lots', companyId, body.lotId);
    const expiry = body.expiry == null || body.expiry === '' ? null : calendarDate(body.expiry, 'วันหมดอายุ');
    const lot = checkOne(await db.from('fa_lots').select('id,item_id,location_id,code,quantity,expiry').eq('company_id', companyId).eq('id', lotId).single());
    if (expiry === null) {
      const item = checkOne(await db.from('fa_items').select('track_expiry').eq('company_id', companyId).eq('id', lot.item_id).single());
      if (item.track_expiry) throw new FirstAidInputError('รายการนี้ติดตามวันหมดอายุ กรุณาระบุวันที่ หรือปิดการติดตามที่ทะเบียนยา');
    }
    let twinQuery = db.from('fa_lots').select('id,quantity').eq('company_id', companyId).eq('location_id', lot.location_id).eq('item_id', lot.item_id).eq('code', lot.code).neq('id', lotId);
    twinQuery = expiry === null ? twinQuery.is('expiry', null) : twinQuery.eq('expiry', expiry);
    const twin = check(await twinQuery.maybeSingle()) as Row | null;
    if (twin) {
      check(await db.from('fa_lots').update({ quantity: Number(twin.quantity) + Number(lot.quantity) }).eq('company_id', companyId).eq('id', twin.id));
      check(await db.from('fa_lots').update({ quantity: 0 }).eq('company_id', companyId).eq('id', lotId));
    } else check(await db.from('fa_lots').update({ expiry }).eq('company_id', companyId).eq('id', lotId));
    return { ok: true };
  }
  if (action === 'count') return recordStockCount(db, companyId, actor, body);
  allowedKeys(body, ['action', 'locationId']); const locationId = await scopedRow(db, 'fa_locations', companyId, body.locationId);
  const point = checkOne(await db.from('fa_locations').select('issue_mode').eq('company_id', companyId).eq('id', locationId).single());
  if (point.issue_mode !== 'self_service') throw new FirstAidInputError('เปิดรูปแบบผู้เบิกบันทึกเองก่อนสร้างลิงก์');
  const token = randomBytes(32).toString('hex');
  check(await db.from('fa_locations').update({ public_token_hash: tokenHash(token) }).eq('company_id', companyId).eq('id', locationId));
  const url = new URL(`/first-aid/take/${token}`, request.nextUrl.origin).href;
  const qrSvg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 3, width: 400 });
  return { ok: true, url, qrSvg };
}


/** Download a picture the user pointed at, shrink it to ≤ 600 px WebP on the server, and store it in the private bucket. */
async function importImageFromUrl(db: DB, companyId: string, itemId: string, url: string): Promise<string> {
  let target: URL;
  try { target = new URL(url); } catch { throw new FirstAidInputError('ลิงก์รูปไม่ถูกต้อง'); }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new FirstAidInputError('รองรับเฉพาะลิงก์ http/https');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/.test(target.hostname)) throw new FirstAidInputError('ลิงก์รูปไม่ถูกต้อง');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try { response = await fetch(target.href, { signal: controller.signal, redirect: 'follow', headers: { accept: 'image/*,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 (compatible; EA-SHE-Tools/1.0)' } }); }
  catch { throw new FirstAidInputError('ดาวน์โหลดรูปจากลิงก์ไม่สำเร็จ'); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new FirstAidInputError(`ดาวน์โหลดรูปไม่สำเร็จ (HTTP ${response.status})`);
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > 8 * 1024 * 1024) throw new FirstAidInputError('ไฟล์รูปใหญ่เกิน 8 MB');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 8 * 1024 * 1024) throw new FirstAidInputError('ไฟล์รูปใหญ่เกิน 8 MB');
  const sharp = (await import('sharp')).default;
  let output: Buffer;
  try { output = await sharp(bytes, { failOn: 'none', limitInputPixels: 40_000_000 }).rotate().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); }
  catch { throw new FirstAidInputError('ลิงก์นี้ไม่ใช่ไฟล์รูป (ต้องเป็นลิงก์ตรงไปยังไฟล์ .jpg/.png/.webp)'); }
  const path = `${companyId}/${itemId}/${randomBytes(8).toString('hex')}.webp`;
  const { error } = await db.storage.from(FA_IMAGE_BUCKET).upload(path, output, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

/** Transactions of a date range (for the daily log, monthly tally and per-item history). */
export async function loadFirstAidHistory(request: NextRequest) {
  const { companyId } = await firstAidActor(request); const db = getSupabaseServer();
  const params = request.nextUrl.searchParams;
  const from = calendarDate(params.get('from') || bangkokDate(), 'วันที่เริ่ม'); const to = calendarDate(params.get('to') || bangkokDate(), 'วันที่สิ้นสุด');
  if (from > to) throw new FirstAidInputError('ช่วงวันที่ไม่ถูกต้อง');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new FirstAidInputError('เลือกช่วงไม่เกิน 13 เดือน');
  const itemId = params.get('item_id') ? uuid(params.get('item_id')) : null;
  const locationId = params.get('location_id') ? uuid(params.get('location_id'), 'รหัสจุด') : null;
  let docQuery = db.from('fa_documents').select(DOCUMENT_COLUMNS).eq('company_id', companyId).gte('date', from).lte('date', to).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(4000);
  if (locationId) docQuery = docQuery.eq('location_id', locationId);
  const documents: Row[] = check(await docQuery) || [];
  const movements: Row[] = [];
  const ids = documents.map(row => row.id);
  for (let offset = 0; offset < ids.length; offset += 100) {
    let query = db.from('fa_movements').select(MOVEMENT_COLUMNS).eq('company_id', companyId).in('document_id', ids.slice(offset, offset + 100));
    if (itemId) query = query.eq('item_id', itemId);
    movements.push(...(check(await query) || []));
  }
  const byId = new Map(documents.map(row => [row.id, row]));
  const events = movements.filter(row => byId.has(row.document_id)).map(row => mapEvent(row, byId.get(row.document_id)!))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.recordedAt).localeCompare(String(a.recordedAt)));
  return { from, to, events, truncated: documents.length >= 4000 };
}

/**
 * Stock take: the counted quantity per item becomes the truth. Differences are posted as receive/dispose
 * documents through the same RPC as every other movement, expired lots are disposed, then the inspection is recorded.
 */
async function recordStockCount(db: DB, companyId: string, actor: ToolsActor, body: Record<string, unknown>) {
  allowedKeys(body, ['action', 'createId', 'locationId', 'date', 'lines', 'disposeLotIds', 'notes', 'hasIssue']);
  const input: FaCountInput = {
    createId: uuid(body.createId, 'รหัสบันทึกผลตรวจ'), locationId: await scopedRow(db, 'fa_locations', companyId, body.locationId), date: calendarDate(body.date),
    lines: [], disposeLotIds: [], notes: text(body.notes, 'หมายเหตุ', 500, false), hasIssue: bool(body.hasIssue, false),
  };
  if (input.date > bangkokDate()) throw new FirstAidInputError('ไม่อนุญาตให้บันทึกล่วงหน้า');
  if (!Array.isArray(body.lines) || body.lines.length > 400) throw new FirstAidInputError('รายการตรวจนับไม่ถูกต้อง');
  input.lines = body.lines.map(value => { const line = record(value); allowedKeys(line, ['itemId', 'counted', 'expiry']); return { itemId: uuid(line.itemId), counted: line.counted == null ? null : integer(line.counted, 'ยอดนับได้'), expiry: line.expiry ? calendarDate(line.expiry, 'วันหมดอายุ') : null }; });
  if (Array.isArray(body.disposeLotIds)) input.disposeLotIds = body.disposeLotIds.map(value => uuid(value, 'รหัสล็อต'));
  const today = bangkokDate(); const actorKey = `${actor.accountTable}:${actor.id}`;
  const items: Row[] = await allRows(db, 'fa_items', ITEM_COLUMNS, companyId, { active: true });
  const lots: Row[] = await allRows(db, 'fa_lots', 'id,item_id,location_id,code,expiry,quantity', companyId, { location_id: input.locationId });
  const post = (payload: Record<string, unknown>) => db.rpc('fa_post_transaction', { p_company_id: companyId, p_actor_key: actorKey, p_actor_name: actor.displayName, p_idempotency_key: randomUUIDv4(), p_payload: { mode: 'staff', onBehalf: false, requester: null, recipientPerson: null, destinationId: null, expiry: null, lotCode: '', note: '', ...payload }, p_public_token_hash: null });
  const results: { itemId: string; delta: number }[] = []; let disposedExpired = 0;
  // 1) expired lots the user ticked → dispose
  for (const lotId of input.disposeLotIds) {
    const lot = lots.find(row => row.id === lotId && Number(row.quantity) > 0);
    if (!lot) continue;
    check(await post({ kind: 'dispose', locationId: input.locationId, date: input.date, lines: [{ itemId: lot.item_id, quantity: Number(lot.quantity), lotId }], note: `ตรวจนับ ${input.date}: หมดอายุ ${lot.expiry || ''}`.trim() }));
    lot.quantity = 0; disposedExpired += 1;
  }
  // 2) counted quantities → receive (+) or dispose (−)
  for (const line of input.lines) {
    if (line.counted == null) continue;
    const item = items.find(row => row.id === line.itemId); if (!item) throw new FirstAidInputError('ไม่พบรายการยาในบริษัทนี้');
    const usable = lots.filter(row => row.item_id === line.itemId && Number(row.quantity) > 0 && (row.expiry ? row.expiry >= today : !item.track_expiry));
    const system = usable.reduce((sum, row) => sum + Number(row.quantity), 0);
    const delta = line.counted - system;
    if (delta === 0) continue;
    if (delta > 0) {
      let expiry = line.expiry || null;
      if (item.track_expiry && !expiry) expiry = usable.map(row => String(row.expiry)).sort().pop() || null;
      if (item.track_expiry && !expiry) throw new FirstAidInputError(`${item.name}: กรุณาระบุวันหมดอายุของจำนวนที่นับได้เกินระบบ`);
      check(await post({ kind: 'receive', locationId: input.locationId, date: input.date, lines: [{ itemId: line.itemId, quantity: delta }], expiry, lotCode: `COUNT-${input.date.replace(/-/g, '')}`, note: `ตรวจนับ ${input.date}: นับได้ ${line.counted} ระบบ ${system}` }));
    } else {
      check(await post({ kind: 'dispose', locationId: input.locationId, date: input.date, lines: [{ itemId: line.itemId, quantity: -delta }], note: `ตรวจนับ ${input.date}: นับได้ ${line.counted} ระบบ ${system} (ใช้ไปโดยไม่ได้บันทึก)` }));
    }
    results.push({ itemId: line.itemId, delta });
  }
  // 3) record the inspection itself
  const inspection = check(await db.rpc('fa_record_inspection', { p_company_id: companyId, p_location_id: input.locationId, p_actor_key: actorKey, p_notes: input.notes, p_has_issue: input.hasIssue, p_create_id: input.createId }));
  return { ok: true, inspection, adjustments: results, disposedExpired };
}
function randomUUIDv4() { return (globalThis.crypto as Crypto).randomUUID(); }

import type { PersonSnapshot, TransactionInput, TransactionLine } from './types';

export class FirstAidInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FirstAidInputError('รูปแบบข้อมูลไม่ถูกต้อง');
  return value as Record<string, unknown>;
}

export function allowedKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new FirstAidInputError('มีช่องข้อมูลที่ไม่รองรับ');
}

export function text(value: unknown, label: string, max = 120, required = true): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new FirstAidInputError(`กรุณาระบุ${label}`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new FirstAidInputError(`${label}ไม่ถูกต้อง`);
  return result;
}

export function uuid(value: unknown, label = 'รหัสรายการ'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new FirstAidInputError(`${label}ไม่ถูกต้อง`);
  return value.toLowerCase();
}

export function integer(value: unknown, label: string, min = 0, max = 1_000_000) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new FirstAidInputError(`${label}ต้องเป็นจำนวนเต็ม ${min}–${max}`);
  return value;
}

export function bool(value: unknown, fallback?: boolean) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw new FirstAidInputError('สถานะไม่ถูกต้อง');
  return value;
}

export function calendarDate(value: unknown, label = 'วันที่') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FirstAidInputError(`${label}ไม่ถูกต้อง`);
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new FirstAidInputError(`${label}ไม่ถูกต้อง`);
  return value;
}

export function bangkokDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function manualPerson(value: unknown): PersonSnapshot {
  const person = record(value);
  allowedKeys(person, ['id', 'name', 'department', 'code', 'identityMethod']);
  return { id: null, name: text(person.name, 'ชื่อผู้เบิก / ผู้รับ'), department: text(person.department, 'หน่วยงาน / บริษัท'), code: text(person.code, 'รหัสพนักงาน', 40, false), identityMethod: 'self_declared' };
}

export function parseTransaction(value: unknown, today = bangkokDate()): TransactionInput {
  const body = record(value);
  allowedKeys(body, ['idempotencyKey', 'kind', 'locationId', 'destinationId', 'date', 'lines', 'expiry', 'lotCode', 'requesterId', 'recipientId', 'requesterPerson', 'recipientPerson', 'requester', 'onBehalf', 'note', 'mode']);
  if (!['issue', 'receive', 'transfer', 'dispose'].includes(String(body.kind))) throw new FirstAidInputError('กรุณาเลือกประเภทรายการ');
  const date = calendarDate(body.date);
  if (date > today) throw new FirstAidInputError('ไม่อนุญาตให้ทำรายการล่วงหน้า');
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 8) throw new FirstAidInputError('ระบุรายการ 1–8 รายการต่อเอกสาร');
  const lines: TransactionLine[] = body.lines.map(value => {
    const line = record(value); allowedKeys(line, ['itemId', 'quantity', 'lotId']);
    return { itemId: uuid(line.itemId), quantity: integer(line.quantity, 'จำนวน', 1), ...(line.lotId ? { lotId: uuid(line.lotId, 'รหัสล็อต') } : {}) };
  });
  const input: TransactionInput = {
    idempotencyKey: uuid(body.idempotencyKey, 'รหัสป้องกันรายการซ้ำ'), kind: body.kind as TransactionInput['kind'], locationId: uuid(body.locationId, 'รหัสจุดปฐมพยาบาล'), date, lines,
    note: text(body.note, 'หมายเหตุ', 500, false), onBehalf: bool(body.onBehalf, false),
  };
  if (body.destinationId) input.destinationId = uuid(body.destinationId, 'รหัสจุดปลายทาง');
  if (body.expiry != null && body.expiry !== '') input.expiry = calendarDate(body.expiry, 'วันหมดอายุ');
  if (body.lotCode != null) input.lotCode = text(body.lotCode, 'เลขล็อต', 100, false);
  if (input.kind === 'transfer' && (!input.destinationId || input.destinationId === input.locationId)) throw new FirstAidInputError('เลือกจุดปลายทางที่ต่างจากต้นทาง');
  if (input.kind === 'dispose' && !input.note) throw new FirstAidInputError('กรุณาระบุเหตุผลที่ตัดจำหน่าย');
  if (input.kind !== 'issue') return input;
  if (body.requesterId != null) input.requesterId = text(body.requesterId, 'รหัสผู้เบิก', 60, false);
  if (body.recipientId != null) input.recipientId = text(body.recipientId, 'รหัสผู้รับจริง', 60, false);
  if (body.requesterPerson != null) input.requesterPerson = record(body.requesterPerson) as PersonSnapshot;
  if (body.requester != null) input.requester = record(body.requester) as PersonSnapshot;
  if (body.recipientPerson != null) input.recipientPerson = record(body.recipientPerson) as PersonSnapshot;
  return input;
}

/** Bound the request before parsing, including requests without Content-Length. */
export async function readJsonBody(request: Request, maxBytes = 32_768): Promise<unknown> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new FirstAidInputError('ข้อมูลมีขนาดใหญ่เกินไป', 413);
  if (!request.body) throw new FirstAidInputError('ไม่พบข้อมูลที่ส่งมา');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new FirstAidInputError('ข้อมูลมีขนาดใหญ่เกินไป', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new FirstAidInputError('ข้อมูล JSON ไม่ถูกต้อง'); }
}

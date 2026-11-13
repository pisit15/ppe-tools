import { randomBytes, randomUUID } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError } from '@/lib/toolsSession';
import { VISITOR_LIMITS, gateCheckConfig, vehiclePolicyFor } from './constants';
import { addDays, bangkokToday } from './validation';
import type { BatchSibling, BoardPayload, BoardRequest, CreateVisitorRequestInput, GateCheckConfig, VisitorBackground, VisitorLinkRow, VisitorPersonRow, VisitorRequestRow, VisitorRequestWithPersons, VisitorVehicleRow } from './types';

export const db = () => getSupabaseServer();
export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url');

export const REQUEST_SELECT = '*, visitor_persons(*), visitor_vehicles(*)';
export const sortPersons = <T extends { visitor_persons: VisitorPersonRow[]; visitor_vehicles?: VisitorVehicleRow[] }>(r: T): T => ({
  ...r,
  visitor_persons: [...(r.visitor_persons || [])].sort((a, b) => a.seq - b.seq),
  visitor_vehicles: [...(r.visitor_vehicles || [])].sort((a, b) => a.seq - b.seq),
});

export async function companyName(companyId: string) {
  const { data, error } = await db().from('company_settings').select('company_id, company_name').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบบริษัท', 404);
  return String(data.company_name || data.company_id);
}

/** Option lists for a company; empty arrays when nothing has been configured yet. */
export async function companyOptions(companyId: string): Promise<{ areas: string[]; departments: string[]; background: VisitorBackground; gate_check: GateCheckConfig }> {
  const { data, error } = await db().from('visitor_company_options').select('areas, departments, form_background, form_background_dim, gate_check').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  const row = data as { areas: string[] | null; departments: string[] | null; form_background: string | null; form_background_dim: number | null; gate_check: unknown } | null;
  return {
    areas: row?.areas || [], departments: row?.departments || [],
    background: row?.form_background ? { url: row.form_background, dim: row.form_background_dim ?? 75 } : null,
    gate_check: gateCheckConfig(row?.gate_check),
  };
}

export async function activeLink(token: string) {
  const { data, error } = await db().from('visitor_links').select('*').eq('token', token).maybeSingle();
  if (error) throw error;
  const link = data as VisitorLinkRow | null;
  if (!link || !link.active) throw new AccessError('ลิงก์นี้ถูกยกเลิกหรือไม่ถูกต้อง กรุณาติดต่อทีม SHE', 404);
  return link;
}

/** Create a request through a public link. Rate-limited per link; returns the stored row. */
/** Creates one request per date (input.arrival_dates, or just arrival_date). Several dates share a batch_id. Returns rows in date order. */
export async function createRequest(input: CreateVisitorRequestInput): Promise<VisitorRequestWithPersons[]> {
  const link = await activeLink(input.token);
  const client = db();
  const dates = input.arrival_dates?.length ? [...new Set(input.arrival_dates)].sort() : [input.arrival_date];
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count, error: countError } = await client.from('visitor_requests').select('id', { count: 'exact', head: true }).eq('link_id', link.id).gte('created_at', since);
  if (countError) throw countError;
  if ((count || 0) + dates.length > VISITOR_LIMITS.maxRequestsPerLinkPerHour) throw new AccessError('มีคำขอผ่านลิงก์นี้มากเกินไปในชั่วโมงที่ผ่านมา กรุณาลองใหม่ภายหลัง', 429);

  const period = bangkokToday().slice(2, 4) + bangkokToday().slice(5, 7);
  const { token: _token, persons, vehicles = [], arrival_dates: _dates, ...fields } = input;
  void _token; void _dates;
  const batchId = dates.length > 1 ? randomUUID() : null;
  const policy = vehiclePolicyFor(input.purpose);
  const out: VisitorRequestWithPersons[] = [];
  for (const arrival_date of dates) {
    const { data: no, error: noError } = await client.rpc('visitor_next_request_no', { p_company: link.company_id, p_period: period });
    if (noError) throw noError;
    const { data: created, error } = await client.from('visitor_requests').insert([{
      ...fields, arrival_date, company_id: link.company_id, link_id: link.id, request_no: String(no), track_code: newToken(18), status: 'submitted', source: 'web', batch_id: batchId,
    }]).select('*').single();
    if (error) throw error;
    const row = created as VisitorRequestRow;
    const { error: personsError } = await client.from('visitor_persons').insert(persons.map((p, i) => ({ request_id: row.id, seq: i + 1, name: p.name, detail: p.detail || '' })));
    if (personsError) throw personsError;
    if (vehicles.length) {
      const { error: vErr } = await client.from('visitor_vehicles').insert(vehicles.map((v, i) => ({
        request_id: row.id, seq: i + 1, plate: v.plate, province: v.province || '', vehicle_type: v.vehicle_type || '', reason: v.reason || '',
        decision: policy.mode === 'allow' ? 'allowed' : 'pending',
      })));
      if (vErr) throw vErr;
    }
    await addEvent(row.id, `${input.informer_name} (${input.informer_employee_code})`, 'submitted', `${persons.length} คน${vehicles.length ? ` · รถ ${vehicles.length} คัน` : ''}${batchId ? ` · ชุด ${dates.length} วัน` : ''}`);
    const { data: full, error: fullError } = await client.from('visitor_requests').select(REQUEST_SELECT).eq('id', row.id).single();
    if (fullError) throw fullError;
    out.push(sortPersons(full as VisitorRequestWithPersons));
  }
  return out;
}

/** Other requests submitted with this one (same batch), date order. Empty for single-day requests. */
export async function batchSiblings(r: Pick<VisitorRequestRow, 'id' | 'batch_id'>): Promise<BatchSibling[]> {
  if (!r.batch_id) return [];
  const { data, error } = await db().from('visitor_requests').select('id, request_no, arrival_date, status, track_code').eq('batch_id', r.batch_id).order('arrival_date');
  if (error) throw error;
  return (data || []) as BatchSibling[];
}

const BATCH_NEXT = { approve: 'approved', reject: 'rejected', cancel: 'cancelled', need_info: 'need_info' } as const;
/**
 * Applies a decision to the other requests of a multi-day batch (the one already decided is skipped).
 * approve/reject/need_info touch only requests still waiting; cancel also cancels approved days. Returns how many changed.
 */
export async function decideBatch(batchId: string, exceptId: string, action: keyof typeof BATCH_NEXT, actor: string, opts: { note?: string; conditions?: string; vehicleChoice?: 'allowed' | 'outside'; source?: string } = {}): Promise<number> {
  const client = db();
  const statuses = action === 'cancel' ? ['submitted', 'need_info', 'approved'] : ['submitted', 'need_info'];
  const { data, error } = await client.from('visitor_requests').select('id, request_no').eq('batch_id', batchId).neq('id', exceptId).in('status', statuses);
  if (error) throw error;
  const rows = (data || []) as { id: string; request_no: string }[];
  const now = new Date().toISOString();
  for (const r of rows) {
    const patch: Record<string, unknown> = { status: BATCH_NEXT[action], decided_by: actor, decided_at: now, decision_note: opts.note || '' };
    if (action === 'approve' && opts.conditions !== undefined) patch.conditions = opts.conditions;
    const { error: uErr } = await client.from('visitor_requests').update(patch).eq('id', r.id);
    if (uErr) throw uErr;
    await addEvent(r.id, actor, BATCH_NEXT[action] === 'need_info' ? 'need_info' : BATCH_NEXT[action], [`ทั้งชุด${opts.source ? ` (${opts.source})` : ''}`, opts.note || ''].filter(Boolean).join(' · '));
    if (action === 'approve' && opts.vehicleChoice) {
      await client.from('visitor_vehicles').update({ decision: opts.vehicleChoice, decided_by: actor, decided_at: now }).eq('request_id', r.id).eq('decision', 'pending');
    }
  }
  return rows.length;
}

export async function addEvent(requestId: string, actor: string, action: string, note = '') {
  const { error } = await db().from('visitor_events').insert([{ request_id: requestId, actor, action, note }]);
  if (error) throw error;
}

/** Guard board: approved requests from yesterday (read-only history, and carry-over of visitors still inside) to today+N (Bangkok). */
export async function boardPayload(companyId: string): Promise<BoardPayload> {
  const [name, options] = await Promise.all([companyName(companyId), companyOptions(companyId)]);
  const today = bangkokToday();
  const { data, error } = await db().from('visitor_requests').select(REQUEST_SELECT)
    .eq('company_id', companyId).eq('status', 'approved')
    .gte('arrival_date', addDays(today, -1)).lte('arrival_date', addDays(today, VISITOR_LIMITS.boardDaysAhead))
    .order('arrival_date').order('time_from');
  if (error) throw error;
  const rows = (data as VisitorRequestWithPersons[]).map(sortPersons);
  const requests: BoardRequest[] = rows.map(r => ({
      id: r.id, request_no: r.request_no, visitor_company: r.visitor_company, arrival_date: r.arrival_date, time_from: r.time_from, time_to: r.time_to,
      purpose: r.purpose, purpose_other: r.purpose_other, work_areas: r.work_areas, work_area_detail: r.work_area_detail,
      informer_name: r.informer_name, informer_department: r.informer_department, informer_phone: r.informer_phone,
      conditions: r.conditions, has_permit: r.has_permit, permit_ref: r.permit_ref,
      persons: r.visitor_persons.map(p => ({ id: p.id, seq: p.seq, name: p.name, detail: p.detail, arrived_at: p.arrived_at, left_at: p.left_at, no_show_at: p.no_show_at, added_by_guard: p.added_by_guard })),
      vehicles: (r.visitor_vehicles || []).map(v => ({ id: v.id, seq: v.seq, plate: v.plate, province: v.province, vehicle_type: v.vehicle_type, decision: v.decision })),
    }));
  return { company: { id: companyId, name }, today, requests, background: options.background, gate_check: options.gate_check };
}

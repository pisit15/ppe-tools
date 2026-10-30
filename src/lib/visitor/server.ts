import { randomBytes } from 'node:crypto';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError } from '@/lib/toolsSession';
import { VISITOR_LIMITS } from './constants';
import { addDays, bangkokToday } from './validation';
import type { BoardPayload, BoardRequest, CreateVisitorRequestInput, VisitorBackground, VisitorLinkRow, VisitorPersonRow, VisitorRequestRow, VisitorRequestWithPersons } from './types';

export const db = () => getSupabaseServer();
export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url');

export const REQUEST_SELECT = '*, visitor_persons(*)';
export const sortPersons = <T extends { visitor_persons: VisitorPersonRow[] }>(r: T): T => ({
  ...r, visitor_persons: [...(r.visitor_persons || [])].sort((a, b) => a.seq - b.seq),
});

export async function companyName(companyId: string) {
  const { data, error } = await db().from('company_settings').select('company_id, company_name').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบบริษัท', 404);
  return String(data.company_name || data.company_id);
}

/** Option lists for a company; empty arrays when nothing has been configured yet. */
export async function companyOptions(companyId: string): Promise<{ areas: string[]; departments: string[]; background: VisitorBackground }> {
  const { data, error } = await db().from('visitor_company_options').select('areas, departments, form_background, form_background_dim').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  const row = data as { areas: string[] | null; departments: string[] | null; form_background: string | null; form_background_dim: number | null } | null;
  return {
    areas: row?.areas || [], departments: row?.departments || [],
    background: row?.form_background ? { url: row.form_background, dim: row.form_background_dim ?? 75 } : null,
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
export async function createRequest(input: CreateVisitorRequestInput): Promise<VisitorRequestWithPersons> {
  const link = await activeLink(input.token);
  const client = db();
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count, error: countError } = await client.from('visitor_requests').select('id', { count: 'exact', head: true }).eq('link_id', link.id).gte('created_at', since);
  if (countError) throw countError;
  if ((count || 0) >= VISITOR_LIMITS.maxRequestsPerLinkPerHour) throw new AccessError('มีคำขอผ่านลิงก์นี้มากเกินไปในชั่วโมงที่ผ่านมา กรุณาลองใหม่ภายหลัง', 429);

  const period = bangkokToday().slice(2, 4) + bangkokToday().slice(5, 7);
  const { data: no, error: noError } = await client.rpc('visitor_next_request_no', { p_company: link.company_id, p_period: period });
  if (noError) throw noError;

  const { token: _token, persons, ...fields } = input;
  void _token;
  const { data: created, error } = await client.from('visitor_requests').insert([{
    ...fields, company_id: link.company_id, link_id: link.id, request_no: String(no), track_code: newToken(18), status: 'submitted', source: 'web',
  }]).select('*').single();
  if (error) throw error;
  const row = created as VisitorRequestRow;
  const { error: personsError } = await client.from('visitor_persons').insert(persons.map((p, i) => ({ request_id: row.id, seq: i + 1, name: p.name, detail: p.detail || '' })));
  if (personsError) throw personsError;
  await addEvent(row.id, `${input.informer_name} (${input.informer_employee_code})`, 'submitted', `${persons.length} คน`);
  const { data: full, error: fullError } = await client.from('visitor_requests').select(REQUEST_SELECT).eq('id', row.id).single();
  if (fullError) throw fullError;
  return sortPersons(full as VisitorRequestWithPersons);
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
    }));
  return { company: { id: companyId, name }, today, requests, background: options.background };
}

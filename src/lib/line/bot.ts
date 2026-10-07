// Server-only: turns one LINE event into reply messages (plain strings or Flex cards).
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { companyNames, getLinkedAccount, type LinkedAccount } from './accounts';
import { HELP_TEXT, parseCommand, type Command } from './commands';
import { incidentMonth, type ManHourRow } from './incidentStats';
import { LAW_PAGE_SIZE, lawHelpCard, lawResultsCard, wordFilter, searchWords, type LawRow } from './lawCards';
import { wasteCarousel, wasteCompanyPicker, wasteMonthCard, type WasteMethodRow, type WasteRow, type WasteTargetRow } from './wasteCards';
import { endMonthFor, incidentCompanyPicker, incidentDetailCard, monthListCard, statsCarousel, type IncidentDetailRow, type IncidentListRow } from './incidentCards';
import type { StockRow } from './ppeFormat';
import { lowCard, menuCard, overviewCard, searchCard, SEARCH_HELP, summaryCard, text, withQuickReply, type LineMessage } from './flex';
import { categoryCard, companyPickerCard, decodePostback, itemCard, listCarousel, type LastMove } from './browse';

export type Reply = string | LineMessage;

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function siteBase(): string {
  return (process.env.LINE_LINK_BASE_URL || 'https://tools.eashe.org').replace(/\/+$/, '');
}

async function linkPrompt(db: SupabaseClient, lineUserId: string): Promise<Reply[]> {
  await db.from('line_link_codes').delete().eq('line_user_id', lineUserId).is('used_at', null);
  const code = newCode();
  const { error } = await db.from('line_link_codes').insert({
    code,
    line_user_id: lineUserId,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error('line link code insert failed', error.message);
    return ['ระบบเชื่อมบัญชีขัดข้อง กรุณาลองใหม่ภายหลัง'];
  }
  return [
    'ยังไม่ได้เชื่อมบัญชี LINE นี้กับบัญชี tools.eashe.org\n\nกดลิงก์ด้านล่างแล้วเข้าสู่ระบบด้วยบัญชีบริษัทเพื่อเชื่อม (ลิงก์ใช้ได้ 15 นาที ใช้ได้ครั้งเดียว)',
    `${siteBase()}/line/link?code=${code}`,
  ];
}

/** Company the account may see; null = admin must pick (overview). */
function scopeFor(account: LinkedAccount, requested?: string): { company: string | null; denied: boolean } {
  if (account.isGroupAdmin) return { company: requested || null, denied: false };
  if (requested && requested !== account.companyId) return { company: account.companyId, denied: true };
  return { company: account.companyId, denied: false };
}

async function stockRows(db: SupabaseClient, company: string | null): Promise<StockRow[]> {
  const rows: StockRow[] = [];
  // Page through: PostgREST caps responses at 1000 rows.
  for (let from = 0; ; from += 1000) {
    let q = db.from('ppe_stock_summary').select('product_id, company_id, name, type, unit, min_stock, current_stock, total_in, total_out').order('name').range(from, from + 999);
    if (company) q = q.eq('company_id', company);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data || []) as StockRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function handlePpe(db: SupabaseClient, account: LinkedAccount, cmd: Extract<Command, { kind: 'ppe_summary' | 'ppe_low' | 'ppe_search' | 'ppe_browse' }>): Promise<Reply[]> {
  const { company, denied } = scopeFor(account, cmd.company);
  const notice: Reply[] = denied ? ['บัญชีนี้ดูได้เฉพาะบริษัทของตัวเอง จึงแสดงข้อมูลบริษัทของคุณแทน'] : [];
  const names = await companyNames(db);

  if (company === null) {
    const rows = await stockRows(db, null);
    if (cmd.kind === 'ppe_search') return [searchCard(rows, cmd.query, 'ทุกบริษัท', true)];
    if (cmd.kind === 'ppe_browse') return [companyPickerCard(rows, names)];
    return [overviewCard(rows, names)];
  }

  const rows = await stockRows(db, company);
  const name = names[company] || company;
  if (rows.length === 0 && account.isGroupAdmin && !names[company]) return [`ไม่พบรหัสบริษัท "${company}"`];
  if (cmd.kind === 'ppe_browse') return [...notice, categoryCard(rows, company, name)];
  if (cmd.kind === 'ppe_low') return [...notice, lowCard(rows, name)];
  if (cmd.kind === 'ppe_search') return [...notice, searchCard(rows, cmd.query, name)];
  return [...notice, summaryCard(rows, name)];
}

const bangkokNow = () => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
};
const MIN_INCIDENT_YEAR = 2021; // first year on the eashe.org dashboard

async function pageAll<T>(build: (from: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const INCIDENT_STAT_FIELDS = 'id, year, company_id, incident_no, incident_type, actual_severity, recordable_override, work_related, incident_date, month';

/** c: company id, or 'all' (admins only — callers enforce scope). */
async function incidentStats(db: SupabaseClient, account: LinkedAccount, c: string, requestedYear?: number): Promise<Reply[]> {
  const now = bangkokNow();
  const year = Math.min(now.year, Math.max(MIN_INCIDENT_YEAR, requestedYear || now.year));
  const endMonth = endMonthFor(year, now);
  const years = [year - 3, year - 2, year - 1, year].filter(y => y >= MIN_INCIDENT_YEAR);
  const all = c === 'all';

  const incidents = await pageAll<IncidentListRow>(from => {
    let q = db.from('incidents').select(INCIDENT_STAT_FIELDS).in('year', years).neq('report_status', 'Draft').order('id').range(from, from + 999);
    if (!all) q = q.eq('company_id', c);
    return q;
  });
  const manHours = await pageAll<ManHourRow & { year: number }>(from => {
    let q = db.from('man_hours').select('company_id, year, month, employee_manhours, contractor_manhours').in('year', years).order('id').range(from, from + 999);
    if (!all) q = q.eq('company_id', c);
    return q;
  });
  const names = all ? {} : await companyNames(db, [c]);
  return [
    statsCarousel({
      c,
      companyLabel: all ? 'ทุกบริษัท' : names[c] || c,
      year,
      endMonth,
      minYear: MIN_INCIDENT_YEAR,
      maxYear: now.year,
      incidents,
      manHours,
      canPickCompany: account.isGroupAdmin,
    }),
  ];
}

async function handleIncidents(db: SupabaseClient, account: LinkedAccount, requested?: string, year?: number): Promise<Reply[]> {
  const { company, denied } = scopeFor(account, requested);
  const notice: Reply[] = denied ? ['บัญชีนี้ดูได้เฉพาะบริษัทของตัวเอง จึงแสดงข้อมูลบริษัทของคุณแทน'] : [];
  return [...notice, ...(await incidentStats(db, account, company ?? 'all', year))];
}

async function incidentMonthList(db: SupabaseClient, c: string, year: number, month: number): Promise<Reply[]> {
  const all = c === 'all';
  const rows = await pageAll<IncidentListRow>(from => {
    let q = db
      .from('incidents')
      .select(`${INCIDENT_STAT_FIELDS}, area, description`)
      .eq('year', year)
      .neq('report_status', 'Draft')
      .order('incident_date')
      .range(from, from + 999);
    if (!all) q = q.eq('company_id', c);
    return q;
  });
  const inMonth = rows.filter(r => incidentMonth(r) === month - 1);
  const names = all ? {} : await companyNames(db, [c]);
  return [monthListCard(inMonth, c, all ? 'ทุกบริษัท' : names[c] || c, year, month, all)];
}

async function incidentDetail(db: SupabaseClient, account: LinkedAccount, id: string): Promise<Reply[]> {
  let q = db
    .from('incidents')
    .select(
      `${INCIDENT_STAT_FIELDS}, area, description, incident_time, activity, report_status, immediate_cause, corrective_action_1, ca1_status, ca1_due_date, corrective_action_2, ca2_status, ca2_due_date`,
    )
    .eq('id', id)
    .neq('report_status', 'Draft');
  if (!account.isGroupAdmin) q = q.eq('company_id', account.companyId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return ['ไม่พบเหตุการณ์นี้ หรือบัญชีนี้ไม่มีสิทธิ์ดู'];
  const row = data as IncidentDetailRow;
  const names = await companyNames(db, [row.company_id]);
  return [incidentDetailCard(row, names[row.company_id] || row.company_id)];
}

const WASTE_FIELDS = 'id, company_id, record_date, waste_category, disposal_method, waste_type, waste_type_th, quantity_kg, cost, disposal_company';

async function wasteRows(db: SupabaseClient, c: string, year: number): Promise<WasteRow[]> {
  return pageAll<WasteRow>(from => {
    let q = db.from('waste_records').select(WASTE_FIELDS).gte('record_date', `${year}-01-01`).lte('record_date', `${year}-12-31`).order('id').range(from, from + 999);
    if (c !== 'all') q = q.eq('company_id', c);
    return q;
  });
}

async function wasteMethods(db: SupabaseClient): Promise<WasteMethodRow[]> {
  const { data, error } = await db.from('waste_methods').select('method_name, method_name_th, is_recycle');
  if (error) throw error;
  return (data || []) as WasteMethodRow[];
}

/** c: company id, or 'all' (admins only — callers enforce scope). */
async function wasteStats(db: SupabaseClient, account: LinkedAccount, c: string, requestedYear?: number): Promise<Reply[]> {
  const now = bangkokNow();
  const year = Math.min(now.year, Math.max(MIN_INCIDENT_YEAR, requestedYear || now.year));
  const endMonth = year < now.year ? 11 : now.month0;
  let tq = db.from('waste_targets').select('company_id, base_year, base_recycle_nonhaz_ton, base_recycle_haz_ton, base_disposal_nonhaz_ton, base_disposal_haz_ton, recycle_step_pct, disposal_step_pct');
  if (c !== 'all') tq = tq.eq('company_id', c);
  const [rows, methods, targets, names] = await Promise.all([wasteRows(db, c, year), wasteMethods(db), tq, c === 'all' ? Promise.resolve({} as Record<string, string>) : companyNames(db, [c])]);
  if (targets.error) throw targets.error;
  return [
    wasteCarousel({
      c,
      companyLabel: c === 'all' ? 'ทุกบริษัท' : names[c] || c,
      year,
      endMonth,
      minYear: MIN_INCIDENT_YEAR,
      maxYear: now.year,
      rows,
      methods,
      targets: (targets.data || []) as WasteTargetRow[],
      canPickCompany: account.isGroupAdmin,
    }),
  ];
}

async function handleWaste(db: SupabaseClient, account: LinkedAccount, requested?: string, year?: number): Promise<Reply[]> {
  const { company, denied } = scopeFor(account, requested);
  const notice: Reply[] = denied ? ['บัญชีนี้ดูได้เฉพาะบริษัทของตัวเอง จึงแสดงข้อมูลบริษัทของคุณแทน'] : [];
  return [...notice, ...(await wasteStats(db, account, company ?? 'all', year))];
}

async function lawSearch(db: SupabaseClient, query: string, page: number): Promise<Reply[]> {
  const words = searchWords(query);
  if (!words.length) return [lawHelpCard()];
  let q = db
    .from('law_documents')
    .select('id, code, ministry, title, law_type, status, enacted_date, gazette_url, external_url, is_core', { count: 'exact' })
    .neq('status', 'repealed')
    .neq('screening', 'excluded');
  for (const w of words) q = q.or(wordFilter(w));
  const from = (page - 1) * LAW_PAGE_SIZE;
  const { data, error, count } = await q
    .order('is_core', { ascending: false })
    .order('enacted_date', { ascending: false, nullsFirst: false })
    .order('code')
    .range(from, from + LAW_PAGE_SIZE - 1);
  if (error) throw error;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / LAW_PAGE_SIZE));
  if (page > pages && total > 0) return lawSearch(db, query, pages);
  return [lawResultsCard((data || []) as LawRow[], words.join(' '), total, page)];
}

const toMessages = (replies: Reply[], quick: boolean): LineMessage[] => {
  const msgs = replies.map(r => (typeof r === 'string' ? text(r) : r));
  return quick ? withQuickReply(msgs) : msgs;
};

async function answer(db: SupabaseClient, lineUserId: string, account: LinkedAccount, input: string): Promise<Reply[]> {
  const cmd = parseCommand(input);
  try {
    switch (cmd.kind) {
      case 'help':
        return [menuCard(account.isGroupAdmin, HELP_TEXT)];
      case 'law_search':
        return await lawSearch(db, cmd.query, cmd.page);
      case 'search_help':
        return [SEARCH_HELP];
      case 'whoami':
        return [`เชื่อมกับบัญชี ${account.displayName} (${account.username})\nบริษัท: ${account.isGroupAdmin ? 'ทุกบริษัท (admin)' : account.companyId}`];
      case 'unlink':
        await db.from('line_links').delete().eq('line_user_id', lineUserId);
        return ['ยกเลิกการเชื่อมบัญชีแล้ว ส่งข้อความใดก็ได้หากต้องการเชื่อมใหม่'];
      case 'waste_stats':
        return await handleWaste(db, account, cmd.company, cmd.year);
      case 'incident_stats':
        return await handleIncidents(db, account, cmd.company, cmd.year);
      default:
        return await handlePpe(db, account, cmd);
    }
  } catch (err) {
    console.error('LINE bot query failed', err instanceof Error ? err.message : err);
    return ['ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'];
  }
}

export async function handleText(db: SupabaseClient, lineUserId: string, input: string): Promise<LineMessage[]> {
  const account = await getLinkedAccount(db, lineUserId);
  if (!account) return toMessages(await linkPrompt(db, lineUserId), false);
  const unlinking = parseCommand(input).kind === 'unlink';
  return toMessages(await answer(db, lineUserId, account, input), !unlinking);
}

/** Taps on browse cards. The postback data is re-checked against the account's scope. */
export async function handlePostback(db: SupabaseClient, lineUserId: string, data: string): Promise<LineMessage[]> {
  const account = await getLinkedAccount(db, lineUserId);
  if (!account) return toMessages(await linkPrompt(db, lineUserId), false);
  const pb = decodePostback(data);
  if (!pb) return toMessages(['ปุ่มนี้หมดอายุแล้ว พิมพ์ "รายการ PPE" เพื่อเริ่มใหม่'], true);
  const company = account.isGroupAdmin ? pb.c : account.companyId;

  try {
    if (pb.a === 'inc') return toMessages(await incidentStats(db, account, company, pb.y), true);
    if (pb.a === 'incm') return toMessages(await incidentMonthList(db, company, pb.y, pb.m), true);
    if (pb.a === 'incd') return toMessages(await incidentDetail(db, account, pb.id), true);
    if (pb.a === 'wst') return toMessages(await wasteStats(db, account, company, pb.y), true);
    if (pb.a === 'wstm') {
      const [rows, methods] = await Promise.all([wasteRows(db, company, pb.y), wasteMethods(db)]);
      const names = company === 'all' ? {} : await companyNames(db, [company]);
      return toMessages([wasteMonthCard(rows, methods, company, company === 'all' ? 'ทุกบริษัท' : names[company] || company, pb.y, pb.m, company === 'all')], true);
    }
    if (pb.a === 'wstpick') {
      if (!account.isGroupAdmin) return toMessages(await wasteStats(db, account, account.companyId, pb.y), true);
      const ids = new Set((await wasteRows(db, 'all', pb.y)).map(r => r.company_id));
      const names = await companyNames(db, [...ids]);
      return toMessages([wasteCompanyPicker(names, [...ids], pb.y)], true);
    }
    if (pb.a === 'incpick') {
      if (!account.isGroupAdmin) return toMessages(await incidentStats(db, account, account.companyId, pb.y), true);
      const names = await companyNames(db);
      return toMessages([incidentCompanyPicker(names, Object.keys(names), pb.y)], true);
    }
    if (company === 'all') return toMessages(['พิมพ์ "รายการ PPE" แล้วเลือกบริษัทก่อน'], true);
    const names = await companyNames(db, [company]);
    const name = names[company] || company;
    if (pb.a === 'item') {
      const { data: row, error } = await db
        .from('ppe_stock_summary')
        .select('product_id, company_id, name, type, unit, min_stock, current_stock, total_in, total_out')
        .eq('company_id', company)
        .eq('product_id', pb.id)
        .maybeSingle();
      if (error) throw error;
      if (!row) return toMessages(['ไม่พบรายการนี้ อาจถูกลบหรือย้ายไปแล้ว'], true);
      const { data: tx } = await db
        .from('ppe_transactions')
        .select('transaction_type, quantity, transaction_date')
        .eq('company_id', company)
        .eq('product_id', pb.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      return toMessages([itemCard(row as StockRow, company, name, ((tx || [])[0] as LastMove) || null)], true);
    }
    const rows = await stockRows(db, company);
    if (pb.a === 'cats') return toMessages([categoryCard(rows, company, name)], true);
    return toMessages([listCarousel(rows, company, name, pb.t, pb.p)], true);
  } catch (err) {
    console.error('LINE postback failed', err instanceof Error ? err.message : err);
    return toMessages(['ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'], true);
  }
}

export async function handleFollow(db: SupabaseClient, lineUserId: string): Promise<LineMessage[]> {
  const account = await getLinkedAccount(db, lineUserId);
  if (account) return toMessages([`ยินดีต้อนรับกลับ ${account.displayName}\n\n${HELP_TEXT}`], true);
  return toMessages(['สวัสดีครับ นี่คือ EA SHE Bot ใช้ถามข้อมูล PPE และสถิติอุบัติเหตุ', ...(await linkPrompt(db, lineUserId))], false);
}

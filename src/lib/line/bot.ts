// Server-only: turns one LINE event into reply messages (plain strings or Flex cards).
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { companyNames, getLinkedAccount, type LinkedAccount } from './accounts';
import { HELP_TEXT, parseCommand, type Command } from './commands';
import { computeCompanyStats, formatIncidentStats, type IncidentRow, type ManHourRow } from './incidentStats';
import type { StockRow } from './ppeFormat';
import { lowCard, overviewCard, searchCard, summaryCard, text, withQuickReply, type LineMessage } from './flex';

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
    let q = db.from('ppe_stock_summary').select('company_id, name, type, unit, min_stock, current_stock').order('name').range(from, from + 999);
    if (company) q = q.eq('company_id', company);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data || []) as StockRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function handlePpe(db: SupabaseClient, account: LinkedAccount, cmd: Extract<Command, { kind: 'ppe_summary' | 'ppe_low' | 'ppe_search' }>): Promise<Reply[]> {
  const { company, denied } = scopeFor(account, cmd.company);
  const notice: Reply[] = denied ? ['บัญชีนี้ดูได้เฉพาะบริษัทของตัวเอง จึงแสดงข้อมูลบริษัทของคุณแทน'] : [];
  const names = await companyNames(db);

  if (company === null) {
    const rows = await stockRows(db, null);
    if (cmd.kind === 'ppe_search') return [searchCard(rows, cmd.query, 'ทุกบริษัท', true)];
    return [overviewCard(rows, names)];
  }

  const rows = await stockRows(db, company);
  const name = names[company] || company;
  if (rows.length === 0 && account.isGroupAdmin && !names[company]) return [`ไม่พบรหัสบริษัท "${company}"`];
  if (cmd.kind === 'ppe_low') return [...notice, lowCard(rows, name)];
  if (cmd.kind === 'ppe_search') return [...notice, searchCard(rows, cmd.query, name)];
  return [...notice, summaryCard(rows, name)];
}

async function handleIncidents(db: SupabaseClient, account: LinkedAccount, requested?: string): Promise<Reply[]> {
  const { company, denied } = scopeFor(account, requested);
  // Bangkok time decides "this year". Like the dashboard's default, the period
  // ends at the last complete month (January shows January).
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const endMonth = Math.max(0, now.getUTCMonth() - 1);

  const incidents: IncidentRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db
      .from('incidents')
      .select('company_id, incident_type, actual_severity, recordable_override, work_related, incident_date, month')
      .eq('year', year)
      .neq('report_status', 'Draft')
      .order('id')
      .range(from, from + 999);
    if (company) q = q.eq('company_id', company);
    const { data, error } = await q;
    if (error) throw error;
    incidents.push(...((data || []) as IncidentRow[]));
    if (!data || data.length < 1000) break;
  }

  let mq = db.from('man_hours').select('company_id, month, employee_manhours, contractor_manhours').eq('year', year);
  if (company) mq = mq.eq('company_id', company);
  const { data: mh, error: mhErr } = await mq;
  if (mhErr) throw mhErr;

  const names = await companyNames(db, company ? [company] : undefined);
  const stats = computeCompanyStats(incidents, (mh || []) as ManHourRow[], endMonth, company ? { [company]: names[company] || company } : {});
  const text = formatIncidentStats(stats, year, endMonth, company !== null);
  const footer = '\n\nรายละเอียดเพิ่มเติม: eashe.org/projects/incidents';
  return [...(denied ? ['บัญชีนี้ดูได้เฉพาะบริษัทของตัวเอง จึงแสดงข้อมูลบริษัทของคุณแทน'] : []), text + footer];
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
        return [HELP_TEXT + (account.isGroupAdmin ? '\n\nบัญชี admin: ต่อท้ายด้วยรหัสบริษัทได้ เช่น "PPE ใกล้หมด amt"' : '')];
      case 'whoami':
        return [`เชื่อมกับบัญชี ${account.displayName} (${account.username})\nบริษัท: ${account.isGroupAdmin ? 'ทุกบริษัท (admin)' : account.companyId}`];
      case 'unlink':
        await db.from('line_links').delete().eq('line_user_id', lineUserId);
        return ['ยกเลิกการเชื่อมบัญชีแล้ว ส่งข้อความใดก็ได้หากต้องการเชื่อมใหม่'];
      case 'incident_stats':
        return await handleIncidents(db, account, cmd.company);
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

export async function handleFollow(db: SupabaseClient, lineUserId: string): Promise<LineMessage[]> {
  const account = await getLinkedAccount(db, lineUserId);
  if (account) return toMessages([`ยินดีต้อนรับกลับ ${account.displayName}\n\n${HELP_TEXT}`], true);
  return toMessages(['สวัสดีครับ นี่คือ EA SHE Bot ใช้ถามข้อมูล PPE และสถิติอุบัติเหตุ', ...(await linkPrompt(db, lineUserId))], false);
}

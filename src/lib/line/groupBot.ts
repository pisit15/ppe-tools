// Group-chat commands. A group answers only for the company it is linked to in
// visitor_company_options.line_group_id (set by SHE in /visitor/settings), so company data never
// leaks into another company's group. Replies are free (no push quota).
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateOrderRows, leadTimeDays, monthKey, monthLabelTH, orderDateRange, orderMonths } from '../ppe-order';
import type { PPEOrderSettings, PPEProduct, PPEStockSummary, PPETransaction } from '../types';
import type { LinkedAccount } from './accounts';
import { answerAs } from './bot';
import { C, flex, fmt, header, text, unitLabel, type Json, type LineMessage } from './flex';

export type GroupScope = { companyId: string; companyName: string };

/** Which company a group speaks for; null = not linked (bot stays silent). */
export async function groupScope(db: SupabaseClient, groupId: string): Promise<GroupScope | null> {
  const { data } = await db.from('visitor_company_options').select('company_id').eq('line_group_id', groupId).maybeSingle();
  const companyId = (data as { company_id: string } | null)?.company_id;
  if (!companyId) return null;
  const { data: c } = await db.from('company_settings').select('company_name').eq('company_id', companyId).maybeSingle();
  return { companyId, companyName: String((c as { company_name?: string } | null)?.company_name || companyId.toUpperCase()) };
}

const TRIGGER = /^\s*(?:@\s*(?:she|ea\s*she\s*center|ea\s*hse\s*center)\b|she[\s:：]|\/she\b)\s*/i;

/** Strip the trigger. Returns null when the message is not addressed to the bot. */
export function groupCommandText(raw: string, mentionedBot: boolean): string | null {
  const t = raw.trim();
  if (mentionedBot) return t.replace(/^@\S+(?:\s+\S+){0,3}?\s*/u, '').replace(TRIGGER, '').trim();
  const m = t.match(TRIGGER);
  return m ? t.slice(m[0].length).trim() : null;
}

const GROUP_HELP = [
  'คำสั่งในกลุ่ม (พิมพ์ @she นำหน้า):',
  '• @she สั่งซื้อ PPE — รายการที่ถึงจุดสั่งซื้อ',
  '• @she PPE ใกล้หมด / PPE คงเหลือ / PPE <ชื่อ>',
  '• @she ผู้มาติดต่อวันนี้ — คณะที่อนุมัติเข้าพื้นที่วันนี้',
  '• @she สถิติอุบัติเหตุ / การจัดการขยะ / สารเคมี <ชื่อ> / กฎหมาย <คำ>',
].join('\n');

export async function handleGroupText(db: SupabaseClient, scope: GroupScope, input: string): Promise<LineMessage[] | null> {
  const lower = input.toLowerCase();
  if (!input || /^(help|เมนู|menu|ช่วยเหลือ|\?)$/i.test(input)) return [text(`${scope.companyName}\n${GROUP_HELP}`)];
  if (/สั่งซื้อ|ต้องสั่ง|reorder|จุดสั่งซื้อ/.test(lower)) return [await reorderCard(db, scope)];
  if (/ผู้มาติดต่อ|visitor|ผู้รับเหมา.*วันนี้/.test(lower)) return [await visitorsTodayText(db, scope)];
  // Everything else: the 1:1 bot's commands, locked to this company (no unlink/whoami, no company switching).
  const account: LinkedAccount = { source: 'company_users', accountId: `group:${scope.companyId}`, username: `group-${scope.companyId}`, displayName: scope.companyName, companyId: scope.companyId, isGroupAdmin: false, modules: null };
  return answerAs(db, account, input);
}

// ---- PPE reorder (same maths as /ppe/reports/order) -------------------------------------------

async function pageAll<T>(build: (from: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

async function reorderCard(db: SupabaseClient, scope: GroupScope): Promise<LineMessage> {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const endMonth = monthKey(now.getUTCFullYear(), now.getUTCMonth());
  const months = orderMonths(endMonth);
  const { start, end } = orderDateRange(endMonth);
  const c = scope.companyId;
  const [products, stocks, transactions, settingsRes] = await Promise.all([
    pageAll<PPEProduct>(from => db.from('ppe_products').select('*').eq('company_id', c).order('name').range(from, from + 999)),
    pageAll<PPEStockSummary>(from => db.from('ppe_stock_availability').select('*').eq('company_id', c).order('product_id').range(from, from + 999)),
    pageAll<PPETransaction>(from => db.from('ppe_transactions').select('product_id, transaction_type, quantity, transaction_date').eq('company_id', c)
      .in('transaction_type', ['stock_out', 'borrow']).gte('transaction_date', start).lte('transaction_date', end).order('id').range(from, from + 999)),
    db.from('ppe_order_settings').select('*').eq('company_id', c).maybeSingle(),
  ]);
  const settings = (settingsRes.data as PPEOrderSettings | null) || null;
  const leadMonths = leadTimeDays(settings) / 30;
  const rows = calculateOrderRows({ products, stocks, transactions, months, leadMonths }).filter(r => r.requiresOrder);
  const site = `https://tools.eashe.org/ppe/reports/order?company_id=${encodeURIComponent(c)}&period=${endMonth}`;
  const period = `${monthLabelTH(months[0])}–${monthLabelTH(months[2])}`;

  if (rows.length === 0) {
    return flex(`${scope.companyName}: ไม่มี PPE ที่ถึงจุดสั่งซื้อ`, {
      type: 'bubble', size: 'mega',
      header: header(`PPE ต้องสั่งซื้อ · ${scope.companyName}`, 'ไม่มีรายการถึงจุดสั่งซื้อ', C.ok),
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `คำนวณจากการใช้ ${period} · lead time ${leadTimeDays(settings)} วัน`, size: 'xs', color: C.sub, wrap: true }] },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: C.primary, height: 'sm', action: { type: 'uri', label: 'เปิดหน้าคำนวณสั่งซื้อ', uri: site } }] },
    });
  }

  const shown = rows.slice(0, 10);
  const line = (r: typeof rows[number]): Json => ({
    type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
    contents: [
      { type: 'text', text: r.product.name, size: 'sm', weight: 'bold', color: C.text, wrap: true },
      { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
        { type: 'text', text: `คงเหลือ ${fmt(r.stockOnHand)}`, size: 'xs', color: r.stockOnHand === 0 ? C.danger : C.sub, flex: 4 },
        { type: 'text', text: `จุดสั่ง ${fmt(Math.ceil(r.reorderPoint))}`, size: 'xs', color: C.sub, flex: 4 },
        { type: 'text', text: `สั่ง ${fmt(Math.max(0, Math.ceil(r.needToOrder)))} ${unitLabel(r.product.unit)}`, size: 'xs', color: C.danger, weight: 'bold', flex: 5, align: 'end' },
      ] },
    ],
  });
  const alt = `${scope.companyName}: PPE ต้องสั่งซื้อ ${rows.length} รายการ — ${shown.slice(0, 5).map(r => `${r.product.name} ${Math.max(0, Math.ceil(r.needToOrder))}`).join(', ')}`;
  return flex(alt, {
    type: 'bubble', size: 'mega',
    header: header(`PPE ต้องสั่งซื้อ · ${scope.companyName}`, `${rows.length} รายการถึงจุดสั่งซื้อ`, C.warn),
    body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: `ใช้ ${period} · lead time ${leadTimeDays(settings)} วัน · จำนวนสั่ง = ค่าเฉลี่ย (MIN+MAX)/2 − คงเหลือ`, size: 'xs', color: C.faint, wrap: true },
      ...shown.map(line),
      ...(rows.length > shown.length ? [{ type: 'text', text: `และอีก ${rows.length - shown.length} รายการ`, size: 'xs', color: C.faint, margin: 'md', align: 'center' } as Json] : []),
    ] },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: C.primary, height: 'sm', action: { type: 'uri', label: 'เปิดหน้าคำนวณสั่งซื้อ (ต้อง login)', uri: site } }] },
  });
}

// ---- Visitors approved for today -------------------------------------------------------------

async function visitorsTodayText(db: SupabaseClient, scope: GroupScope): Promise<LineMessage> {
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await db.from('visitor_requests').select('request_no, visitor_company, time_from, time_to, purpose, visitor_persons(id)')
    .eq('company_id', scope.companyId).eq('status', 'approved').eq('arrival_date', today).order('time_from');
  if (error) throw new Error(error.message);
  const rows = (data || []) as { request_no: string; visitor_company: string; time_from: string; time_to: string; purpose: string; visitor_persons: { id: string }[] }[];
  const { count } = await db.from('visitor_requests').select('id', { count: 'exact', head: true }).eq('company_id', scope.companyId).in('status', ['submitted', 'need_info']);
  const lines = rows.length === 0 ? ['ไม่มีคณะที่อนุมัติเข้าพื้นที่วันนี้'] : rows.map(r => `• ${r.time_from.slice(0, 5)}–${r.time_to.slice(0, 5)} ${r.visitor_company} (${r.visitor_persons.length} คน) — ${r.purpose.replace(/\s*\(.*\)$/, '')}`);
  return text([`ผู้มาติดต่อวันนี้ · ${scope.companyName}`, ...lines, count ? `\nรออนุมัติ ${count} คำขอ → tools.eashe.org/visitor` : ''].filter(Boolean).join('\n'));
}

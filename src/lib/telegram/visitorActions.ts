// Approve a visitor request from the Telegram group card. Same rules as the LINE version and the web queue:
// the tapping user must have linked their Telegram (line_links row with id 'tg:<user id>') to an account
// that may approve for this company. Vehicles waiting for a decision get a 2-button choice.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLinkedAccount, type LinkedAccount } from '../line/accounts';
import type { GroupScope } from '../line/groupBot';
import type { VehicleDecision, VisitorRequestWithPersons } from '../visitor/types';
import { VEHICLE_DECISION_LABEL } from '../visitor/constants';
import { decideBatch } from '../visitor/server';
import { esc, type InlineKeyboard } from './api';

const UUID = /^[0-9a-f-]{36}$/;
export const tgLinkId = (userId: number | string) => `tg:${userId}`;

export type ActionReply = { html: string; keyboard?: InlineKeyboard; toast?: string; alert?: boolean; approvedRequest?: VisitorRequestWithPersons };

function canApprove(a: LinkedAccount, companyId: string) {
  if (a.isGroupAdmin) return true;
  if (a.companyId !== companyId) return false;
  if (a.modules && !a.modules.includes('visitor')) return false;
  return a.username.trim().toLowerCase() !== companyId.toLowerCase();
}

async function loadRequest(db: SupabaseClient, id: string): Promise<VisitorRequestWithPersons | null> {
  const { data } = await db.from('visitor_requests').select('*, visitor_persons(*), visitor_vehicles(*)').eq('id', id).maybeSingle();
  const r = data as VisitorRequestWithPersons | null;
  if (r) { r.visitor_persons = [...(r.visitor_persons || [])].sort((a, b) => a.seq - b.seq); r.visitor_vehicles = [...(r.visitor_vehicles || [])].sort((a, b) => a.seq - b.seq); }
  return r;
}

export const LINK_HINT = 'ยังไม่ได้ผูก Telegram ของคุณกับบัญชี tools.eashe.org — เปิดแชทส่วนตัวกับบอทแล้วพิมพ์ /link ทำตามลิงก์ครั้งเดียว จากนั้นกดอนุมัติจากในกลุ่มได้';

/** callback_data "visitor:approve:<id>" | "visitor:confirm:<id>[:allowed|outside]" */
export async function handleVisitorCallback(db: SupabaseClient, scope: GroupScope, tgUserId: number | undefined, data: string): Promise<ActionReply> {
  const [, action, id, vehicleChoice] = data.split(':');
  if (!UUID.test(id || '')) return { html: 'คำสั่งไม่ถูกต้อง', toast: 'คำสั่งไม่ถูกต้อง' };
  const r = await loadRequest(db, id);
  if (!r || r.company_id !== scope.companyId) return { html: 'ไม่พบคำขอนี้ในบริษัทของกลุ่ม', toast: 'ไม่พบคำขอนี้' };
  if (!tgUserId) return { html: 'Telegram ไม่ส่งข้อมูลผู้กด — กรุณาอนุมัติในระบบ', toast: 'อนุมัติในระบบแทน' };
  const account = await getLinkedAccount(db, tgLinkId(tgUserId));
  if (!account) return { html: LINK_HINT, toast: 'ยังไม่ได้ผูกบัญชี — ดูข้อความในกลุ่ม', alert: true };
  if (!canApprove(account, scope.companyId)) return { html: `บัญชี ${esc(account.displayName)} ไม่มีสิทธิ์อนุมัติคำขอของ ${esc(scope.companyName)}`, toast: 'ไม่มีสิทธิ์อนุมัติ', alert: true };
  if (!['submitted', 'need_info'].includes(r.status)) {
    const s = r.status === 'approved' ? 'อนุมัติ' : r.status === 'rejected' ? 'ไม่อนุมัติ' : 'ยกเลิก';
    return { html: `${esc(r.request_no)} ถูกพิจารณาแล้ว (${s}${r.decided_by ? ` โดย ${esc(r.decided_by)}` : ''})`, toast: `พิจารณาแล้ว: ${s}` };
  }

  const pendingVehicles = (r.visitor_vehicles || []).filter(v => v.decision === 'pending');
  if (action === 'approve') {
    const who = `ในนาม ${esc(account.displayName)}`;
    const batchNote = r.batch_id ? ' <i>(ทั้งชุดหลายวัน)</i>' : '';
    if (pendingVehicles.length === 0) {
      return {
        html: `<b>ยืนยันอนุมัติ ${esc(r.request_no)}</b>${batchNote}\n${esc(r.visitor_company)} · ${r.visitor_persons.length} คน\n${who}\n<i>(ถ้าต้องใส่เงื่อนไข PPE/PTW ให้อนุมัติในระบบแทน)</i>`,
        keyboard: { inline_keyboard: [[{ text: '✅ ยืนยันอนุมัติ', callback_data: `visitor:confirm:${r.id}` }, { text: 'เปิดในระบบ', url: 'https://tools.eashe.org/visitor' }]] },
      };
    }
    const plates = pendingVehicles.map(v => `${esc(v.plate)}${v.reason ? ` (${esc(v.reason.slice(0, 60))})` : ''}`).join(', ');
    return {
      html: `<b>ยืนยันอนุมัติ ${esc(r.request_no)}</b>${batchNote}\n${esc(r.visitor_company)} · ${r.visitor_persons.length} คน\n🚗 รถรอพิจารณา ${pendingVehicles.length} คัน: ${plates}\n${who}`,
      keyboard: { inline_keyboard: [
        [{ text: '✅ อนุมัติ + รถเข้าภายในได้ทุกคัน', callback_data: `visitor:confirm:${r.id}:allowed` }],
        [{ text: '✅ อนุมัติ + รถจอดลานด้านนอก', callback_data: `visitor:confirm:${r.id}:outside` }],
        [{ text: 'เปิดในระบบ (ตัดสินรายคัน)', url: 'https://tools.eashe.org/visitor' }],
      ] },
    };
  }
  if (action === 'confirm') {
    const now = new Date().toISOString();
    const actor = `${account.displayName} (Telegram)`;
    const { error } = await db.from('visitor_requests').update({ status: 'approved', decided_by: actor, decided_at: now, decision_note: '' })
      .eq('id', r.id).in('status', ['submitted', 'need_info']);
    if (error) throw error;
    await db.from('visitor_events').insert([{ request_id: r.id, actor, action: 'approved', note: 'อนุมัติจากกลุ่ม Telegram' }]);
    if ((vehicleChoice === 'allowed' || vehicleChoice === 'outside') && pendingVehicles.length) {
      const choice = vehicleChoice as VehicleDecision;
      const { error: vErr } = await db.from('visitor_vehicles').update({ decision: choice, decided_by: actor, decided_at: now }).eq('request_id', r.id).eq('decision', 'pending');
      if (vErr) throw vErr;
      await db.from('visitor_events').insert([{ request_id: r.id, actor, action: 'vehicle_decision', note: `${pendingVehicles.map(v => v.plate).join(', ')}: ${VEHICLE_DECISION_LABEL[choice]} (จาก Telegram)` }]);
    }
    let more = 0;
    if (r.batch_id) more = await decideBatch(r.batch_id, r.id, 'approve', actor, { vehicleChoice: vehicleChoice === 'allowed' || vehicleChoice === 'outside' ? vehicleChoice : undefined, source: 'Telegram' });
    const updated = await loadRequest(db, r.id);
    return { html: `✅ อนุมัติ ${esc(r.request_no)} แล้ว โดย ${esc(account.displayName)}${more > 0 ? `\nรวมอีก ${more} วันในชุดเดียวกัน` : ''}`, toast: `อนุมัติ ${r.request_no} แล้ว${more > 0 ? ` (+${more} วัน)` : ''}`, approvedRequest: updated || undefined };
  }
  return { html: 'คำสั่งไม่ถูกต้อง', toast: 'คำสั่งไม่ถูกต้อง' };
}

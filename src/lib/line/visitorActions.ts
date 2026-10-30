// Approve a visitor request from the LINE group card. Who tapped matters: the LINE user must have
// linked their LINE to a tools.eashe.org account that may approve for this company (same rule as the
// web queue). Everything here is a reply (free); the approval record names the real person.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLinkedAccount, type LinkedAccount } from './accounts';
import { decisionCard } from './visitorCards';
import { text, type Json, type LineMessage } from './flex';
import type { GroupScope } from './groupBot';
import type { VisitorRequestWithPersons } from '../visitor/types';

const UUID = /^[0-9a-f-]{36}$/;
type Req = VisitorRequestWithPersons;

export const approvePostback = (id: string) => `visitor:approve:${id}`;
const confirmPostback = (id: string) => `visitor:confirm:${id}`;

function canApprove(a: LinkedAccount, companyId: string) {
  if (a.isGroupAdmin) return true;
  if (a.companyId !== companyId) return false;
  if (a.modules && !a.modules.includes('visitor')) return false;
  // Shared company logins (username == company id) may not approve — same as the web.
  return a.username.trim().toLowerCase() !== companyId.toLowerCase();
}

async function loadRequest(db: SupabaseClient, id: string): Promise<Req | null> {
  const { data } = await db.from('visitor_requests').select('*, visitor_persons(*), visitor_vehicles(*)').eq('id', id).maybeSingle();
  const r = data as Req | null;
  if (r) { r.visitor_persons = [...(r.visitor_persons || [])].sort((a, b) => a.seq - b.seq); r.visitor_vehicles = [...(r.visitor_vehicles || [])].sort((a, b) => a.seq - b.seq); }
  return r;
}

const linkHint = 'ยังไม่ได้ผูก LINE ของคุณกับบัญชี tools.eashe.org — ทัก EA SHE Center แบบส่วนตัว (1:1) แล้วทำตามลิงก์ที่บอทส่งให้ครั้งเดียว จากนั้นกดอนุมัติจากในกลุ่มได้';

/** Handles postback data "visitor:…" sent from a group. Returns reply messages. */
export async function handleVisitorPostback(db: SupabaseClient, scope: GroupScope, lineUserId: string | undefined, data: string): Promise<LineMessage[]> {
  const [, action, id] = data.split(':');
  if (!UUID.test(id || '')) return [text('คำสั่งไม่ถูกต้อง')];
  const r = await loadRequest(db, id);
  if (!r || r.company_id !== scope.companyId) return [text('ไม่พบคำขอนี้ในบริษัทของกลุ่ม')];
  if (!lineUserId) return [text('LINE ไม่ส่งข้อมูลผู้กด — กรุณาอนุมัติในระบบ tools.eashe.org/visitor')];
  const account = await getLinkedAccount(db, lineUserId);
  if (!account) return [text(linkHint)];
  if (!canApprove(account, scope.companyId)) return [text(`บัญชี ${account.displayName} ไม่มีสิทธิ์อนุมัติคำขอของ ${scope.companyName}`)];
  if (!['submitted', 'need_info'].includes(r.status)) return [text(`${r.request_no} ถูกพิจารณาแล้ว (${r.status === 'approved' ? 'อนุมัติ' : r.status === 'rejected' ? 'ไม่อนุมัติ' : 'ยกเลิก'}${r.decided_by ? ` โดย ${r.decided_by}` : ''})`)];

  if (action === 'approve') {
    return [{
      type: 'template', altText: `ยืนยันอนุมัติ ${r.request_no}?`,
      template: {
        type: 'confirm',
        text: `ยืนยันอนุมัติ ${r.request_no}\n${r.visitor_company} · ${r.visitor_persons.length} คน\nในนาม ${account.displayName}\n(ถ้าต้องใส่เงื่อนไข PPE/PTW ให้อนุมัติในระบบแทน)`.slice(0, 240),
        actions: [
          { type: 'postback', label: 'ยืนยันอนุมัติ', data: confirmPostback(r.id), displayText: `ยืนยันอนุมัติ ${r.request_no}` },
          { type: 'uri', label: 'เปิดในระบบ', uri: 'https://tools.eashe.org/visitor' },
        ] as Json,
      },
    }];
  }
  if (action === 'confirm') {
    const now = new Date().toISOString();
    const { error } = await db.from('visitor_requests').update({ status: 'approved', decided_by: `${account.displayName} (LINE)`, decided_at: now, decision_note: '' })
      .eq('id', r.id).in('status', ['submitted', 'need_info']);
    if (error) throw error;
    await db.from('visitor_events').insert([{ request_id: r.id, actor: `${account.displayName} (LINE)`, action: 'approved', note: 'อนุมัติจากกลุ่ม LINE' }]);
    const updated = await loadRequest(db, r.id);
    return updated ? [decisionCard(updated, scope.companyName)] : [text(`อนุมัติ ${r.request_no} แล้ว`)];
  }
  return [text('คำสั่งไม่ถูกต้อง')];
}

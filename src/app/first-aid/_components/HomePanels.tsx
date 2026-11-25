'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { ISSUE_KINDS, type FaItem, type FaState } from '@/lib/first-aid/types';
import { FA_GREEN, VIZ, fmtInt, thaiDate, type ItemStatus } from './fa';

type Row = { item: FaItem; st: ItemStatus };
const smallBtn = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap disabled:opacity-50';

/**
 * First days of a company: the steps from an empty list to a working cabinet, with a button for the next one.
 * A company that was given a starter list already has its items; one that was not has to add them before stock can be
 * entered, so the item register is a step of its own. `onAddItem` opens the "add item" form of the page.
 * It goes away by itself once a point exists and holds stock; what is left after that (minimums, QR) moves to the to-do box.
 */
export function SetupChecklist({ state, onAddItem }: { state: FaState; onAddItem: () => void }) {
  const points = state.locations.filter(l => !l.isRegister);
  const hasPoint = points.length > 0; const hasStock = state.lots.length > 0;
  if (hasPoint && hasStock) return null;
  const hasMin = state.thresholds.some(t => t.min > 0);
  const selfService = points.filter(l => l.issueMode === 'self_service');
  const hasQr = selfService.length > 0 && selfService.every(l => l.hasPublicLink);
  const itemCount = state.items.length;
  const steps: { done: boolean; title: string; text: string; cta: string; href?: string; onClick?: () => void }[] = [
    { done: hasPoint, title: 'สร้างจุดปฐมพยาบาล', text: 'ตู้ กระเป๋า หรือห้องพยาบาล ที่เก็บยาจริง', href: '/first-aid/settings', cta: 'สร้างจุด' },
    { done: itemCount > 0, title: 'เพิ่มรายการยาและเวชภัณฑ์', text: itemCount > 0 ? `มีแล้ว ${fmtInt(itemCount)} รายการ · เพิ่มได้อีกที่ปุ่ม “เพิ่มยา” ด้านล่าง` : 'ใส่ชื่อ หมวด และหน่วยของยาแต่ละตัวที่ใช้ — ต้องมีรายการก่อนจึงลงของได้', onClick: onAddItem, cta: 'เพิ่มยา' },
    { done: hasStock, title: 'ลงของที่มีอยู่ในตู้', text: 'กรอกจำนวนและวันหมดอายุของทุกรายการในตารางเดียว', href: '/first-aid/count?mode=receive&view=table', cta: 'ลงของครั้งแรก' },
    { done: hasMin, title: 'ตั้งจำนวนขั้นต่ำ', text: 'ระบบจะขึ้น “ต้องเติม” เมื่อของเหลือน้อยกว่าจำนวนนี้', href: '/first-aid/settings', cta: 'ตั้งขั้นต่ำ' },
    { done: hasQr, title: 'พิมพ์ QR ติดตู้', text: 'ให้พนักงานสแกนแล้วบันทึกการหยิบเอง (เฉพาะจุดแบบหยิบเอง)', href: '/first-aid/settings', cta: 'สร้าง / พิมพ์ QR' },
  ];
  const next = steps.findIndex(s => !s.done);
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: `${FA_GREEN}55` }} aria-label="ขั้นตอนเริ่มใช้งาน">
      <h2 className="font-semibold text-gray-900">เริ่มใช้งาน First Aid · เหลืออีก {steps.filter(s => !s.done).length} ขั้น</h2>
      <p className="mt-0.5 text-sm text-gray-600">ทำตามลำดับนี้เพื่อเริ่มจ่ายยาได้</p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 ${i === next ? 'border-gray-300 bg-gray-50' : 'border-gray-100'}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={s.done ? { background: `${VIZ.positive}22`, color: VIZ.positive } : i === next ? { background: FA_GREEN, color: '#fff' } : { background: '#F3F4F6', color: VIZ.lightText }}>{s.done ? <Check size={16} aria-label="เสร็จแล้ว" /> : i + 1}</span>
            <span className="min-w-0 flex-1 basis-48"><span className={`block font-medium ${s.done ? 'text-gray-500' : 'text-gray-900'}`}>{s.title}</span><span className="block text-sm text-gray-600">{s.text}</span></span>
            {i === next && (s.href ? <Link href={s.href} className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-white" style={{ background: FA_GREEN }}>{s.cta}</Link> : <button type="button" onClick={s.onClick} className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-white" style={{ background: FA_GREEN }}>{s.cta}</button>)}
          </li>))}
      </ol>
    </section>
  );
}

/**
 * What needs doing today, in one place, each line with the button that fixes it.
 * Counts follow the point chosen in the top bar. A cabinet counts as "to be counted" when it holds stock and has not
 * been counted in the current calendar month (the stock take is monthly).
 */
export function TodoBox({ state, scope, rows, onFilter, onBulkExpiry, onReorder, reorderBusy, onReports }: {
  state: FaState; scope: string; rows: Row[]; onFilter: (filter: 'low' | 'out' | 'expired' | 'open_expired') => void; onBulkExpiry: () => void; onReorder: () => void; reorderBusy: boolean; onReports: () => void;
}) {
  const inScope = (locationId: string) => scope === 'all' || locationId === scope;
  const points = state.locations.filter(l => !l.isRegister && inScope(l.id));
  const everStocked = new Set(state.lots.filter(l => inScope(l.locationId)).map(l => l.itemId));
  const tracked = new Set(state.items.filter(i => i.trackExpiry).map(i => i.id));
  const expired = rows.filter(r => r.st.expiredQty > 0);
  const pendingLots = state.lots.filter(l => l.quantity > 0 && !l.expiry && tracked.has(l.itemId) && inScope(l.locationId));
  // "หมด" only counts for things the point is meant to hold: a minimum is set, or it has held the item before.
  const refill = rows.filter(r => (r.st.key === 'low' || r.st.key === 'out') && (r.st.min > 0 || everStocked.has(r.item.id)));
  const openExpired = rows.filter(r => r.st.key === 'open_expired');
  const stocked = points.filter(p => state.lots.some(l => l.locationId === p.id && l.quantity > 0));
  const month = state.asOf.slice(0, 7);
  const uncounted = stocked.filter(p => !p.lastChecked || p.lastChecked.slice(0, 7) < month);
  const itemMin = new Map(state.items.map(i => [i.id, i.min]));
  const noMinimum = stocked.filter(p => !state.thresholds.some(t => t.locationId === p.id && t.min > 0) && !state.lots.some(l => l.locationId === p.id && l.quantity > 0 && (itemMin.get(l.itemId) || 0) > 0));
  const flagged = points.filter(p => p.inspectionIssue);
  const noQr = stocked.filter(p => p.issueMode === 'self_service' && !p.hasPublicLink);

  const reports = state.issueReports.filter(r => r.status === 'open' && inScope(r.locationId));

  const lines: { key: string; tone: string; text: ReactNode; actions: ReactNode }[] = [];
  if (reports.length) lines.push({ key: 'reports', tone: VIZ.accent, text: <><b>{fmtInt(reports.length)} เรื่อง</b> แจ้งจากจุดปฐมพยาบาล รอจัดการ — ล่าสุด: {ISSUE_KINDS.find(k => k.id === reports[0].kind)?.label}{reports[0].detail ? ` “${reports[0].detail.slice(0, 60)}”` : ''} ที่ {points.find(p => p.id === reports[0].locationId)?.name || '—'}</>, actions: <button type="button" className={smallBtn} onClick={onReports}>ดู / ปิดเรื่อง</button> });
  if (expired.length) lines.push({ key: 'expired', tone: VIZ.accent, text: <><b>{fmtInt(expired.length)} รายการ</b> มีของหมดอายุค้างอยู่ในตู้ — นำออกแล้วตัดทิ้งในระบบ</>, actions: <><button type="button" className={smallBtn} onClick={() => onFilter('expired')}>ดูรายการ</button><Link href="/first-aid/count" className={smallBtn}>ตัดทิ้งที่หน้าตรวจนับ</Link></> });
  if (openExpired.length) lines.push({ key: 'open', tone: VIZ.accent, text: <><b>{fmtInt(openExpired.length)} รายการ</b> เปิดขวดใช้เกินกำหนดแล้ว — เปลี่ยนขวดใหม่</>, actions: <button type="button" className={smallBtn} onClick={() => onFilter('open_expired')}>ดูรายการ</button> });
  if (flagged.length) lines.push({ key: 'flag', tone: VIZ.accent, text: <>ตรวจนับครั้งล่าสุดพบปัญหาที่ <b>{flagged.map(p => p.name).join(', ')}</b></>, actions: <Link href={`/first-aid/count?location=${flagged[0].id}`} className={smallBtn}>เปิดหน้าตรวจนับ</Link> });
  if (pendingLots.length) lines.push({ key: 'pending', tone: VIZ.secondary, text: <><b>{fmtInt(pendingLots.length)} ล็อต</b> ยังไม่มีวันหมดอายุ จึงยังจ่ายไม่ได้</>, actions: <button type="button" className={smallBtn} onClick={onBulkExpiry}>กรอกวันหมดอายุ</button> });
  if (refill.length) lines.push({ key: 'refill', tone: VIZ.secondary, text: <><b>{fmtInt(refill.length)} รายการ</b> ต้องเติม ({fmtInt(refill.filter(r => r.st.key === 'out').length)} รายการหมดแล้ว)</>, actions: <><button type="button" className={smallBtn} onClick={() => onFilter(refill.some(r => r.st.key === 'low') ? 'low' : 'out')}>ดูรายการ</button><button type="button" className={smallBtn} disabled={reorderBusy} onClick={onReorder}>{reorderBusy ? 'กำลังสร้าง…' : 'Excel รายการสั่งซื้อ'}</button></> });
  if (uncounted.length) lines.push({ key: 'count', tone: VIZ.primary, text: <>ยังไม่ได้ตรวจนับเดือนนี้: <b>{uncounted.map(p => `${p.name} (${p.lastChecked ? `ล่าสุด ${thaiDate(p.lastChecked, { short: true })}` : 'ยังไม่เคยตรวจ'})`).join(', ')}</b></>, actions: <Link href={`/first-aid/count?location=${uncounted[0].id}`} className={smallBtn}>ไปตรวจนับ</Link> });
  if (noMinimum.length) lines.push({ key: 'min', tone: VIZ.primary, text: <>ยังไม่ได้ตั้งขั้นต่ำที่ <b>{noMinimum.map(p => p.name).join(', ')}</b> — ระบบจึงยังเตือน “ต้องเติม” ไม่ได้</>, actions: <Link href={`/first-aid/settings?minimum=${noMinimum[0].id}`} className={smallBtn}>ตั้งขั้นต่ำ</Link> });
  if (noQr.length) lines.push({ key: 'qr', tone: VIZ.primary, text: <>จุดแบบหยิบเองที่ยังไม่มี QR: <b>{noQr.map(p => p.name).join(', ')}</b></>, actions: <Link href="/first-aid/settings" className={smallBtn}>สร้าง QR</Link> });
  if (!lines.length) return null;
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm" aria-label="สิ่งที่ต้องทำ">
      <h2 className="px-4 pt-3 font-semibold text-gray-900">ต้องทำ <span className="font-normal text-gray-600">· {lines.length} เรื่อง</span></h2>
      <ul className="mt-1 divide-y divide-gray-100">
        {lines.map(l => (
          <li key={l.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.tone }} aria-hidden="true" />
            <span className="min-w-0 flex-1 basis-56 text-sm leading-relaxed text-gray-800">{l.text}</span>
            <span className="flex flex-wrap gap-2">{l.actions}</span>
          </li>))}
      </ul>
    </section>
  );
}

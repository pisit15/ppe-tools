'use client';

import { useState } from 'react';
import { ISSUE_KINDS, type FaIssueReport } from '@/lib/first-aid/types';
import { FA_GREEN, Modal, VIZ, btnSecondary, errMsg, inputClass, manage, thaiDateTime, useFa } from './fa';

export const issueKindLabel = (kind: FaIssueReport['kind']) => ISSUE_KINDS.find(k => k.id === kind)?.label || kind;

/**
 * Problems reported at the cabinets (from the QR page): what, where, when and by whom, each with a button to close it
 * once dealt with. Closed ones stay visible for 30 days so the answer to "did anyone handle this?" is on the screen.
 */
export function IssueReportsModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const { state, company, scope, refresh } = useFa();
  const [notes, setNotes] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  if (!open || !state) return null;
  const point = (id: string) => state.locations.find(l => l.id === id)?.name || state.archivedLocations.find(l => l.id === id)?.name || '—';
  const mine = state.issueReports.filter(r => scope === 'all' || r.locationId === scope);
  const openOnes = mine.filter(r => r.status === 'open'); const closed = mine.filter(r => r.status === 'closed');
  async function close(report: FaIssueReport) {
    setBusy(report.id); setErr('');
    try { await manage(company, { action: 'issue-close', id: report.id, note: (notes[report.id] || '').trim() }); await refresh(); onDone('ปิดเรื่องแล้ว'); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(''); }
  }
  const head = (r: FaIssueReport) => <><div className="flex flex-wrap items-baseline gap-x-2"><b className="text-gray-900">{issueKindLabel(r.kind)}</b><span className="text-sm text-gray-700">{point(r.locationId)}</span></div>{r.detail && <p className="mt-0.5 break-words text-sm text-gray-800">{r.detail}</p>}<p className="mt-0.5 text-xs text-gray-600">แจ้งเมื่อ {thaiDateTime(r.createdAt)} · {r.source === 'qr' ? 'จากหน้า QR' : 'โดยเจ้าหน้าที่'}{r.reporterName ? ` · ${r.reporterName}` : ''}{r.reporterDepartment ? ` (${r.reporterDepartment})` : ''}</p></>;
  return (
    <Modal open={open} onClose={onClose} size="lg" title="เรื่องที่แจ้งจากจุดปฐมพยาบาล" footer={<div className="flex justify-end"><button type="button" className={btnSecondary} onClick={onClose}>ปิดหน้าต่าง</button></div>}>
      {openOnes.length === 0 ? <p className="py-6 text-center text-sm text-gray-600">ไม่มีเรื่องค้าง</p> : (
        <ul className="space-y-2">
          {openOnes.map(r => (
            <li key={r.id} className="rounded-xl border border-gray-200 p-3">
              {head(r)}
              <div className="mt-2 flex flex-wrap gap-2"><input className={`${inputClass} min-w-[180px] flex-1`} value={notes[r.id] || ''} onChange={e => setNotes(m => ({ ...m, [r.id]: e.target.value }))} placeholder="ทำอะไรไปแล้ว เช่น เติมผ้าก๊อซแล้ว (ไม่บังคับ)" aria-label={`บันทึกการแก้ไข ${issueKindLabel(r.kind)}`} maxLength={300} /><button type="button" disabled={busy === r.id} onClick={() => void close(r)} className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: FA_GREEN }}>{busy === r.id ? 'กำลังปิด…' : 'ปิดเรื่อง'}</button></div>
            </li>))}
        </ul>)}
      {err && <p className="mt-2 text-sm" style={{ color: VIZ.accent }}>{err}</p>}
      {closed.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-gray-700">ปิดแล้วใน 30 วันล่าสุด ({closed.length})</summary>
        <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">{closed.map(r => <li key={r.id} className="p-3">{head(r)}<p className="mt-0.5 text-xs" style={{ color: VIZ.positive }}>ปิดเมื่อ {thaiDateTime(r.closedAt)}{r.closedBy ? ` · ${r.closedBy}` : ''}{r.closedNote ? ` · ${r.closedNote}` : ''}</p></li>)}</ul>
      </details>}
    </Modal>
  );
}

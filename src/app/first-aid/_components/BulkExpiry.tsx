'use client';

import { useMemo, useState } from 'react';
import { FA_GREEN, ItemImage, Modal, VIZ, btnPrimary, btnSecondary, errMsg, fmtInt, manage, useFa } from './fa';
import { ThaiDateInput } from './ThaiDateInput';

/**
 * Every lot that still has no expiry date, in one list: type the dates off the boxes and save once.
 * Lots without a date cannot be dispensed, so this is the quick way to release stock that was imported without dates.
 */
export function BulkExpiryModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const { state, company, scope, refresh } = useFa();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [saved, setSaved] = useState(0);
  const lots = useMemo(() => {
    if (!state) return [];
    const items = new Map(state.items.map(i => [i.id, i])); const points = new Map(state.locations.map(l => [l.id, l.name]));
    return state.lots.filter(l => l.quantity > 0 && !l.expiry && items.get(l.itemId)?.trackExpiry && (scope === 'all' || l.locationId === scope))
      .map(l => ({ lot: l, item: items.get(l.itemId)!, point: points.get(l.locationId) || '' }))
      .sort((a, b) => a.point.localeCompare(b.point, 'th') || a.item.name.localeCompare(b.item.name, 'th'));
  }, [state, scope]);
  if (!open || !state) return null;
  const filled = lots.filter(l => values[l.lot.id]);
  async function save() {
    setBusy(true); setErr(''); let ok = 0;
    try {
      for (const l of filled) { await manage(company, { action: 'lot-expiry', lotId: l.lot.id, expiry: values[l.lot.id] }); ok += 1; setSaved(ok); }
      await refresh(); setValues({}); setSaved(0); onDone(`บันทึกวันหมดอายุ ${fmtInt(ok)} ล็อตแล้ว`); onClose();
    } catch (e) {
      // What was saved stays saved: reload so those lots leave the list, and say where it stopped.
      await refresh().catch(() => undefined); setSaved(0);
      setErr(`${errMsg(e)}${ok ? ` (บันทึกไปแล้ว ${fmtInt(ok)} ล็อต)` : ''}`);
    } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title="กรอกวันหมดอายุ" footer={<div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-gray-600">{busy ? `กำลังบันทึก ${fmtInt(saved)} / ${fmtInt(filled.length)}…` : `กรอกแล้ว ${fmtInt(filled.length)} จาก ${fmtInt(lots.length)} ล็อต`}</span><div className="flex gap-2"><button type="button" className={btnSecondary} onClick={onClose}>ปิด</button><button type="button" className={btnPrimary} style={{ background: FA_GREEN }} disabled={busy || filled.length === 0} onClick={() => void save()}>บันทึก {filled.length ? fmtInt(filled.length) : ''} ล็อต</button></div></div>}>
      <p className="mb-3 text-sm text-gray-600">พิมพ์วันหมดอายุตามที่พิมพ์บนกล่องเป็นปี ค.ศ. เช่น 31/12/2027 หรือเฉพาะเดือน/ปี 12/2027 กรอกเท่าที่มี แล้วกลับมากรอกที่เหลือทีหลังได้ · ของที่ไม่มีวันหมดอายุจริง (เช่น อุปกรณ์) ให้ปิด “ติดตามวันหมดอายุ” ที่หน้าแก้ไขรายการ</p>
      {lots.length === 0 ? <p className="py-8 text-center text-sm text-gray-600">ทุกล็อตมีวันหมดอายุครบแล้ว</p> : (
        <ul className="max-h-[55vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
          {lots.map(({ lot, item, point }) => (
            <li key={lot.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <ItemImage item={item} size={36} rounded={8} />
              <span className="min-w-0 flex-1 basis-44"><span className="block truncate font-medium text-gray-900">{item.name}</span><span className="block truncate text-xs text-gray-600">{point} · ล็อต {lot.code} · {fmtInt(lot.quantity)} {item.unit}</span></span>
              <ThaiDateInput compact monthOnly ariaLabel={`วันหมดอายุ ${item.name} ล็อต ${lot.code}`} value={values[lot.id] || ''} onChange={v => setValues(m => ({ ...m, [lot.id]: v }))} disabled={busy} />
            </li>))}
        </ul>)}
      {err && <p className="mt-2 text-sm" style={{ color: VIZ.accent }}>{err}</p>}
    </Modal>
  );
}

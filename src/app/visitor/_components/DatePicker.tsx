'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VIZ } from './ui';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dow = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();

type Props = {
  value: string[];            // selected dates (YYYY-MM-DD), any order
  onChange: (dates: string[]) => void;
  min: string;                // earliest selectable date
  max?: string;
  maxCount?: number;          // cap on selected dates
};

/** Multi-date picker: tap days on a month grid (any days, not just a range). Calendar only — no range shortcuts (owner, 13 Nov). */
export function MultiDatePicker({ value, onChange, min, max, maxCount = 14 }: Props) {
  const selected = useMemo(() => new Set(value), [value]);
  const [view, setView] = useState(() => (value[0] || min).slice(0, 7)); // YYYY-MM
  const sorted = useMemo(() => [...value].sort(), [value]);

  const cells = useMemo(() => {
    const [y, m] = view.split('-').map(Number);
    const firstDay = new Date(Date.UTC(y, m - 1, 1));
    const lead = firstDay.getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= days; d++) out.push(ymd(new Date(Date.UTC(y, m - 1, d))));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const toggle = (d: string) => {
    if (selected.has(d)) onChange(value.filter(x => x !== d));
    else if (value.length < maxCount) onChange([...value, d].sort());
  };
  const shiftMonth = (n: number) => { const [y, m] = view.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setView(d.toISOString().slice(0, 7)); };
  const [vy, vm] = view.split('-').map(Number);
  const disabled = (d: string) => d < min || (max ? d > max : false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="เดือนก่อน"><ChevronLeft size={18} /></button>
        <div className="font-semibold text-gray-800">{TH_MONTHS[vm - 1]} {vy + 543}</div>
        <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="เดือนถัดไป"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">{TH_DOW.map(d => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => d ? (
          <button key={d} type="button" disabled={disabled(d)} onClick={() => toggle(d)} aria-pressed={selected.has(d)}
            className="h-10 rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            style={selected.has(d) ? { background: VIZ.primary, color: '#fff' } : { background: dow(d) === 0 || dow(d) === 6 ? '#F7F7F7' : '#fff', border: '1px solid #E5E7EB', color: VIZ.text }}>
            {Number(d.slice(8, 10))}
          </button>
        ) : <div key={`e${i}`} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <div className="text-gray-600">เลือกแล้ว <strong style={{ color: VIZ.primary }}>{value.length}</strong>/{maxCount} วัน{sorted.length > 0 && <span className="text-gray-400"> · {sorted.map(d => Number(d.slice(8, 10))).join(', ')}</span>}</div>
        {value.length > 1 && <button type="button" onClick={() => onChange(sorted.slice(0, 1))} className="ml-auto rounded-lg px-2.5 py-1 text-xs" style={{ color: VIZ.accent }}>ล้างเหลือวันแรก</button>}
      </div>
    </div>
  );
}

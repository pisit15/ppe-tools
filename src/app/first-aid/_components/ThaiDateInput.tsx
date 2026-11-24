'use client';

import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatThaiInput, parseThaiDate } from '@/lib/first-aid/thai-date';
import { VIZ, thaiDate } from './fa';

/**
 * A date typed as วัน/เดือน/ปี ค.ศ. — instead of the browser's own date field, which shows month/day/year on a
 * device set to English. The value going in and out stays an ISO date (yyyy-mm-dd, '' = none).
 * A Buddhist-era year is still accepted and converted; the line under the field says so while it is being typed.
 * `monthOnly` (expiry dates): "12/2027" is enough and means the end of that month, as printed on the box.
 * The calendar button still opens the device's picker for people who prefer to tap.
 */
export function ThaiDateInput({ id, value, onChange, min, max, monthOnly = false, compact = false, disabled = false, attention = false, ariaLabel, widthClass }: {
  id?: string; value: string; onChange: (iso: string) => void; min?: string; max?: string;
  monthOnly?: boolean; /** Table rows: smaller, with the reading of the date shown on hover instead of underneath. */ compact?: boolean; disabled?: boolean;
  /** A date is needed here and still missing: red border. */ attention?: boolean; ariaLabel?: string; /** Tailwind width; default full width (compact: 8.75rem). */ widthClass?: string;
}) {
  // `seen` = the value this field was last given, `emitted` = the last value it reported itself.
  // A value arriving from outside (a form reset, another row copied in) replaces the text; the echo of the field's own
  // report does not, so typing is never rewritten and a mistyped date stays on screen to be corrected.
  const [st, setSt] = useState(() => ({ text: formatThaiInput(value), seen: value, emitted: value }));
  if (value !== st.seen) setSt({ text: value === st.emitted ? st.text : formatThaiInput(value), seen: value, emitted: value });
  const text = st.text;
  const native = useRef<HTMLInputElement>(null);

  const parsed = parseThaiDate(text, { monthOnly });
  const outOfRange = !!parsed && ((!!max && parsed.iso > max) || (!!min && parsed.iso < min));
  const invalid = text.trim() !== '' && (!parsed || outOfRange);
  const example = monthOnly ? 'ค.ศ. เช่น 31/12/2027 หรือ 12/2027' : 'ค.ศ. เช่น 31/12/2027';
  const reading = invalid ? (outOfRange ? (max && parsed!.iso > max ? `ต้องไม่เกิน ${thaiDate(max)}` : `ต้องไม่ก่อน ${thaiDate(min)}`) : `พิมพ์ วัน/เดือน/ปี ${example}`) : parsed ? `${parsed.monthOnly ? 'สิ้นเดือน · ' : ''}${thaiDate(parsed.iso)}${parsed.buddhist ? ` · แปลงจาก พ.ศ. ${Number(parsed.iso.slice(0, 4)) + 543}` : ''}` : '';

  function type(next: string) {
    const p = parseThaiDate(next, { monthOnly });
    const iso = p && !(max && p.iso > max) && !(min && p.iso < min) ? p.iso : '';
    setSt(s => ({ ...s, text: next, emitted: iso })); onChange(iso);
  }
  function openPicker() {
    const el = native.current; if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  }
  // Same box as the other form fields (inputClass) so rows line up; compact is for table cells.
  const box = compact ? 'h-9 rounded-lg pl-2 pr-8 text-sm' : 'rounded-lg px-3 py-2.5 pr-10';
  return (
    <div className={`${compact ? 'inline-block align-middle' : ''} ${widthClass || (compact ? 'w-[8.75rem]' : 'w-full')}`}>
      <div className="relative">
        <input id={id} type="text" inputMode="numeric" autoComplete="off" disabled={disabled} value={text} aria-label={ariaLabel} aria-invalid={invalid || undefined} title={compact ? reading || undefined : undefined}
          placeholder={compact ? 'วว/ดด/ค.ศ.' : 'วว/ดด/ปี ค.ศ.'}
          onChange={e => type(e.target.value)} onFocus={e => e.target.select()} onBlur={() => { if (parsed && !outOfRange) setSt(s => ({ ...s, text: formatThaiInput(parsed.iso) })); }}
          className={`w-full border bg-white text-gray-900 tabular-nums placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4E79A7] disabled:bg-gray-50 disabled:text-gray-500 ${box}`} style={{ borderColor: invalid || (attention && !value) ? VIZ.accent : '#D1D5DB' }} />
        <button type="button" tabIndex={-1} disabled={disabled} aria-label="เลือกจากปฏิทิน" onClick={openPicker} className={`absolute inset-y-0 right-0 flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-40 ${compact ? 'w-8' : 'w-10'}`}><Calendar size={compact ? 15 : 17} aria-hidden="true" /></button>
        {/* The device's own picker, opened by the button. It only supplies a value; what is shown is always the text field. */}
        <input ref={native} type="date" tabIndex={-1} aria-hidden="true" value={value || ''} min={min} max={max} onChange={e => { const iso = e.target.value; setSt(s => ({ ...s, text: formatThaiInput(iso), emitted: iso })); onChange(iso); }} className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0" />
      </div>
      {!compact && reading && <p className="mt-1 text-xs" style={{ color: invalid ? VIZ.accent : VIZ.lightText }} aria-live="polite">{reading}</p>}
      {compact && invalid && <p className="mt-0.5 text-xs leading-tight" style={{ color: VIZ.accent }}>{outOfRange ? reading : 'วว/ดด/ปี ค.ศ.'}</p>}
    </div>
  );
}

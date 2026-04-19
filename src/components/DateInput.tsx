'use client';

import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';

/**
 * DateInput — custom date input wrapper.
 *
 * Why: native <input type="date"> on Chrome with Thai locale leaks
 * "วว/ดด/ปปปป" placeholder text through the field even with value set.
 * This wrapper shows a Thai-formatted display and delegates the picker
 * to a hidden native input via showPicker().
 *
 * Props:
 *   value    — ISO string "YYYY-MM-DD"
 *   onChange — called with new ISO string
 *   required — native required flag
 */

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function fmtThai(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const be = y + 543;
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${be}`;
}

type WithShowPicker = HTMLInputElement & { showPicker?: () => void };

export default function DateInput({
  value, onChange, required, disabled, ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      const withPicker = el as WithShowPicker;
      if (typeof withPicker.showPicker === 'function') {
        withPicker.showPicker();
        return;
      }
    } catch { /* fall through */ }
    el.focus();
    el.click();
  };

  const ring = focus || hover;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative w-full"
    >
      <button
        type="button"
        onClick={openPicker}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        disabled={disabled}
        aria-label={ariaLabel || 'เลือกวันที่'}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left outline-none transition-colors"
        style={{
          border: '1px solid',
          borderColor: ring ? '#60A5FA' : '#E5E7EB',
          background: disabled ? '#f9fafb' : '#ffffff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: value ? '#111827' : '#9CA3AF',
          boxShadow: focus ? '0 0 0 3px rgba(219, 234, 254, 0.8)' : 'none',
        }}
      >
        <Calendar size={16} style={{ color: '#6B7280', flexShrink: 0 }} />
        <span className="flex-1 tabular-nums">
          {value ? fmtThai(value) : 'เลือกวันที่'}
        </span>
      </button>
      {/* Hidden native input — receives the picker + participates in form */}
      <input
        ref={nativeRef}
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

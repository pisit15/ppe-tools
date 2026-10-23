'use client';

// One period control for every procurement page. The URL (?y=2026) is the single source of truth:
// links can be shared, the back button works, and the nav keeps the period when moving between pages.

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Info, X } from 'lucide-react';
import { be, parsePeriod, periodInfo, type Measure, type PeriodSel } from '@/lib/procurement/period';
import type { ProcMeta } from '@/lib/procurement/types';
import { VIZ } from './ui';

export { usePeriodParam, withPeriod } from './ui';

/** Read/write URL search params on the current page without adding history entries. */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = useCallback((next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v); else sp.delete(k);
    }
    router.replace(`${pathname}${sp.size ? `?${sp}` : ''}`, { scroll: false });
  }, [params, pathname, router]);
  return { params, set };
}

/**
 * The period in the URL. Pass the loaded meta to validate it (a year without data means "all years");
 * before the data arrives any 4-digit year is trusted so the first request already asks for the right period.
 */
export function usePeriod(meta?: ProcMeta | null) {
  const { params, set } = useUrlParams();
  const raw = params.get('y');
  const sel: PeriodSel = meta ? parsePeriod(raw, meta.years) : raw && /^\d{4}$/.test(raw) ? Number(raw) : 'all';
  const setSel = useCallback((s: PeriodSel) => set({ y: s === 'all' ? null : String(s) }), [set]);
  return { sel, setSel };
}

/** Validate a requested period against the years that have data. */
export const validPeriod = (sel: PeriodSel, meta: ProcMeta | null | undefined): PeriodSel =>
  meta ? parsePeriod(sel === 'all' ? null : String(sel), meta.years) : sel;

/**
 * Segmented year control + a line that states exactly which dates are shown and what they are compared with,
 * plus data-coverage warnings. measure = which documents' dates define the period on this page.
 */
export function PeriodBar({ meta, sel, onChange, measure, compare = true, children }: {
  meta: ProcMeta | null | undefined; sel: PeriodSel; onChange: (s: PeriodSel) => void; measure: Measure;
  /** false on pages that list documents without year-on-year numbers */
  compare?: boolean; children?: React.ReactNode;
}) {
  if (!meta || !meta.years?.length) return null;
  const info = periodInfo(sel, meta, measure);
  const options: PeriodSel[] = ['all', ...meta.years];
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="ช่วงเวลา" className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-white p-0.5" style={{ borderColor: VIZ.muted }}>
          {options.map(o => {
            const active = o === sel;
            return (
              <button key={o} type="button" aria-pressed={active} onClick={() => onChange(o)}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors"
                style={active ? { background: VIZ.primary, color: 'white' } : { color: VIZ.text }}>
                {o === 'all' ? 'ทุกปี' : `ปี ${be(o)}`}
              </button>
            );
          })}
        </div>
        {children}
      </div>
      <p className="text-xs" style={{ color: VIZ.lightText }}>
        <b style={{ color: VIZ.text }}>ช่วงที่แสดง:</b> {info.label}
        {info.partial && ' (ข้อมูลถึงวันที่นำเข้า)'}
        {compare && info.prevLabel && <> · เทียบกับช่วงเดียวกันปีก่อน {info.prevLabel}</>}
      </p>
      {[...info.notes, ...(compare ? info.compareNotes : [])].map(n => (
        <p key={n} className="flex items-start gap-1.5 text-xs" style={{ color: '#B5600F' }}>
          <Info size={14} className="mt-px shrink-0" aria-hidden />{n}
        </p>
      ))}
    </div>
  );
}

/** Small pill that shows an active filter and clears it. */
export function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-sm" style={{ background: '#E8EEF5', color: VIZ.text }}>
      {label}
      <button type="button" onClick={onClear} aria-label={`ล้างตัวกรอง ${label}`} className="rounded-full p-0.5 hover:bg-white">
        <X size={14} aria-hidden />
      </button>
    </span>
  );
}

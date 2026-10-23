'use client';

// Custom charts for the procurement pages (no chart library, per project rules).
// Principles: bars start at 0, grey/blue base + one accent, direct labels instead of legends where possible,
// HTML rows for horizontal charts so Thai labels wrap on phones.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MONTHS_TH, be, pctChange } from '@/lib/procurement/period';
import { VIZ, baht, int } from './ui';

export { MONTHS_TH };
// Status colours: approved is the quiet base, pending a warning, cancelled the accent to look at.
export const STATUS_COLOR = { approved: '#A9BED4', pending: VIZ.secondary, rejected: VIZ.accent } as const;

export function niceMax(v: number) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * p).find(m => m >= v) ?? v;
}

/** 12 300 000 -> "12.3 ล้าน", 845 000 -> "845,000" */
export function shortBaht(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('th-TH', { maximumFractionDigits: 1 })} ล้าน`;
  return int(v);
}

export function Legend({ items }: { items: { color: string; label: string; kind?: 'box' | 'tick' | 'line' | 'dot' | 'ring' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: VIZ.lightText }}>
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <svg width="16" height="10" aria-hidden>
            {i.kind === 'tick' && <rect x="0" y="4" width="16" height="2.5" fill={i.color} />}
            {i.kind === 'line' && <line x1="0" y1="5" x2="16" y2="5" stroke={i.color} strokeWidth="2" />}
            {i.kind === 'dot' && <circle cx="8" cy="5" r="4" fill={i.color} />}
            {i.kind === 'ring' && <circle cx="8" cy="5" r="3.5" fill="white" stroke={i.color} strokeWidth="1.5" />}
            {(!i.kind || i.kind === 'box') && <rect x="2" y="0" width="12" height="10" rx="2" fill={i.color} />}
          </svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Action title: the conclusion in one line, with an optional supporting line. */
export function ChartTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="font-semibold leading-snug" style={{ color: VIZ.text }}>{title}</h3>
      {sub && <p className="mt-0.5 text-xs" style={{ color: VIZ.lightText }}>{sub}</p>}
    </div>
  );
}

/** Render SVG charts at the container's real pixel width so text stays readable on phones. */
function useWidth(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/* ---------------- Monthly bars with previous-year reference ticks ---------------- */

export type MonthPoint = { cur: number; prev: number | null; partial?: boolean; future?: boolean };

export function MonthlyBars({ data, format = int, ariaLabel }: { data: MonthPoint[]; format?: (v: number) => string; ariaLabel: string }) {
  const { ref, w: W } = useWidth();
  const H = W < 480 ? 200 : 230, L = 32, R = 4, T = 22, B = 28;
  const max = niceMax(Math.max(1, ...data.map(d => Math.max(d.cur, d.prev ?? 0))));
  const slot = (W - L - R) / 12, bw = slot * 0.62;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.5, 1].map(f => f * max);
  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="img" aria-label={ariaLabel}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={VIZ.grid} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={VIZ.lightText}>{format(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            {!d.future && d.cur > 0 && (
              <rect x={x} y={y(d.cur)} width={bw} height={y(0) - y(d.cur)} rx="2"
                fill={VIZ.primary} fillOpacity={d.partial ? 0.45 : 1}>
                <title>{`${MONTHS_TH[i]}: ${format(d.cur)}${d.prev !== null ? ` (ปีก่อน ${format(d.prev)})` : ''}`}</title>
              </rect>
            )}
            {!d.future && <text x={x + bw / 2} y={y(d.cur) - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={VIZ.text}>{d.cur ? format(d.cur) : ''}</text>}
            {d.prev !== null && d.prev > 0 && <rect x={x - 3} y={y(d.prev) - 1.5} width={bw + 6} height="3" fill="#555" fillOpacity="0.75" />}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={W < 480 ? 10 : 11} fill={d.future ? VIZ.muted : VIZ.lightText}>{MONTHS_TH[i]}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/* ---------------- Cumulative pace: this year vs last year ---------------- */

export function CumulativeLines({ cur, prev, curLabel, prevLabel, format = shortBaht, lastMonth, prevSame, ariaLabel }: {
  cur: number[]; prev: number[] | null; curLabel: string; prevLabel: string; format?: (v: number) => string; lastMonth: number;
  /** last year's value on the same day as the latest data (more exact than the month-end value) */
  prevSame?: number | null; ariaLabel?: string;
}) {
  const { ref, w: W } = useWidth();
  const narrow = W < 480;
  const H = narrow ? 210 : 240, L = 48, R = narrow ? 76 : 96, T = 16, B = 28;
  const curShown = cur.slice(0, lastMonth + 1);
  const max = niceMax(Math.max(1, ...curShown, ...(prev ?? [])));
  const x = (m: number) => L + (m / 11) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (vals: number[]) => vals.map((v, m) => `${m ? 'L' : 'M'}${x(m)},${y(v)}`).join(' ');
  const ticks = [0, 0.5, 1].map(f => f * max);
  const curEnd = curShown[curShown.length - 1] ?? 0;
  const prevAtSame = prev ? (prevSame ?? prev[lastMonth]) : null;
  const prevEnd = prev ? prev[11] : null;
  // keep the two end labels apart
  let yCur = y(curEnd), yPrev = prevEnd !== null ? y(prevEnd) : 0;
  if (prevEnd !== null && Math.abs(yCur - yPrev) < 16) { if (yCur < yPrev) yPrev = yCur + 16; else yCur = yPrev + 16; }
  const showMonth = (m: number) => !narrow || m % 2 === 0;
  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="img" aria-label={ariaLabel ?? `งบประมาณสะสม ${curLabel} เทียบ ${prevLabel}`}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={VIZ.grid} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={VIZ.lightText}>{format(t)}</text>
        </g>
      ))}
      {MONTHS_TH.map((mth, m) => showMonth(m) && <text key={mth} x={x(m)} y={H - 8} textAnchor="middle" fontSize="11" fill={VIZ.lightText}>{mth}</text>)}
      {prev && <path d={path(prev)} fill="none" stroke={VIZ.neutral} strokeWidth="2.5" />}
      {prev && prevEnd !== null && <text x={x(11) + 8} y={yPrev + 4} fontSize="12" fill={VIZ.lightText}>{narrow ? format(prevEnd) : `${prevLabel} ${format(prevEnd)}`}</text>}
      <path d={path(curShown)} fill="none" stroke={VIZ.primary} strokeWidth="3" />
      <circle cx={x(lastMonth)} cy={y(curEnd)} r="4.5" fill={VIZ.primary} />
      <text x={lastMonth === 11 ? x(11) + 8 : x(lastMonth) + 10} y={(lastMonth === 11 ? yCur : y(curEnd)) + 4} fontSize="12" fontWeight="700" fill={VIZ.primary}>
        {narrow ? format(curEnd) : `${curLabel} ${format(curEnd)}`}
      </text>
      {prevAtSame !== null && lastMonth < 11 && (
        <g>
          <line x1={x(lastMonth)} x2={x(lastMonth)} y1={y(curEnd)} y2={y(prevAtSame)} stroke={VIZ.neutral} strokeDasharray="3 3" />
          <circle cx={x(lastMonth)} cy={y(prevAtSame)} r="3.5" fill="white" stroke={VIZ.neutral} strokeWidth="2" />
        </g>
      )}
    </svg>
    </div>
  );
}

/* ---------------- In-cell stacked bar (common scale across rows) ---------------- */

export function StackBar({ parts, max, width = '100%' }: { parts: { value: number; color: string; label: string }[]; max: number; width?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="h-2.5 overflow-hidden rounded-sm" style={{ width, background: VIZ.bg }} title={parts.map(p => `${p.label} ${p.value}`).join(' · ')}>
      <div className="flex h-full" style={{ width: `${(total / Math.max(1, max)) * 100}%` }}>
        {parts.map(p => p.value > 0 && <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
    </div>
  );
}

/* ---------------- Horizontal bar list (HTML rows, wraps on phones) ---------------- */

export type HBarRow = { key: string; label: ReactNode; value: number; display: ReactNode; note?: ReactNode; highlight?: boolean; color?: string };

export function HBarList({ rows, max, ariaLabel }: { rows: HBarRow[]; max?: number; ariaLabel: string }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="space-y-2" aria-label={ariaLabel}>
      {rows.map(r => (
        <li key={r.key} className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(9rem,16rem)_1fr]">
          <div className="min-w-0 text-sm leading-snug" style={{ color: r.highlight ? VIZ.text : VIZ.lightText, fontWeight: r.highlight ? 600 : 400 }}>{r.label}</div>
          <div className="flex items-center gap-2">
            <div className="h-3.5 flex-1 rounded-sm" style={{ background: VIZ.bg }}>
              <div className="h-full rounded-sm" style={{ width: `${Math.max(0.5, (r.value / top) * 100)}%`, background: r.color ?? (r.highlight ? VIZ.primary : '#9AA9B8') }} />
            </div>
            <span className="w-28 shrink-0 text-right text-sm tabular-nums" style={{ color: VIZ.text }}>{r.display}</span>
          </div>
          {r.note && <div className="text-xs sm:col-start-2" style={{ color: VIZ.lightText }}>{r.note}</div>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Vendor price strip: every price as a dot, one row per vendor ---------------- */

export type StripRow = { key: string; label: ReactNode; po: number[]; quotes: number[]; median: number; best?: boolean; sub?: ReactNode };

export function VendorStrip({ rows, unit }: { rows: StripRow[]; unit: string }) {
  const all = rows.flatMap(r => [...r.po, ...r.quotes]).sort((a, b) => a - b);
  // Very large outliers would squash everyone else: cap the axis at ~1.5× the 90th percentile and mark points beyond it.
  const p90 = all[Math.floor(all.length * 0.9)] ?? 1;
  const rawMax = all[all.length - 1] ?? 1;
  const max = niceMax(rawMax > p90 * 3 ? p90 * 1.5 : rawMax);
  const capped = rawMax > max;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const ticks = [0, 0.5, 1].map(f => f * max);
  return (
    <div>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[minmax(9rem,16rem)_1fr]">
        <div className="hidden sm:block" />
        <div className="relative mb-1 h-4 text-[11px]" style={{ color: VIZ.lightText }}>
          {ticks.map((t, i) => (
            <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t), transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{shortBaht(t)}</span>
          ))}
        </div>
      </div>
      <ul className="space-y-1.5">
        {rows.map(r => (
          <li key={r.key} className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[minmax(9rem,16rem)_1fr]">
            <div className="min-w-0 text-sm leading-snug" style={{ color: r.best ? VIZ.text : VIZ.lightText, fontWeight: r.best ? 600 : 400 }}>
              {r.label}{r.sub && <span className="block text-xs font-normal" style={{ color: VIZ.lightText }}>{r.sub}</span>}
            </div>
            <div className="relative h-7 rounded-sm" style={{ background: r.best ? '#EEF3F8' : '#F6F6F6' }}>
              {ticks.slice(1, -1).map(t => <span key={t} className="absolute inset-y-0 w-px" style={{ left: pct(t), background: '#E3E3E3' }} />)}
              {r.quotes.map((v, i) => (
                <span key={`q${i}`} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: pct(v), border: `1.5px solid ${VIZ.secondary}`, background: 'white' }} title={`เสนอ ${baht(v)} บาท/${unit}`} />
              ))}
              {r.po.map((v, i) => (
                <span key={`p${i}`} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: pct(v), background: VIZ.primary, opacity: 0.85 }} title={`จ่ายจริง ${baht(v)} บาท/${unit}`} />
              ))}
              <span className="absolute inset-y-1 w-0.5" style={{ left: pct(r.median), background: VIZ.text }} title={`มัธยฐาน ${baht(r.median)}`} />
            </div>
          </li>
        ))}
      </ul>
      {capped && <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>มีราคาที่สูงกว่า {shortBaht(max)} บาท (แสดงชิดขอบขวา) — ดูค่าจริงในตารางด้านล่าง</p>}
    </div>
  );
}

/* ---------------- Change vs the same span last year ---------------- */

/** "▲ 39%" / "▼ 12%" — neutral colours: more spend is not good or bad by itself. */
export function Delta({ cur, prev, isNew, unit = '%' }: { cur: number; prev: number | null | undefined; isNew?: boolean; unit?: string }) {
  if (isNew) return <span className="rounded px-1.5 py-px text-[11px] font-medium" style={{ background: '#E8EEF5', color: VIZ.primary }}>ผู้ขายใหม่</span>;
  if (prev === null || prev === undefined) return null;
  if (!(prev > 0)) return cur > 0 ? <span style={{ color: VIZ.lightText }}>ปีก่อนไม่มี</span> : null;
  const p = pctChange(cur, prev)!;
  const r = Math.round(p);
  if (r === 0) return <span style={{ color: VIZ.lightText }}>≈ เท่าเดิม</span>;
  const times = cur / prev;
  return (
    <span className="whitespace-nowrap tabular-nums" style={{ color: r > 0 ? VIZ.text : VIZ.lightText }} title={`${r > 0 ? '+' : ''}${int(r)}%`}>
      {r > 0 ? '▲' : '▼'} {times >= 3 ? `${timesText(times)} เท่า` : `${int(Math.abs(r))}${unit}`}
    </span>
  );
}

/** 3.64 -> "3.6", 35.2 -> "35": a multiple reads better than "+3,418%". */
const timesText = (t: number) => (t < 10 ? t.toLocaleString('th-TH', { maximumFractionDigits: 1 }) : int(Math.round(t)));

/** Rank movement: "▲2", "▼1", "ใหม่ใน 10 อันดับ" */
export function RankMove({ rank, prev }: { rank: number | null; prev: number | null }) {
  if (rank === null) return null;
  if (prev === null) return null;
  const d = prev - rank;
  if (d === 0) return <span style={{ color: VIZ.lightText }}>อันดับเดิม</span>;
  return <span className="tabular-nums" style={{ color: VIZ.lightText }}>{d > 0 ? `ขึ้น ${d} อันดับ` : `ลง ${-d} อันดับ`}</span>;
}

/* ---------------- Ranked bars with last year's mark (HTML rows) ---------------- */

export type RankRow = {
  key: string; label: ReactNode; title?: string; note?: ReactNode; rank?: number | null;
  value: number; prev?: number | null; display: ReactNode; delta?: ReactNode; highlight?: boolean;
};

/**
 * One row per item: label (one line + one note line), bar from zero, last year's same-span value as a dark mark,
 * value and change on the right. Rows become buttons when onSelect is given (click to filter).
 */
export function RankBars({ rows, ariaLabel, max, onSelect, selected }: {
  rows: RankRow[]; ariaLabel: string; max?: number; onSelect?: (key: string) => void; selected?: string | null;
}) {
  const top = max ?? Math.max(1, ...rows.map(r => Math.max(r.value, r.prev ?? 0)));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  return (
    <ul className="@container divide-y divide-gray-50" aria-label={ariaLabel}>
      {rows.map(r => {
        const isSel = !!selected && selected === r.key;
        const fill = isSel || (!selected && r.highlight) ? VIZ.primary : selected ? '#C5CFDA' : '#8FA3B8';
        const body = (
          <>
            <div className="order-1 min-w-0 text-left">
              <p className="truncate text-sm leading-snug" title={r.title} style={{ color: VIZ.text, fontWeight: isSel || r.highlight ? 600 : 400 }}>
                {r.rank ? <span className="mr-1.5 inline-block w-5 text-right tabular-nums" style={{ color: VIZ.lightText, fontWeight: 400 }}>{r.rank}</span> : null}
                {r.label}
              </p>
              {r.note && <p className="truncate text-xs" style={{ color: VIZ.lightText, paddingLeft: r.rank ? '1.625rem' : 0 }}>{r.note}</p>}
            </div>
            <div className="order-3 col-span-2 @md:order-2 @md:col-span-1">
              <div className="relative h-3.5 rounded-sm" style={{ background: VIZ.bg }}>
                <div className="h-full rounded-sm" style={{ width: r.value > 0 ? `max(2px, ${pct(r.value)})` : 0, background: fill }} />
                {r.prev !== null && r.prev !== undefined && r.prev > 0 && (
                  <span className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-sm" style={{ left: pct(r.prev), background: '#444' }} aria-hidden />
                )}
              </div>
            </div>
            <div className="order-2 text-right @md:order-3">
              <p className="text-sm font-semibold tabular-nums" style={{ color: VIZ.text }}>{r.display}</p>
              {r.delta && <p className="text-xs">{r.delta}</p>}
            </div>
          </>
        );
        // Columns follow the card's own width (container query), so half-width cards still get a usable bar.
        const grid = 'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 @md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6.5rem] @3xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_8.5rem]';
        return (
          <li key={r.key}>
            {onSelect
              ? <button type="button" onClick={() => onSelect(r.key)} aria-pressed={isSel} className={`${grid} hover:bg-gray-50`} style={{ background: isSel ? '#EEF3F8' : undefined }}>{body}</button>
              : <div className={grid}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Year sparkline: one bar per year, own scale per row ---------------- */

export function YearSpark({ years, values, selected }: { years: number[]; values: number[]; selected?: number | 'all' }) {
  const max = Math.max(...values, 0);
  const label = years.map((y, i) => `${be(y)}: ${shortBaht(values[i] ?? 0)}`).join(' · ');
  return (
    <span className="inline-flex h-6 items-end gap-0.5" role="img" aria-label={`ยอด PO รายปี ${label}`} title={label}>
      {years.map((y, i) => {
        const v = values[i] ?? 0;
        const on = selected === y;
        return <span key={y} className="w-2.5 rounded-t-sm" style={{ height: v > 0 && max > 0 ? `${Math.max(8, (v / max) * 100)}%` : '2px', background: v > 0 ? (on ? VIZ.primary : '#A9BED4') : VIZ.muted }} />;
      })}
    </span>
  );
}

/* ---------------- Year x category matrix (pivot with in-cell bars) ---------------- */

export type MatrixRow = { key: string; label: string; values: number[]; note?: string };

/**
 * Rows = categories, columns = years. Each cell: value + a bar scaled within its row (reads as that row's trend).
 * Column headers drill into a year; row labels filter by category.
 */
export function YearMatrix({ years, rows, total, yearNotes, onYear, onRow, selectedRow }: {
  years: number[]; rows: MatrixRow[]; total: MatrixRow; yearNotes: Record<number, string | undefined>;
  onYear: (y: number) => void; onRow: (key: string) => void; selectedRow: string | null;
}) {
  const grand = total.values.reduce((a, b) => a + b, 0);
  const line = (r: MatrixRow, isTotal: boolean) => {
    const rowMax = Math.max(...r.values, 0);
    const sum = r.values.reduce((a, b) => a + b, 0);
    const isSel = selectedRow === r.key;
    return (
      <tr key={r.key} className="border-t border-gray-100" style={{ background: isSel ? '#EEF3F8' : isTotal ? '#FAFAFA' : undefined }}>
        <th scope="row" className="sticky left-0 z-10 min-w-[9rem] px-3 py-2 text-left font-normal" style={{ background: isSel ? '#EEF3F8' : isTotal ? '#FAFAFA' : 'white' }}>
          {isTotal
            ? <span className="font-semibold">{r.label}</span>
            : <button type="button" onClick={() => onRow(r.key)} aria-pressed={isSel} className="text-left hover:underline" style={{ color: VIZ.primary, fontWeight: isSel ? 600 : 400 }}>{r.label}</button>}
          {r.note && <span className="block text-[11px]" style={{ color: VIZ.lightText }}>{r.note}</span>}
        </th>
        {r.values.map((v, i) => (
          <td key={years[i]} className="px-3 py-2 align-middle">
            <span className={`block whitespace-nowrap text-right tabular-nums ${isTotal ? 'font-semibold' : ''}`}>{v ? shortBaht(v) : '–'}</span>
            <span className="mt-1 block h-1.5 rounded-sm" style={{ background: VIZ.bg }}>
              <span className="block h-full rounded-sm" style={{ width: rowMax > 0 && v > 0 ? `${Math.max(3, (v / rowMax) * 100)}%` : 0, background: isTotal ? VIZ.text : isSel ? VIZ.primary : '#8FA3B8' }} />
            </span>
          </td>
        ))}
        <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${isTotal ? 'font-semibold' : ''}`}>{shortBaht(sum)}</td>
        <td className="px-3 py-2 text-right tabular-nums" style={{ color: VIZ.lightText }}>{grand > 0 ? `${sum > 0 && Math.round((sum / grand) * 100) === 0 ? '<1' : Math.round((sum / grand) * 100)}%` : '–'}</td>
      </tr>
    );
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead style={{ background: VIZ.bg }}>
          <tr>
            <th scope="col" className="sticky left-0 z-10 px-3 py-2 text-left font-semibold" style={{ background: VIZ.bg }}>หมวด (ตามรหัสสินค้า Odoo)</th>
            {years.map(y => (
              <th key={y} scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                <button type="button" onClick={() => onYear(y)} className="hover:underline" style={{ color: VIZ.primary }} title={yearNotes[y] ?? `ดูเฉพาะปี ${be(y)}`}>
                  ปี {be(y)}{yearNotes[y] ? '*' : ''}
                </button>
                {yearNotes[y] && <span className="block text-[11px] font-normal" style={{ color: VIZ.lightText }}>{yearNotes[y]}</span>}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-semibold">รวม</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">สัดส่วน</th>
          </tr>
        </thead>
        <tbody>
          {line(total, true)}
          {rows.map(r => line(r, false))}
        </tbody>
      </table>
    </div>
  );
}

export const changeWord = (cur: number, prev: number | null | undefined) => {
  const p = pctChange(cur, prev);
  if (p === null) return null;
  const r = Math.round(p);
  if (r === 0) return 'ใกล้เคียงช่วงเดียวกันปีก่อน';
  const times = cur / (prev as number);
  return `${r > 0 ? 'สูงกว่า' : 'ต่ำกว่า'}ช่วงเดียวกันปีก่อน ${times >= 3 ? `${timesText(times)} เท่า` : `${int(Math.abs(r))}%`}`;
};

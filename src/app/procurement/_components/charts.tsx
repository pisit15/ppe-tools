'use client';

// Custom charts for the procurement pages (no chart library, per project rules).
// Principles: bars start at 0, grey/blue base + one accent, direct labels instead of legends where possible,
// HTML rows for horizontal charts so Thai labels wrap on phones.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { VIZ, baht, int } from './ui';

export const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
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

export function CumulativeLines({ cur, prev, curLabel, prevLabel, format = shortBaht, lastMonth }: {
  cur: number[]; prev: number[] | null; curLabel: string; prevLabel: string; format?: (v: number) => string; lastMonth: number;
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
  const prevAtSame = prev ? prev[lastMonth] : null;
  const prevEnd = prev ? prev[11] : null;
  // keep the two end labels apart
  let yCur = y(curEnd), yPrev = prevEnd !== null ? y(prevEnd) : 0;
  if (prevEnd !== null && Math.abs(yCur - yPrev) < 16) { if (yCur < yPrev) yPrev = yCur + 16; else yCur = yPrev + 16; }
  const showMonth = (m: number) => !narrow || m % 2 === 0;
  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="img" aria-label={`งบประมาณสะสม ${curLabel} เทียบ ${prevLabel}`}>
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

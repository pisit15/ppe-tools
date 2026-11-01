'use client';

import { VIZ } from './ui';

/** Completion ring: inspected / total */
export function Ring({ value, total, size = 112, stroke = 10, color = VIZ.positive, label, sub }: { value: number; total: number; size?: number; stroke?: number; color?: string; label?: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={VIZ.grid} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none" style={{ color: VIZ.text }}>{label ?? `${Math.round(p * 100)}%`}</span>
        {sub && <span className="text-[11px] text-gray-500 mt-1">{sub}</span>}
      </div>
    </div>
  );
}

/** Horizontal stacked progress per row (inspected vs remaining) with overdue tint */
export function BarList({ rows, max }: { rows: { label: string; value: number; total: number; danger?: number; href?: string; color?: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map(r => r.total));
  return (
    <ul className="space-y-2.5">
      {rows.map(r => {
        const w = (r.total / m) * 100;
        const done = r.total > 0 ? (r.value / r.total) * 100 : 0;
        return (
          <li key={r.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="truncate text-gray-700 font-medium">{r.label}</span>
              <span className="text-gray-500 tabular-nums shrink-0 ml-3">{r.value}/{r.total}{r.danger ? <span className="ml-2 font-medium" style={{ color: VIZ.accent }}>เกิน {r.danger}</span> : null}</span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: VIZ.grid, width: `${Math.max(w, 8)}%` }}>
              <div className="h-2.5 rounded-full" style={{ width: `${done}%`, background: r.color || VIZ.positive, transition: 'width .5s ease' }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 12-month column chart: inspections with fails highlighted */
export function MonthlyBars({ data, labelOf }: { data: { period: string; inspections: number; fails: number }[]; labelOf: (p: string) => string }) {
  const W = 560, H = 160, padL = 28, padB = 24, padT = 14;
  const max = Math.max(1, ...data.map(d => d.inspections));
  const bw = (W - padL - 8) / data.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="จำนวนการตรวจรายเดือน">
      {ticks.map(t => <line key={t} x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke={VIZ.grid} />)}
      {ticks.map(t => <text key={t} x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill={VIZ.lightText}>{t}</text>)}
      {data.map((d, i) => {
        const x = padL + i * bw + bw * 0.2;
        const w = bw * 0.6;
        const last = i === data.length - 1;
        return (
          <g key={d.period}>
            <rect x={x} y={y(d.inspections)} width={w} height={H - padB - y(d.inspections)} rx="3" fill={last ? VIZ.primary : `${VIZ.primary}99`} />
            {d.fails > 0 && <rect x={x} y={y(d.fails)} width={w} height={H - padB - y(d.fails)} rx="3" fill={VIZ.accent} />}
            {d.inspections > 0 && <text x={x + w / 2} y={y(d.inspections) - 4} fontSize="10" textAnchor="middle" fill={VIZ.text}>{d.inspections}</text>}
            <text x={x + w / 2} y={H - 8} fontSize="10" textAnchor="middle" fill={last ? VIZ.text : VIZ.lightText} fontWeight={last ? 600 : 400}>{labelOf(d.period)}</text>
          </g>
        );
      })}
    </svg>
  );
}

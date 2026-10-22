'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PricePoint } from '@/lib/procurement/types';
import { median } from '@/lib/procurement/analysis';
import { VIZ, baht, prHref, thaiDate } from './ui';

const W = 800, H = 260, PAD = { l: 64, r: 16, t: 16, b: 32 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v) ?? v;
}

/** Unit price over time: filled = paid on a PO, hollow = quoted. Click a point to open its PR. */
export function PriceChart({ points }: { points: PricePoint[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<PricePoint | null>(null);
  const dated = useMemo(() => points.filter(p => p.date), [points]);
  const model = useMemo(() => {
    if (!dated.length) return null;
    const ts = dated.map(p => Date.parse(p.date as string));
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (t0 === t1) { t0 -= 15 * 864e5; t1 += 15 * 864e5; }
    const yMax = niceMax(Math.max(...dated.map(p => p.unit_price)) * 1.05);
    const x = (d: string) => PAD.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
    const years: number[] = [];
    for (let yr = new Date(t0).getFullYear() + 1; yr <= new Date(t1).getFullYear(); yr++) years.push(yr);
    const poMedian = median(dated.filter(p => p.source === 'po').map(p => p.unit_price));
    return { x, y, yMax, years, poMedian };
  }, [dated]);

  if (!model) return <p className="text-sm" style={{ color: VIZ.lightText }}>ไม่มีวันที่สำหรับวาดกราฟ</p>;
  const { x, y, yMax, years, poMedian } = model;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs" style={{ color: VIZ.lightText }}>
        <span className="inline-flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill={VIZ.primary} /></svg>จ่ายจริง (PO)</span>
        <span className="inline-flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="3.5" fill="white" stroke={VIZ.secondary} strokeWidth="1.5" /></svg>ใบเสนอราคา</span>
        {poMedian > 0 && <span className="inline-flex items-center gap-1"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={VIZ.primary} strokeDasharray="4 3" /></svg>มัธยฐานราคาจ่ายจริง {baht(poMedian)} บาท</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`กราฟราคาต่อหน่วย ${dated.length} จุด`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={VIZ.grid} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={VIZ.lightText}>{baht(t)}</text>
          </g>
        ))}
        {years.map(yr => {
          const xx = x(`${yr}-01-01`);
          return <g key={yr}><line x1={xx} x2={xx} y1={PAD.t} y2={H - PAD.b} stroke={VIZ.grid} /><text x={xx} y={H - 10} textAnchor="middle" fontSize="11" fill={VIZ.lightText}>{yr + 543}</text></g>;
        })}
        {poMedian > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(poMedian)} y2={y(poMedian)} stroke={VIZ.primary} strokeDasharray="4 3" />}
        {dated.map(p => {
          const cx = x(p.date as string), cy = y(p.unit_price);
          const on = hover === p;
          return p.source === 'po'
            ? <circle key={`${p.source}${p.id}`} cx={cx} cy={cy} r={on ? 6 : 4} fill={VIZ.primary} fillOpacity={0.85} className="cursor-pointer"
                onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => router.push(prHref(p.pr_no, p.requester))} />
            : <circle key={`${p.source}${p.id}`} cx={cx} cy={cy} r={on ? 6 : 3.5} fill="white" stroke={VIZ.secondary} strokeWidth={1.5} className="cursor-pointer"
                onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => router.push(prHref(p.pr_no, p.requester))} />;
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-8 z-10 w-72 max-w-[90%] -translate-x-1/2 rounded-lg border bg-white p-3 text-xs shadow-lg" style={{ borderColor: VIZ.muted, color: VIZ.text }}>
          <p className="font-semibold">{baht(hover.unit_price)} บาท / {hover.unit || 'หน่วย'}</p>
          <p className="mt-1 line-clamp-2">{hover.item}</p>
          <p className="mt-1" style={{ color: VIZ.lightText }}>{hover.vendor || '–'}</p>
          <p style={{ color: VIZ.lightText }}>{thaiDate(hover.date)} · {hover.pr_no} {hover.ref && `· ${hover.ref}`}</p>
        </div>
      )}
    </div>
  );
}

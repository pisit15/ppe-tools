'use client';

import { useMemo, useState } from 'react';
import type { PricePoint } from '@/lib/procurement/types';
import { median } from '@/lib/procurement/analysis';
import { taxLabel, unitPriceBasisLabel } from '@/lib/procurement/comparability';
import { VIZ, baht, prHref, thaiDate, usePeriodParam } from './ui';
import { niceMax, useWidth } from './charts';

const H = 280, PAD = { l: 76, r: 24, t: 20, b: 36 };

/** Parent supplies one unit/currency series; null median shows raw records without a pooled statistic. */
export function PriceChart({ points, poMedian }: { points: PricePoint[]; poMedian?: number | null }) {
  const period = usePeriodParam();
  const { ref, w: W } = useWidth();
  const [hover, setHover] = useState<PricePoint | null>(null);
  const dated = useMemo(() => points.filter(p => p.date && Number.isFinite(Date.parse(p.date)) && Number.isFinite(p.unit_price) && p.unit_price >= 0), [points]);
  const model = useMemo(() => {
    if (!dated.length) return null;
    const ts = dated.map(p => Date.parse(p.date as string));
    let t0 = Math.min(...ts), t1 = Math.max(...ts);
    if (t0 === t1) { t0 -= 15 * 864e5; t1 += 15 * 864e5; }
    const mid = poMedian === undefined ? median(dated.filter(p => p.source === 'po').map(p => p.unit_price)) : poMedian;
    const yMax = niceMax(Math.max(...dated.map(p => p.unit_price), mid ?? 0) * 1.05);
    const x = (d: string) => PAD.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
    return { x, y, yMax, t0, t1, mid };
  }, [dated, poMedian, W]);

  if (!model) return <p className="text-sm" style={{ color: VIZ.lightText }}>ไม่มีวันที่สำหรับวาดกราฟ</p>;
  const { x, y, yMax, t0, t1, mid } = model;
  const currency = points[0]?.currency || 'ไม่ระบุสกุลเงิน';
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * yMax);
  const dateLabel = (t: number) => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

  return (
    <div ref={ref} className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: VIZ.lightText }}>
        <span className="inline-flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill={VIZ.primary} /></svg>ราคาตาม PO</span>
        <span className="inline-flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="3.5" fill="white" stroke={VIZ.secondary} strokeWidth="1.5" /></svg>ใบเสนอราคา</span>
        {mid !== null && mid > 0 && <span className="inline-flex items-center gap-1"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={VIZ.primary} strokeDasharray="4 3" /></svg>มัธยฐาน PO {baht(mid)} {currency}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="group" aria-label={`กราฟราคาต่อหน่วย ${currency} จำนวน ${dated.length} จุด กดจุดเพื่อเปิด PR หรืออ่านตารางรายการและเอกสารอ้างอิง`}>
        {ticks.map(t => <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={VIZ.grid} />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={VIZ.lightText}>{baht(t)}</text>
        </g>)}
        <text x={PAD.l} y={H - 8} fontSize="12" fill={VIZ.lightText}>{dateLabel(t0)}</text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="12" fill={VIZ.lightText}>{dateLabel(t1)}</text>
        {mid !== null && mid > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(mid)} y2={y(mid)} stroke={VIZ.primary} strokeDasharray="4 3" />}
        {dated.map(p => {
          const on = hover === p;
          return <a key={`${p.source}${p.id}`} href={prHref(p.pr_no, p.requester, period)}
            aria-label={`${p.pr_no} ${p.vendor} ${baht(p.unit_price)} ${p.currency || 'ไม่ระบุสกุลเงิน'} ต่อ ${p.unit || 'ไม่ระบุหน่วย'}`}
            onFocus={() => setHover(p)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(p.date as string)} cy={y(p.unit_price)} r={on ? 7 : 5}
              fill={p.source === 'po' ? VIZ.primary : 'white'} stroke={p.source === 'po' ? VIZ.primary : VIZ.secondary} strokeWidth={on ? 2.5 : 1.5} />
            <title>{`${thaiDate(p.date)} · ${p.vendor} · ${baht(p.unit_price)} ${p.currency || 'ไม่ระบุสกุลเงิน'} / ${p.unit}`}</title>
          </a>;
        })}
      </svg>
      {hover && <div className="pointer-events-none absolute left-1/2 top-8 z-10 w-72 max-w-[90%] -translate-x-1/2 rounded-lg border bg-white p-3 text-xs shadow-lg" style={{ borderColor: VIZ.muted, color: VIZ.text }}>
        <p className="font-semibold">{baht(hover.unit_price)} {hover.currency || 'ไม่ระบุสกุลเงิน'} / {hover.unit || 'ไม่ระบุหน่วย'}</p>
        <p className="mt-1 line-clamp-2">{hover.item}</p>
        <p className="mt-1">{taxLabel(hover.tax_basis || 'unknown')} · {unitPriceBasisLabel(hover.price_basis || 'unknown')}</p>
        <p className="mt-1" style={{ color: VIZ.lightText }}>{hover.vendor || '–'}</p>
        <p style={{ color: VIZ.lightText }}>{thaiDate(hover.date)} · {hover.pr_no} {hover.ref && `· ${hover.ref}`}</p>
      </div>}
      <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>ตำแหน่งจุดแสดงราคาและวันที่ของเอกสาร อ่านรายการทั้งหมดได้จากตารางรายการและเอกสารอ้างอิง</p>
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BarChart3, ArrowUp, ArrowDown, Minus, AlertTriangle, ChevronLeft, ChevronRight, CalendarRange, X } from 'lucide-react';
import type { PPEStockSummary, PPETransaction } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

/* ── Professional Palette (Tableau-inspired) ── */
const VIZ = {
  primary:  '#4E79A7',
  secondary:'#F28E2B',
  accent:   '#E15759',
  positive: '#59A14F',
  neutral:  '#BAB0AC',
  muted:    '#D4D4D4',
  bg:       '#EEEEEE',
  text:     '#333333',
  lightText:'#666666',
  grid:     '#EEEEEE',
};

/* ── helpers ── */
function getTypeLabel(v: string) { return PPE_TYPES.find(t => t.value === v)?.label ?? v; }
function getTypeEmoji(v: string) { return PPE_TYPES.find(t => t.value === v)?.icon ?? '📦'; }
function fmtNum(n: number) { return n.toLocaleString('th-TH'); }
function fmtCompact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Format a month key (YYYY-MM) to Thai short label */
function monthKeyToLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}
function monthKeyToFullLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}
function makeMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/* ═══════════════════════════ Month Range Picker ═══════════════════════════ */

interface DateRange {
  from: string; // YYYY-MM
  to: string;   // YYYY-MM
}

function MonthRangePicker({
  range,
  onChange,
  minDate,
  maxDate,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  minDate: string; // earliest YYYY-MM with data
  maxDate: string; // latest YYYY-MM
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseInt(range.to.split('-')[0]));
  const [selecting, setSelecting] = useState<'from' | 'to' | null>(null);
  const [tempFrom, setTempFrom] = useState(range.from);
  const [tempTo, setTempTo] = useState(range.to);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Quick presets
  const now = new Date();
  const presets = [
    { label: 'ทั้งหมด', from: minDate, to: maxDate },
    { label: 'เดือนนี้', from: makeMonthKey(now.getFullYear(), now.getMonth()), to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: 'เดือนที่แล้ว', from: makeMonthKey(now.getFullYear(), now.getMonth() - 1), to: makeMonthKey(now.getFullYear(), now.getMonth() - 1) },
    { label: '3 เดือนล่าสุด', from: makeMonthKey(now.getFullYear(), now.getMonth() - 2), to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: '6 เดือนล่าสุด', from: makeMonthKey(now.getFullYear(), now.getMonth() - 5), to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: 'ปีนี้', from: `${now.getFullYear()}-01`, to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: 'ปีที่แล้ว', from: `${now.getFullYear() - 1}-01`, to: `${now.getFullYear() - 1}-12` },
  ];

  function applyPreset(p: { from: string; to: string }) {
    onChange(p);
    setTempFrom(p.from);
    setTempTo(p.to);
    setOpen(false);
  }

  function handleMonthClick(monthKey: string) {
    if (selecting === 'from' || !selecting) {
      setTempFrom(monthKey);
      if (monthKey > tempTo) setTempTo(monthKey);
      setSelecting('to');
    } else {
      if (monthKey < tempFrom) {
        setTempFrom(monthKey);
        setTempTo(tempFrom);
      } else {
        setTempTo(monthKey);
      }
      // Apply
      const newFrom = monthKey < tempFrom ? monthKey : tempFrom;
      const newTo = monthKey < tempFrom ? tempFrom : monthKey;
      onChange({ from: newFrom, to: newTo });
      setTempFrom(newFrom);
      setTempTo(newTo);
      setSelecting(null);
      setOpen(false);
    }
  }

  function isInRange(mk: string) {
    const f = selecting === 'to' ? tempFrom : range.from;
    const t = selecting === 'to' ? tempTo : range.to;
    return mk >= f && mk <= t;
  }

  function isStart(mk: string) {
    return mk === (selecting === 'to' ? tempFrom : range.from);
  }
  function isEnd(mk: string) {
    return mk === (selecting === 'to' ? tempTo : range.to);
  }

  // Display label
  const fromLabel = monthKeyToFullLabel(range.from);
  const toLabel = monthKeyToFullLabel(range.to);
  const isSameMonth = range.from === range.to;
  const displayLabel = isSameMonth ? fromLabel : `${monthKeyToLabel(range.from)} — ${monthKeyToLabel(range.to)}`;

  // Count months in range
  const [fy, fm] = range.from.split('-').map(Number);
  const [ty, tm] = range.to.split('-').map(Number);
  const monthCount = (ty - fy) * 12 + (tm - fm) + 1;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(!open); setSelecting(null); setTempFrom(range.from); setTempTo(range.to); }}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border text-sm
          transition-all duration-150
          ${open
            ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
          }
        `}
      >
        <CalendarRange size={16} className={open ? 'text-blue-500' : 'text-gray-400'} />
        <span className="font-medium text-gray-800">{displayLabel}</span>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{monthCount} เดือน</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 flex overflow-hidden"
          style={{ minWidth: 520 }}>

          {/* Left: Presets */}
          <div className="w-40 bg-gray-50 border-r border-gray-100 p-2 flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-2 py-1">ช่วงเวลาด่วน</span>
            {presets.map((p, i) => {
              const isActive = range.from === p.from && range.to === p.to;
              return (
                <button
                  key={i}
                  onClick={() => applyPreset(p)}
                  className={`text-left text-xs px-2.5 py-1.5 rounded-md transition-colors
                    ${isActive ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Right: Month grid */}
          <div className="flex-1 p-4">
            {/* Range display */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setSelecting('from')}
                className={`flex-1 text-center text-xs py-1.5 rounded-md border transition-colors
                  ${selecting === 'from' ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
              >
                {monthKeyToFullLabel(selecting ? tempFrom : range.from)}
              </button>
              <span className="text-gray-300">→</span>
              <button
                onClick={() => setSelecting('to')}
                className={`flex-1 text-center text-xs py-1.5 rounded-md border transition-colors
                  ${selecting === 'to' ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-600'}`}
              >
                {monthKeyToFullLabel(selecting ? tempTo : range.to)}
              </button>
            </div>

            {/* Year nav */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setViewYear(y => y - 1)} className="p-1 hover:bg-gray-100 rounded">
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              <span className="text-sm font-bold text-gray-700">{viewYear} ({viewYear + 543})</span>
              <button onClick={() => setViewYear(y => y + 1)} className="p-1 hover:bg-gray-100 rounded">
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>

            {/* Month grid 4x3 */}
            <div className="grid grid-cols-4 gap-1">
              {THAI_MONTHS_SHORT.map((name, idx) => {
                const mk = makeMonthKey(viewYear, idx);
                const inRange = isInRange(mk);
                const start = isStart(mk);
                const end = isEnd(mk);
                const isFuture = mk > makeMonthKey(now.getFullYear(), now.getMonth());
                return (
                  <button
                    key={idx}
                    disabled={isFuture}
                    onClick={() => handleMonthClick(mk)}
                    className={`
                      text-xs py-2 rounded-md transition-all duration-100
                      ${isFuture ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'}
                      ${start || end ? 'bg-blue-600 text-white font-bold shadow-sm' : ''}
                      ${inRange && !start && !end ? 'bg-blue-50 text-blue-700 font-medium' : ''}
                      ${!inRange && !isFuture ? 'text-gray-600 hover:bg-gray-100' : ''}
                    `}
                  >
                    {name}
                  </button>
                );
              })}
            </div>

            {/* Hint */}
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              {selecting === 'to' ? 'เลือกเดือนสิ้นสุด' : 'คลิกเดือนเริ่มต้น แล้วเลือกเดือนสิ้นสุด'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ SVG Chart Components ═══════════════════════════ */

/** Horizontal bar chart — "Gray + One" strategy */
function HBarChart({
  data,
  maxVal,
  highlightTop = true,
  maxBars = 8,
  accentColor = VIZ.primary,
}: {
  data: { label: string; value: number }[];
  maxVal: number;
  highlightTop?: boolean;
  maxBars?: number;
  accentColor?: string;
}) {
  const display = data.slice(0, maxBars);
  if (!display.length || maxVal === 0) return <p className="text-gray-400 text-sm py-4 text-center">ไม่มีข้อมูล</p>;
  return (
    <div className="space-y-1.5">
      {display.map((d, i) => {
        const isTop = highlightTop && i === 0;
        const barColor = isTop ? accentColor : VIZ.neutral;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-24 text-[11px] text-right truncate flex-shrink-0 ${isTop ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
              {d.label}
            </span>
            <div className="flex-1 bg-gray-50 rounded h-4 overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${Math.max((d.value / maxVal) * 100, 2)}%`, background: barColor }}
              />
            </div>
            <span className={`w-11 text-[11px] text-right tabular-nums ${isTop ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
              {fmtCompact(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Combined dual-line trend chart */
function DualLineChart({
  months,
  dataA,
  dataB,
  colorA,
  colorB,
  labelA,
  labelB,
}: {
  months: string[];
  dataA: number[];
  dataB: number[];
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
}) {
  const allVals = [...dataA, ...dataB];
  if (!allVals.length || allVals.every(v => v === 0))
    return <p className="text-gray-400 text-sm py-6 text-center">ไม่มีข้อมูลในช่วงนี้</p>;

  const W = 400, H = 120, PX = 36, PY = 16, PB = 24;
  const max = Math.max(...allVals, 1);
  const chartH = H - PY - PB;

  const toPoints = (data: number[]) =>
    data.map((v, i) => ({
      x: PX + (i / Math.max(data.length - 1, 1)) * (W - PX - 8),
      y: PY + (1 - v / max) * chartH,
    }));

  const ptsA = toPoints(dataA);
  const ptsB = toPoints(dataB);
  const makeLine = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const makeArea = (pts: { x: number; y: number }[]) =>
    `${makeLine(pts)} L${pts[pts.length - 1].x},${PY + chartH} L${pts[0].x},${PY + chartH} Z`;

  const gridVals = [0, Math.round(max / 2), max];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
        {gridVals.map((v, i) => {
          const y = PY + (1 - v / max) * chartH;
          return (
            <g key={i}>
              <line x1={PX} y1={y} x2={W - 8} y2={y} stroke={VIZ.grid} strokeWidth={0.5} />
              <text x={PX - 4} y={y + 3} textAnchor="end" className="text-[8px]" fill={VIZ.lightText}>{fmtCompact(v)}</text>
            </g>
          );
        })}
        <path d={makeArea(ptsA)} fill={colorA} fillOpacity={0.08} />
        <path d={makeArea(ptsB)} fill={colorB} fillOpacity={0.08} />
        <path d={makeLine(ptsA)} fill="none" stroke={colorA} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={makeLine(ptsB)} fill="none" stroke={colorB} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {ptsA.map((p, i) => <circle key={`a${i}`} cx={p.x} cy={p.y} r={2.5} fill={colorA} />)}
        {ptsB.map((p, i) => <circle key={`b${i}`} cx={p.x} cy={p.y} r={2.5} fill={colorB} />)}
        {dataA[dataA.length - 1] > 0 && (
          <text x={ptsA[ptsA.length - 1].x + 4} y={ptsA[ptsA.length - 1].y - 6}
            className="text-[8px] font-bold" fill={colorA}>{fmtNum(dataA[dataA.length - 1])}</text>
        )}
        {dataB[dataB.length - 1] > 0 && (
          <text x={ptsB[ptsB.length - 1].x + 4} y={ptsB[ptsB.length - 1].y + 12}
            className="text-[8px] font-bold" fill={colorB}>{fmtNum(dataB[dataB.length - 1])}</text>
        )}
        {months.map((m, i) => {
          const x = PX + (i / Math.max(months.length - 1, 1)) * (W - PX - 8);
          const show = months.length <= 6 || i % 2 === 0 || i === months.length - 1;
          return show ? (
            <text key={i} x={x} y={H - 4} textAnchor="middle" className="text-[8px]" fill={VIZ.lightText}>{m}</text>
          ) : null;
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 ml-9">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: colorA }}>
          <span className="w-3 h-0.5 rounded" style={{ background: colorA, display: 'inline-block' }} /> {labelA}
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: colorB }}>
          <span className="w-3 h-0.5 rounded" style={{ background: colorB, display: 'inline-block' }} /> {labelB}
        </span>
      </div>
    </div>
  );
}

/** Mini sparkline for KPI cards */
function MiniSpark({ data, color }: { data: number[]; color: string }) {
  if (!data.length || data.every(d => d === 0)) return null;
  const W = 64, H = 20, PX = 1, PY = 2;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => ({
    x: PX + (i / Math.max(data.length - 1, 1)) * (W - 2 * PX),
    y: PY + (1 - v / max) * (H - 2 * PY),
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-16 h-5 flex-shrink-0">
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════ Page ═══════════════════════════ */

interface ReportData {
  stocks: PPEStockSummary[];
  transactions: PPETransaction[];
}

export default function ReportsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [reportData, setReportData] = useState<ReportData>({ stocks: [], transactions: [] });
  const [isLoading, setIsLoading] = useState(true);

  // Default: last 6 months (current month inclusive)
  const now = new Date();
  const defaultRange: DateRange = {
    from: makeMonthKey(now.getFullYear(), now.getMonth() - 5),
    to: makeMonthKey(now.getFullYear(), now.getMonth()),
  };
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);

  useEffect(() => {
    Promise.all([
      fetch(`/api/ppe/stock?company_id=${companyId}`),
      fetch(`/api/ppe/transactions?company_id=${companyId}&limit=2000`),
    ])
      .then(async ([stockRes, transRes]) => {
        const stockData = await stockRes.json();
        const transData = await transRes.json();
        setReportData({ stocks: stockData.data || [], transactions: transData.data || [] });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [companyId]);

  /* ── computed analytics ── */
  const analytics = useMemo(() => {
    const { stocks, transactions: allTransactions } = reportData;

    // Parse date range to cutoff dates
    const [fromY, fromM] = dateRange.from.split('-').map(Number);
    const [toY, toM] = dateRange.to.split('-').map(Number);
    const cutoffStart = new Date(fromY, fromM - 1, 1);
    const cutoffEnd = new Date(toY, toM, 0, 23, 59, 59); // last day of "to" month

    const transactions = allTransactions.filter((t) => {
      if (!t.transaction_date) return false;
      const d = new Date(t.transaction_date);
      return d >= cutoffStart && d <= cutoffEnd;
    });

    // Previous period of same length for comparison
    const monthCount = (toY - fromY) * 12 + (toM - fromM) + 1;
    const prevStart = new Date(fromY, fromM - 1 - monthCount, 1);
    const prevEnd = new Date(fromY, fromM - 1, 0, 23, 59, 59);
    const prevTransactions = allTransactions.filter((t) => {
      if (!t.transaction_date) return false;
      const d = new Date(t.transaction_date);
      return d >= prevStart && d <= prevEnd;
    });

    // type breakdown (from current stock)
    const typeMap: Record<string, { count: number; total: number }> = {};
    stocks.forEach((s) => {
      if (!typeMap[s.type]) typeMap[s.type] = { count: 0, total: 0 };
      typeMap[s.type].count += 1;
      typeMap[s.type].total += s.current_stock;
    });

    // transaction breakdown (current period)
    const transMap: Record<string, number> = {};
    transactions.forEach((t) => { transMap[t.transaction_type] = (transMap[t.transaction_type] || 0) + t.quantity; });

    // previous period totals
    const prevTransMap: Record<string, number> = {};
    prevTransactions.forEach((t) => { prevTransMap[t.transaction_type] = (prevTransMap[t.transaction_type] || 0) + t.quantity; });

    // monthly trends — iterate through each month in range
    const months: string[] = [];
    const monthlyIn: number[] = [];
    const monthlyOut: number[] = [];
    let curY = fromY, curM = fromM - 1; // 0-indexed month
    while (curY < toY || (curY === toY && curM <= toM - 1)) {
      const key = `${curY}-${String(curM + 1).padStart(2, '0')}`;
      const d = new Date(curY, curM, 1);
      months.push(d.toLocaleDateString('th-TH', { month: 'short' }));
      const mIn = transactions
        .filter(t => (t.transaction_type === 'stock_in' || t.transaction_type === 'return') && t.transaction_date?.startsWith(key))
        .reduce((s, t) => s + t.quantity, 0);
      const mOut = transactions
        .filter(t => (t.transaction_type === 'stock_out' || t.transaction_type === 'borrow') && t.transaction_date?.startsWith(key))
        .reduce((s, t) => s + t.quantity, 0);
      monthlyIn.push(mIn);
      monthlyOut.push(mOut);
      curM++;
      if (curM > 11) { curM = 0; curY++; }
    }

    // top products by stock-out
    const outByProduct: Record<string, { name: string; qty: number }> = {};
    transactions.filter(t => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow').forEach(t => {
      const prod = stocks.find(s => s.product_id === t.product_id);
      const name = prod?.name || t.product_id;
      if (!outByProduct[name]) outByProduct[name] = { name, qty: 0 };
      outByProduct[name].qty += t.quantity;
    });

    // department usage
    const deptUsage: Record<string, number> = {};
    transactions.filter(t => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow').forEach(t => {
      const dept = t.department || 'ไม่ระบุ';
      deptUsage[dept] = (deptUsage[dept] || 0) + t.quantity;
    });

    // low stock alert
    const lowStock = stocks.filter(s => s.current_stock <= (s.min_stock || 0) && s.min_stock > 0);

    const totalIn = (transMap['stock_in'] || 0) + (transMap['return'] || 0);
    const totalOut = (transMap['stock_out'] || 0) + (transMap['borrow'] || 0);
    const prevTotalIn = (prevTransMap['stock_in'] || 0) + (prevTransMap['return'] || 0);
    const prevTotalOut = (prevTransMap['stock_out'] || 0) + (prevTransMap['borrow'] || 0);

    const topType = Object.entries(typeMap).sort((a, b) => b[1].total - a[1].total)[0];
    const topTypeName = topType ? getTypeLabel(topType[0]) : '';
    const topDept = Object.entries(deptUsage).sort((a, b) => b[1] - a[1])[0];
    const topDeptName = topDept ? topDept[0] : '';
    const topProduct = Object.values(outByProduct).sort((a, b) => b.qty - a.qty)[0];

    return {
      typeMap, transMap, months, monthlyIn, monthlyOut, monthCount,
      outByProduct, deptUsage, lowStock,
      totalIn, totalOut, prevTotalIn, prevTotalOut,
      topTypeName, topDeptName, topProduct,
    };
  }, [reportData, dateRange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const { stocks } = reportData;
  const totalStock = stocks.reduce((s, st) => s + st.current_stock, 0);

  const inChange = analytics.prevTotalIn > 0 ? ((analytics.totalIn - analytics.prevTotalIn) / analytics.prevTotalIn * 100) : 0;
  const outChange = analytics.prevTotalOut > 0 ? ((analytics.totalOut - analytics.prevTotalOut) / analytics.prevTotalOut * 100) : 0;

  // Find data range for picker
  const allDates = reportData.transactions.filter(t => t.transaction_date).map(t => t.transaction_date!.slice(0, 7));
  const minDate = allDates.length > 0 ? allDates.sort()[0] : makeMonthKey(now.getFullYear(), 0);
  const maxDate = makeMonthKey(now.getFullYear(), now.getMonth());

  // Range label for subtitles
  const rangeLabel = dateRange.from === dateRange.to
    ? monthKeyToFullLabel(dateRange.from)
    : `${monthKeyToLabel(dateRange.from)} – ${monthKeyToLabel(dateRange.to)}`;

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* ── header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-gray-600" />
          <h1 className="text-xl font-bold text-gray-900">รายงาน PPE</h1>
          <span className="text-sm text-gray-400 ml-1">{stocks.length} รายการ</span>
        </div>
        <MonthRangePicker range={dateRange} onChange={setDateRange} minDate={minDate} maxDate={maxDate} />
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="สต็อกคงเหลือ"
          value={fmtNum(totalStock)}
          suffix="ชิ้น"
          color={VIZ.primary}
          sparkData={null}
          note={analytics.lowStock.length > 0 ? `${analytics.lowStock.length} รายการต่ำกว่าขั้นต่ำ` : 'สต็อกปกติทุกรายการ'}
          noteColor={analytics.lowStock.length > 0 ? VIZ.accent : VIZ.positive}
        />
        <KPICard
          label="รับเข้า"
          value={fmtNum(analytics.totalIn)}
          suffix="ชิ้น"
          color={VIZ.positive}
          sparkData={analytics.monthlyIn}
          change={inChange}
          changePeriod="vs ช่วงก่อนหน้า"
        />
        <KPICard
          label="เบิกออก"
          value={fmtNum(analytics.totalOut)}
          suffix="ชิ้น"
          color={VIZ.secondary}
          sparkData={analytics.monthlyOut}
          change={outChange}
          changePeriod="vs ช่วงก่อนหน้า"
        />
        <KPICard
          label="สต็อกต่ำ"
          value={String(analytics.lowStock.length)}
          suffix="รายการ"
          color={analytics.lowStock.length > 0 ? VIZ.accent : VIZ.neutral}
          sparkData={null}
          note={analytics.lowStock.length > 0
            ? analytics.lowStock.slice(0, 2).map(s => s.name).join(', ')
            : 'ไม่มีรายการที่ต้องเติม'}
          noteColor={analytics.lowStock.length > 0 ? VIZ.accent : VIZ.positive}
        />
      </div>

      {/* ── Row 1: Trend + Stock by type ── */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900">
            {analytics.totalOut > analytics.totalIn
              ? `เบิกออกมากกว่ารับเข้า ${fmtNum(analytics.totalOut - analytics.totalIn)} ชิ้น`
              : analytics.totalIn > analytics.totalOut
                ? `รับเข้ามากกว่าเบิกออก ${fmtNum(analytics.totalIn - analytics.totalOut)} ชิ้น`
                : `รับเข้า-เบิกออกสมดุล`}
          </h2>
          <p className="text-[11px] text-gray-400 mb-3">{rangeLabel}</p>
          <DualLineChart
            months={analytics.months}
            dataA={analytics.monthlyIn}
            dataB={analytics.monthlyOut}
            colorA={VIZ.positive}
            colorB={VIZ.secondary}
            labelA="รับเข้า + คืน"
            labelB="เบิก + ยืม"
          />
        </div>
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900">
            {analytics.topTypeName ? `${analytics.topTypeName}มีสต็อกมากที่สุด` : 'สต็อกตามประเภท'}
          </h2>
          <p className="text-[11px] text-gray-400 mb-3">จำนวนคงเหลือแยกตามประเภท PPE</p>
          <HBarChart
            data={Object.entries(analytics.typeMap)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([type, d]) => ({
                label: `${getTypeEmoji(type)} ${getTypeLabel(type)}`,
                value: d.total,
              }))}
            maxVal={Math.max(...Object.values(analytics.typeMap).map(d => d.total), 1)}
            accentColor={VIZ.primary}
          />
        </div>
      </div>

      {/* ── Row 2: Top products + Dept usage + Low stock ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900">
            {analytics.topProduct ? `"${analytics.topProduct.name}" เบิกบ่อยสุด` : 'สินค้าเบิกบ่อยสุด'}
          </h2>
          <p className="text-[11px] text-gray-400 mb-3">Top 8 เบิก/ยืม · {rangeLabel}</p>
          <HBarChart
            data={Object.values(analytics.outByProduct)
              .sort((a, b) => b.qty - a.qty)
              .slice(0, 8)
              .map((d) => ({ label: d.name, value: d.qty }))}
            maxVal={Math.max(...Object.values(analytics.outByProduct).map(d => d.qty), 1)}
            accentColor={VIZ.secondary}
          />
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900">
            {analytics.topDeptName && analytics.topDeptName !== 'ไม่ระบุ'
              ? `${analytics.topDeptName}ใช้ PPE มากที่สุด`
              : 'การใช้งานตามแผนก'}
          </h2>
          <p className="text-[11px] text-gray-400 mb-3">จำนวนเบิก/ยืมแยกตามแผนก · {rangeLabel}</p>
          <HBarChart
            data={Object.entries(analytics.deptUsage)
              .sort((a, b) => b[1] - a[1])
              .map(([dept, qty]) => ({ label: dept, value: qty }))}
            maxVal={Math.max(...Object.values(analytics.deptUsage), 1)}
            accentColor="#76B7B2"
          />
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            {analytics.lowStock.length > 0 && <AlertTriangle size={14} className="text-amber-500" />}
            {analytics.lowStock.length > 0
              ? `${analytics.lowStock.length} รายการต้องเติมสต็อก`
              : 'สต็อกอยู่ในเกณฑ์ปกติ'}
          </h2>
          <p className="text-[11px] text-gray-400 mb-3">สินค้าที่คงเหลือต่ำกว่าขั้นต่ำ</p>
          {analytics.lowStock.length > 0 ? (
            <div className="space-y-1.5">
              {analytics.lowStock.slice(0, 8).map((s) => {
                const pct = s.min_stock > 0 ? Math.round((s.current_stock / s.min_stock) * 100) : 0;
                return (
                  <div key={s.product_id} className="flex items-center gap-2">
                    <span className="w-24 text-[11px] text-gray-600 truncate flex-shrink-0">
                      {getTypeEmoji(s.type)} {s.name}
                    </span>
                    <div className="flex-1 bg-gray-50 rounded h-4 overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${Math.max(pct, 4)}%`,
                          background: pct <= 30 ? VIZ.accent : pct <= 70 ? VIZ.secondary : VIZ.positive,
                        }}
                      />
                    </div>
                    <span className="w-14 text-[10px] text-right text-gray-500 tabular-nums flex-shrink-0">
                      <span className="font-bold" style={{ color: VIZ.accent }}>{s.current_stock}</span>/{s.min_stock}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-gray-400">
              <span className="text-2xl mb-1">✓</span>
              <span className="text-xs">ไม่มีสินค้าต่ำกว่าขั้นต่ำ</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Detailed stock table ── */}
      <details className="bg-white rounded-lg border border-gray-100">
        <summary className="px-5 py-3 cursor-pointer text-sm font-bold text-gray-900 hover:bg-gray-50 select-none">
          ตารางสต็อกละเอียด ({stocks.length} รายการ)
        </summary>
        <div className="px-5 pb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-2 text-left font-semibold text-gray-500">สินค้า</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500">ประเภท</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">รับเข้า</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">เบิกออก</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">คงเหลือ</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">ขั้นต่ำ</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-500">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {stocks.length > 0 ? stocks
                .sort((a, b) => {
                  const aLow = a.current_stock <= a.min_stock && a.min_stock > 0;
                  const bLow = b.current_stock <= b.min_stock && b.min_stock > 0;
                  if (aLow !== bLow) return aLow ? -1 : 1;
                  return a.current_stock - b.current_stock;
                })
                .map((s) => {
                  const isLow = s.current_stock <= s.min_stock && s.min_stock > 0;
                  return (
                    <tr key={s.product_id} className={`border-b border-gray-50 ${isLow ? 'bg-red-50/50' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {s.image_url ? (
                          <span className="inline-flex items-center gap-1.5">
                            <img src={s.image_url} alt="" className="w-5 h-5 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            {s.name}
                          </span>
                        ) : (
                          <span>{getTypeEmoji(s.type)} {s.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{getTypeLabel(s.type)}</td>
                      <td className="px-3 py-2 text-center tabular-nums" style={{ color: VIZ.positive }}>{fmtNum(s.total_in)}</td>
                      <td className="px-3 py-2 text-center tabular-nums" style={{ color: VIZ.secondary }}>{fmtNum(s.total_out)}</td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{fmtNum(s.current_stock)}</td>
                      <td className="px-3 py-2 text-center text-gray-400 tabular-nums">{s.min_stock}</td>
                      <td className="px-3 py-2 text-center">
                        {isLow ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEE2E2', color: VIZ.accent }}>ต่ำ</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#DCFCE7', color: VIZ.positive }}>ปกติ</span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">ไม่มีข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* ── KPI Card ── */
function KPICard({
  label, value, suffix, color, sparkData, change, changePeriod, note, noteColor,
}: {
  label: string;
  value: string;
  suffix: string;
  color: string;
  sparkData: number[] | null;
  change?: number;
  changePeriod?: string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-500">{label}</span>
        {sparkData && <MiniSpark data={sparkData} color={color} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
        <span className="text-[11px] text-gray-400">{suffix}</span>
      </div>
      {change !== undefined && change !== 0 && (
        <div className="flex items-center gap-1 mt-1">
          {change > 0 ? (
            <ArrowUp size={11} style={{ color: VIZ.accent }} />
          ) : (
            <ArrowDown size={11} style={{ color: VIZ.positive }} />
          )}
          <span className="text-[10px]" style={{ color: change > 0 ? VIZ.accent : VIZ.positive }}>
            {Math.abs(change).toFixed(0)}%
          </span>
          {changePeriod && <span className="text-[10px] text-gray-400">{changePeriod}</span>}
        </div>
      )}
      {change === 0 && changePeriod && (
        <div className="flex items-center gap-1 mt-1">
          <Minus size={11} className="text-gray-400" />
          <span className="text-[10px] text-gray-400">ไม่เปลี่ยนแปลง</span>
        </div>
      )}
      {note && (
        <p className="text-[10px] mt-1 truncate" style={{ color: noteColor || VIZ.lightText }}>{note}</p>
      )}
    </div>
  );
}

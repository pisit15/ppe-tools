'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef, useCallback, Fragment } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Search, FileSpreadsheet, FileText, ChevronLeft, ChevronRight, ChevronDown,
  CalendarRange, Package, ArrowDownToLine, ArrowUpFromLine,
  Building2, Users, Download, Printer,
} from 'lucide-react';
import type { PPEStockSummary, PPETransaction } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

/* ── Palette ── */
const VIZ = {
  primary: '#4E79A7', secondary: '#F28E2B', accent: '#E15759',
  positive: '#59A14F', neutral: '#BAB0AC', muted: '#D4D4D4',
  grid: '#EEEEEE', lightText: '#666666',
};

/* ── Helpers ── */
function getTypeLabel(v: string) { return PPE_TYPES.find(t => t.value === v)?.label ?? v; }
function getTypeEmoji(v: string) { return PPE_TYPES.find(t => t.value === v)?.icon ?? '📦'; }
function getUnitLabel(v: string) { return UNIT_TYPES.find(u => u.value === v)?.label ?? v; }
function fmtNum(n: number) { return n.toLocaleString('th-TH'); }
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
}
function makeMonthKey(year: number, month: number) {
  // Handle negative months
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthKeyToLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}
function monthKeyToFullLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/* ═══════════════════ Month Range Picker (compact) ═══════════════════ */

interface DateRange { from: string; to: string; }

function MonthRangePicker({ range, onChange, minDate, maxDate }: {
  range: DateRange; onChange: (r: DateRange) => void; minDate: string; maxDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseInt(range.to.split('-')[0]));
  const [selecting, setSelecting] = useState<'from' | 'to' | null>(null);
  const [tempFrom, setTempFrom] = useState(range.from);
  const [tempTo, setTempTo] = useState(range.to);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const presets = [
    { label: 'ทั้งหมด', from: minDate, to: maxDate },
    { label: 'เดือนนี้', from: makeMonthKey(now.getFullYear(), now.getMonth()), to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: '3 เดือนล่าสุด', from: makeMonthKey(now.getFullYear(), now.getMonth() - 2), to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: '6 เดือนล่าสุด', from: makeMonthKey(now.getFullYear(), now.getMonth() - 5), to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: 'ปีนี้', from: `${now.getFullYear()}-01`, to: makeMonthKey(now.getFullYear(), now.getMonth()) },
    { label: 'ปีที่แล้ว', from: `${now.getFullYear() - 1}-01`, to: `${now.getFullYear() - 1}-12` },
  ];

  function apply(p: { from: string; to: string }) { onChange(p); setTempFrom(p.from); setTempTo(p.to); setOpen(false); }

  function handleMonthClick(mk: string) {
    if (selecting === 'from' || !selecting) {
      setTempFrom(mk); if (mk > tempTo) setTempTo(mk); setSelecting('to');
    } else {
      const nf = mk < tempFrom ? mk : tempFrom;
      const nt = mk < tempFrom ? tempFrom : mk;
      onChange({ from: nf, to: nt }); setTempFrom(nf); setTempTo(nt); setSelecting(null); setOpen(false);
    }
  }

  const isInRange = (mk: string) => mk >= (selecting === 'to' ? tempFrom : range.from) && mk <= (selecting === 'to' ? tempTo : range.to);
  const isStart = (mk: string) => mk === (selecting === 'to' ? tempFrom : range.from);
  const isEnd = (mk: string) => mk === (selecting === 'to' ? tempTo : range.to);
  const isSame = range.from === range.to;
  const label = isSame ? monthKeyToFullLabel(range.from) : `${monthKeyToLabel(range.from)} — ${monthKeyToLabel(range.to)}`;
  const [fy, fm] = range.from.split('-').map(Number);
  const [ty, tm] = range.to.split('-').map(Number);
  const mc = (ty - fy) * 12 + (tm - fm) + 1;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(!open); setSelecting(null); setTempFrom(range.from); setTempTo(range.to); }}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${open ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
        <CalendarRange size={16} className={open ? 'text-blue-500' : 'text-gray-400'} />
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{mc} เดือน</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 flex overflow-hidden" style={{ minWidth: 480 }}>
          <div className="w-36 bg-gray-50 border-r border-gray-100 p-2 flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-2 py-1">ช่วงเวลาด่วน</span>
            {presets.map((p, i) => (
              <button key={i} onClick={() => apply(p)} className={`text-left text-xs px-2.5 py-1.5 rounded-md transition-colors ${range.from === p.from && range.to === p.to ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>{p.label}</button>
            ))}
          </div>
          <div className="flex-1 p-4">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setSelecting('from')} className={`flex-1 text-center text-xs py-1.5 rounded-md border ${selecting === 'from' ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-600'}`}>{monthKeyToFullLabel(selecting ? tempFrom : range.from)}</button>
              <span className="text-gray-300">→</span>
              <button onClick={() => setSelecting('to')} className={`flex-1 text-center text-xs py-1.5 rounded-md border ${selecting === 'to' ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-600'}`}>{monthKeyToFullLabel(selecting ? tempTo : range.to)}</button>
            </div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setViewYear(y => y - 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} className="text-gray-500" /></button>
              <span className="text-sm font-bold text-gray-700">{viewYear} ({viewYear + 543})</span>
              <button onClick={() => setViewYear(y => y + 1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} className="text-gray-500" /></button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {THAI_MONTHS_SHORT.map((name, idx) => {
                const mk = makeMonthKey(viewYear, idx);
                const fut = mk > makeMonthKey(now.getFullYear(), now.getMonth());
                return (
                  <button key={idx} disabled={fut} onClick={() => handleMonthClick(mk)}
                    className={`text-xs py-2 rounded-md transition-all ${fut ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'} ${isStart(mk) || isEnd(mk) ? 'bg-blue-600 text-white font-bold' : ''} ${isInRange(mk) && !isStart(mk) && !isEnd(mk) ? 'bg-blue-50 text-blue-700 font-medium' : ''} ${!isInRange(mk) && !fut ? 'text-gray-600 hover:bg-gray-100' : ''}`}>{name}</button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">{selecting === 'to' ? 'เลือกเดือนสิ้นสุด' : 'คลิกเดือนเริ่มต้น แล้วเลือกเดือนสิ้นสุด'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ Bar Chart SVG ═══════════════════ */

function BarChartSVG({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  if (!data.length) return <p className="text-gray-400 text-sm py-4 text-center">ไม่มีข้อมูล</p>;
  const W = 400, H = Math.max(data.length * 28 + 10, 60);
  const LW = 120, BH = 18, GAP = 28;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = W - LW - 60;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {data.map((d, i) => {
        const y = 5 + i * GAP;
        const w = (d.value / max) * barW;
        const isTop = i === 0;
        return (
          <g key={i}>
            <text x={LW - 4} y={y + BH / 2 + 4} textAnchor="end" className="text-[9px]" fill={isTop ? '#333' : '#888'}>{d.label}</text>
            <rect x={LW} y={y} width={Math.max(w, 2)} height={BH} rx={3} fill={isTop ? color : VIZ.neutral} />
            <text x={LW + Math.max(w, 2) + 4} y={y + BH / 2 + 4} className="text-[9px]" fill={isTop ? '#333' : '#888'} fontWeight={isTop ? 'bold' : 'normal'}>{fmtNum(d.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════ Dual Line Chart ═══════════════════ */

function TrendChart({ months, dataIn, dataOut }: { months: string[]; dataIn: number[]; dataOut: number[] }) {
  const all = [...dataIn, ...dataOut];
  if (!all.length || all.every(v => v === 0)) return <p className="text-gray-400 text-sm py-6 text-center">ไม่มีข้อมูล</p>;
  const W = 500, H = 140, PX = 40, PY = 16, PB = 24;
  const max = Math.max(...all, 1);
  const cH = H - PY - PB;
  const pts = (d: number[]) => d.map((v, i) => ({ x: PX + (i / Math.max(d.length - 1, 1)) * (W - PX - 8), y: PY + (1 - v / max) * cH }));
  const line = (p: { x: number; y: number }[]) => p.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ');
  const area = (p: { x: number; y: number }[]) => `${line(p)} L${p[p.length - 1].x},${PY + cH} L${p[0].x},${PY + cH} Z`;
  const pA = pts(dataIn), pB = pts(dataOut);
  const grid = [0, Math.round(max / 2), max];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
        {grid.map((v, i) => { const y = PY + (1 - v / max) * cH; return (<g key={i}><line x1={PX} y1={y} x2={W - 8} y2={y} stroke={VIZ.grid} strokeWidth={0.5} /><text x={PX - 4} y={y + 3} textAnchor="end" className="text-[8px]" fill={VIZ.lightText}>{fmtNum(v)}</text></g>); })}
        <path d={area(pA)} fill={VIZ.positive} fillOpacity={0.1} />
        <path d={area(pB)} fill={VIZ.secondary} fillOpacity={0.1} />
        <path d={line(pA)} fill="none" stroke={VIZ.positive} strokeWidth={2} strokeLinecap="round" />
        <path d={line(pB)} fill="none" stroke={VIZ.secondary} strokeWidth={2} strokeLinecap="round" />
        {pA.map((p, i) => <circle key={`a${i}`} cx={p.x} cy={p.y} r={3} fill={VIZ.positive} />)}
        {pB.map((p, i) => <circle key={`b${i}`} cx={p.x} cy={p.y} r={3} fill={VIZ.secondary} />)}
        {months.map((m, i) => {
          const x = PX + (i / Math.max(months.length - 1, 1)) * (W - PX - 8);
          const show = months.length <= 8 || i % 2 === 0 || i === months.length - 1;
          return show ? <text key={i} x={x} y={H - 4} textAnchor="middle" className="text-[8px]" fill={VIZ.lightText}>{m}</text> : null;
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 ml-10">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: VIZ.positive }}><span className="w-3 h-0.5 rounded inline-block" style={{ background: VIZ.positive }} /> รับเข้า</span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: VIZ.secondary }}><span className="w-3 h-0.5 rounded inline-block" style={{ background: VIZ.secondary }} /> เบิกออก</span>
      </div>
    </div>
  );
}

/* ═══════════════════ Export Functions ═══════════════════ */

type ExportMonthly = { month: string; stockIn: number; stockOut: number; runningBalance: number };
type ExportDaily = {
  date: string; type: string; qty: number;
  po: string | null; dept: string | null;
  emp: string | null; empCode: string | null; note: string | null;
};

async function exportExcel(
  productName: string,
  stock: PPEStockSummary,
  monthlyData: ExportMonthly[],
  dailyData: ExportDaily[],
  openingBalance: number,
  endingBalance: number,
  deptData: { dept: string; qty: number }[],
  empData: { name: string; dept: string; qty: number }[],
  rangeLabel: string
) {
  const XLSX = (await import('xlsx'));
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const totalInAll = monthlyData.reduce((s, m) => s + m.stockIn, 0);
  const totalOutAll = monthlyData.reduce((s, m) => s + m.stockOut, 0);
  const summary = [
    ['รายงานสินค้า PPE - สำหรับแผนกจัดซื้อ'],
    [''],
    ['ชื่อสินค้า', productName],
    ['ประเภท', getTypeLabel(stock.type)],
    ['หน่วย', getUnitLabel(stock.unit)],
    ['ช่วงเวลา', rangeLabel],
    [''],
    ['ยอดยกมา (ก่อนช่วงที่เลือก)', openingBalance],
    ['รับเข้าในช่วง', totalInAll],
    ['เบิกออกในช่วง', totalOutAll],
    ['ยอดคงเหลือสิ้นสุดช่วง', endingBalance],
    [''],
    ['สต็อกคงเหลือปัจจุบัน', stock.current_stock],
    ['ขั้นต่ำ', stock.min_stock],
    ['รับเข้าทั้งหมด (ประวัติทั้งหมด)', stock.total_in],
    ['เบิกออกทั้งหมด (ประวัติทั้งหมด)', stock.total_out],
    ['สถานะ', stock.current_stock <= stock.min_stock && stock.min_stock > 0 ? 'ต่ำกว่าขั้นต่ำ - ต้องสั่งซื้อ' : 'ปกติ'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{ wch: 32 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'สรุป');

  // Sheet 2: Monthly breakdown (with opening balance + running balance)
  const monthHeaders = ['เดือน', 'รับเข้า', 'เบิกออก', 'ผลต่าง', 'คงเหลือสิ้นเดือน'];
  const openingRow: (string | number)[] = ['ยอดยกมา', '', '', '', openingBalance];
  const monthRows: (string | number)[][] = monthlyData.map(m => [m.month, m.stockIn, m.stockOut, m.stockIn - m.stockOut, m.runningBalance]);
  const totalRow: (string | number)[] = ['รวม', totalInAll, totalOutAll, totalInAll - totalOutAll, endingBalance];
  const ws2 = XLSX.utils.aoa_to_sheet([monthHeaders, openingRow, ...monthRows, totalRow]);
  ws2['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'รายเดือน');

  // Sheet 3: Daily detail (all transactions in range)
  const dailyHeaders = ['วันที่', 'ประเภท', 'จำนวน', 'เลข PO', 'แผนก', 'พนักงาน', 'รหัสพนักงาน', 'หมายเหตุ'];
  const dailyRows = dailyData.map(d => [
    d.date, d.type, d.qty,
    d.po || '', d.dept || '',
    d.emp || '', d.empCode || '', d.note || '',
  ]);
  const ws3 = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);
  ws3['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'รายวัน');

  // Sheet 4: Department breakdown
  const deptHeaders = ['แผนก', 'จำนวนเบิก', '% ของทั้งหมด'];
  const deptTotal = deptData.reduce((s, d) => s + d.qty, 0);
  const deptRows = deptData.map(d => [d.dept, d.qty, deptTotal > 0 ? `${((d.qty / deptTotal) * 100).toFixed(1)}%` : '0%']);
  deptRows.push(['รวม', deptTotal, '100%']);
  const ws4 = XLSX.utils.aoa_to_sheet([deptHeaders, ...deptRows]);
  ws4['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'ตามแผนก');

  // Sheet 5: Employee detail
  const empHeaders = ['พนักงาน', 'แผนก', 'จำนวนเบิก'];
  const empRows = empData.map(e => [e.name, e.dept, e.qty]);
  const ws5 = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
  ws5['!cols'] = [{ wch: 25 }, { wch: 22 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'ตามพนักงาน');

  const filename = `PPE_Report_${productName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

async function exportPDF(
  productName: string,
  stock: PPEStockSummary,
  monthlyData: ExportMonthly[],
  openingBalance: number,
  endingBalance: number,
  deptData: { dept: string; qty: number }[],
  empData: { name: string; dept: string; qty: number }[],
  rangeLabel: string
) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF('p', 'mm', 'a4');

  // Thai font fallback: use Helvetica (will show boxes for Thai in basic jsPDF)
  // For proper Thai, we'd need to embed a Thai font — using simple ASCII-safe approach
  doc.setFontSize(16);
  doc.text('PPE Product Report', 14, 20);
  doc.setFontSize(10);
  doc.text(`Product: ${productName}`, 14, 30);
  doc.text(`Type: ${getTypeLabel(stock.type)} | Unit: ${getUnitLabel(stock.unit)}`, 14, 36);
  doc.text(`Period: ${rangeLabel}`, 14, 42);
  doc.text(`Opening Balance: ${fmtNum(openingBalance)} | Ending Balance: ${fmtNum(endingBalance)} | Current Stock: ${fmtNum(stock.current_stock)} | Min: ${stock.min_stock} | Status: ${stock.current_stock <= stock.min_stock && stock.min_stock > 0 ? 'LOW - Need to Purchase' : 'Normal'}`, 14, 48);

  let y = 56;

  // Monthly table (with opening balance row + running balance column)
  doc.setFontSize(12);
  doc.text('Monthly Breakdown', 14, y);
  y += 4;
  const totalInAll = monthlyData.reduce((s, m) => s + m.stockIn, 0);
  const totalOutAll = monthlyData.reduce((s, m) => s + m.stockOut, 0);
  autoTable(doc, {
    startY: y,
    head: [['Month', 'Stock In', 'Stock Out', 'Difference', 'End Balance']],
    body: [
      ['Opening Balance', '', '', '', String(openingBalance)],
      ...monthlyData.map(m => [m.month, String(m.stockIn), String(m.stockOut), String(m.stockIn - m.stockOut), String(m.runningBalance)]),
      ['TOTAL', String(totalInAll), String(totalOutAll), String(totalInAll - totalOutAll), String(endingBalance)],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [78, 121, 167] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Department table
  doc.setFontSize(12);
  doc.text('Department Usage', 14, y);
  y += 4;
  const deptTotal = deptData.reduce((s, d) => s + d.qty, 0);
  autoTable(doc, {
    startY: y,
    head: [['Department', 'Quantity', '% of Total']],
    body: deptData.map(d => [d.dept, String(d.qty), deptTotal > 0 ? `${((d.qty / deptTotal) * 100).toFixed(1)}%` : '0%']),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [78, 121, 167] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Employee table (if fits on page)
  if (y < 220 && empData.length > 0) {
    doc.setFontSize(12);
    doc.text('Employee Detail', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['Employee', 'Department', 'Quantity']],
      body: empData.slice(0, 20).map(e => [e.name, e.dept, String(e.qty)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [78, 121, 167] },
    });
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated: ${new Date().toLocaleDateString('th-TH')} | PPE Inventory System - tools.eashe.org`, 14, 285);

  doc.save(`PPE_Report_${productName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/* ═══════════════════ Main Page ═══════════════════ */

export default function ProductReportPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [stocks, setStocks] = useState<PPEStockSummary[]>([]);
  const [transactions, setTransactions] = useState<PPETransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const expandAllMonths = useCallback((keys: string[]) => {
    setExpandedMonths(new Set(keys));
  }, []);
  const collapseAllMonths = useCallback(() => {
    setExpandedMonths(new Set());
  }, []);

  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: makeMonthKey(now.getFullYear(), now.getMonth() - 5),
    to: makeMonthKey(now.getFullYear(), now.getMonth()),
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/ppe/stock?company_id=${companyId}`),
      fetch(`/api/ppe/transactions?company_id=${companyId}&limit=5000`),
    ])
      .then(async ([sRes, tRes]) => {
        const sData = await sRes.json();
        const tData = await tRes.json();
        setStocks(sData.data || []);
        setTransactions(tData.data || []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [companyId]);

  // Close dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selectedStock = stocks.find(s => s.product_id === selectedProduct);

  // Filter products for search
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return stocks.sort((a, b) => a.name.localeCompare(b.name));
    const lower = searchTerm.toLowerCase();
    return stocks.filter(s => s.name.toLowerCase().includes(lower) || getTypeLabel(s.type).toLowerCase().includes(lower)).sort((a, b) => a.name.localeCompare(b.name));
  }, [stocks, searchTerm]);

  // Compute product-specific analytics
  const productAnalytics = useMemo(() => {
    if (!selectedProduct || !selectedStock) return null;

    const [fromY, fromM] = dateRange.from.split('-').map(Number);
    const [toY, toM] = dateRange.to.split('-').map(Number);
    const cutoffStart = new Date(fromY, fromM - 1, 1);
    const cutoffEnd = new Date(toY, toM, 0, 23, 59, 59);

    // All transactions for this product
    const allProductTx = transactions.filter(t => t.product_id === selectedProduct && t.transaction_date);

    // Opening balance: all transactions BEFORE the range start
    const beforeTx = allProductTx.filter(t => new Date(t.transaction_date!) < cutoffStart);
    const openingIn = beforeTx.filter(t => t.transaction_type === 'stock_in' || t.transaction_type === 'return').reduce((s, t) => s + t.quantity, 0);
    const openingOut = beforeTx.filter(t => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow').reduce((s, t) => s + t.quantity, 0);
    const openingBalance = openingIn - openingOut;

    // Transactions within the range
    const productTx = allProductTx.filter(t => {
      const d = new Date(t.transaction_date!);
      return d >= cutoffStart && d <= cutoffEnd;
    });

    // Monthly breakdown with daily detail + running balance
    type StockInDay = { date: string; qty: number; po: string | null; note: string | null; type: 'stock_in' | 'return' };
    type StockOutDay = { date: string; qty: number; dept: string; emp: string; empCode: string | null; note: string | null; type: 'stock_out' | 'borrow' };
    type MonthData = {
      key: string; label: string; fullLabel: string;
      stockIn: number; stockOut: number; runningBalance: number;
      stockInDays: StockInDay[]; stockOutDays: StockOutDay[];
    };
    const monthly: MonthData[] = [];
    let running = openingBalance;
    let cY = fromY, cM = fromM - 1;
    while (cY < toY || (cY === toY && cM <= toM - 1)) {
      const key = `${cY}-${String(cM + 1).padStart(2, '0')}`;
      const d = new Date(cY, cM, 1);
      const monthTx = productTx.filter(t => t.transaction_date?.startsWith(key));
      const inTx = monthTx.filter(t => t.transaction_type === 'stock_in' || t.transaction_type === 'return');
      const outTx = monthTx.filter(t => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow');

      const mIn = inTx.reduce((s, t) => s + t.quantity, 0);
      const mOut = outTx.reduce((s, t) => s + t.quantity, 0);
      running = running + mIn - mOut;

      const stockInDays: StockInDay[] = inTx
        .slice()
        .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''))
        .map(t => ({
          date: t.transaction_date!,
          qty: t.quantity,
          po: t.po_number,
          note: t.notes,
          type: t.transaction_type as 'stock_in' | 'return',
        }));

      const stockOutDays: StockOutDay[] = outTx
        .slice()
        .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''))
        .map(t => ({
          date: t.transaction_date!,
          qty: t.quantity,
          dept: t.department || 'ไม่ระบุ',
          emp: t.employee_name || (t.employee_code || '-'),
          empCode: t.employee_code,
          note: t.notes,
          type: t.transaction_type as 'stock_out' | 'borrow',
        }));

      monthly.push({
        key,
        label: d.toLocaleDateString('th-TH', { month: 'short' }),
        fullLabel: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
        stockIn: mIn, stockOut: mOut, runningBalance: running,
        stockInDays, stockOutDays,
      });
      cM++; if (cM > 11) { cM = 0; cY++; }
    }
    const endingBalance = monthly.length > 0 ? monthly[monthly.length - 1].runningBalance : openingBalance;

    // Department breakdown
    const deptMap: Record<string, number> = {};
    productTx.filter(t => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow').forEach(t => {
      const dept = t.department || 'ไม่ระบุ';
      deptMap[dept] = (deptMap[dept] || 0) + t.quantity;
    });
    const deptData = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).map(([dept, qty]) => ({ dept, qty }));

    // Employee breakdown
    const empMap: Record<string, { name: string; dept: string; code: string; qty: number }> = {};
    productTx.filter(t => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow').forEach(t => {
      const key = t.employee_name || t.employee_code || 'ไม่ระบุ';
      if (!empMap[key]) empMap[key] = { name: key, dept: t.department || 'ไม่ระบุ', code: t.employee_code || '', qty: 0 };
      empMap[key].qty += t.quantity;
    });
    const empData = Object.values(empMap).sort((a, b) => b.qty - a.qty);

    const totalIn = monthly.reduce((s, m) => s + m.stockIn, 0);
    const totalOut = monthly.reduce((s, m) => s + m.stockOut, 0);
    const avgOutPerMonth = monthly.length > 0 ? totalOut / monthly.length : 0;
    const monthsUntilEmpty = avgOutPerMonth > 0 ? Math.floor(selectedStock.current_stock / avgOutPerMonth) : Infinity;

    return {
      monthly, deptData, empData, totalIn, totalOut, avgOutPerMonth, monthsUntilEmpty,
      openingBalance, endingBalance,
    };
  }, [selectedProduct, selectedStock, transactions, dateRange]);

  // Data range for picker
  const allDates = transactions.filter(t => t.transaction_date).map(t => t.transaction_date!.slice(0, 7));
  const minDate = allDates.length > 0 ? allDates.sort()[0] : makeMonthKey(now.getFullYear(), 0);
  const maxDate = makeMonthKey(now.getFullYear(), now.getMonth());
  const rangeLabel = dateRange.from === dateRange.to ? monthKeyToFullLabel(dateRange.from) : `${monthKeyToLabel(dateRange.from)} – ${monthKeyToLabel(dateRange.to)}`;

  const handleExportExcel = useCallback(() => {
    if (!selectedStock || !productAnalytics) return;
    const typeLabels: Record<string, string> = {
      stock_in: 'รับเข้า', return: 'คืน', stock_out: 'เบิกออก', borrow: 'ยืม',
    };
    const dailyData: ExportDaily[] = [];
    productAnalytics.monthly.forEach(m => {
      m.stockInDays.forEach(d => {
        dailyData.push({
          date: d.date, type: typeLabels[d.type] || d.type, qty: d.qty,
          po: d.po, dept: null, emp: null, empCode: null, note: d.note,
        });
      });
      m.stockOutDays.forEach(d => {
        dailyData.push({
          date: d.date, type: typeLabels[d.type] || d.type, qty: d.qty,
          po: null, dept: d.dept, emp: d.emp, empCode: d.empCode, note: d.note,
        });
      });
    });
    dailyData.sort((a, b) => a.date.localeCompare(b.date));
    exportExcel(
      selectedStock.name, selectedStock,
      productAnalytics.monthly.map(m => ({ month: m.fullLabel, stockIn: m.stockIn, stockOut: m.stockOut, runningBalance: m.runningBalance })),
      dailyData,
      productAnalytics.openingBalance,
      productAnalytics.endingBalance,
      productAnalytics.deptData,
      productAnalytics.empData.map(e => ({ name: e.name, dept: e.dept, qty: e.qty })),
      rangeLabel
    );
  }, [selectedStock, productAnalytics, rangeLabel]);

  const handleExportPDF = useCallback(() => {
    if (!selectedStock || !productAnalytics) return;
    exportPDF(
      selectedStock.name, selectedStock,
      productAnalytics.monthly.map(m => ({ month: m.fullLabel, stockIn: m.stockIn, stockOut: m.stockOut, runningBalance: m.runningBalance })),
      productAnalytics.openingBalance,
      productAnalytics.endingBalance,
      productAnalytics.deptData,
      productAnalytics.empData.map(e => ({ name: e.name, dept: e.dept, qty: e.qty })),
      rangeLabel
    );
  }, [selectedStock, productAnalytics, rangeLabel]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full min-h-[400px]"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Package size={22} className="text-gray-600" />
          <h1 className="text-xl font-bold text-gray-900">รายงานสินค้า PPE</h1>
          <span className="text-xs text-gray-400">สำหรับแผนกจัดซื้อ</span>
        </div>
        <MonthRangePicker range={dateRange} onChange={setDateRange} minDate={minDate} maxDate={maxDate} />
      </div>

      {/* Product selector + Export buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search/Select product */}
        <div ref={dropdownRef} className="relative flex-1 min-w-[280px] max-w-[500px]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาสินค้า PPE..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
            />
          </div>
          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-lg shadow-xl border border-gray-200 max-h-72 overflow-auto">
              {filteredProducts.length === 0 && <p className="text-gray-400 text-sm p-3">ไม่พบสินค้า</p>}
              {filteredProducts.map(s => (
                <button
                  key={s.product_id}
                  onClick={() => { setSelectedProduct(s.product_id); setSearchTerm(s.name); setShowDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 transition-colors ${selectedProduct === s.product_id ? 'bg-blue-50' : ''}`}
                >
                  <span className="text-lg">{s.image_url ? <img src={s.image_url} alt="" className="w-7 h-7 rounded object-cover" /> : getTypeEmoji(s.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                    <div className="text-[10px] text-gray-400">{getTypeLabel(s.type)} · คงเหลือ {fmtNum(s.current_stock)} {getUnitLabel(s.unit)}</div>
                  </div>
                  {s.current_stock <= s.min_stock && s.min_stock > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">ต่ำ</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export buttons */}
        {selectedStock && productAnalytics && (
          <div className="flex items-center gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
              <FileText size={14} /> Export PDF
            </button>
          </div>
        )}
      </div>

      {/* ── No product selected state ── */}
      {!selectedStock && (
        <div className="bg-white rounded-lg border border-gray-100 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">เลือกสินค้า PPE เพื่อดูรายงานละเอียด</p>
          <p className="text-gray-400 text-xs mt-1">รวมข้อมูลสต็อก, การเบิก, แผนก, พนักงาน สำหรับส่งแผนกจัดซื้อ</p>
        </div>
      )}

      {/* ── Product Detail ── */}
      {selectedStock && productAnalytics && (
        <>
          {/* Product info card */}
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Product image/emoji */}
              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-3xl flex-shrink-0">
                {selectedStock.image_url
                  ? <img src={selectedStock.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  : getTypeEmoji(selectedStock.type)}
              </div>
              {/* Product details */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{selectedStock.name}</h2>
                <p className="text-xs text-gray-500">{getTypeLabel(selectedStock.type)} · {getUnitLabel(selectedStock.unit)}</p>
              </div>
              {/* KPI boxes */}
              <div className="flex gap-3 flex-wrap">
                <div className="bg-blue-50 rounded-lg px-4 py-2.5 text-center min-w-[100px]">
                  <div className="text-[10px] text-gray-500">คงเหลือ</div>
                  <div className="text-xl font-bold" style={{ color: VIZ.primary }}>{fmtNum(selectedStock.current_stock)}</div>
                  <div className="text-[10px] text-gray-400">ขั้นต่ำ: {selectedStock.min_stock}</div>
                </div>
                <div className="bg-green-50 rounded-lg px-4 py-2.5 text-center min-w-[100px]">
                  <div className="text-[10px] text-gray-500">รับเข้า</div>
                  <div className="text-xl font-bold" style={{ color: VIZ.positive }}>{fmtNum(productAnalytics.totalIn)}</div>
                  <div className="text-[10px] text-gray-400">{rangeLabel}</div>
                </div>
                <div className="bg-orange-50 rounded-lg px-4 py-2.5 text-center min-w-[100px]">
                  <div className="text-[10px] text-gray-500">เบิกออก</div>
                  <div className="text-xl font-bold" style={{ color: VIZ.secondary }}>{fmtNum(productAnalytics.totalOut)}</div>
                  <div className="text-[10px] text-gray-400">{rangeLabel}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-center min-w-[100px]">
                  <div className="text-[10px] text-gray-500">เฉลี่ย/เดือน</div>
                  <div className="text-xl font-bold text-gray-700">{Math.round(productAnalytics.avgOutPerMonth)}</div>
                  <div className="text-[10px] text-gray-400">
                    {productAnalytics.monthsUntilEmpty === Infinity ? 'ไม่มีการเบิก' : `เหลือ ~${productAnalytics.monthsUntilEmpty} เดือน`}
                  </div>
                </div>
              </div>
            </div>
            {/* Low stock warning */}
            {selectedStock.current_stock <= selectedStock.min_stock && selectedStock.min_stock > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <span className="text-red-500 font-bold text-sm">⚠ สต็อกต่ำกว่าขั้นต่ำ — แนะนำสั่งซื้อเพิ่ม</span>
                <span className="text-xs text-red-400 ml-auto">คงเหลือ {selectedStock.current_stock} / ขั้นต่ำ {selectedStock.min_stock}</span>
              </div>
            )}
          </div>

          {/* Trend chart */}
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">เทรนด์รับเข้า-เบิกออก</h3>
            <p className="text-[11px] text-gray-400 mb-3">{rangeLabel}</p>
            <TrendChart months={productAnalytics.monthly.map(m => m.label)} dataIn={productAnalytics.monthly.map(m => m.stockIn)} dataOut={productAnalytics.monthly.map(m => m.stockOut)} />
          </div>

          {/* Department + Employee side by side */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Department chart */}
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                {productAnalytics.deptData[0] ? `${productAnalytics.deptData[0].dept}เบิกมากที่สุด` : 'แผนกที่เบิก'}
              </h3>
              <p className="text-[11px] text-gray-400 mb-3">จำนวนเบิก/ยืมแยกตามแผนก</p>
              <BarChartSVG data={productAnalytics.deptData.slice(0, 10).map(d => ({ label: d.dept, value: d.qty }))} color="#76B7B2" />
            </div>

            {/* Employee chart */}
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                {productAnalytics.empData[0] ? `${productAnalytics.empData[0].name}เบิกบ่อยที่สุด` : 'พนักงานที่เบิก'}
              </h3>
              <p className="text-[11px] text-gray-400 mb-3">จำนวนเบิก/ยืมแยกตามพนักงาน</p>
              <BarChartSVG data={productAnalytics.empData.slice(0, 10).map(e => ({ label: e.name, value: e.qty }))} color={VIZ.primary} />
            </div>
          </div>

          {/* Monthly detail table with opening balance + drill-down */}
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">ตารางรายเดือน</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">คลิกแถวเดือนเพื่อดูรายละเอียดรายวัน · รับเข้าแสดงเลข PO · เบิกออกแสดงแผนก/พนักงาน</p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  onClick={() => expandAllMonths(productAnalytics.monthly.filter(m => m.stockInDays.length + m.stockOutDays.length > 0).map(m => m.key))}
                  className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                >เปิดทั้งหมด</button>
                <button
                  onClick={collapseAllMonths}
                  className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                >ปิดทั้งหมด</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gray-50">
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">เดือน</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">รับเข้า</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">เบิกออก</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">ผลต่าง</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">คงเหลือสิ้นเดือน</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b border-gray-200" style={{ background: `${VIZ.primary}0D` }}>
                    <td className="px-2 py-2"></td>
                    <td className="px-3 py-2 font-semibold text-gray-700" colSpan={4}>
                      ยอดยกมา <span className="text-[10px] text-gray-400 font-normal">(ก่อน {monthKeyToFullLabel(dateRange.from)})</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: VIZ.primary }}>
                      {fmtNum(productAnalytics.openingBalance)}
                    </td>
                  </tr>

                  {/* Monthly rows with expandable detail */}
                  {productAnalytics.monthly.map((m) => {
                    const diff = m.stockIn - m.stockOut;
                    const isOpen = expandedMonths.has(m.key);
                    const hasDetail = m.stockInDays.length + m.stockOutDays.length > 0;
                    return (
                      <Fragment key={m.key}>
                        <tr
                          onClick={() => hasDetail && toggleMonth(m.key)}
                          className={`border-b border-gray-50 ${hasDetail ? 'cursor-pointer hover:bg-blue-50/40' : ''} ${isOpen ? 'bg-blue-50/40' : ''}`}
                        >
                          <td className="px-2 py-2 text-center">
                            {hasDetail ? (
                              <ChevronDown
                                size={14}
                                className="text-gray-400 transition-transform inline-block"
                                style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                              />
                            ) : (
                              <span className="text-gray-200 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">{m.fullLabel}</td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: VIZ.positive }}>
                            {m.stockIn > 0 ? fmtNum(m.stockIn) : '-'}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums" style={{ color: VIZ.secondary }}>
                            {m.stockOut > 0 ? fmtNum(m.stockOut) : '-'}
                          </td>
                          <td className={`px-3 py-2 text-center tabular-nums font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {diff > 0 ? `+${fmtNum(diff)}` : diff < 0 ? fmtNum(diff) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">
                            {fmtNum(m.runningBalance)}
                          </td>
                        </tr>
                        {isOpen && hasDetail && (
                          <tr>
                            <td colSpan={6} className="p-0 border-b border-gray-200" style={{ background: '#FAFBFC' }}>
                              <div className="grid md:grid-cols-2 gap-3 p-4">
                                {/* Stock In detail */}
                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                  <div
                                    className="px-3 py-2 flex items-center gap-2"
                                    style={{ background: `${VIZ.positive}1A`, borderBottom: `1px solid ${VIZ.positive}40` }}
                                  >
                                    <ArrowDownToLine size={13} style={{ color: VIZ.positive }} />
                                    <span className="text-[11px] font-bold" style={{ color: VIZ.positive }}>
                                      รับเข้า · {m.stockInDays.length} รายการ · {fmtNum(m.stockIn)} {getUnitLabel(selectedStock.unit)}
                                    </span>
                                  </div>
                                  {m.stockInDays.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-[11px] text-gray-400">ไม่มีการรับเข้า</p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[11px]">
                                        <thead>
                                          <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                                            <th className="px-3 py-1.5 text-left font-semibold">วันที่</th>
                                            <th className="px-3 py-1.5 text-center font-semibold">จำนวน</th>
                                            <th className="px-3 py-1.5 text-left font-semibold">เลข PO</th>
                                            <th className="px-3 py-1.5 text-left font-semibold">หมายเหตุ</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {m.stockInDays.map((d, i) => (
                                            <tr key={i} className="border-b border-gray-50 last:border-0">
                                              <td className="px-3 py-1.5 tabular-nums text-gray-700 whitespace-nowrap">
                                                {fmtDate(d.date)}
                                                {d.type === 'return' && (
                                                  <span className="ml-1 px-1 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-semibold">คืน</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-1.5 text-center tabular-nums font-semibold" style={{ color: VIZ.positive }}>
                                                {fmtNum(d.qty)}
                                              </td>
                                              <td className="px-3 py-1.5 text-gray-700">
                                                {d.po ? (
                                                  <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-mono rounded">
                                                    {d.po}
                                                  </span>
                                                ) : <span className="text-gray-300">—</span>}
                                              </td>
                                              <td className="px-3 py-1.5 text-gray-500 truncate max-w-[180px]" title={d.note || ''}>
                                                {d.note || <span className="text-gray-300">—</span>}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                                {/* Stock Out detail */}
                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                  <div
                                    className="px-3 py-2 flex items-center gap-2"
                                    style={{ background: `${VIZ.secondary}1A`, borderBottom: `1px solid ${VIZ.secondary}40` }}
                                  >
                                    <ArrowUpFromLine size={13} style={{ color: VIZ.secondary }} />
                                    <span className="text-[11px] font-bold" style={{ color: VIZ.secondary }}>
                                      เบิกออก · {m.stockOutDays.length} รายการ · {fmtNum(m.stockOut)} {getUnitLabel(selectedStock.unit)}
                                    </span>
                                  </div>
                                  {m.stockOutDays.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-[11px] text-gray-400">ไม่มีการเบิกออก</p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-[11px]">
                                        <thead>
                                          <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                                            <th className="px-3 py-1.5 text-left font-semibold">วันที่</th>
                                            <th className="px-3 py-1.5 text-left font-semibold">แผนก</th>
                                            <th className="px-3 py-1.5 text-left font-semibold">พนักงาน</th>
                                            <th className="px-3 py-1.5 text-center font-semibold">จำนวน</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {m.stockOutDays.map((d, i) => (
                                            <tr key={i} className="border-b border-gray-50 last:border-0">
                                              <td className="px-3 py-1.5 tabular-nums text-gray-700 whitespace-nowrap">
                                                {fmtDate(d.date)}
                                                {d.type === 'borrow' && (
                                                  <span className="ml-1 px-1 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-semibold">ยืม</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-1.5 text-gray-700 truncate max-w-[120px]" title={d.dept}>{d.dept}</td>
                                              <td className="px-3 py-1.5 text-gray-700 truncate max-w-[160px]" title={d.emp}>
                                                {d.emp}
                                                {d.empCode && <span className="ml-1 text-gray-400 text-[9px]">{d.empCode}</span>}
                                              </td>
                                              <td className="px-3 py-1.5 text-center tabular-nums font-semibold" style={{ color: VIZ.secondary }}>
                                                {fmtNum(d.qty)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}

                  {/* Total row */}
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                    <td className="px-2 py-2"></td>
                    <td className="px-3 py-2 text-gray-900">รวม ({productAnalytics.monthly.length} เดือน)</td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: VIZ.positive }}>{fmtNum(productAnalytics.totalIn)}</td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: VIZ.secondary }}>{fmtNum(productAnalytics.totalOut)}</td>
                    <td className={`px-3 py-2 text-center tabular-nums ${productAnalytics.totalIn - productAnalytics.totalOut >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {productAnalytics.totalIn - productAnalytics.totalOut > 0 ? '+' : ''}{fmtNum(productAnalytics.totalIn - productAnalytics.totalOut)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: VIZ.primary }}>
                      {fmtNum(productAnalytics.endingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Reconciliation note */}
            {productAnalytics.endingBalance !== selectedStock.current_stock && (
              <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1.5">
                <span className="font-semibold text-gray-600">หมายเหตุ:</span>
                <span>
                  ยอดสิ้นสุดของช่วงที่เลือก <span className="font-semibold">{fmtNum(productAnalytics.endingBalance)}</span> ต่างจากสต็อกคงเหลือปัจจุบัน <span className="font-semibold">{fmtNum(selectedStock.current_stock)}</span> — เกิดจากรายการหลังวันที่สิ้นสุดช่วง (ต่าง {fmtNum(selectedStock.current_stock - productAnalytics.endingBalance)} {getUnitLabel(selectedStock.unit)})
                </span>
              </p>
            )}
          </div>

          {/* Department + Employee detail table */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">รายละเอียดตามแผนก</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">แผนก</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500">จำนวน</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500">%</th>
                  </tr>
                </thead>
                <tbody>
                  {productAnalytics.deptData.map((d) => {
                    const total = productAnalytics.deptData.reduce((s, x) => s + x.qty, 0);
                    return (
                      <tr key={d.dept} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{d.dept}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmtNum(d.qty)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-gray-500">{total > 0 ? `${((d.qty / total) * 100).toFixed(1)}%` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">รายละเอียดตามพนักงาน</h3>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">พนักงาน</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500">แผนก</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-500">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productAnalytics.empData.map((e) => (
                      <tr key={e.name} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{e.name}</td>
                        <td className="px-3 py-2 text-gray-500">{e.dept}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmtNum(e.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

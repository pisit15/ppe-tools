'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BarChart3, Shield, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, TrendingUp, Calendar } from 'lucide-react';
import type { PPEStockSummary, PPETransaction } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

/* ── palette ── */
const VIZ = {
  green:  '#2B8C3E',
  orange: '#F28E2B',
  blue:   '#4E79A7',
  red:    '#E15759',
  purple: '#B07AA1',
  teal:   '#59A14F',
  gray:   '#BAB0AC',
  yellow: '#EDC948',
};
const CHART_COLORS = [VIZ.blue, VIZ.orange, VIZ.green, VIZ.red, VIZ.purple, VIZ.teal, VIZ.yellow, VIZ.gray];

/* ── helpers ── */
function getTypeLabel(v: string) { return PPE_TYPES.find(t => t.value === v)?.label ?? v; }
function getTypeEmoji(v: string) { return PPE_TYPES.find(t => t.value === v)?.icon ?? '📦'; }
function getUnitLabel(v: string) { return UNIT_TYPES.find(u => u.value === v)?.label ?? v; }
function fmtNum(n: number) { return n.toLocaleString('th-TH'); }

/* ─────────────────────────── SVG Charts ─────────────────────────── */

/** Horizontal bar chart — best for comparing categories */
function HBarChart({ data, maxVal }: { data: { label: string; value: number; color: string }[]; maxVal: number }) {
  if (!data.length || maxVal === 0) return <p className="text-gray-400 text-sm py-4 text-center">ไม่มีข้อมูล</p>;
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-28 text-xs text-gray-600 text-right truncate flex-shrink-0">{d.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max((d.value / maxVal) * 100, 2)}%`, background: d.color }}
            />
          </div>
          <span className="w-12 text-xs font-semibold text-gray-700 text-right">{fmtNum(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Sparkline area chart (SVG) for 6-month trend */
function SparkArea({ data, color, label }: { data: number[]; color: string; label: string }) {
  if (!data.length || data.every(d => d === 0)) return <p className="text-gray-400 text-sm py-4 text-center">ไม่มีข้อมูล</p>;
  const W = 320, H = 80, PX = 4, PY = 8;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = PX + (i / Math.max(data.length - 1, 1)) * (W - 2 * PX);
    const y = PY + (1 - v / max) * (H - 2 * PY);
    return { x, y };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded-full" style={{ background: color }} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 80 }}>
        <path d={area} fill={color} fillOpacity={0.15} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />)}
      </svg>
    </div>
  );
}

/** Donut chart (SVG) */
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="text-gray-400 text-sm py-4 text-center">ไม่มีข้อมูล</p>;
  const R = 40, CX = 50, CY = 50, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0">
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * C;
          const gap = C - dash;
          const el = (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={d.color} strokeWidth={16}
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${CX} ${CY})`} />
          );
          offset += dash;
          return el;
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" className="text-[10px] font-bold fill-gray-700">{fmtNum(total)}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" className="text-[6px] fill-gray-400">รายการ</text>
      </svg>
      <div className="space-y-1.5 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-gray-600 truncate">{d.label}</span>
            <span className="ml-auto font-semibold text-gray-700">{fmtNum(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

interface ReportData {
  stocks: PPEStockSummary[];
  transactions: PPETransaction[];
}

const PERIOD_OPTIONS = [
  { value: 1, label: '1 เดือน' },
  { value: 2, label: '2 เดือน' },
  { value: 3, label: '3 เดือน' },
  { value: 6, label: '6 เดือน' },
  { value: 12, label: '12 เดือน' },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [reportData, setReportData] = useState<ReportData>({ stocks: [], transactions: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState(6); // months

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

    // filter transactions by selected period
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - period, 1);
    const transactions = allTransactions.filter((t) => {
      if (!t.transaction_date) return false;
      return new Date(t.transaction_date) >= cutoff;
    });

    // type breakdown
    const typeMap: Record<string, { count: number; total: number }> = {};
    stocks.forEach((s) => {
      if (!typeMap[s.type]) typeMap[s.type] = { count: 0, total: 0 };
      typeMap[s.type].count += 1;
      typeMap[s.type].total += s.current_stock;
    });

    // transaction breakdown
    const transMap: Record<string, number> = {};
    transactions.forEach((t) => { transMap[t.transaction_type] = (transMap[t.transaction_type] || 0) + t.quantity; });

    // monthly trends (dynamic period)
    const months: string[] = [];
    const monthlyIn: number[] = [];
    const monthlyOut: number[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(d.toLocaleDateString('th-TH', { month: 'short' }));
      const mIn = transactions.filter(t => (t.transaction_type === 'stock_in' || t.transaction_type === 'return') && t.transaction_date?.startsWith(key)).reduce((s, t) => s + t.quantity, 0);
      const mOut = transactions.filter(t => (t.transaction_type === 'stock_out' || t.transaction_type === 'borrow') && t.transaction_date?.startsWith(key)).reduce((s, t) => s + t.quantity, 0);
      monthlyIn.push(mIn);
      monthlyOut.push(mOut);
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
    const ratio = totalIn > 0 ? (totalOut / totalIn) : 0;

    return { typeMap, transMap, months, monthlyIn, monthlyOut, outByProduct, deptUsage, lowStock, totalIn, totalOut, ratio };
  }, [reportData, period]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const { stocks, transactions } = reportData;

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 size={32} />
            รายงาน PPE
          </h1>
          <p className="text-gray-500 mt-1">
            สรุปและวิเคราะห์ข้อมูล PPE · {stocks.length} สินค้า · {transactions.length} รายการเคลื่อนไหว
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
          <Calendar size={16} className="text-gray-400 ml-2" />
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI icon={<Shield size={20} />} label="สต็อกรวม" value={fmtNum(stocks.reduce((s, st) => s + st.current_stock, 0))} suffix="ชิ้น" color="text-blue-600" bg="bg-blue-50" />
        <KPI icon={<ArrowDownToLine size={20} />} label="รับเข้า" value={fmtNum(analytics.totalIn)} suffix="ชิ้น" color="text-green-600" bg="bg-green-50" />
        <KPI icon={<ArrowUpFromLine size={20} />} label="เบิกออก" value={fmtNum(analytics.totalOut)} suffix="ชิ้น" color="text-red-600" bg="bg-red-50" />
        <KPI icon={<AlertTriangle size={20} />} label="สต็อกต่ำ" value={String(analytics.lowStock.length)} suffix="รายการ" color="text-amber-600" bg="bg-amber-50" />
        <KPI icon={<TrendingUp size={20} />} label="อัตราเข้า/ออก" value={analytics.ratio.toFixed(1)} suffix="x" color="text-purple-600" bg="bg-purple-50" />
      </div>

      {/* ── row 1: trend + donut ── */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">เทรนด์รับเข้า-เบิกออก {period} เดือนล่าสุด</h2>
          <p className="text-xs text-gray-400 mb-4">เทียบจำนวนรับเข้า (สีเขียว) กับเบิกออก (สีส้ม) แต่ละเดือน</p>
          <SparkArea data={analytics.monthlyIn} color={VIZ.green} label="รับเข้า+คืน" />
          <div className="mt-3" />
          <SparkArea data={analytics.monthlyOut} color={VIZ.orange} label="เบิก+ยืม" />
          <div className="flex justify-between mt-2 text-[10px] text-gray-400 px-1">
            {analytics.months.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">สัดส่วนรายการ</h2>
          <p className="text-xs text-gray-400 mb-4">จำนวนแยกตามประเภท</p>
          <DonutChart
            data={Object.entries(analytics.typeMap)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([type, d], i) => ({
                label: `${getTypeEmoji(type)} ${getTypeLabel(type)}`,
                value: d.total,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }))}
          />
        </div>
      </div>

      {/* ── row 2: stock by type + top products ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">สต็อกตามประเภท PPE</h2>
          <p className="text-xs text-gray-400 mb-4">จำนวนสต็อกรวมของแต่ละประเภทอุปกรณ์</p>
          <HBarChart
            data={Object.entries(analytics.typeMap)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([type, d], i) => ({
                label: `${getTypeEmoji(type)} ${getTypeLabel(type)}`,
                value: d.total,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }))}
            maxVal={Math.max(...Object.values(analytics.typeMap).map(d => d.total), 1)}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">สินค้าที่เบิกบ่อยที่สุด</h2>
          <p className="text-xs text-gray-400 mb-4">Top 8 อุปกรณ์ที่มีการเบิก/ยืมมากที่สุด (จำนวนชิ้น)</p>
          <HBarChart
            data={Object.values(analytics.outByProduct)
              .sort((a, b) => b.qty - a.qty)
              .slice(0, 8)
              .map((d, i) => ({ label: d.name, value: d.qty, color: CHART_COLORS[i % CHART_COLORS.length] }))}
            maxVal={Math.max(...Object.values(analytics.outByProduct).map(d => d.qty), 1)}
          />
        </div>
      </div>

      {/* ── row 3: dept + low stock ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">การใช้งานตามแผนก</h2>
          <p className="text-xs text-gray-400 mb-4">จำนวนเบิก/ยืม แยกตามแผนก</p>
          <HBarChart
            data={Object.entries(analytics.deptUsage)
              .sort((a, b) => b[1] - a[1])
              .map(([dept, qty], i) => ({ label: dept, value: qty, color: CHART_COLORS[i % CHART_COLORS.length] }))}
            maxVal={Math.max(...Object.values(analytics.deptUsage), 1)}
          />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">
            <AlertTriangle size={16} className="inline mr-1 text-amber-500" />
            แจ้งเตือนสต็อกต่ำ
          </h2>
          <p className="text-xs text-gray-400 mb-4">สินค้าที่สต็อกต่ำกว่าหรือเท่ากับขั้นต่ำ</p>
          {analytics.lowStock.length > 0 ? (
            <div className="space-y-2">
              {analytics.lowStock.map((s) => (
                <div key={s.product_id} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{getTypeEmoji(s.type)} {s.name}</span>
                    <p className="text-xs text-gray-500">{getTypeLabel(s.type)} · {getUnitLabel(s.unit)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-red-600">{s.current_stock}</span>
                    <span className="text-xs text-gray-400"> / {s.min_stock}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm py-4 text-center">ไม่มีสินค้าที่ต่ำกว่าขั้นต่ำ ✓</p>
          )}
        </div>
      </div>

      {/* ── detailed stock table ── */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">ตารางสต็อกละเอียด</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">สินค้า</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">ประเภท</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">รับเข้า</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">เบิกออก</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">คงเหลือ</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">ขั้นต่ำ</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {stocks.length > 0 ? stocks
                .sort((a, b) => a.current_stock - b.current_stock)
                .map((s) => {
                  const isLow = s.current_stock <= s.min_stock && s.min_stock > 0;
                  return (
                    <tr key={s.product_id} className={`border-b ${isLow ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {s.image_url ? (
                          <span className="inline-flex items-center gap-2">
                            <img src={s.image_url} alt="" className="w-6 h-6 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            {s.name}
                          </span>
                        ) : (
                          <span>{getTypeEmoji(s.type)} {s.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{getTypeLabel(s.type)}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-semibold">{fmtNum(s.total_in)}</td>
                      <td className="px-4 py-3 text-center text-red-600 font-semibold">{fmtNum(s.total_out)}</td>
                      <td className="px-4 py-3 text-center font-bold">{fmtNum(s.current_stock)}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{s.min_stock}</td>
                      <td className="px-4 py-3 text-center">
                        {isLow ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">ต่ำ</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">ปกติ</span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── KPI card component ── */
function KPI({ icon, label, value, suffix, color, bg }: { icon: React.ReactNode; label: string; value: string; suffix: string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-4 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        <span className="text-xs text-gray-400">{suffix}</span>
      </div>
    </div>
  );
}

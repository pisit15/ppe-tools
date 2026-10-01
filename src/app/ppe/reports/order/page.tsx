'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  ShoppingCart, Settings2, FileSpreadsheet, Search, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Save,
} from 'lucide-react';
import type { PPEProduct, PPETransaction, PPEStockSummary, PPEOrderSettings, PPEOrderRemark } from '@/lib/types';

const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#EEEEEE',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
};

const PAGE_SIZE = 30;

type OrderRow = {
  product: PPEProduct;
  usage: [number, number, number];
  usage3: number;
  stockOnHand: number;
  avg3: number;        // J: avg usage / month
  safetyStock: number; // K
  minV: number;        // L
  maxV: number;        // M
  avgV: number;        // N
  reorderPoint: number; // O
  needToOrder: number;  // P = N - G
};

function monthKey(y: number, m0: number): string {
  const d = new Date(y, m0, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelTH(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? n.toLocaleString('th-TH') : n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrderCalculationPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const urlCompanyId = searchParams.get('company_id');
  const companyId = isAdmin ? (urlCompanyId || 'all') : (user?.companyId || '');

  const now = new Date();
  const [endMonth, setEndMonth] = useState<string>(monthKey(now.getFullYear(), now.getMonth()));
  const months: [string, string, string] = useMemo(() => {
    const [y, m] = endMonth.split('-').map(Number);
    return [monthKey(y, m - 3), monthKey(y, m - 2), monthKey(y, m - 1)];
  }, [endMonth]);

  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [stocks, setStocks] = useState<PPEStockSummary[]>([]);
  const [transactions, setTransactions] = useState<PPETransaction[]>([]);
  const [settings, setSettings] = useState<PPEOrderSettings | null>(null);
  const [remarks, setRemarks] = useState<Record<string, { remark: string; qty: string }>>({});
  const [savedRemarks, setSavedRemarks] = useState<Record<string, { remark: string; qty: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [onlyNeed, setOnlyNeed] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const [y, m] = endMonth.split('-').map(Number);
      const start = `${months[0]}-01`;
      const endDate = new Date(y, m, 0);
      const end = `${endMonth}-${String(endDate.getDate()).padStart(2, '0')}`;
      const [prodRes, stockRes, txRes, setRes, remRes] = await Promise.all([
        fetch(`/api/ppe/products?company_id=${companyId}`).then(r => r.json()),
        fetch(`/api/ppe/stock?company_id=${companyId}`).then(r => r.json()),
        fetch(`/api/ppe/transactions?company_id=${companyId}&limit=20000&start_date=${start}&end_date=${end}`).then(r => r.json()),
        fetch(`/api/ppe/order-settings?company_id=${companyId}`).then(r => r.json()),
        fetch(`/api/ppe/order-remarks?company_id=${companyId}&period=${endMonth}`).then(r => r.json()),
      ]);
      setProducts(prodRes.data || []);
      setStocks(stockRes.data || []);
      setTransactions(txRes.data || []);
      setSettings(setRes.data || null);
      const rm: Record<string, { remark: string; qty: string }> = {};
      ((remRes.data || []) as PPEOrderRemark[]).forEach(r => {
        rm[r.product_id] = { remark: r.remark || '', qty: r.actual_order_qty != null ? String(r.actual_order_qty) : '' };
      });
      setRemarks(rm);
      setSavedRemarks(rm);
    } catch {
      setToast({ type: 'error', msg: 'โหลดข้อมูลไม่สำเร็จ' });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, endMonth, months]);

  useEffect(() => { loadData(); }, [loadData]);

  const leadDaysTotal = settings
    ? settings.quotation_days + settings.pr_days + settings.wams_open_days + settings.wams_process_days + settings.delivery_days
    : 30;
  const leadMonths = leadDaysTotal / 30;

  const rows: OrderRow[] = useMemo(() => {
    const stockMap: Record<string, number> = {};
    stocks.forEach(s => { stockMap[s.product_id] = s.current_stock ?? 0; });
    const usageMap: Record<string, [number, number, number]> = {};
    transactions.forEach(t => {
      if (t.transaction_type !== 'stock_out' && t.transaction_type !== 'borrow') return;
      if (!t.transaction_date || !t.product_id) return;
      const key = t.transaction_date.slice(0, 7);
      const idx = months.indexOf(key);
      if (idx === -1) return;
      if (!usageMap[t.product_id]) usageMap[t.product_id] = [0, 0, 0];
      usageMap[t.product_id][idx] += t.quantity;
    });
    return products
      .filter(p => p.is_active !== false)
      .map(p => {
        const usage = usageMap[p.id] || ([0, 0, 0] as [number, number, number]);
        const usage3 = usage[0] + usage[1] + usage[2];
        const stockOnHand = stockMap[p.id] ?? 0;
        const avg3 = usage3 / 3;
        const safetyStock = leadMonths * avg3;
        const minV = avg3 + safetyStock;
        const maxV = avg3 * leadMonths + safetyStock + minV;
        const avgV = (maxV + minV) / 2;
        const reorderPoint = avg3 * leadMonths + safetyStock;
        const needToOrder = avgV - stockOnHand;
        return { product: p, usage, usage3, stockOnHand, avg3, safetyStock, minV, maxV, avgV, reorderPoint, needToOrder };
      })
      .sort((a, b) => b.needToOrder - a.needToOrder || a.product.name.localeCompare(b.product.name, 'th'));
  }, [products, stocks, transactions, months, leadMonths]);

  const filtered = useMemo(() => {
    let list = rows;
    if (onlyNeed) list = list.filter(r => r.needToOrder > 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.product.name.toLowerCase().includes(q) ||
        (r.product.item_code || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, onlyNeed, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [onlyNeed, search, endMonth]);

  const needCount = rows.filter(r => r.needToOrder > 0).length;
  const needValue = rows.reduce((s, r) => s + (r.needToOrder > 0 && r.product.unit_price ? r.needToOrder * r.product.unit_price : 0), 0);

  const saveRemark = async (productId: string) => {
    const cur = remarks[productId] || { remark: '', qty: '' };
    const prev = savedRemarks[productId] || { remark: '', qty: '' };
    if (cur.remark === prev.remark && cur.qty === prev.qty) return;
    try {
      const res = await fetch('/api/ppe/order-remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          product_id: productId,
          period: endMonth,
          remark: cur.remark,
          actual_order_qty: cur.qty === '' ? null : Number(cur.qty),
        }),
      });
      if (res.ok) {
        setSavedRemarks(prevMap => ({ ...prevMap, [productId]: cur }));
        setToast({ type: 'success', msg: 'บันทึก Remark แล้ว' });
      } else {
        setToast({ type: 'error', msg: 'บันทึก Remark ไม่สำเร็จ' });
      }
    } catch {
      setToast({ type: 'error', msg: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      const res = await fetch('/api/ppe/order-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, company_id: companyId }),
      });
      if (res.ok) setToast({ type: 'success', msg: 'บันทึกค่า Lead time แล้ว' });
      else setToast({ type: 'error', msg: 'บันทึกไม่สำเร็จ' });
    } catch {
      setToast({ type: 'error', msg: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
  };

  const handleExport = useCallback(async () => {
    const XLSX = await import('xlsx');
    const cutoff = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const header3 = ['No.', 'Item Code', 'Item Name', 'Usage / Month', '', '', 'Stock on hand', 'Lead Time (Month)', 'Stock', '', '', '', '', '', 'Re-order point', 'Need to order', 'สั่งซื้อจริง', 'Remark', 'ราคา/หน่วย'];
    const header4 = ['', '', '', monthLabelTH(months[0]), monthLabelTH(months[1]), monthLabelTH(months[2]), `Cut-off date\n${cutoff}`, '', 'Usage per 3 months', 'Avg. usage per 3 months', 'Safety Stock', 'MIN', 'MAX', 'AVG.', '', '', '', '', ''];
    const aoa: (string | number | null)[][] = [
      ['Calculation Order'],
      [],
      header3,
      header4,
    ];
    const list = filtered;
    list.forEach((r, i) => {
      const rm = remarks[r.product.id] || { remark: '', qty: '' };
      aoa.push([
        i + 1,
        r.product.item_code || '',
        r.product.name,
        r.usage[0], r.usage[1], r.usage[2],
        r.stockOnHand,
        null, null, null, null, null, null, null, null, null, // H..P formulas
        rm.qty === '' ? null : Number(rm.qty),
        rm.remark,
        r.product.unit_price ?? null,
      ]);
    });
    const firstDataRow = 5;
    const lastDataRow = 4 + list.length;
    const s = settings;
    aoa.push([]);
    aoa.push([null, null, null, 'Lead time :', 'Quotation', null, s?.quotation_days ?? 0.5, 'Day', null, null, 'Safety Stock =', 'ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง * Lead Time (Month)']);
    aoa.push([null, null, null, null, 'PR', null, s?.pr_days ?? 0.5, 'Day', null, null, 'ค่า MIN =', 'ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง + Safety Stock']);
    aoa.push([null, null, null, null, 'WAMS Open', null, s?.wams_open_days ?? 1, 'Day', null, null, 'ค่า MAX =', '(ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง * Lead Time (Month)) + MIN + Safety Stock']);
    aoa.push([null, null, null, null, 'WAMS Process', null, s?.wams_process_days ?? 14, 'Days', null, null, 'ค่า AVG. =', '(MAX + MIN) / 2']);
    aoa.push([null, null, null, null, 'Delivery', null, s?.delivery_days ?? 14, 'Days', null, null, 'Re-order point =', '(ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง * Lead Time (Month)) + Safety Stock']);
    aoa.push([null, null, null, null, 'Total', null, leadDaysTotal, 'Days', null, null, 'Need to order =', 'AVG. - Stock on hand']);
    aoa.push([null, null, null, null, 'Lead Time (Month)', null, leadMonths, 'Month']);
    aoa.push([]);
    aoa.push([null, null, null, 'Remark :', '- ถ้า Lead time ในใบเสนอราคาอยู่ที่ 1-14 วัน ให้ใส่ที่ 14 วัน']);
    aoa.push([null, null, null, null, '- ถ้า Lead time ในใบเสนอราคาอยู่ที่ มากกว่า 14 วัน ให้ใส่จำนวนวันตามจริง']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Formulas H..P per data row (same as the team's Excel)
    for (let r = firstDataRow; r <= lastDataRow; r++) {
      ws[`H${r}`] = { t: 'n', v: leadMonths };
      ws[`I${r}`] = { t: 'n', f: `SUM(D${r}:F${r})` };
      ws[`J${r}`] = { t: 'n', f: `I${r}/3` };
      ws[`K${r}`] = { t: 'n', f: `H${r}*J${r}` };
      ws[`L${r}`] = { t: 'n', f: `J${r}+K${r}` };
      ws[`M${r}`] = { t: 'n', f: `(J${r}*H${r})+K${r}+L${r}` };
      ws[`N${r}`] = { t: 'n', f: `(M${r}+L${r})/2` };
      ws[`O${r}`] = { t: 'n', f: `(J${r}*H${r})+K${r}` };
      ws[`P${r}`] = { t: 'n', f: `N${r}-G${r}` };
    }
    ws['!merges'] = [
      XLSX.utils.decode_range('A3:A4'), XLSX.utils.decode_range('B3:B4'), XLSX.utils.decode_range('C3:C4'),
      XLSX.utils.decode_range('D3:F3'), XLSX.utils.decode_range('G3:G4'), XLSX.utils.decode_range('H3:H4'),
      XLSX.utils.decode_range('I3:N3'), XLSX.utils.decode_range('O3:O4'), XLSX.utils.decode_range('P3:P4'),
      XLSX.utils.decode_range('Q3:Q4'), XLSX.utils.decode_range('R3:R4'), XLSX.utils.decode_range('S3:S4'),
    ];
    ws['!cols'] = [
      { wch: 4 }, { wch: 14 }, { wch: 45 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 9 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 11 }, { wch: 11 },
      { wch: 9 }, { wch: 45 }, { wch: 9 },
    ];
    const wb = XLSX.utils.book_new();
    const [y, m] = endMonth.split('-').map(Number);
    const sheetName = `Cal. Order-${new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `Calculation_Order_${companyId.toUpperCase()}_${endMonth}.xlsx`);
  }, [filtered, remarks, settings, leadDaysTotal, leadMonths, months, endMonth, companyId]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) {
      opts.push(monthKey(d.getFullYear(), d.getMonth() - i));
    }
    return opts;
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: VIZ.primary }} />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl" style={{ backgroundColor: `${VIZ.primary}20` }}>
            <ShoppingCart size={24} style={{ color: VIZ.primary }} />
          </div>
          <div>
            <h1 className="text-3xl font-bold" style={{ color: VIZ.text }}>คำนวณสั่งซื้อ</h1>
            <p className="text-sm" style={{ color: VIZ.lightText }}>
              Calculation Order จากยอดเบิก 3 เดือนย้อนหลัง — สำหรับส่งฝ่ายจัดซื้อ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={endMonth}
            onChange={e => setEndMonth(e.target.value)}
            className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white"
          >
            {monthOptions.map(k => {
              const [y, m] = k.split('-').map(Number);
              const from = monthKey(y, m - 3);
              return <option key={k} value={k}>{monthLabelTH(from)} – {monthLabelTH(k)}</option>;
            })}
          </select>
          <button
            onClick={() => setShowSettings(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border bg-white hover:shadow"
            style={{ borderColor: VIZ.primary, color: VIZ.primary }}
          >
            <Settings2 size={16} /> Lead time
            {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: VIZ.positive }}
          >
            <FileSpreadsheet size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* Lead time settings */}
      {showSettings && settings && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-end gap-4">
            {([
              ['Quotation', 'quotation_days'],
              ['PR', 'pr_days'],
              ['WAMS Open', 'wams_open_days'],
              ['WAMS Process', 'wams_process_days'],
              ['Delivery', 'delivery_days'],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <label className="block text-xs font-semibold mb-1" style={{ color: VIZ.lightText }}>{label} (วัน)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={settings[key]}
                  onChange={e => setSettings({ ...settings, [key]: parseFloat(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
            ))}
            <div className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
              รวม <b>{fmt(leadDaysTotal)}</b> วัน = <b>{fmt(leadMonths)}</b> เดือน
            </div>
            <button
              onClick={saveSettings}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: VIZ.primary }}
            >
              <Save size={14} /> บันทึก
            </button>
          </div>
          <p className="text-xs mt-3" style={{ color: VIZ.lightText }}>
            กติกา: ถ้า Lead time ในใบเสนอราคาอยู่ที่ 1–14 วัน ให้ใส่ 14 วัน · ถ้ามากกว่า 14 วัน ให้ใส่จำนวนวันตามจริง
          </p>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${VIZ.primary}` }}>
          <p className="text-xs" style={{ color: VIZ.lightText }}>สินค้าทั้งหมด</p>
          <p className="text-2xl font-bold" style={{ color: VIZ.primary }}>{rows.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${VIZ.secondary}` }}>
          <p className="text-xs" style={{ color: VIZ.lightText }}>ต้องสั่งซื้อ (Need &gt; 0)</p>
          <p className="text-2xl font-bold" style={{ color: VIZ.secondary }}>{needCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${VIZ.positive}` }}>
          <p className="text-xs" style={{ color: VIZ.lightText }}>มูลค่าโดยประมาณ (เฉพาะที่มีราคา)</p>
          <p className="text-2xl font-bold" style={{ color: VIZ.positive }}>฿{needValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${VIZ.neutral}` }}>
          <p className="text-xs" style={{ color: VIZ.lightText }}>Lead time</p>
          <p className="text-2xl font-bold" style={{ color: VIZ.text }}>{fmt(leadDaysTotal)} วัน <span className="text-sm font-normal">({fmt(leadMonths)} เดือน)</span></p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า / Item Code"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: VIZ.text }}>
          <input type="checkbox" checked={onlyNeed} onChange={e => setOnlyNeed(e.target.checked)} className="w-4 h-4" />
          เฉพาะที่ต้องสั่งซื้อ ({needCount})
        </label>
        <span className="text-xs ml-auto" style={{ color: VIZ.lightText }}>
          Export จะใช้รายการตามตัวกรองปัจจุบัน ({filtered.length} รายการ)
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b text-left" style={{ backgroundColor: VIZ.bg, color: VIZ.lightText }}>
              <th className="px-2 py-2 font-semibold">No.</th>
              <th className="px-2 py-2 font-semibold">Item Code</th>
              <th className="px-2 py-2 font-semibold">สินค้า</th>
              <th className="px-2 py-2 font-semibold text-center">{monthLabelTH(months[0])}</th>
              <th className="px-2 py-2 font-semibold text-center">{monthLabelTH(months[1])}</th>
              <th className="px-2 py-2 font-semibold text-center">{monthLabelTH(months[2])}</th>
              <th className="px-2 py-2 font-semibold text-center" style={{ color: VIZ.primary }}>Stock on hand</th>
              <th className="px-2 py-2 font-semibold text-center">ใช้ 3 เดือน</th>
              <th className="px-2 py-2 font-semibold text-center">เฉลี่ย/เดือน</th>
              <th className="px-2 py-2 font-semibold text-center">Safety Stock</th>
              <th className="px-2 py-2 font-semibold text-center">MIN</th>
              <th className="px-2 py-2 font-semibold text-center">MAX</th>
              <th className="px-2 py-2 font-semibold text-center">AVG.</th>
              <th className="px-2 py-2 font-semibold text-center">Re-order point</th>
              <th className="px-2 py-2 font-semibold text-center" style={{ color: VIZ.accent }}>ต้องสั่ง</th>
              <th className="px-2 py-2 font-semibold text-center">สั่งจริง</th>
              <th className="px-2 py-2 font-semibold">Remark</th>
              <th className="px-2 py-2 font-semibold text-right">ราคา/หน่วย</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={18} className="px-4 py-10 text-center text-gray-400">ไม่พบรายการ</td></tr>
            ) : (
              pageRows.map((r, i) => {
                const rm = remarks[r.product.id] || { remark: '', qty: '' };
                const need = r.needToOrder > 0;
                return (
                  <tr key={r.product.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                    <td className="px-2 py-2 tabular-nums" style={{ color: VIZ.lightText }}>{(pageSafe - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-2 py-2 font-mono" style={{ color: VIZ.lightText }}>{r.product.item_code || '—'}</td>
                    <td className="px-2 py-2 max-w-[260px] truncate font-medium" title={r.product.name} style={{ color: VIZ.text }}>{r.product.name}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.usage[0])}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.usage[1])}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.usage[2])}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold" style={{ color: VIZ.primary }}>{fmt(r.stockOnHand)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.usage3)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.avg3)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.safetyStock)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.minV)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.maxV)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.avgV)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{fmt(r.reorderPoint)}</td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className="inline-block px-2 py-0.5 rounded-lg font-bold tabular-nums"
                        style={need
                          ? { backgroundColor: `${VIZ.accent}15`, color: VIZ.accent }
                          : { backgroundColor: `${VIZ.positive}15`, color: VIZ.positive }}
                      >
                        {need ? Math.ceil(r.needToOrder).toLocaleString('th-TH') : fmt(Math.max(r.needToOrder, 0))}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={rm.qty}
                        onChange={e => setRemarks(prev => ({ ...prev, [r.product.id]: { ...rm, qty: e.target.value } }))}
                        onBlur={() => saveRemark(r.product.id)}
                        placeholder="—"
                        className="w-16 px-1.5 py-1 border border-gray-200 rounded-lg text-center text-xs text-gray-900"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={rm.remark}
                        onChange={e => setRemarks(prev => ({ ...prev, [r.product.id]: { ...rm, remark: e.target.value } }))}
                        onBlur={() => saveRemark(r.product.id)}
                        placeholder="เหตุผล / หมายเหตุ..."
                        className="w-56 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-300"
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums" style={{ color: VIZ.lightText }}>
                      {r.product.unit_price != null ? r.product.unit_price.toLocaleString('th-TH') : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs" style={{ color: VIZ.lightText }}>หน้า {pageSafe} / {totalPages} · {filtered.length} รายการ</span>
            <div className="flex gap-2">
              <button disabled={pageSafe <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <button disabled={pageSafe >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs" style={{ color: VIZ.lightText }}>
        สูตรตามไฟล์ฝ่ายจัดซื้อ: Safety Stock = เฉลี่ย 3 เดือน × Lead Time · MIN = เฉลี่ย + SS · MAX = (เฉลี่ย × Lead Time) + MIN + SS ·
        AVG. = (MAX + MIN) / 2 · Re-order point = (เฉลี่ย × Lead Time) + SS · ต้องสั่ง = AVG. − Stock on hand ·
        Item Code และราคาแก้ได้ที่หน้า &quot;จัดการสต็อก&quot;
      </p>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50"
          style={{ backgroundColor: toast.type === 'success' ? VIZ.positive : VIZ.accent }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

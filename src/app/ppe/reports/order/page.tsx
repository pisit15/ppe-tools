'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PPEOrderItem from '@/components/PPEOrderItem';
import {
  ShoppingCart, Settings2, FileSpreadsheet, Search, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Save,
} from 'lucide-react';
import type { PPEProduct, PPETransaction, PPEStockSummary, PPEOrderSettings, PPEOrderRemark } from '@/lib/types';
import {
  calculateOrderRows, isOrderPeriod, leadTimeDays, monthKey, monthLabelTH, orderDateRange, orderMonths,
} from '@/lib/ppe-order';

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

  const [endMonth, setEndMonth] = useState<string>(() => {
    const period = searchParams.get('period');
    const now = new Date();
    return isOrderPeriod(period) ? period : monthKey(now.getFullYear(), now.getMonth());
  });
  const months = useMemo(() => orderMonths(endMonth), [endMonth]);

  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [stocks, setStocks] = useState<PPEStockSummary[]>([]);
  const [transactions, setTransactions] = useState<PPETransaction[]>([]);
  const [settings, setSettings] = useState<PPEOrderSettings | null>(null);
  const [remarks, setRemarks] = useState<Record<string, { remark: string; qty: string }>>({});
  const [savedRemarks, setSavedRemarks] = useState<Record<string, { remark: string; qty: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [onlyNeed, setOnlyNeed] = useState(() => searchParams.get('only_need') === '1');
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
      const { start, end } = orderDateRange(endMonth);
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
  }, [companyId, endMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const leadDaysTotal = leadTimeDays(settings);
  const leadMonths = leadDaysTotal / 30;

  const rows = useMemo(() => calculateOrderRows({ products, stocks, transactions, months, leadMonths }),
    [products, stocks, transactions, months, leadMonths]);

  const filtered = useMemo(() => {
    let list = rows;
    if (onlyNeed) list = list.filter(r => r.requiresOrder);
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

  const needCount = rows.filter(r => r.requiresOrder).length;
  const needValue = rows.reduce((s, r) => s + (r.requiresOrder && r.product.unit_price ? Math.max(r.needToOrder, 0) * r.product.unit_price : 0), 0);

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
    // ExcelJS replicates the purchasing team's original workbook styling
    const ExcelJS = (await import('exceljs')).default;
    const cutoff = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });

    // Colors extracted from the team's original file
    const C_GRAY = 'FFD9D9D9';   // header base
    const C_CREAM = 'FFFFF2CC';  // Usage/Month + months + Stock on hand
    const C_GREEN = 'FFC6DEB5';  // Need to order header + cut-off cell
    const C_ORANGE = 'FFF7860C'; // Re-order point header
    const C_RED = 'FFFF0000';    // Avg usage header
    const C_PINK = 'FFFFCCF3';   // Stock on hand data
    const C_YELLOW = 'FFFFFF00'; // Avg usage data
    const C_BLUE_D = 'FFBDD7EE'; // No./Code/Name data
    const C_BLUE_L = 'FFDEEBF7'; // numeric data
    const C_MINT = 'FFDEF9F7';   // lead-time month cell

    const TNR = (opts: Partial<{ bold: boolean; size: number; underline: boolean; color: string }> = {}) => ({
      name: 'Times New Roman', size: opts.size ?? 11, bold: opts.bold ?? false,
      underline: opts.underline ?? false,
      ...(opts.color ? { color: { argb: opts.color } } : {}),
    });
    const TAHOMA = { name: 'Tahoma', size: 11 };
    const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
    const thin = { style: 'thin' as const };
    const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
    const center = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
    const left = { horizontal: 'left' as const, vertical: 'middle' as const, wrapText: true };

    const wb = new ExcelJS.Workbook();
    const [y, m] = endMonth.split('-').map(Number);
    const sheetName = `Cal. Order-${new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })}`;
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }] });

    ws.columns = [
      { width: 5.6 }, { width: 13.5 }, { width: 70.7 }, { width: 10.3 }, { width: 10.3 }, { width: 10.3 },
      { width: 15.6 }, { width: 20.2 }, { width: 12.6 }, { width: 11 }, { width: 11 }, { width: 10.6 },
      { width: 10.6 }, { width: 10.6 }, { width: 13 }, { width: 12 }, { width: 30.3 }, { width: 11 }, { width: 24 },
    ];

    // Title
    ws.getCell('A1').value = 'Calculation Order';
    ws.getCell('A1').font = TNR({ bold: true, size: 18 });
    ws.getRow(1).height = 22.8;

    // Headers (rows 3-4)
    ws.getRow(3).height = 35;
    ws.getRow(4).height = 35;
    const h3: [string, string, string][] = [
      ['A3', 'No.', C_GRAY], ['B3', 'Item Code', C_GRAY], ['C3', 'Item Name', C_GRAY],
      ['D3', 'Usage / Month', C_CREAM], ['G3', 'Stock on hand', C_CREAM], ['H3', 'Lead Time (Month)', C_GRAY],
      ['I3', 'Stock', C_GRAY], ['O3', 'Re-order point', C_ORANGE], ['P3', 'Need to order', C_GREEN],
      ['Q3', 'Remark', C_GRAY], ['R3', 'ราคา', C_GRAY], ['S3', 'การสั่งซื้อเพิ่ม', C_GRAY],
    ];
    const h4: [string, string, string][] = [
      ['D4', monthLabelTH(months[0]), C_CREAM], ['E4', monthLabelTH(months[1]), C_CREAM], ['F4', monthLabelTH(months[2]), C_CREAM],
      ['G4', `Cut-off date\n${cutoff}`, C_GREEN],
      ['I4', 'Usage per 3 months', C_GRAY], ['J4', 'Avg. usage per 3 months', C_RED],
      ['K4', 'Safety Stock', C_GRAY], ['L4', 'MIN', C_GRAY], ['M4', 'MAX', C_GRAY], ['N4', 'AVG.', C_GRAY],
    ];
    [...h3, ...h4].forEach(([addr, label, color]) => {
      const c = ws.getCell(addr);
      c.value = label;
      c.font = TNR({ bold: true });
      c.fill = fill(color);
      c.alignment = center;
    });
    // NOTE: G3/G4 are NOT merged in the original — G3 is "Stock on hand", G4 is the cut-off date
    ['A3:A4', 'B3:B4', 'C3:C4', 'D3:F3', 'H3:H4', 'I3:N3', 'O3:O4', 'P3:P4', 'Q3:Q4', 'R3:R4', 'S3:S4'].forEach(r => ws.mergeCells(r));

    // Data rows
    const list = filtered;
    const firstDataRow = 5;
    const lbTop = firstDataRow + list.length + 1; // lead-time block start
    const monthCellRef = `$G$${lbTop + 6}`; // Lead Time (Month) cell, like $G$33 in the original
    list.forEach((r, i) => {
      const rowN = firstDataRow + i;
      const row = ws.getRow(rowN);
      row.height = 50;
      const rm = remarks[r.product.id] || { remark: '', qty: '' };
      const remarkText = r.canReorder && rm.qty !== ''
        ? `(สั่งซื้อจริง ${rm.qty}${rm.remark ? ' ' + rm.remark : ''})`
        : rm.remark;

      row.getCell(1).value = i + 1;
      row.getCell(2).value = r.product.item_code || '';
      row.getCell(3).value = r.product.name;
      row.getCell(4).value = r.usage[0];
      row.getCell(5).value = r.usage[1];
      row.getCell(6).value = r.usage[2];
      row.getCell(7).value = r.stockOnHand;
      row.getCell(8).value = { formula: monthCellRef, result: leadMonths };
      row.getCell(9).value = { formula: `SUM(D${rowN}:F${rowN})` };
      row.getCell(10).value = { formula: `I${rowN}/3` };
      row.getCell(11).value = { formula: `H${rowN}*J${rowN}` };
      row.getCell(12).value = { formula: `J${rowN}+K${rowN}` };
      row.getCell(13).value = { formula: `(J${rowN}*H${rowN})+K${rowN}+L${rowN}` };
      row.getCell(14).value = { formula: `(M${rowN}+L${rowN})/2` };
      row.getCell(15).value = { formula: `(J${rowN}*H${rowN})+K${rowN}` };
      row.getCell(16).value = r.canReorder ? { formula: `N${rowN}-G${rowN}` } : '—';
      row.getCell(17).value = remarkText;
      if (r.product.unit_price != null) row.getCell(18).value = r.product.unit_price;
      row.getCell(19).value = r.canReorder ? 'สั่งซื้อเพิ่มได้' : 'ไม่สั่งซื้อเพิ่ม';

      for (let col = 1; col <= 19; col++) {
        const c = row.getCell(col);
        c.border = allBorders;
        c.font = col === 3 || col === 17 || col === 19 ? TAHOMA : TNR();
        c.alignment = col === 2 || col === 3 || col === 17 ? left : center;
        if (col <= 3) c.fill = fill(C_BLUE_D);
        else if (col <= 17) c.fill = fill(C_BLUE_L);
      }
      // Special cells (colors/formats from the original file)
      row.getCell(7).fill = fill(C_PINK);
      row.getCell(7).font = TNR({ bold: true });
      row.getCell(8).numFmt = '0.0_ ';
      row.getCell(10).fill = fill(C_YELLOW);
      row.getCell(10).font = TNR({ bold: true, underline: true });
      for (const col of [10, 11, 12, 13, 14, 15, 16]) row.getCell(col).numFmt = '0_ ';
      row.getCell(16).font = TNR({ bold: true, color: C_RED });
    });

    // Lead time block + formula legend
    const s = settings;
    const lb = lbTop;
    const leadRows: [string, number | { formula: string }, string][] = [
      ['Quotation', s?.quotation_days ?? 0.5, 'Day'],
      ['PR', s?.pr_days ?? 0.5, 'Day'],
      ['WAMS Open', s?.wams_open_days ?? 1, 'Day'],
      ['WAMS Process', s?.wams_process_days ?? 14, 'Days'],
      ['Delivery', s?.delivery_days ?? 14, 'Days'],
      ['Total', { formula: `SUM(G${lb}:G${lb + 4})` }, 'Days'],
      ['', { formula: `G${lb + 5}/30` }, 'Month'],
    ];
    const legend: [string, string][] = [
      ['Safety Stock =', 'ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง * Lead Time (Month)'],
      ['ค่า MIN =', 'ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง + Safety Stock'],
      ['ค่า MAX =', '(ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง * Lead Time (Month)) + MIN + Safety Stock'],
      ['ค่า AVG. =', '(MAX + MIN) / 2'],
      ['Re-order point =', '(ปริมาณการใช้งานเฉลี่ย 3 เดือนย้อนหลัง * Lead Time (Month)) + Safety Stock'],
      ['Need to order =', 'AVG. - Stock on hand เฉพาะรายการที่สั่งซื้อเพิ่มได้ (ไม่สั่งซื้อเพิ่มแสดง —)'],
    ];
    ws.getCell(`D${lb}`).value = 'Lead time :';
    ws.getCell(`D${lb}`).font = TNR({ bold: true });
    leadRows.forEach(([label, val, unit], i) => {
      const rn = lb + i;
      ws.getCell(`E${rn}`).value = label;
      ws.getCell(`E${rn}`).font = TNR({ bold: label === 'Total' });
      ws.getCell(`G${rn}`).value = val;
      ws.getCell(`G${rn}`).font = TNR({ bold: label === 'Total' || unit === 'Month' });
      ws.getCell(`G${rn}`).alignment = center;
      ws.getCell(`H${rn}`).value = unit;
      ws.getCell(`H${rn}`).font = TNR();
      ws.getCell(`H${rn}`).alignment = left;
      if (unit === 'Month') {
        ws.getCell(`G${rn}`).fill = fill(C_MINT);
        ws.getCell(`G${rn}`).numFmt = '0.0_ ';
      }
    });
    legend.forEach(([k, v], i) => {
      const rn = lb + i;
      ws.getCell(`K${rn}`).value = k;
      ws.getCell(`K${rn}`).font = TNR({ bold: true });
      ws.getCell(`K${rn}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`L${rn}`).value = v;
      ws.getCell(`L${rn}`).font = TAHOMA;
    });
    const noteRow = lb + 8;
    ws.getCell(`D${noteRow}`).value = 'Remark :';
    ws.getCell(`D${noteRow}`).font = TNR({ bold: true });
    ws.getCell(`E${noteRow}`).value = '- ถ้า Lead time ในใบเสนอราคาอยู่ที่ 1-14 วัน ให้ใส่ที่ 14 วัน';
    ws.getCell(`E${noteRow}`).font = TNR();
    ws.getCell(`E${noteRow + 1}`).value = '- ถ้า Lead time ในใบเสนอราคาอยู่ที่ มากกว่า 14 วัน ให้ใส่จำนวนวันตามจริง';
    ws.getCell(`E${noteRow + 1}`).font = TNR();

    // Download
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Calculation_Order_${companyId.toUpperCase()}_${endMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, remarks, settings, leadMonths, months, endMonth, companyId]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) {
      opts.push(monthKey(d.getFullYear(), d.getMonth() - i));
    }
    return opts.includes(endMonth) ? opts : [endMonth, ...opts];
  }, [endMonth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: VIZ.primary }} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-xl p-3" style={{ backgroundColor: `${VIZ.primary}20` }}>
            <ShoppingCart size={24} style={{ color: VIZ.primary }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: VIZ.text }}>คำนวณสั่งซื้อ</h1>
            <p className="text-sm" style={{ color: VIZ.lightText }}>
              Calculation Order จากยอดเบิก 3 เดือนย้อนหลัง — สำหรับส่งฝ่ายจัดซื้อ
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <select
            aria-label="ช่วงการใช้งาน"
            value={endMonth}
            onChange={e => setEndMonth(e.target.value)}
            className="min-h-11 max-w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900"
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
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end gap-4">
            {([
              ['Quotation', 'quotation_days'],
              ['PR', 'pr_days'],
              ['WAMS Open', 'wams_open_days'],
              ['WAMS Process', 'wams_process_days'],
              ['Delivery', 'delivery_days'],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <label htmlFor={`order-lead-${key}`} className="block text-xs font-semibold mb-1" style={{ color: VIZ.lightText }}>{label} (วัน)</label>
                <input
                  id={`order-lead-${key}`}
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
      <div className="grid grid-cols-2 gap-3 break-words xl:grid-cols-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${VIZ.primary}` }}>
          <p className="text-xs" style={{ color: VIZ.lightText }}>สินค้าทั้งหมด</p>
          <p className="text-2xl font-bold" style={{ color: VIZ.primary }}>{rows.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${VIZ.secondary}` }}>
          <p className="text-xs" style={{ color: VIZ.lightText }}>ต้องสั่งซื้อ (Stock on hand ≤ Re-order point)</p>
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
        <div className="relative min-w-0 basis-64 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า / Item Code"
            aria-label="ค้นหารายการ"
            className="min-h-11 w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400"
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

      <section aria-label="รายการคำนวณสั่งซื้อ" data-testid="order-list" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>แสดง {pageRows.length} จาก {filtered.length} รายการ</span>
          <span>เปิด “รายละเอียด” เพื่อดูยอดใช้รายเดือนและสูตรคำนวณ</span>
        </div>
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,.75fr)_minmax(0,1.5fr)_2.75rem] items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 xl:grid">
          <span>สินค้า</span>
          <div className="grid grid-cols-3 gap-2 text-center"><span>คงเหลือ</span><span>จุดสั่งซื้อ</span><span className="text-orange-700">ต้องสั่ง</span></div>
          <span>สั่งจริง</span><span>หมายเหตุ</span><span className="sr-only">รายละเอียด</span>
        </div>
        <div className="divide-y divide-slate-100">
          {pageRows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-500">ไม่พบรายการ</p> : pageRows.map((row, index) => (
            <PPEOrderItem
              key={row.product.id}
              row={row}
              index={(pageSafe - 1) * PAGE_SIZE + index + 1}
              months={months}
              remark={remarks[row.product.id] || { remark: '', qty: '' }}
              onChange={value => setRemarks(previous => ({ ...previous, [row.product.id]: value }))}
              onSave={() => { void saveRemark(row.product.id); }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <span className="text-xs text-slate-500">หน้า {pageSafe} / {totalPages} · {filtered.length} รายการ</span>
          <div className="flex gap-2">
            <button type="button" aria-label="หน้าก่อนหน้า" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)} className="flex size-11 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={17} /></button>
            <button type="button" aria-label="หน้าถัดไป" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)} className="flex size-11 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={17} /></button>
          </div>
        </div>
      </section>
      <details className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-600">เกณฑ์และสูตรการคำนวณ</summary>
        <p className="mt-2">
        แสดงแท็ก “ต้องสั่งซื้อ” เฉพาะรายการที่สั่งซื้อเพิ่มได้ เมื่อ Stock on hand ≤ Re-order point ยกเว้นรายการที่สต็อกและยอดใช้ทั้ง 3 เดือนเป็น 0 ·{' '}
        เรียงรายการที่ต้องสั่งซื้อก่อน แล้วเรียงจำนวน “ต้องสั่ง” จากมากไปน้อย รายการที่ไม่สั่งซื้อเพิ่มอยู่หลังรายการที่สั่งซื้อได้ โดยรายการที่ข้อมูลเป็น 0 ทั้งหมดอยู่ท้ายสุด ·{' '}
        สูตรตามไฟล์ฝ่ายจัดซื้อ: Safety Stock = เฉลี่ย 3 เดือน × Lead Time · MIN = เฉลี่ย + SS · MAX = (เฉลี่ย × Lead Time) + MIN + SS ·
        AVG. = (MAX + MIN) / 2 · Re-order point = (เฉลี่ย × Lead Time) + SS · ต้องสั่ง = AVG. − Stock on hand ·
        Item Code ราคา และตัวเลือกสั่งซื้อเพิ่มแก้ได้ที่หน้า &quot;จัดการสต็อก&quot;
        </p>
      </details>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-3 z-50 max-w-[calc(100vw-1.5rem)] rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg sm:right-6"
          style={{ backgroundColor: toast.type === 'success' ? VIZ.positive : VIZ.accent }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

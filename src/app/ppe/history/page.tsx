'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Search, Filter, X, Package, ArrowDownCircle, ArrowUpCircle, RotateCcw, HandMetal, CalendarDays, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import type { PPETransaction } from '@/lib/types';
import { UNIT_TYPES } from '@/lib/constants';

/* ── Professional Palette (Tableau-inspired) ── */
const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
};

const TX_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  stock_in: { label: 'รับเข้า', color: VIZ.positive, bg: '#DCFCE7', border: '#BBF7D0', icon: '📥' },
  return: { label: 'รับคืน', color: VIZ.primary, bg: '#DBEAFE', border: '#BFDBFE', icon: '🔄' },
  stock_out: { label: 'เบิก', color: VIZ.accent, bg: '#FEE2E2', border: '#FECACA', icon: '📤' },
  borrow: { label: 'ยืม', color: VIZ.secondary, bg: '#FEF3C7', border: '#FDE68A', icon: '🤝' },
};

function fmtNum(n: number) { return n.toLocaleString('th-TH'); }
function getUnitLabel(v: string) { return UNIT_TYPES.find(u => u.value === v)?.label ?? v; }

type TransactionWithProduct = PPETransaction & {
  ppe_products?: { name: string; type: string; image_url: string | null } | null;
};

export default function HistoryPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [transactions, setTransactions] = useState<TransactionWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /* ── Filters ── */
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  /* ── Sort ── */
  const [sortField, setSortField] = useState<'date' | 'product' | 'quantity'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  /* ── Pagination ── */
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!companyId) return;
    fetchTransactions();
  }, [companyId]);

  async function fetchTransactions() {
    try {
      const res = await fetch(`/api/ppe/transactions?company_id=${companyId}&limit=5000`);
      const data = await res.json();
      if (data.data) setTransactions(data.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }

  /* ── Filtered + Sorted ── */
  const filtered = useMemo(() => {
    let list = [...transactions];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(t => {
        const prodName = (t.ppe_products as unknown as Record<string, string> | null)?.name || '';
        return prodName.toLowerCase().includes(lower) ||
          (t.employee_name || '').toLowerCase().includes(lower) ||
          (t.employee_code || '').toLowerCase().includes(lower) ||
          (t.notes || '').toLowerCase().includes(lower);
      });
    }

    if (typeFilter) list = list.filter(t => t.transaction_type === typeFilter);
    if (startDate) list = list.filter(t => t.transaction_date >= startDate);
    if (endDate) list = list.filter(t => t.transaction_date <= endDate);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.transaction_date.localeCompare(b.transaction_date);
      else if (sortField === 'product') {
        const pA = (a.ppe_products as unknown as Record<string, string> | null)?.name || '';
        const pB = (b.ppe_products as unknown as Record<string, string> | null)?.name || '';
        cmp = pA.localeCompare(pB);
      } else if (sortField === 'quantity') cmp = a.quantity - b.quantity;
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [transactions, searchTerm, typeFilter, startDate, endDate, sortField, sortDir]);

  /* ── Pagination ── */
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useMemo(() => { setPage(1); }, [searchTerm, typeFilter, startDate, endDate]);

  /* ── KPI Summary ── */
  const summary = useMemo(() => {
    const byType: Record<string, { count: number; qty: number }> = {};
    const byMonth: Record<string, Record<string, number>> = {};
    const byProduct: Record<string, { name: string; count: number; qty: number }> = {};

    for (const t of filtered) {
      const type = t.transaction_type;
      if (!byType[type]) byType[type] = { count: 0, qty: 0 };
      byType[type].count++;
      byType[type].qty += t.quantity;

      // Monthly breakdown
      const month = t.transaction_date.substring(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][type] = (byMonth[month][type] || 0) + t.quantity;

      // Product breakdown
      const prod = (t.ppe_products as unknown as Record<string, string> | null);
      const prodName = prod?.name || 'ไม่ระบุ';
      const pid = t.product_id;
      if (!byProduct[pid]) byProduct[pid] = { name: prodName, count: 0, qty: 0 };
      byProduct[pid].count++;
      byProduct[pid].qty += t.quantity;
    }

    // Top 5 most active products
    const topProducts = Object.values(byProduct)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Monthly data sorted
    const months = Object.keys(byMonth).sort();

    return { byType, byMonth, months, topProducts, total: filtered.length };
  }, [filtered]);

  /* ── Chart: Monthly Activity Bars ── */
  const monthlyChart = useMemo(() => {
    if (summary.months.length === 0) return null;
    const maxVal = Math.max(...summary.months.map(m => {
      const d = summary.byMonth[m];
      return Object.values(d).reduce((s, v) => s + v, 0);
    }), 1);

    return summary.months.map(m => {
      const d = summary.byMonth[m];
      const total = Object.values(d).reduce((s, v) => s + v, 0);
      const [y, mo] = m.split('-');
      const thYear = parseInt(y) + 543;
      const monthNames = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      return { month: m, label: `${monthNames[parseInt(mo)]} ${thYear - 2500}`, total, pct: (total / maxVal) * 100, data: d };
    });
  }, [summary]);

  const toggleSort = (field: 'date' | 'product' | 'quantity') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronDown size={12} className="text-gray-300 ml-0.5" />;
    return sortDir === 'desc'
      ? <ChevronDown size={12} className="text-blue-600 ml-0.5" />
      : <ChevronUp size={12} className="text-blue-600 ml-0.5" />;
  };

  const hasActiveFilters = searchTerm || typeFilter || startDate || endDate;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: VIZ.text }}>📋 ประวัติการทำงาน</h1>
          <p className="text-sm mt-1" style={{ color: VIZ.lightText }}>
            บันทึกทั้งหมด {fmtNum(filtered.length)} รายการ
            {hasActiveFilters && <span className="ml-1">(กรองจาก {fmtNum(transactions.length)})</span>}
          </p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['stock_in', 'stock_out', 'borrow', 'return'] as const).map(type => {
          const cfg = TX_CONFIG[type];
          const data = summary.byType[type] || { count: 0, qty: 0 };
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: typeFilter === type ? cfg.bg : '#fff',
                border: `2px solid ${typeFilter === type ? cfg.color : '#f3f4f6'}`,
                boxShadow: typeFilter === type ? `0 2px 8px ${cfg.color}22` : 'none',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{cfg.icon}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: cfg.color }}>{fmtNum(data.count)}</div>
              <div className="text-[11px]" style={{ color: VIZ.lightText }}>รายการ · {fmtNum(data.qty)} หน่วย</div>
            </button>
          );
        })}
      </div>

      {/* ── Monthly Activity Chart ── */}
      {monthlyChart && monthlyChart.length > 1 && (
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #f0f0f0' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} style={{ color: VIZ.primary }} />
            <h3 className="text-sm font-bold" style={{ color: VIZ.text }}>กิจกรรมรายเดือน</h3>
            <div className="flex gap-3 ml-auto text-[10px]">
              {Object.entries(TX_CONFIG).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: v.color }} />
                  {v.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {monthlyChart.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center min-w-0">
                <div className="w-full flex flex-col justify-end" style={{ height: 90 }}>
                  {/* Stacked bar */}
                  <div className="w-full rounded-t overflow-hidden flex flex-col-reverse" style={{ height: `${Math.max(m.pct, 4)}%` }}>
                    {Object.entries(m.data).map(([type, val]) => {
                      const pct = m.total > 0 ? (val / m.total) * 100 : 0;
                      return (
                        <div
                          key={type}
                          style={{
                            height: `${pct}%`,
                            background: TX_CONFIG[type]?.color || VIZ.neutral,
                            minHeight: pct > 0 ? 2 : 0,
                          }}
                          title={`${TX_CONFIG[type]?.label}: ${val}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="text-[9px] mt-1 truncate w-full text-center" style={{ color: VIZ.lightText }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top 5 Products ── */}
      {summary.topProducts.length > 0 && (
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #f0f0f0' }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: VIZ.text }}>🏆 สินค้าที่มีรายการเคลื่อนไหวมากสุด</h3>
          <div className="space-y-2">
            {summary.topProducts.map((p, i) => {
              const maxCount = summary.topProducts[0].count;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold w-5 text-right tabular-nums" style={{ color: VIZ.lightText }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate" style={{ color: VIZ.text }}>{p.name}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: VIZ.lightText }}>{p.count} รายการ</span>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: VIZ.grid }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(p.count / maxCount) * 100}%`, background: VIZ.primary }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search & Filter Bar ── */}
      <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #f0f0f0' }}>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาสินค้า, พนักงาน, หมายเหตุ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Toggle filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{
              borderColor: showFilters || hasActiveFilters ? VIZ.primary : '#e5e7eb',
              color: showFilters || hasActiveFilters ? VIZ.primary : VIZ.lightText,
              background: showFilters ? '#EFF6FF' : 'white',
            }}
          >
            <Filter size={14} />
            ตัวกรอง
            {hasActiveFilters && (
              <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: VIZ.primary }}>
                {[typeFilter, startDate, endDate].filter(Boolean).length}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearchTerm(''); setTypeFilter(''); setStartDate(''); setEndDate(''); }}
              className="text-xs font-medium px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              style={{ color: VIZ.accent }}
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">ประเภท</label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
              >
                <option value="">ทั้งหมด</option>
                <option value="stock_in">📥 รับเข้า</option>
                <option value="return">🔄 รับคืน</option>
                <option value="stock_out">📤 เบิก</option>
                <option value="borrow">🤝 ยืม</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">จากวันที่</label>
              <input
                type="date"
                lang="en"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">ถึงวันที่</label>
              <input
                type="date"
                lang="en"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Transaction Table ── */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #f0f0f0' }}>
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: '#FAFBFC', borderBottom: '2px solid #E5E7EB' }}>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: VIZ.lightText, width: 40 }}>#</th>
                <th
                  className="px-4 py-2.5 text-left text-[11px] font-semibold cursor-pointer select-none hover:text-blue-600 transition-colors"
                  style={{ color: sortField === 'date' ? VIZ.primary : VIZ.lightText }}
                  onClick={() => toggleSort('date')}
                >
                  <span className="flex items-center">วันที่ <SortIcon field="date" /></span>
                </th>
                <th
                  className="px-4 py-2.5 text-left text-[11px] font-semibold cursor-pointer select-none hover:text-blue-600 transition-colors"
                  style={{ color: sortField === 'product' ? VIZ.primary : VIZ.lightText }}
                  onClick={() => toggleSort('product')}
                >
                  <span className="flex items-center">สินค้า <SortIcon field="product" /></span>
                </th>
                <th className="px-4 py-2.5 text-center text-[11px] font-semibold" style={{ color: VIZ.lightText }}>ประเภท</th>
                <th
                  className="px-4 py-2.5 text-right text-[11px] font-semibold cursor-pointer select-none hover:text-blue-600 transition-colors"
                  style={{ color: sortField === 'quantity' ? VIZ.primary : VIZ.lightText }}
                  onClick={() => toggleSort('quantity')}
                >
                  <span className="flex items-center justify-end">จำนวน <SortIcon field="quantity" /></span>
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: VIZ.lightText }}>พนักงาน</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: VIZ.lightText }}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {paged.length > 0 ? paged.map((t, i) => {
                const cfg = TX_CONFIG[t.transaction_type] || TX_CONFIG.stock_out;
                const prod = t.ppe_products as unknown as Record<string, string> | null;
                const prodName = prod?.name || '—';
                const rowIdx = (page - 1) * PAGE_SIZE + i + 1;

                return (
                  <tr
                    key={t.id}
                    className="transition-colors hover:bg-gray-50/70"
                    style={{ borderBottom: '1px solid #F3F4F6' }}
                  >
                    <td className="px-4 py-2.5 tabular-nums text-gray-400 text-xs">{rowIdx}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium whitespace-nowrap" style={{ color: VIZ.text }}>
                      {new Date(t.transaction_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium" style={{ color: VIZ.text }}>{prodName}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
                      >
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: cfg.color }}>
                      {fmtNum(t.quantity)} <span className="font-normal text-[11px]" style={{ color: VIZ.lightText }}>{getUnitLabel(t.unit)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {t.employee_name ? (
                        <div>
                          <span className="text-xs font-medium" style={{ color: VIZ.text }}>{t.employee_name}</span>
                          {t.employee_code && <span className="text-[10px] ml-1" style={{ color: VIZ.neutral }}>({t.employee_code})</span>}
                          {t.department && <div className="text-[10px]" style={{ color: VIZ.lightText }}>{t.department}</div>}
                        </div>
                      ) : (
                        <span style={{ color: VIZ.muted }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-[200px]">
                      {t.notes ? (
                        <span className="text-gray-500 italic truncate block">{t.notes}</span>
                      ) : t.po_number ? (
                        <span className="text-gray-500">PO: {t.po_number}</span>
                      ) : (
                        <span style={{ color: VIZ.muted }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    {hasActiveFilters ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ไม่มีบันทึก'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid #F3F4F6' }}>
            <span className="text-xs" style={{ color: VIZ.lightText }}>
              หน้า {page}/{totalPages} · แสดง {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} จาก {fmtNum(filtered.length)}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded text-xs font-medium border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                ← ก่อนหน้า
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded text-xs font-medium border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

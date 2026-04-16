'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  AlertTriangle,
  Package,
  TrendingUp,
  TrendingDown,
  Building2,
  BarChart3,
  Clock,
  Settings,
  Download,
  Plus,
  ArrowRight,
} from 'lucide-react';
import type { PPEStockSummary } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES, TRANSACTION_TYPES } from '@/lib/constants';

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

interface DashboardStats {
  total_products: number;
  total_stock_in: number;
  total_stock_out: number;
  low_stock_count: number;
}

interface TypeDistribution {
  type: string;
  label: string;
  count: number;
  emoji: string;
}

interface TransactionFeed {
  id: string;
  product_id: string;
  transaction_type: string;
  quantity: number;
  unit: string;
  transaction_date: string;
  employee_name: string | null;
  department: string | null;
  ppe_products: {
    name: string;
    type: string;
  };
}

// Helper functions
function getTypeLabel(type: string): string {
  return PPE_TYPES.find((t) => t.value === type)?.label || type;
}

function getTypeEmoji(type: string): string {
  return PPE_TYPES.find((t) => t.value === type)?.icon || '📦';
}

function getUnitLabel(unit: string): string {
  return UNIT_TYPES.find((u) => u.value === unit)?.label || unit;
}

function fmtNum(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num);
}

function getTransactionLabel(type: string): string {
  return TRANSACTION_TYPES.find((t) => t.value === type)?.label || type;
}

function getTransactionColor(type: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    stock_in: { bg: 'bg-green-50', text: 'text-green-700' },
    stock_out: { bg: 'bg-red-50', text: 'text-red-700' },
    return: { bg: 'bg-blue-50', text: 'text-blue-700' },
    borrow: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  };
  return colors[type]?.text || 'text-gray-700';
}

function getTransactionBg(type: string): string {
  const colors: Record<string, string> = {
    stock_in: 'bg-green-50',
    stock_out: 'bg-red-50',
    return: 'bg-blue-50',
    borrow: 'bg-yellow-50',
  };
  return colors[type] || 'bg-gray-50';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'เมื่อวาน';
  }

  return date.toLocaleDateString('th-TH', {
    month: 'short',
    day: 'numeric',
  });
}

export default function PPEDashboard() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const urlCompanyId = searchParams.get('company_id');
  const companyId = isAdmin
    ? urlCompanyId || 'all'
    : user?.companyId || '';

  const [companyMap, setCompanyMap] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<DashboardStats>({
    total_products: 0,
    total_stock_in: 0,
    total_stock_out: 0,
    low_stock_count: 0,
  });
  const [allStocks, setAllStocks] = useState<PPEStockSummary[]>([]);
  const [lowStockItems, setLowStockItems] = useState<PPEStockSummary[]>([]);
  const [transactions, setTransactions] = useState<TransactionFeed[]>([]);
  const [typeDistribution, setTypeDistribution] = useState<TypeDistribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch dashboard data
  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [stockRes, lowStockRes, transRes] = await Promise.all([
          fetch(`/api/ppe/stock?company_id=${companyId}`),
          fetch(`/api/ppe/stock?company_id=${companyId}&low_stock=true`),
          fetch(`/api/ppe/transactions?company_id=${companyId}&limit=20`),
        ]);

        const stockData = await stockRes.json();
        const lowStockData = await lowStockRes.json();
        const transData = await transRes.json();

        if (stockData.data) {
          const stocks = stockData.data as PPEStockSummary[];
          setAllStocks(stocks);

          // Calculate type distribution
          const typeCounts = stocks.reduce(
            (acc, item) => {
              const existing = acc.find((t) => t.type === item.type);
              if (existing) {
                existing.count += 1;
              } else {
                acc.push({
                  type: item.type,
                  label: getTypeLabel(item.type),
                  emoji: getTypeEmoji(item.type),
                  count: 1,
                });
              }
              return acc;
            },
            [] as TypeDistribution[]
          );
          setTypeDistribution(typeCounts.sort((a, b) => b.count - a.count));

          setStats({
            total_products: stocks.length,
            total_stock_in: stocks.reduce((sum, item) => sum + item.total_in, 0),
            total_stock_out: stocks.reduce(
              (sum, item) => sum + item.total_out,
              0
            ),
            low_stock_count: lowStockData.data?.length || 0,
          });
        }

        if (lowStockData.data) {
          setLowStockItems(lowStockData.data.slice(0, 8));
        }

        if (transData.data) {
          setTransactions(transData.data.slice(0, 8));
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [companyId]);

  // Load company name map (admin)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const map: Record<string, string> = {};
        list.forEach((c: { company_id: string; company_name: string }) => {
          map[c.company_id] = c.company_name;
        });
        setCompanyMap(map);
      })
      .catch(() => {});
  }, [isAdmin]);

  const headerCompanyLabel = isAdmin
    ? companyId === 'all'
      ? 'ทุกบริษัท (ภาพรวม)'
      : companyMap[companyId] || companyId.toUpperCase()
    : user?.companyName || companyId;

  const maxTypeCount = Math.max(...typeDistribution.map((t) => t.count), 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: VIZ.text }}>
            PPE Dashboard
          </h1>
          <p className="text-sm mt-2 flex items-center gap-2" style={{ color: VIZ.lightText }}>
            <Building2 size={16} />
            บริษัท: <span className="font-semibold" style={{ color: VIZ.text }}>
              {headerCompanyLabel}
            </span>
          </p>
        </div>
        {isAdmin && (
          <div
            className="px-3 py-1 rounded-lg text-xs font-bold"
            style={{
              backgroundColor: VIZ.secondary + '20',
              color: VIZ.secondary,
              border: `1px solid ${VIZ.secondary}`,
            }}
          >
            ADMIN VIEW
          </div>
        )}
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Products */}
        <div
          className="rounded-xl p-6 bg-white border-l-4 flex flex-col justify-between"
          style={{
            borderColor: VIZ.primary,
            border: `1px solid ${VIZ.grid}`,
            borderLeftWidth: '4px',
            borderLeftColor: VIZ.primary,
          }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: VIZ.lightText }}
            >
              สินค้าทั้งหมด
            </p>
            <p
              className="text-3xl font-bold mt-3"
              style={{ color: VIZ.primary }}
            >
              {fmtNum(stats.total_products)}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: VIZ.grid }}>
            <p
              className="text-xs"
              style={{ color: VIZ.lightText }}
            >
              {typeDistribution.length} ประเภท
            </p>
          </div>
        </div>

        {/* Stock In */}
        <div
          className="rounded-xl p-6 bg-white border-l-4 flex flex-col justify-between"
          style={{
            borderColor: VIZ.positive,
            border: `1px solid ${VIZ.grid}`,
            borderLeftWidth: '4px',
            borderLeftColor: VIZ.positive,
          }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: VIZ.lightText }}
            >
              รับเข้า
            </p>
            <p
              className="text-3xl font-bold mt-3"
              style={{ color: VIZ.positive }}
            >
              {fmtNum(stats.total_stock_in)}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: VIZ.grid }}>
            <div className="flex items-center gap-2" style={{ color: VIZ.positive }}>
              <TrendingUp size={16} />
              <p className="text-xs font-semibold">เข้า</p>
            </div>
          </div>
        </div>

        {/* Stock Out */}
        <div
          className="rounded-xl p-6 bg-white border-l-4 flex flex-col justify-between"
          style={{
            borderColor: VIZ.accent,
            border: `1px solid ${VIZ.grid}`,
            borderLeftWidth: '4px',
            borderLeftColor: VIZ.accent,
          }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: VIZ.lightText }}
            >
              เบิกออก
            </p>
            <p
              className="text-3xl font-bold mt-3"
              style={{ color: VIZ.accent }}
            >
              {fmtNum(stats.total_stock_out)}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: VIZ.grid }}>
            <div className="flex items-center gap-2" style={{ color: VIZ.accent }}>
              <TrendingDown size={16} />
              <p className="text-xs font-semibold">ออก</p>
            </div>
          </div>
        </div>

        {/* Low Stock */}
        <div
          className="rounded-xl p-6 bg-white border-l-4 flex flex-col justify-between"
          style={{
            borderColor: VIZ.secondary,
            border: `1px solid ${VIZ.grid}`,
            borderLeftWidth: '4px',
            borderLeftColor: VIZ.secondary,
          }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: VIZ.lightText }}
            >
              สต็อกต่ำ
            </p>
            <p
              className="text-3xl font-bold mt-3"
              style={{ color: VIZ.secondary }}
            >
              {fmtNum(stats.low_stock_count)}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: VIZ.grid }}>
            <div className="flex items-center gap-2" style={{ color: VIZ.secondary }}>
              <AlertTriangle size={16} />
              <p className="text-xs font-semibold">ต้องเตือน</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Type Distribution & Low Stock */}
        <div className="lg:col-span-1 space-y-6">
          {/* Stock Type Distribution */}
          <div
            className="rounded-xl p-6 bg-white"
            style={{ border: `1px solid ${VIZ.grid}` }}
          >
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 size={20} style={{ color: VIZ.primary }} />
              <h2
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: VIZ.text }}
              >
                การกระจายประเภท
              </h2>
            </div>

            <div className="space-y-4">
              {typeDistribution.length > 0 ? (
                typeDistribution.map((item) => (
                  <div key={item.type}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold flex items-center gap-2">
                        <span>{item.emoji}</span>
                        <span>{item.label}</span>
                      </span>
                      <span
                        className="text-xs font-bold"
                        style={{ color: VIZ.primary }}
                      >
                        {item.count}
                      </span>
                    </div>
                    <div
                      className="w-full h-2 rounded-full"
                      style={{ backgroundColor: VIZ.grid }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(item.count / maxTypeCount) * 100}%`,
                          backgroundColor: VIZ.primary,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p
                  className="text-sm text-center py-4"
                  style={{ color: VIZ.lightText }}
                >
                  ไม่มีข้อมูล
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Transactions & Low Stock */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Transactions */}
          <div
            className="rounded-xl p-6 bg-white"
            style={{ border: `1px solid ${VIZ.grid}` }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock size={20} style={{ color: VIZ.primary }} />
                <h2
                  className="text-sm font-bold uppercase tracking-wider"
                  style={{ color: VIZ.text }}
                >
                  ธุรกรรมล่าสุด
                </h2>
              </div>
              <p
                className="text-xs"
                style={{ color: VIZ.lightText }}
              >
                8 รายการล่าสุด
              </p>
            </div>

            <div className="space-y-3">
              {transactions.length > 0 ? (
                transactions.map((trans) => (
                  <div
                    key={trans.id}
                    className={`rounded-lg p-4 flex items-center justify-between ${getTransactionBg(trans.transaction_type)}`}
                    style={{
                      border: `1px solid ${VIZ.grid}`,
                    }}
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-sm" style={{ color: VIZ.text }}>
                        {trans.ppe_products?.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span
                          className={`inline-block px-2 py-1 rounded font-semibold ${getTransactionColor(trans.transaction_type)}`}
                          style={{
                            backgroundColor: getTransactionBg(
                              trans.transaction_type
                            ).replace('bg-', ''),
                          }}
                        >
                          {getTransactionLabel(trans.transaction_type)}
                        </span>
                        <span style={{ color: VIZ.lightText }}>
                          {trans.employee_name || 'ระบบ'}
                        </span>
                        {trans.department && (
                          <span style={{ color: VIZ.lightText }}>
                            • {trans.department}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className="font-bold"
                        style={{ color: VIZ.primary }}
                      >
                        {fmtNum(trans.quantity)} {getUnitLabel(trans.unit)}
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: VIZ.lightText }}
                      >
                        {formatDate(trans.transaction_date)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p
                  className="text-sm text-center py-6"
                  style={{ color: VIZ.lightText }}
                >
                  ยังไม่มีธุรกรรม
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock Items Section */}
      {lowStockItems.length > 0 && (
        <div
          className="rounded-xl p-6 bg-white"
          style={{ border: `1px solid ${VIZ.grid}` }}
        >
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={20} style={{ color: VIZ.secondary }} />
            <h2
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: VIZ.text }}
            >
              สินค้าสต็อกต่ำ
            </h2>
            <span
              className="ml-auto text-xs font-semibold"
              style={{
                backgroundColor: VIZ.secondary + '20',
                color: VIZ.secondary,
                padding: '4px 8px',
                borderRadius: '6px',
              }}
            >
              {lowStockItems.length} รายการ
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lowStockItems.map((item) => {
              const percentage = Math.max(
                0,
                Math.min(
                  100,
                  (item.current_stock / item.min_stock) * 100
                )
              );
              const isLow = percentage < 50;
              const isCritical = percentage < 25;

              return (
                <div
                  key={item.product_id}
                  className="rounded-lg p-4"
                  style={{
                    backgroundColor: isCritical
                      ? VIZ.accent + '10'
                      : isLow
                        ? VIZ.secondary + '10'
                        : '#f5f5f5',
                    border: `1px solid ${VIZ.grid}`,
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p
                        className="font-semibold text-sm"
                        style={{ color: VIZ.text }}
                      >
                        {item.name}
                      </p>
                      <p
                        className="text-xs mt-1"
                        style={{ color: VIZ.lightText }}
                      >
                        {getTypeLabel(item.type)} • {getUnitLabel(item.unit)}
                      </p>
                    </div>
                    <span
                      className="text-xs font-bold px-2 py-1 rounded"
                      style={{
                        backgroundColor: isCritical
                          ? VIZ.accent + '30'
                          : VIZ.secondary + '30',
                        color: isCritical ? VIZ.accent : VIZ.secondary,
                      }}
                    >
                      {percentage.toFixed(0)}%
                    </span>
                  </div>

                  <div
                    className="w-full h-2 rounded-full mb-2"
                    style={{ backgroundColor: VIZ.muted }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: isCritical ? VIZ.accent : VIZ.secondary,
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-xs">
                    <span style={{ color: VIZ.lightText }}>
                      ปัจจุบัน:{' '}
                      <span
                        className="font-bold"
                        style={{ color: VIZ.text }}
                      >
                        {fmtNum(item.current_stock)}
                      </span>
                    </span>
                    <span style={{ color: VIZ.lightText }}>
                      ต่ำสุด:{' '}
                      <span
                        className="font-bold"
                        style={{ color: VIZ.text }}
                      >
                        {fmtNum(item.min_stock)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <a
          href={`/ppe/inventory?company_id=${companyId}`}
          className="rounded-xl p-5 bg-white transition-all duration-200 hover:shadow-lg hover:scale-105"
          style={{
            border: `1px solid ${VIZ.grid}`,
            cursor: 'pointer',
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
            style={{
              backgroundColor: VIZ.primary + '20',
            }}
          >
            <Package size={20} style={{ color: VIZ.primary }} />
          </div>
          <p
            className="font-semibold text-sm"
            style={{ color: VIZ.text }}
          >
            จัดการสต็อก
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: VIZ.lightText }}
          >
            ดูและแก้ไข PPE
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span
              className="text-xs font-semibold"
              style={{ color: VIZ.primary }}
            >
              เปิด
            </span>
            <ArrowRight size={14} style={{ color: VIZ.primary }} />
          </div>
        </a>

        <a
          href={`/ppe/stock-in?company_id=${companyId}`}
          className="rounded-xl p-5 bg-white transition-all duration-200 hover:shadow-lg hover:scale-105"
          style={{
            border: `1px solid ${VIZ.grid}`,
            cursor: 'pointer',
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
            style={{
              backgroundColor: VIZ.positive + '20',
            }}
          >
            <Plus size={20} style={{ color: VIZ.positive }} />
          </div>
          <p
            className="font-semibold text-sm"
            style={{ color: VIZ.text }}
          >
            รับเข้า
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: VIZ.lightText }}
          >
            บันทึกสต็อกเข้า
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span
              className="text-xs font-semibold"
              style={{ color: VIZ.positive }}
            >
              เปิด
            </span>
            <ArrowRight size={14} style={{ color: VIZ.positive }} />
          </div>
        </a>

        <a
          href={`/ppe/stock-out?company_id=${companyId}`}
          className="rounded-xl p-5 bg-white transition-all duration-200 hover:shadow-lg hover:scale-105"
          style={{
            border: `1px solid ${VIZ.grid}`,
            cursor: 'pointer',
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
            style={{
              backgroundColor: VIZ.accent + '20',
            }}
          >
            <TrendingDown size={20} style={{ color: VIZ.accent }} />
          </div>
          <p
            className="font-semibold text-sm"
            style={{ color: VIZ.text }}
          >
            เบิกออก
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: VIZ.lightText }}
          >
            บันทึกการเบิก
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span
              className="text-xs font-semibold"
              style={{ color: VIZ.accent }}
            >
              เปิด
            </span>
            <ArrowRight size={14} style={{ color: VIZ.accent }} />
          </div>
        </a>

        <a
          href={`/ppe/history?company_id=${companyId}`}
          className="rounded-xl p-5 bg-white transition-all duration-200 hover:shadow-lg hover:scale-105"
          style={{
            border: `1px solid ${VIZ.grid}`,
            cursor: 'pointer',
          }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
            style={{
              backgroundColor: VIZ.primary + '20',
            }}
          >
            <Clock size={20} style={{ color: VIZ.primary }} />
          </div>
          <p
            className="font-semibold text-sm"
            style={{ color: VIZ.text }}
          >
            ประวัติ
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: VIZ.lightText }}
          >
            ดูประวัติการทำงาน
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span
              className="text-xs font-semibold"
              style={{ color: VIZ.primary }}
            >
              เปิด
            </span>
            <ArrowRight size={14} style={{ color: VIZ.primary }} />
          </div>
        </a>
      </div>
    </div>
  );
}

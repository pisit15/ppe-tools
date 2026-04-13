'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Package, TrendingUp, TrendingDown } from 'lucide-react';
import type { PPEStockSummary } from '@/lib/types';

interface DashboardStats {
  total_products: number;
  total_stock_in: number;
  total_stock_out: number;
  low_stock_count: number;
}

export default function PPEDashboard() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id') || 'default';
  const [stats, setStats] = useState<DashboardStats>({
    total_products: 0,
    total_stock_in: 0,
    total_stock_out: 0,
    low_stock_count: 0,
  });
  const [lowStockItems, setLowStockItems] = useState<PPEStockSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [stockRes, lowStockRes] = await Promise.all([
          fetch(`/api/ppe/stock?company_id=${companyId}`),
          fetch(`/api/ppe/stock?company_id=${companyId}&low_stock=true`),
        ]);

        const stockData = await stockRes.json();
        const lowStockData = await lowStockRes.json();

        if (stockData.data) {
          const stocks = stockData.data as PPEStockSummary[];
          setStats({
            total_products: stocks.length,
            total_stock_in: stocks.reduce((sum, item) => sum + item.total_in, 0),
            total_stock_out: stocks.reduce((sum, item) => sum + item.total_out, 0),
            low_stock_count: lowStockData.data?.length || 0,
          });
        }

        if (lowStockData.data) {
          setLowStockItems(lowStockData.data.slice(0, 10));
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [companyId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">PPE Dashboard</h1>
        <p className="text-gray-600 mt-2">
          บริษัท: <span className="font-semibold">{companyId}</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">สินค้า PPE ทั้งหมด</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {stats.total_products}
              </p>
            </div>
            <Package className="text-blue-600" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">รับเข้าทั้งหมด</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {stats.total_stock_in}
              </p>
            </div>
            <TrendingUp className="text-green-600" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">เบิกออกทั้งหมด</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {stats.total_stock_out}
              </p>
            </div>
            <TrendingDown className="text-red-600" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">สต็อกต่ำ</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">
                {stats.low_stock_count}
              </p>
            </div>
            <AlertTriangle className="text-yellow-600" size={32} />
          </div>
        </div>
      </div>

      {/* Low Stock Items */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-b-2 border-yellow-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-600" />
            สินค้าที่มีสต็อกต่ำ
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ชื่อสินค้า
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ประเภท
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  สต็อกปัจจุบัน
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  สต็อกขั้นต่ำ
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  หน่วย
                </th>
              </tr>
            </thead>
            <tbody>
              {lowStockItems.length > 0 ? (
                lowStockItems.map((item) => (
                  <tr key={item.product_id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {item.name}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{item.type}</td>
                    <td className="px-6 py-3 text-center">
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-semibold">
                        {item.current_stock}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center font-semibold text-gray-900">
                      {item.min_stock}
                    </td>
                    <td className="px-6 py-3 text-center text-gray-600">
                      {item.unit}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    ไม่มีสินค้าที่มีสต็อกต่ำ ✓
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h2 className="text-lg font-bold text-gray-900 mb-4">ลิงก์ด่วน</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <a
            href={`/ppe/inventory?company_id=${companyId}`}
            className="p-4 border rounded-lg hover:bg-blue-50 transition-colors"
          >
            <p className="font-semibold text-gray-900">จัดการสต็อก</p>
            <p className="text-sm text-gray-600">ดูและแก้ไขรายการ PPE</p>
          </a>
          <a
            href={`/ppe/stock-in?company_id=${companyId}`}
            className="p-4 border rounded-lg hover:bg-green-50 transition-colors"
          >
            <p className="font-semibold text-gray-900">รับเข้า</p>
            <p className="text-sm text-gray-600">บันทึกสต็อกเข้า</p>
          </a>
          <a
            href={`/ppe/stock-out?company_id=${companyId}`}
            className="p-4 border rounded-lg hover:bg-red-50 transition-colors"
          >
            <p className="font-semibold text-gray-900">เบิกออก</p>
            <p className="text-sm text-gray-600">บันทึกการเบิก</p>
          </a>
          <a
            href={`/ppe/history?company_id=${companyId}`}
            className="p-4 border rounded-lg hover:bg-purple-50 transition-colors"
          >
            <p className="font-semibold text-gray-900">ประวัติ</p>
            <p className="text-sm text-gray-600">ดูประวัติการทำงาน</p>
          </a>
        </div>
      </div>
    </div>
  );
}

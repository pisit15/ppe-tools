'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import type { PPEStockSummary, PPETransaction } from '@/lib/types';

interface ReportData {
  stocks: PPEStockSummary[];
  transactions: PPETransaction[];
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id') || 'default';
  const [reportData, setReportData] = useState<ReportData>({
    stocks: [],
    transactions: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/ppe/stock?company_id=${companyId}`),
      fetch(`/api/ppe/transactions?company_id=${companyId}&limit=500`),
    ])
      .then(async ([stockRes, transRes]) => {
        const stockData = await stockRes.json();
        const transData = await transRes.json();
        setReportData({
          stocks: stockData.data || [],
          transactions: transData.data || [],
        });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [companyId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const typeStats = reportData.stocks.reduce(
    (acc, stock) => {
      const type = stock.type;
      if (!acc[type]) {
        acc[type] = { name: type, count: 0, total: 0 };
      }
      acc[type].count += 1;
      acc[type].total += stock.current_stock;
      return acc;
    },
    {} as Record<string, { name: string; count: number; total: number }>
  );

  const transactionStats = reportData.transactions.reduce(
    (acc, trans) => {
      const type = trans.transaction_type;
      acc[type] = (acc[type] || 0) + trans.quantity;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={32} />
          รายงาน
        </h1>
        <p className="text-gray-600 mt-2">สรุปและวิเคราะห์ข้อมูล PPE</p>
      </div>

      {/* Summary Stats */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-6 shadow">
          <p className="text-gray-600 text-sm">สินค้าทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {reportData.stocks.length}
          </p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <p className="text-gray-600 text-sm">บันทึกทั้งหมด</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {reportData.transactions.length}
          </p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <p className="text-gray-600 text-sm">สต็อกรวม</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {reportData.stocks.reduce((sum, s) => sum + s.current_stock, 0)}
          </p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <p className="text-gray-600 text-sm">ประเภท PPE</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {Object.keys(typeStats).length}
          </p>
        </div>
      </div>

      {/* Stock by Type */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">สต็อกตามประเภท</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  ประเภท
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">
                  จำนวนสินค้า
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">
                  สต็อกรวม
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.values(typeStats)
                .sort((a, b) => b.total - a.total)
                .map((stat) => (
                  <tr key={stat.name} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {stat.name}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {stat.count}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">
                        {stat.total}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">สรุปบันทึก</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">เข้า/คืน</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>รับเข้า:</span>
                <span className="font-semibold text-green-600">
                  {transactionStats['stock_in'] || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>รับคืน:</span>
                <span className="font-semibold text-blue-600">
                  {transactionStats['return'] || 0}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">รวม:</span>
                <span className="font-bold text-green-600">
                  {(transactionStats['stock_in'] || 0) +
                    (transactionStats['return'] || 0)}
                </span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">ออก/ยืม</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>เบิก:</span>
                <span className="font-semibold text-red-600">
                  {transactionStats['stock_out'] || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>ยืม:</span>
                <span className="font-semibold text-yellow-600">
                  {transactionStats['borrow'] || 0}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">รวม:</span>
                <span className="font-bold text-red-600">
                  {(transactionStats['stock_out'] || 0) +
                    (transactionStats['borrow'] || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Data */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          ส่งออกข้อมูล
        </h2>
        <p className="text-gray-600 mb-4">
          คุณสามารถส่งออกข้อมูล PPE เป็นไฟล์ CSV หรือ PDF ได้
        </p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
          ดาวน์โหลด CSV
        </button>
      </div>
    </div>
  );
}

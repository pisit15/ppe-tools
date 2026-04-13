'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { PPETransaction } from '@/lib/types';

export default function HistoryPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [transactions, setTransactions] = useState<PPETransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<PPETransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    transactionType: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchTransactions();
  }, [companyId]);

  useEffect(() => {
    let filtered = transactions;

    if (filters.transactionType) {
      filtered = filtered.filter((t) => t.transaction_type === filters.transactionType);
    }

    if (filters.startDate) {
      filtered = filtered.filter((t) => t.transaction_date >= filters.startDate);
    }

    if (filters.endDate) {
      filtered = filtered.filter((t) => t.transaction_date <= filters.endDate);
    }

    setFilteredTransactions(filtered);
  }, [transactions, filters]);

  async function fetchTransactions() {
    try {
      const res = await fetch(
        `/api/ppe/transactions?company_id=${companyId}&limit=500`
      );
      const data = await res.json();
      if (data.data) {
        setTransactions(data.data);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const getTransactionTypeLabel = (type: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      stock_in: { label: 'รับเข้า', color: 'bg-green-100 text-green-800' },
      return: { label: 'รับคืน', color: 'bg-blue-100 text-blue-800' },
      stock_out: { label: 'เบิก', color: 'bg-red-100 text-red-800' },
      borrow: { label: 'ยืม', color: 'bg-yellow-100 text-yellow-800' },
    };
    return labels[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ประวัติการทำงาน</h1>
        <p className="text-gray-600 mt-2">
          จำนวนบันทึก: {filteredTransactions.length}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h2 className="text-lg font-bold text-gray-900 mb-4">ตัวกรอง</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภท
            </label>
            <select
              value={filters.transactionType}
              onChange={(e) =>
                setFilters({ ...filters, transactionType: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- ทั้งหมด --</option>
              <option value="stock_in">รับเข้า</option>
              <option value="return">รับคืน</option>
              <option value="stock_out">เบิก</option>
              <option value="borrow">ยืม</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              จากวันที่
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters({ ...filters, startDate: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ถึงวันที่
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters({ ...filters, endDate: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={() =>
            setFilters({ transactionType: '', startDate: '', endDate: '' })
          }
          className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          ล้างตัวกรอง
        </button>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  วันที่
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ประเภท
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  จำนวน
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  พนักงาน/หมายเหตุ
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  บันทึกโดย
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction) => {
                  const typeInfo = getTransactionTypeLabel(
                    transaction.transaction_type
                  );
                  return (
                    <tr key={transaction.id} className="border-b hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-900 font-medium">
                        {new Date(transaction.transaction_date).toLocaleDateString(
                          'th-TH'
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-900 font-semibold">
                        {transaction.quantity} {transaction.unit}
                      </td>
                      <td className="px-6 py-3 text-gray-600 text-xs">
                        {transaction.employee_name && (
                          <div>{transaction.employee_name}</div>
                        )}
                        {transaction.employee_code && (
                          <div className="text-gray-500">
                            ({transaction.employee_code})
                          </div>
                        )}
                        {transaction.po_number && (
                          <div className="text-gray-500">PO: {transaction.po_number}</div>
                        )}
                        {transaction.notes && (
                          <div className="text-gray-500 italic">
                            {transaction.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {transaction.recorded_by}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    ไม่มีบันทึก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

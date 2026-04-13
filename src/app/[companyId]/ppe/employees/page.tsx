'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { PPEEmployee } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/constants';

export default function EmployeesPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [employees, setEmployees] = useState<PPEEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employee_code: '',
    name: '',
    position: '',
    department: '',
  });

  useEffect(() => {
    fetchEmployees();
  }, [companyId]);

  async function fetchEmployees() {
    try {
      const res = await fetch(`/api/ppe/employees?company_id=${companyId}`);
      const data = await res.json();
      if (data.data) {
        setEmployees(data.data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/ppe/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          ...formData,
        }),
      });

      if (res.ok) {
        setFormData({
          employee_code: '',
          name: '',
          position: '',
          department: '',
        });
        setShowForm(false);
        fetchEmployees();
      }
    } catch (error) {
      console.error('Error creating employee:', error);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">พนักงาน</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          เพิ่มพนักงาน
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg p-6 shadow border-l-4 border-blue-600">
          <h2 className="text-lg font-bold text-gray-900 mb-4">เพิ่มพนักงานใหม่</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รหัสพนักงาน *
                </label>
                <input
                  type="text"
                  required
                  value={formData.employee_code}
                  onChange={(e) =>
                    setFormData({ ...formData, employee_code: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ-นามสกุล *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ตำแหน่ง
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) =>
                    setFormData({ ...formData, position: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  แผนก
                </label>
                <select
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- เลือกแผนก --</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.value} value={dept.value}>
                      {dept.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 px-6 py-2 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Employees Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  รหัสพนักงาน
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ชื่อ-นามสกุล
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ตำแหน่ง
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  แผนก
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  การจัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((employee) => (
                  <tr key={employee.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {employee.employee_code}
                    </td>
                    <td className="px-6 py-3 text-gray-900">{employee.name}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {employee.position}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {employee.department}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button className="text-red-600 hover:text-red-700 p-2 rounded hover:bg-red-50">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    ไม่มีพนักงาน. คลิก "เพิ่มพนักงาน" เพื่อเริ่มต้น
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

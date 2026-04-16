'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Search, Plus, Users, Building2, X, CheckCircle2 } from 'lucide-react';
import type { PPEEmployee } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/constants';

const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  text: '#333333',
  lightText: '#666666',
};

// Deterministic avatar color from name hash
function getAvatarColor(name: string): string {
  const colors = [
    '#4E79A7', // primary blue
    '#F28E2B', // secondary orange
    '#E15759', // accent red
    '#59A14F', // positive green
    '#9C755F', // warm brown
    '#BAB0AC', // neutral grey
    '#5975A4', // blue
    '#F1A028', // gold
    '#D45113', // orange-red
    '#348A36', // dark green
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');
}

// Toast notification
interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = (type: 'success' | 'error', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  return { toasts, add };
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const { toasts, add: addToast } = useToast();

  const [employees, setEmployees] = useState<PPEEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
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
      setIsLoading(true);
      const res = await fetch(`/api/ppe/employees?company_id=${companyId}`);
      const data = await res.json();
      if (data.data) {
        setEmployees(data.data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
      addToast('error', 'ไม่สามารถโหลดข้อมูลพนักงาน');
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
        addToast('success', 'เพิ่มพนักงานสำเร็จ');
        fetchEmployees();
      } else {
        addToast('error', 'เกิดข้อผิดพลาดในการเพิ่มพนักงาน');
      }
    } catch (error) {
      console.error('Error creating employee:', error);
      addToast('error', 'เกิดข้อผิดพลาด โปรดลองใหม่');
    }
  }

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      !searchQuery ||
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.department || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment =
      !selectedDepartment || emp.department === selectedDepartment;

    return matchesSearch && matchesDepartment;
  });

  // Calculate department counts
  const departmentCounts = DEPARTMENTS.map((dept) => ({
    ...dept,
    count: employees.filter((emp) => emp.department === dept.value).length,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: VIZ.primary }}
        ></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-white text-sm shadow-lg animate-in fade-in slide-in-from-top-4 duration-300"
            style={{
              backgroundColor:
                toast.type === 'success' ? VIZ.positive : VIZ.accent,
            }}
          >
            <CheckCircle2 size={18} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="p-3 rounded-xl"
            style={{ backgroundColor: `${VIZ.primary}20` }}
          >
            <Users size={24} style={{ color: VIZ.primary }} />
          </div>
          <div>
            <h1 className="text-3xl font-bold" style={{ color: VIZ.text }}>
              พนักงาน
            </h1>
            <p
              className="text-sm"
              style={{ color: VIZ.lightText }}
            >
              จัดการข้อมูลพนักงาน {employees.length} คน
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-medium transition-all duration-300 hover:shadow-lg"
          style={{ backgroundColor: VIZ.primary }}
        >
          <Plus size={20} />
          เพิ่มพนักงาน
        </button>
      </div>

      {/* Department Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {departmentCounts.map((dept) => (
          <button
            key={dept.value}
            onClick={() =>
              setSelectedDepartment(
                selectedDepartment === dept.value ? '' : dept.value
              )
            }
            className="p-3 rounded-xl border-2 text-left transition-all duration-300 text-sm"
            style={{
              borderColor:
                selectedDepartment === dept.value ? VIZ.primary : '#f0f0f0',
              backgroundColor:
                selectedDepartment === dept.value
                  ? `${VIZ.primary}10`
                  : 'white',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Building2
                size={16}
                style={{
                  color:
                    selectedDepartment === dept.value
                      ? VIZ.primary
                      : VIZ.lightText,
                }}
              />
              <span
                className="font-medium"
                style={{
                  color:
                    selectedDepartment === dept.value ? VIZ.primary : VIZ.text,
                }}
              >
                {dept.count}
              </span>
            </div>
            <p
              className="text-xs"
              style={{
                color:
                  selectedDepartment === dept.value ? VIZ.primary : VIZ.lightText,
              }}
            >
              {dept.label}
            </p>
          </button>
        ))}
      </div>

      {/* Collapsible Add Form */}
      {showForm && (
        <div
          className="rounded-xl p-6 shadow border overflow-hidden animate-in slide-in-from-top-2 duration-300"
          style={{ borderColor: '#f0f0f0', backgroundColor: 'white' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-lg font-bold"
              style={{ color: VIZ.text }}
            >
              เพิ่มพนักงานใหม่
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} style={{ color: VIZ.lightText }} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: VIZ.text }}
                >
                  รหัสพนักงาน *
                </label>
                <input
                  type="text"
                  required
                  value={formData.employee_code}
                  onChange={(e) =>
                    setFormData({ ...formData, employee_code: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors"
                  style={{
                    border: '1px solid #f0f0f0',
                                      }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: VIZ.text }}
                >
                  ชื่อ-นามสกุล *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors"
                  style={{
                    border: '1px solid #f0f0f0',
                                      }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: VIZ.text }}
                >
                  ตำแหน่ง
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) =>
                    setFormData({ ...formData, position: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors"
                  style={{
                    border: '1px solid #f0f0f0',
                                      }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: VIZ.text }}
                >
                  แผนก
                </label>
                <select
                  value={formData.department}
                  onChange={(e) =>
                    setFormData({ ...formData, department: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors"
                  style={{
                    border: '1px solid #f0f0f0',
                                      }}
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

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl font-medium transition-all duration-300 hover:shadow-lg"
                style={{ backgroundColor: VIZ.positive }}
              >
                <CheckCircle2 size={18} />
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2.5 rounded-xl font-medium transition-colors"
                style={{
                  backgroundColor: '#f0f0f0',
                  color: VIZ.text,
                }}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search Bar and Filter */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 transform -translate-y-1/2"
            style={{ color: VIZ.lightText }}
          />
          <input
            type="text"
            placeholder="ค้นหาจากชื่อ รหัสพนักงาน หรือแผนก..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors"
            style={{
              border: '1px solid #f0f0f0',
                          }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <X size={16} style={{ color: VIZ.lightText }} />
            </button>
          )}
        </div>
      </div>

      {/* Employees Table */}
      <div
        className="rounded-xl shadow overflow-hidden"
        style={{ border: '1px solid #f0f0f0', backgroundColor: 'white' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #f0f0f0',
                  backgroundColor: `${VIZ.primary}05`,
                }}
              >
                <th
                  className="px-6 py-4 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  พนักงาน
                </th>
                <th
                  className="px-6 py-4 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  รหัส
                </th>
                <th
                  className="px-6 py-4 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  ตำแหน่ง
                </th>
                <th
                  className="px-6 py-4 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  แผนก
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                    }}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                          style={{
                            backgroundColor: getAvatarColor(employee.name),
                          }}
                        >
                          {getInitials(employee.name)}
                        </div>
                        <span
                          className="font-medium text-sm"
                          style={{ color: VIZ.text }}
                        >
                          {employee.name}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-6 py-4 text-sm"
                      style={{ color: VIZ.lightText }}
                    >
                      {employee.employee_code}
                    </td>
                    <td
                      className="px-6 py-4 text-sm"
                      style={{ color: VIZ.lightText }}
                    >
                      {employee.position || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${VIZ.secondary}20`,
                          color: VIZ.secondary,
                        }}
                      >
                        {DEPARTMENTS.find(
                          (d) => d.value === employee.department
                        )?.label || employee.department || '-'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm"
                    style={{ color: VIZ.lightText }}
                  >
                    {employees.length === 0
                      ? 'ไม่มีพนักงาน คลิก "เพิ่มพนักงาน" เพื่อเริ่มต้น'
                      : 'ไม่พบพนักงานที่ตรงกับการค้นหา'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results summary */}
      {employees.length > 0 && (
        <div
          className="text-center text-sm py-3 rounded-lg"
          style={{
            backgroundColor: `${VIZ.primary}05`,
            color: VIZ.lightText,
          }}
        >
          แสดง {filteredEmployees.length} จาก {employees.length} พนักงาน
        </div>
      )}
    </div>
  );
}

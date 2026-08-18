'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Search, Plus, Users, Building2, X, CheckCircle2, Settings2, Pencil, Trash2, Check } from 'lucide-react';
import type { PPEEmployee, PPEDepartment } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/constants';

// Build a lookup that maps a stored department value (either Thai enum or the
// English full-name actually in the DB) to a friendly display label.
const DEPT_VALUE_TO_LABEL: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.value, d.label])
);
function getDeptLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return DEPT_VALUE_TO_LABEL[value] || value;
}

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
  const searchParams = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const urlCompanyId = searchParams.get('company_id');
  const companyId = isAdmin
    ? (urlCompanyId || 'all')
    : (user?.companyId || '');
  const { toasts, add: addToast } = useToast();

  const [employees, setEmployees] = useState<PPEEmployee[]>([]);
  const [departments, setDepartments] = useState<PPEDepartment[]>([]);
  const [showDeptManager, setShowDeptManager] = useState(false);
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
    fetchDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function fetchDepartments() {
    try {
      const res = await fetch(`/api/ppe/departments?company_id=${companyId}`);
      const data = await res.json();
      setDepartments(data.data || []);
    } catch {
      // non-fatal — form falls back to default list
    }
  }

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

  // Dynamically derive department cards from actual employee data — the DB
  // stores English names (e.g. "Pack Module") which do not match the Thai
  // DEPARTMENTS constant, so a static list produces empty counts. We union
  // the canonical enum with whatever is present in the data and fold each
  // value through getDeptLabel so preconfigured Thai values still display
  // their Thai label.
  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach((emp) => {
      const key = (emp.department || '').trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        label: getDeptLabel(value),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'));
  }, [employees]);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeptManager(true)}
            disabled={companyId === 'all' || companyId === 'admin'}
            title={companyId === 'all' || companyId === 'admin' ? 'เลือกบริษัทก่อนจัดการแผนก' : 'เพิ่ม/แก้ไข/ลบแผนก'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium border transition-all duration-300 hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: VIZ.primary, color: VIZ.primary, backgroundColor: 'white' }}
          >
            <Settings2 size={18} />
            จัดการแผนก
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-medium transition-all duration-300 hover:shadow-lg"
            style={{ backgroundColor: VIZ.primary }}
          >
            <Plus size={20} />
            เพิ่มพนักงาน
          </button>
        </div>
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
                  {(departments.length > 0
                    ? departments.map((d) => ({ value: d.name, label: d.name }))
                    : DEPARTMENTS
                  ).map((dept) => (
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
                        {getDeptLabel(employee.department)}
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

      {/* Department Manager Modal */}
      {showDeptManager && (
        <DeptManagerModal
          companyId={companyId}
          departments={departments}
          onClose={() => setShowDeptManager(false)}
          onChanged={() => {
            fetchDepartments();
            fetchEmployees();
          }}
          notify={addToast}
        />
      )}
    </div>
  );
}

function DeptManagerModal({
  companyId,
  departments,
  onClose,
  onChanged,
  notify,
}: {
  companyId: string;
  departments: PPEDepartment[];
  onClose: () => void;
  onChanged: () => void;
  notify: (type: 'success' | 'error', message: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ppe/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'เพิ่มแผนกไม่สำเร็จ');
        return;
      }
      notify('success', `เพิ่มแผนก "${name}" แล้ว`);
      setNewName('');
      onChanged();
    } catch {
      notify('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: number) => {
    const name = editName.trim();
    const current = departments.find((d) => d.id === id);
    setEditingId(null);
    if (!name || !current || name === current.name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ppe/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'เปลี่ยนชื่อไม่สำเร็จ');
        return;
      }
      const moved = (data.cascaded?.employees ?? 0) + (data.cascaded?.transactions ?? 0);
      notify(
        'success',
        moved > 0
          ? `เปลี่ยนชื่อเป็น "${name}" และอัปเดตข้อมูลเก่า ${moved} รายการ`
          : `เปลี่ยนชื่อเป็น "${name}" แล้ว`
      );
      onChanged();
    } catch {
      notify('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    const current = departments.find((d) => d.id === id);
    setConfirmDeleteId(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/ppe/departments?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        notify('error', data.error || 'ลบไม่สำเร็จ');
        return;
      }
      notify('success', `ลบแผนก "${current?.name || ''}" ออกจากรายการแล้ว`);
      onChanged();
    } catch {
      notify('error', 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Building2 size={18} style={{ color: VIZ.primary }} />
            <h3 className="font-bold" style={{ color: VIZ.text }}>จัดการแผนก</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="ชื่อแผนกใหม่..."
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400"
            />
            <button
              onClick={handleAdd}
              disabled={busy || !newName.trim()}
              className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
              style={{ backgroundColor: VIZ.positive }}
            >
              <Plus size={15} /> เพิ่ม
            </button>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto space-y-1.5">
            {departments.length === 0 ? (
              <p className="text-center text-sm py-6" style={{ color: VIZ.lightText }}>
                ยังไม่มีแผนก
              </p>
            ) : (
              departments.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 hover:bg-gray-50"
                >
                  {editingId === d.id ? (
                    <>
                      <input
                        type="text"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(d.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 px-2 py-1.5 border rounded-lg text-sm text-gray-900"
                        style={{ borderColor: VIZ.primary }}
                      />
                      <button
                        onClick={() => handleRename(d.id)}
                        disabled={busy}
                        className="p-1.5 rounded-lg hover:bg-green-50"
                        style={{ color: VIZ.positive }}
                      >
                        <Check size={16} />
                      </button>
                    </>
                  ) : confirmDeleteId === d.id ? (
                    <>
                      <span className="flex-1 text-sm" style={{ color: VIZ.accent }}>
                        ลบ &quot;{d.name}&quot; ออกจากรายการ?
                      </span>
                      <button
                        onClick={() => handleDelete(d.id)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-lg text-white text-xs font-semibold"
                        style={{ backgroundColor: VIZ.accent }}
                      >
                        ลบ
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs text-gray-600"
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm" style={{ color: VIZ.text }}>{d.name}</span>
                      <button
                        title="เปลี่ยนชื่อแผนก"
                        onClick={() => { setEditingId(d.id); setEditName(d.name); setConfirmDeleteId(null); }}
                        className="p-1.5 rounded-lg hover:bg-blue-50"
                        style={{ color: VIZ.primary }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        title="ลบแผนกออกจากรายการ"
                        onClick={() => { setConfirmDeleteId(d.id); setEditingId(null); }}
                        className="p-1.5 rounded-lg hover:bg-red-50"
                        style={{ color: VIZ.accent }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <p className="text-xs" style={{ color: VIZ.lightText }}>
            เปลี่ยนชื่อแผนก = ข้อมูลพนักงานและประวัติเบิกเก่าจะย้ายไปใช้ชื่อใหม่ด้วย ·
            ลบแผนก = หายจากตัวเลือกเท่านั้น ข้อมูลเก่าไม่ถูกแก้
          </p>
        </div>
      </div>
    </div>
  );
}

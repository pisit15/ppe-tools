'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, User, ArrowRight, ArrowLeft, Building2, Package, Users, BarChart3, LogOut } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

interface CompanyStock {
  company_id: string;
  company_name: string;
  total_products: number;
  total_stock: number;
  low_stock_count: number;
  total_employees: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, login, logout, isLoading: authLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<CompanyStock[]>([]);
  const [loading, setLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

  // Load admin data
  useEffect(() => {
    if (!isAdmin) return;

    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/summary');
        if (res.ok) {
          const data = await res.json();
          setCompanies(data.companies || []);
        }
      } catch {
        console.error('Failed to load admin data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isAdmin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ');
    } else {
      // Check if the logged-in user is admin — will re-render
    }
  };

  // Login form for admin
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
        <nav className="p-6">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <Shield className="text-blue-400" size={28} />
            <div>
              <h1 className="text-xl font-bold text-white">EA SHE Tools</h1>
              <p className="text-blue-300 text-xs">Admin Dashboard</p>
            </div>
          </div>
        </nav>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-2 text-blue-300 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft size={16} />
              <span className="text-sm">กลับหน้าหลัก</span>
            </button>

            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div
                className="px-8 py-6 text-center"
                style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)' }}
              >
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Lock className="text-white" size={28} />
                </div>
                <h2 className="text-2xl font-bold text-white">Admin Login</h2>
                <p className="text-gray-300 text-sm mt-1">เข้าสู่ระบบสำหรับผู้ดูแลระบบ</p>
              </div>

              <form onSubmit={handleLogin} className="p-8 space-y-5">
                {user && !isAdmin && (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-xl text-sm">
                    บัญชี &quot;{user.username}&quot; ไม่มีสิทธิ์ Admin กรุณาเข้าสู่ระบบด้วยบัญชี Admin
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <User size={14} className="inline mr-1" />
                    ชื่อผู้ใช้
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    placeholder="admin"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <Lock size={14} className="inline mr-1" />
                    รหัสผ่าน
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="ใส่รหัสผ่าน Admin"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : (
                    <>เข้าสู่ระบบ Admin <ArrowRight size={18} /></>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin Dashboard
  const totals = companies.reduce(
    (acc, c) => ({
      products: acc.products + c.total_products,
      stock: acc.stock + c.total_stock,
      lowStock: acc.lowStock + c.low_stock_count,
      employees: acc.employees + c.total_employees,
    }),
    { products: 0, stock: 0, lowStock: 0, employees: 0 }
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-slate-800 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-blue-400" />
            <div>
              <h1 className="text-lg font-bold">Admin Dashboard</h1>
              <p className="text-sm text-gray-400">PPE Inventory — ทุกบริษัท</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/')} className="text-sm text-gray-300 hover:text-white flex items-center gap-1">
              <ArrowLeft size={16} /> หน้าหลัก
            </button>
            <button onClick={() => { logout(); }} className="text-sm text-gray-300 hover:text-red-300 flex items-center gap-1">
              <LogOut size={16} /> ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow">
            <div className="flex items-center gap-3">
              <Building2 className="text-blue-600" size={24} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{companies.length}</p>
                <p className="text-sm text-gray-500">บริษัท</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow">
            <div className="flex items-center gap-3">
              <Package className="text-green-600" size={24} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{totals.products}</p>
                <p className="text-sm text-gray-500">รายการ PPE</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow">
            <div className="flex items-center gap-3">
              <BarChart3 className="text-orange-600" size={24} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{totals.stock}</p>
                <p className="text-sm text-gray-500">สต็อกรวม</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow">
            <div className="flex items-center gap-3">
              <Users className="text-purple-600" size={24} />
              <div>
                <p className="text-2xl font-bold text-gray-900">{totals.employees}</p>
                <p className="text-sm text-gray-500">พนักงาน</p>
              </div>
            </div>
          </div>
        </div>

        {/* Company Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">ข้อมูลแยกรายบริษัท</h2>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="text-gray-500 mt-3">กำลังโหลดข้อมูล...</p>
            </div>
          ) : companies.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              ยังไม่มีข้อมูล PPE ในระบบ
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-700">บริษัท</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-gray-700">รายการ PPE</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-gray-700">สต็อกรวม</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-gray-700">สต็อกต่ำ</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-gray-700">พนักงาน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {companies.map((c) => (
                    <tr key={c.company_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{c.company_name || c.company_id}</p>
                        <p className="text-xs text-gray-500">{c.company_id}</p>
                      </td>
                      <td className="text-center px-4 py-4 text-gray-700">{c.total_products}</td>
                      <td className="text-center px-4 py-4 text-gray-700">{c.total_stock}</td>
                      <td className="text-center px-4 py-4">
                        {c.low_stock_count > 0 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                            {c.low_stock_count}
                          </span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                      <td className="text-center px-4 py-4 text-gray-700">{c.total_employees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

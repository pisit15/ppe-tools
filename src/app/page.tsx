'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { COMPANIES } from '@/lib/companies';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState('');

  // Redirect after auth state is committed (fixes React batching race condition)
  useEffect(() => {
    if (pendingRedirect && auth.isLoggedIn(pendingRedirect)) {
      router.push(`/${pendingRedirect}`);
    }
  }, [pendingRedirect, auth, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) {
      setError('กรุณาเลือกบริษัท');
      return;
    }
    if (!password) {
      setError('กรุณาใส่รหัสผ่าน');
      return;
    }

    setIsLoading(true);
    setError('');

    // Small delay for UX
    await new Promise((r) => setTimeout(r, 300));

    const success = auth.login(selectedCompany, password);
    if (success) {
      // Let useEffect handle redirect after state commits
      setPendingRedirect(selectedCompany);
    } else {
      setError('รหัสผ่านไม่ถูกต้อง');
      setIsLoading(false);
    }
  };

  // Check if already logged in to any company
  const loggedInCompanies = COMPANIES.filter((c) => auth.isLoggedIn(c.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col">
      {/* Nav */}
      <nav className="p-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Shield className="text-blue-400" size={28} />
          <div>
            <h1 className="text-xl font-bold text-white">EA SHE Tools</h1>
            <p className="text-blue-300 text-xs">tools.eashe.org</p>
          </div>
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div
              className="px-8 py-6 text-center"
              style={{
                background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e40af 100%)',
              }}
            >
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lock className="text-white" size={28} />
              </div>
              <h2 className="text-2xl font-bold text-white">เข้าสู่ระบบ</h2>
              <p className="text-blue-200 text-sm mt-1">
                Safety & Environment Tools Platform
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="p-8 space-y-5">
              {/* Company Selector */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Building2 size={14} className="inline mr-1" />
                  เลือกบริษัท
                </label>
                <select
                  value={selectedCompany}
                  onChange={(e) => {
                    setSelectedCompany(e.target.value);
                    setError('');
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="">-- เลือกบริษัท --</option>
                  {COMPANIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Lock size={14} className="inline mr-1" />
                  รหัสผ่าน
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="ใส่รหัสผ่าน"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <>
                    เข้าสู่ระบบ
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick access for already logged-in companies */}
          {loggedInCompanies.length > 0 && (
            <div className="mt-6 bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-blue-200 text-sm mb-3">เข้าสู่ระบบอยู่แล้ว:</p>
              <div className="space-y-2">
                {loggedInCompanies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/${c.id}`)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  >
                    <span className="font-medium">{c.name}</span>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 text-center text-blue-400 text-xs">
        EA SHE Tools Platform v1.0 | Powered by Next.js & Supabase
      </footer>
    </div>
  );
}

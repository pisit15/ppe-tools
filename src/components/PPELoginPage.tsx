'use client';

import { useState } from 'react';
import { Shield, Lock, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

export default function PPELoginPage({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('กรุณาใส่ชื่อผู้ใช้');
      return;
    }
    if (!password) {
      setError('กรุณาใส่รหัสผ่าน');
      return;
    }

    setError('');
    const result = await login(username, password);
    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ');
    }
  };

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
          {/* Back link */}
          <Link href="/" className="inline-flex items-center gap-2 text-blue-300 hover:text-white mb-6 transition-colors">
            <ArrowLeft size={16} />
            <span className="text-sm">กลับหน้าหลัก</span>
          </Link>

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
                <Shield className="text-white" size={28} />
              </div>
              <h2 className="text-2xl font-bold text-white">PPE Inventory</h2>
              <p className="text-blue-200 text-sm mt-1">
                เข้าสู่ระบบเพื่อจัดการอุปกรณ์ PPE
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              {/* Username */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <User size={14} className="inline mr-1" />
                  ชื่อผู้ใช้
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  placeholder="ใส่ชื่อผู้ใช้ (เช่น komsant)"
                  autoComplete="username"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
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
                  autoComplete="current-password"
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

          <p className="text-center text-blue-400 text-xs mt-6">
            ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกันกับ eashe.org
          </p>
        </div>
      </div>
    </div>
  );
}

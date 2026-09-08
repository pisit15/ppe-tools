'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck, User } from 'lucide-react';
import { useSuperAdmin } from '@/components/superadmin/SuperAdminShell';
import { VIZ } from '@/components/superadmin/ui';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { href } = useSuperAdmin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/superadmin/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      router.replace(href('/'));
      router.refresh();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0f172a 100%)' }}
    >
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div
            className="px-8 py-7 text-center"
            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)' }}
          >
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
              <ShieldCheck className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-white">EA SHE Admin Console</h1>
            <p className="mt-1 text-sm text-slate-300">สำหรับ Super Admin เท่านั้น</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-8">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold" style={{ color: VIZ.text }}>
                <User size={14} className="mr-1 inline" />
                ชื่อผู้ใช้
              </span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold" style={{ color: VIZ.text }}>
                <Lock size={14} className="mr-1 inline" />
                รหัสผ่าน
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: VIZ.primary }}
            >
              {submitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          การเข้าใช้งานทุกครั้งถูกบันทึกไว้ในระบบ
        </p>
      </div>
    </div>
  );
}

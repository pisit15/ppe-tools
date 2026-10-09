'use client';

import { useState } from 'react';
import { Settings2, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { HomeCardGrid } from '@/components/home/HomeCardGrid';
import { HomeCardsManager } from '@/components/home/HomeCardsManager';

export default function HomePage() {
  const { user, logout } = useAuth();
  const [managing, setManaging] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Nav */}
      <nav className="p-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-2 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ea-logo.svg" alt="EA SHE" width={52} height={40} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">EA SHE Tools</h1>
              <p className="text-blue-300 text-xs">tools.eashe.org</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-white font-medium">{user.displayName}</p>
                <p className="text-xs text-blue-300">{user.companyName}</p>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-4">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <div className="bg-white rounded-2xl px-6 py-4 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ea-logo.svg" alt="EA SHE" width={132} height={100} />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Safety & Environment Tools
          </h2>
          <p className="text-blue-200 text-lg">
            เลือกเครื่องมือที่ต้องการใช้งาน
          </p>
          {user && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
              <User size={16} className="text-blue-300" />
              <span className="text-blue-200 text-sm">
                เข้าสู่ระบบแล้ว: <span className="text-white font-medium">{user.nickname || user.displayName}</span> ({user.companyName})
              </span>
            </div>
          )}
        </div>

        {/* Project Grid */}
        {isAdmin && !managing && <div className="mb-5 flex justify-end"><button onClick={() => setManaging(true)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200/60 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"><Settings2 size={17} />จัดการการ์ด</button></div>}
        {isAdmin && managing ? <HomeCardsManager key={user.id} onClose={() => { setManaging(false); setRefresh(value => value + 1); }} /> : <HomeCardGrid key={refresh} />}
      </div>

      {/* Footer */}
      <footer className="p-4 text-center text-blue-400 text-xs">
        {!user && <Link href="/admin" className="mb-3 block text-sm text-blue-100 underline">เข้าสู่ระบบ Admin</Link>}
        EA SHE Tools Platform v1.0 | Powered by Next.js & Supabase
      </footer>
    </div>
  );
}

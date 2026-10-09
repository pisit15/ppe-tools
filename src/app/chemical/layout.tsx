'use client';

import './chemical.css';
import { usePathname } from 'next/navigation';
import { Suspense, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import ChemicalLoginPage from '@/components/ChemicalLoginPage';

export default function ChemicalLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const editing = pathname === '/chemical/new' || pathname.endsWith('/edit');
  const [loginDone, setLoginDone] = useState(false);

  if (!user && !loginDone) {
    return <ChemicalLoginPage onLoginSuccess={() => setLoginDone(true)} />;
  }
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="chemical-shell flex flex-col md:flex-row min-h-screen bg-gray-50">
      {/* Sidebar อ่าน useSearchParams → ต้องครอบ Suspense ตามข้อกำหนด Next */}
      {!editing && <Suspense fallback={<aside className="w-64 bg-purple-950 min-h-screen" />}>
        <Sidebar mode="chemical" />
      </Suspense>}
      <main className="flex-1 min-w-0">
        <div className="p-3 md:p-6">
          <Suspense fallback={<div className="text-sm text-gray-500">กำลังโหลด…</div>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}

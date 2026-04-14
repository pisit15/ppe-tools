'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import SHELoginPage from '@/components/SHELoginPage';

export default function SHEWorkforceLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loginDone, setLoginDone] = useState(false);

  // Show login page if not authenticated
  if (!user && !loginDone) {
    return <SHELoginPage onLoginSuccess={() => setLoginDone(true)} />;
  }

  // Loading state after login
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar mode="she" />
      <main className="flex-1">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

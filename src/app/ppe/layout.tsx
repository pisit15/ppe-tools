'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import PPELoginPage from '@/components/PPELoginPage';
import ModuleAccessDenied from '@/components/ModuleAccessDenied';
import { canAccessModule } from '@/lib/companies';

export default function PPELayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loginDone, setLoginDone] = useState(false);

  // Show login page if not authenticated
  if (!user && !loginDone) {
    return <PPELoginPage onLoginSuccess={() => setLoginDone(true)} />;
  }

  // After login, user state will be set by AuthProvider
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Module-level access control (allowed_modules on the user account)
  if (!canAccessModule(user, 'ppe')) {
    return <ModuleAccessDenied moduleName="PPE Inventory" />;
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-gray-50 md:flex-row">
      <Sidebar mode="ppe" />
      <main id="ppe-main-content" className="min-w-0 flex-1">
        <div className="min-w-0 p-3 sm:p-5 lg:p-6">{children}</div>
      </main>
    </div>
  );
}

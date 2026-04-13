'use client';

import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PPELayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const auth = useAuth();
  const companyId = params.companyId as string;

  // Auth gate — small delay to allow state propagation
  useEffect(() => {
    if (!auth.isLoggedIn(companyId)) {
      const timer = setTimeout(() => {
        if (!auth.isLoggedIn(companyId)) {
          router.replace('/');
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [auth, companyId, router]);

  if (!auth.isLoggedIn(companyId)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

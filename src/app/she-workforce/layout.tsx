'use client';

import Sidebar from '@/components/Sidebar';

export default function SHEWorkforceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar mode="she" />
      <main className="flex-1">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

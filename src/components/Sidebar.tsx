'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Menu,
  X,
  Home,
  Package,
  TrendingUp,
  TrendingDown,
  Users,
  History,
  BarChart3,
  ArrowLeft,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const basePath = '/ppe';

  const navItems: NavItem[] = [
    { label: 'แดชบอร์ด', href: basePath, icon: <Home size={20} /> },
    { label: 'จัดการสต็อก', href: `${basePath}/inventory`, icon: <Package size={20} /> },
    { label: 'รับเข้า', href: `${basePath}/stock-in`, icon: <TrendingUp size={20} /> },
    { label: 'เบิกออก', href: `${basePath}/stock-out`, icon: <TrendingDown size={20} /> },
    { label: 'พนักงาน', href: `${basePath}/employees`, icon: <Users size={20} /> },
    { label: 'ประวัติ', href: `${basePath}/history`, icon: <History size={20} /> },
    { label: 'รายงาน', href: `${basePath}/reports`, icon: <BarChart3 size={20} /> },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <aside
      className={`${
        isOpen ? 'w-64' : 'w-20'
      } bg-blue-900 text-white transition-all duration-300 min-h-screen flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-blue-800">
        {isOpen && <h1 className="text-lg font-bold">PPE System</h1>}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-blue-800 rounded-lg transition-colors"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* User / Company Info */}
      {isOpen && user && (
        <div className="p-4 border-b border-blue-800">
          <label className="text-xs text-blue-300 block mb-1">บริษัท</label>
          <p className="text-sm font-semibold text-white">{user.companyName}</p>
          <p className="text-xs text-blue-300 mt-1">{user.nickname || user.displayName}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-colors ${
              isActive(item.href)
                ? 'bg-blue-700 text-white'
                : 'text-blue-100 hover:bg-blue-800'
            }`}
          >
            {item.icon}
            {isOpen && <span className="text-sm font-medium">{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-blue-800 space-y-2">
        {/* Back to Hub */}
        <button
          onClick={() => router.push('/')}
          className="w-full flex items-center gap-3 px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-800 rounded-lg transition-colors text-sm"
        >
          <ArrowLeft size={18} />
          {isOpen && <span>กลับหน้าเลือกเครื่องมือ</span>}
        </button>

        {/* Logout */}
        <button
          onClick={() => {
            logout();
            router.push('/');
          }}
          className="w-full flex items-center gap-3 px-4 py-2 text-blue-200 hover:text-red-300 hover:bg-blue-800 rounded-lg transition-colors text-sm"
        >
          <LogOut size={18} />
          {isOpen && <span>ออกจากระบบ</span>}
        </button>
      </div>
    </aside>
  );
}

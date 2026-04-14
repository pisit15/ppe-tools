'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Briefcase,
  ArrowLeft,
  Building2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type SidebarProps = {
  mode?: 'ppe' | 'she';
};

export default function Sidebar({ mode = 'ppe' }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Use company from logged-in user
  const companyId = user?.companyId || 'default';
  const companyName = user?.companyName || 'ไม่ทราบบริษัท';

  const ppeItems: NavItem[] = [
    { label: 'แดชบอร์ด', href: `/ppe?company_id=${companyId}`, icon: <Home size={20} /> },
    { label: 'จัดการสต็อก', href: `/ppe/inventory?company_id=${companyId}`, icon: <Package size={20} /> },
    { label: 'รับเข้า', href: `/ppe/stock-in?company_id=${companyId}`, icon: <TrendingUp size={20} /> },
    { label: 'เบิกออก', href: `/ppe/stock-out?company_id=${companyId}`, icon: <TrendingDown size={20} /> },
    { label: 'พนักงาน', href: `/ppe/employees?company_id=${companyId}`, icon: <Users size={20} /> },
    { label: 'ประวัติ', href: `/ppe/history?company_id=${companyId}`, icon: <History size={20} /> },
    { label: 'รายงาน', href: `/ppe/reports?company_id=${companyId}`, icon: <BarChart3 size={20} /> },
  ];

  const sheItems: NavItem[] = [
    { label: 'ภาพรวม', href: `/she-workforce?company_id=${companyId}`, icon: <Briefcase size={20} /> },
  ];

  const navItems = mode === 'she' ? sheItems : ppeItems;
  const sectionTitle = mode === 'she' ? 'SHE Workforce' : 'PPE Inventory';
  const bgColor = mode === 'she' ? 'bg-teal-900' : 'bg-blue-900';
  const borderColor = mode === 'she' ? 'border-teal-800' : 'border-blue-800';
  const hoverBg = mode === 'she' ? 'hover:bg-teal-800' : 'hover:bg-blue-800';
  const activeBg = mode === 'she' ? 'bg-teal-700' : 'bg-blue-700';
  const mutedText = mode === 'she' ? 'text-teal-300' : 'text-blue-300';

  const isActive = (href: string) => pathname === href.split('?')[0];

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <aside
      className={`${
        isOpen ? 'w-64' : 'w-20'
      } ${bgColor} text-white transition-all duration-300 min-h-screen flex flex-col`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b ${borderColor}`}>
        {isOpen && <h1 className="text-lg font-bold">{sectionTitle}</h1>}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`p-2 ${hoverBg} rounded-lg transition-colors`}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Company Display */}
      {isOpen && user && (
        <div className={`p-4 border-b ${borderColor}`}>
          <label className={`text-xs ${mutedText} block mb-1`}>บริษัท</label>
          <div className="flex items-center gap-2">
            <Building2 size={16} className={mutedText} />
            <span className="text-sm font-medium text-white truncate">{companyName}</span>
          </div>
          {user.displayName && (
            <p className={`text-xs ${mutedText} mt-2 truncate`}>
              เข้าสู่ระบบ: {user.displayName}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-colors ${
              isActive(item.href)
                ? `${activeBg} text-white`
                : `text-blue-100 ${hoverBg}`
            }`}
          >
            {item.icon}
            {isOpen && <span className="text-sm font-medium">{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      {user && (
        <div className={`px-4 pb-2`}>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-4 py-2 ${mutedText} hover:text-white ${hoverBg} rounded-lg transition-colors`}
          >
            <LogOut size={18} />
            {isOpen && <span className="text-sm">ออกจากระบบ</span>}
          </button>
        </div>
      )}

      {/* Back to Home */}
      <div className={`px-4 pb-4 border-t ${borderColor} pt-3`}>
        <Link
          href="/"
          className={`flex items-center gap-3 px-4 py-2 ${mutedText} hover:text-white ${hoverBg} rounded-lg transition-colors`}
        >
          <ArrowLeft size={18} />
          {isOpen && <span className="text-sm">กลับหน้าหลัก</span>}
        </Link>
      </div>

      {/* Footer */}
      {isOpen && (
        <div className={`p-4 border-t ${borderColor} text-xs ${mutedText}`}>
          <p className="mb-1">EA SHE Tools</p>
          <p>tools.eashe.org</p>
        </div>
      )}
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
} from 'lucide-react';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id') || 'default';

  const navItems: NavItem[] = [
    { label: 'แดชบอร์ด', href: `/ppe?company_id=${companyId}`, icon: <Home size={20} /> },
    { label: 'จัดการสต็อก', href: `/ppe/inventory?company_id=${companyId}`, icon: <Package size={20} /> },
    { label: 'รับเข้า', href: `/ppe/stock-in?company_id=${companyId}`, icon: <TrendingUp size={20} /> },
    { label: 'เบิกออก', href: `/ppe/stock-out?company_id=${companyId}`, icon: <TrendingDown size={20} /> },
    { label: 'พนักงาน', href: `/ppe/employees?company_id=${companyId}`, icon: <Users size={20} /> },
    { label: 'ประวัติ', href: `/ppe/history?company_id=${companyId}`, icon: <History size={20} /> },
    { label: 'รายงาน', href: `/ppe/reports?company_id=${companyId}`, icon: <BarChart3 size={20} /> },
  ];

  const isActive = (href: string) => pathname === href.split('?')[0];

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

      {/* Company Selector */}
      {isOpen && (
        <div className="p-4 border-b border-blue-800">
          <label className="text-xs text-blue-300 block mb-2">บริษัท</label>
          <select
            value={companyId}
            onChange={(e) => {
              const newCompanyId = e.target.value;
              window.location.href = pathname + `?company_id=${newCompanyId}`;
            }}
            className="w-full bg-blue-800 text-white text-sm rounded px-2 py-2 border border-blue-700"
          >
            <option value="default">บริษัท เริ่มต้น</option>
            <option value="eashe">EASHE Corp</option>
            <option value="subsidiary">Subsidiary Co</option>
          </select>
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

      {/* Footer */}
      {isOpen && (
        <div className="p-4 border-t border-blue-800 text-xs text-blue-300">
          <p className="mb-2">PPE Inventory System</p>
          <p>Deployed to tools.eashe.org</p>
        </div>
      )}
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  ChevronDown,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  // URL-driven company selection (admin can switch)
  const urlCompanyId = searchParams.get('company_id');
  const activeCompanyId =
    (isAdmin && urlCompanyId) ||
    (isAdmin ? 'all' : user?.companyId || 'default');

  // Load companies list for admin dropdown
  const [companies, setCompanies] = useState<Array<{ company_id: string; company_name: string }>>([]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCompanies(data);
        else if (Array.isArray(data?.data)) setCompanies(data.data);
      })
      .catch(() => {});
  }, [isAdmin]);

  const displayCompanyName = (() => {
    if (isAdmin) {
      if (activeCompanyId === 'all') return 'ทุกบริษัท (ภาพรวม)';
      const c = companies.find((x) => x.company_id === activeCompanyId);
      return c?.company_name || activeCompanyId.toUpperCase();
    }
    return user?.companyName || 'ไม่ทราบบริษัท';
  })();

  // Nav query: keep company_id in URL so pages can read it
  const q = `?company_id=${activeCompanyId}`;

  const ppeItems: NavItem[] = [
    { label: 'แดชบอร์ด', href: `/ppe${q}`, icon: <Home size={20} /> },
    { label: 'จัดการสต็อก', href: `/ppe/inventory${q}`, icon: <Package size={20} /> },
    { label: 'รับเข้า', href: `/ppe/stock-in${q}`, icon: <TrendingUp size={20} /> },
    { label: 'เบิกออก', href: `/ppe/stock-out${q}`, icon: <TrendingDown size={20} /> },
    { label: 'พนักงาน', href: `/ppe/employees${q}`, icon: <Users size={20} /> },
    { label: 'ประวัติ', href: `/ppe/history${q}`, icon: <History size={20} /> },
    { label: 'รายงาน', href: `/ppe/reports${q}`, icon: <BarChart3 size={20} /> },
  ];

  const sheItems: NavItem[] = [
    { label: 'ภาพรวม', href: `/she-workforce${q}`, icon: <Briefcase size={20} /> },
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

  const handleCompanyChange = (newId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('company_id', newId);
    router.push(`${pathname}?${params.toString()}`);
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

      {/* Company Selector / Display */}
      {isOpen && user && (
        <div className={`p-4 border-b ${borderColor}`}>
          <label className={`text-xs ${mutedText} block mb-1`}>
            {isAdmin ? 'เลือกบริษัท (Admin)' : 'บริษัท'}
          </label>

          {isAdmin ? (
            <div className="relative">
              <select
                value={activeCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className={`w-full ${mode === 'she' ? 'bg-teal-800 border-teal-700' : 'bg-blue-800 border-blue-700'} border text-white text-sm rounded-lg pl-8 pr-8 py-2 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/30`}
              >
                <option value="all">ทุกบริษัท (ภาพรวม)</option>
                {companies.map((c) => (
                  <option key={c.company_id} value={c.company_id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
              <Building2
                size={14}
                className={`absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none ${mutedText}`}
              />
              <ChevronDown
                size={14}
                className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${mutedText}`}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Building2 size={16} className={mutedText} />
              <span className="text-sm font-medium text-white truncate">
                {displayCompanyName}
              </span>
            </div>
          )}

          {user.displayName && (
            <p className={`text-xs ${mutedText} mt-2 truncate`}>
              เข้าสู่ระบบ: {user.displayName}
              {isAdmin && <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-yellow-900 text-[10px] rounded font-bold">ADMIN</span>}
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

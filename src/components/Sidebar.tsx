'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  FileBarChart,
  Briefcase,
  ArrowLeft,
  Building2,
  LogOut,
  ChevronDown,
  Network,
  ShoppingCart,
  FlaskConical,
  Grid3x3,
  Warehouse,
  Settings,
  Scale,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type SidebarProps = {
  mode?: 'ppe' | 'she' | 'chemical';
};

export default function Sidebar({ mode = 'ppe' }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (mode !== 'ppe' || !mobileOpen) return;

    const drawer = mobileDrawerRef.current;
    const main = document.getElementById('ppe-main-content');
    const previousOverflow = document.body.style.overflow;
    const previousInert = main?.inert ?? false;
    document.body.style.overflow = 'hidden';
    if (main) main.inert = true;
    drawer?.querySelector<HTMLButtonElement>('button')?.focus();

    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };
    const desktop = window.matchMedia('(min-width: 768px)');
    desktop.addEventListener('change', closeOnDesktop);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex="0"]',
      )).filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (main) main.inert = previousInert;
      document.removeEventListener('keydown', handleKeyDown);
      desktop.removeEventListener('change', closeOnDesktop);
      mobileTriggerRef.current?.focus();
    };
  }, [mode, mobileOpen]);

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
  const q = `?company_id=${encodeURIComponent(activeCompanyId)}`;

  const ppeItems: NavItem[] = [
    { label: 'แดชบอร์ด', href: `/ppe${q}`, icon: <Home size={20} /> },
    { label: 'จัดการสต็อก', href: `/ppe/inventory${q}`, icon: <Package size={20} /> },
    { label: 'รับเข้า', href: `/ppe/stock-in${q}`, icon: <TrendingUp size={20} /> },
    { label: 'เบิกออก', href: `/ppe/stock-out${q}`, icon: <TrendingDown size={20} /> },
    { label: 'พนักงาน', href: `/ppe/employees${q}`, icon: <Users size={20} /> },
    { label: 'ประวัติ', href: `/ppe/history${q}`, icon: <History size={20} /> },
    { label: 'รายงาน', href: `/ppe/reports${q}`, icon: <BarChart3 size={20} /> },
    { label: 'รายงานสินค้า', href: `/ppe/reports/product${q}`, icon: <FileBarChart size={20} /> },
    { label: 'คำนวณสั่งซื้อ', href: `/ppe/reports/order${q}`, icon: <ShoppingCart size={20} /> },
  ];

  const sheItems: NavItem[] = [
    { label: 'ภาพรวม', href: `/she-workforce${q}`, icon: <Briefcase size={20} /> },
    { label: 'ผังองค์กร', href: `/she-workforce/organization${q}`, icon: <Network size={20} /> },
  ];

  const chemItems: NavItem[] = [
    { label: 'ทะเบียนสารเคมี', href: `/chemical${q}`, icon: <FlaskConical size={20} /> },
    { label: 'ตรวจสอบกฎหมาย', href: `/chemical/legal${q}`, icon: <Scale size={20} /> },
    { label: 'ตารางเก็บร่วม/แยก', href: `/chemical/compatibility${q}`, icon: <Grid3x3 size={20} /> },
    { label: 'พื้นที่จัดเก็บ', href: `/chemical/storage-areas${q}`, icon: <Warehouse size={20} /> },
    { label: 'ตั้งค่า / เบอร์ฉุกเฉิน', href: `/chemical/settings${q}`, icon: <Settings size={20} /> },
  ];

  const navItems = mode === 'she' ? sheItems : mode === 'chemical' ? chemItems : ppeItems;
  const sectionTitle = mode === 'she' ? 'SHE Workforce' : mode === 'chemical' ? 'Chemical Management' : 'PPE Inventory';
  const isTeal = mode === 'she';
  const isPurple = mode === 'chemical';
  const bgColor = isTeal ? 'bg-teal-900' : isPurple ? 'bg-purple-950' : 'bg-blue-900';
  const borderColor = isTeal ? 'border-teal-800' : isPurple ? 'border-purple-900' : 'border-blue-800';
  const hoverBg = isTeal ? 'hover:bg-teal-800' : isPurple ? 'hover:bg-purple-900' : 'hover:bg-blue-800';
  const activeBg = isTeal ? 'bg-teal-700' : isPurple ? 'bg-purple-700' : 'bg-blue-700';
  const mutedText = isTeal ? 'text-teal-300' : isPurple ? 'text-purple-300' : 'text-blue-300';
  const selectBg = isTeal ? 'bg-teal-800 border-teal-700' : isPurple ? 'bg-purple-900 border-purple-800' : 'bg-blue-800 border-blue-700';

  const isActive = (href: string) => pathname === href.split('?')[0];

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const handleCompanyChange = (newId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('company_id', newId);
    if (mode === 'chemical') params.delete('substance_id');
    if (mode === 'ppe') setMobileOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  };

  if (mode === 'ppe') {
    const companySelector = (expanded: boolean) => expanded && user && (
      <div className="shrink-0 border-b border-blue-800 px-4 py-3">
        <label className="mb-1.5 block text-xs text-blue-200">{isAdmin ? 'เลือกบริษัท (Admin)' : 'บริษัท'}</label>
        {isAdmin ? (
          <div className="relative">
            <select
              aria-label="เลือกบริษัท"
              value={activeCompanyId}
              onChange={event => handleCompanyChange(event.target.value)}
              className="min-h-11 w-full appearance-none rounded-lg border border-blue-700 bg-blue-800 py-2 pl-8 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
            >
              <option value="all">ทุกบริษัท (ภาพรวม)</option>
              {activeCompanyId !== 'all' && !companies.some(company => company.company_id === activeCompanyId) && (
                <option value={activeCompanyId}>{displayCompanyName}</option>
              )}
              {companies.map(company => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}
            </select>
            <Building2 size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-200" />
            <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-200" />
          </div>
        ) : <p className="truncate text-sm font-medium">{displayCompanyName}</p>}
        {user.displayName && <p className="mt-2 truncate text-xs text-blue-200">{user.displayName}{isAdmin ? ' · Admin' : ''}</p>}
      </div>
    );
    const navigation = (expanded: boolean) => (
      <nav aria-label="เมนูหลัก PPE" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ppeItems.map(item => (
          <Link key={item.href} href={item.href} aria-label={item.label} aria-current={isActive(item.href) ? 'page' : undefined}
            title={expanded ? undefined : item.label} onClick={() => setMobileOpen(false)}
            className={`flex min-h-11 items-center rounded-lg ${expanded ? 'gap-3 px-3' : 'justify-center px-2'} py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${isActive(item.href) ? 'bg-blue-700 text-white' : 'text-blue-100 hover:bg-blue-800'}`}>
            <span className="shrink-0">{item.icon}</span>{expanded && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
    );
    const footer = (expanded: boolean) => (
      <div className="shrink-0 space-y-1 border-t border-blue-800 p-3">
        {user && <button aria-label="ออกจากระบบ" title={expanded ? undefined : 'ออกจากระบบ'} onClick={handleLogout}
          className={`flex min-h-11 w-full items-center ${expanded ? 'gap-3 px-3' : 'justify-center px-2'} rounded-lg py-2 text-sm text-blue-200 hover:bg-blue-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}>
          <LogOut size={18} />{expanded && <span>ออกจากระบบ</span>}
        </button>}
        <Link href="/" aria-label="กลับหน้าหลัก" title={expanded ? undefined : 'กลับหน้าหลัก'} onClick={() => setMobileOpen(false)}
          className={`flex min-h-11 items-center ${expanded ? 'gap-3 px-3' : 'justify-center px-2'} rounded-lg py-2 text-sm text-blue-200 hover:bg-blue-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}>
          <ArrowLeft size={18} />{expanded && <span>กลับหน้าหลัก</span>}
        </Link>
      </div>
    );
    return (
      <>
        <header className="sticky top-0 z-30 flex min-h-16 w-full min-w-0 shrink-0 items-center gap-3 border-b border-blue-800 bg-blue-900 px-3 py-2 text-white md:hidden">
          <button ref={mobileTriggerRef} type="button" aria-label="เปิดเมนู" aria-expanded={mobileOpen} aria-controls="ppe-mobile-menu"
            onClick={() => setMobileOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <Menu size={23} />
          </button>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">PPE Inventory</p><p className="truncate text-xs text-blue-200">{displayCompanyName}</p></div>
          <div className="shrink-0 rounded-md bg-white p-1">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/ea-logo.svg" alt="EA SHE" width={32} height={24} /></div>
        </header>
        <aside aria-label="เมนู PPE" className={`sticky top-0 hidden h-dvh shrink-0 self-start flex-col overflow-hidden bg-blue-900 text-white md:flex ${isOpen ? 'w-64' : 'w-20'}`}>
          <div className={`flex min-h-16 shrink-0 items-center border-b border-blue-800 ${isOpen ? 'justify-between gap-2 px-4' : 'justify-center px-2'}`}>
            {isOpen && <div className="flex min-w-0 items-center gap-2"><div className="shrink-0 rounded-md bg-white p-1">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/ea-logo.svg" alt="EA SHE" width={32} height={24} /></div><span className="truncate text-sm font-bold">PPE Inventory</span></div>}
            <button type="button" aria-label={isOpen ? 'ย่อเมนู' : 'ขยายเมนู'} aria-expanded={isOpen} onClick={() => setIsOpen(value => !value)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          {companySelector(isOpen)}{navigation(isOpen)}{footer(isOpen)}
        </aside>
        {mobileOpen && <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-950/50" aria-hidden="true" onClick={() => setMobileOpen(false)} />
          <div id="ppe-mobile-menu" ref={mobileDrawerRef} role="dialog" aria-modal="true" aria-labelledby="ppe-mobile-menu-title"
            className="relative flex h-dvh w-[min(86vw,320px)] flex-col bg-blue-900 text-white shadow-xl">
            <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-blue-800 px-4">
              <h2 id="ppe-mobile-menu-title" className="text-base font-semibold">เมนู PPE</h2>
              <button type="button" aria-label="ปิดเมนู" onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X size={23} /></button>
            </div>
            {companySelector(true)}{navigation(true)}{footer(true)}
          </div>
        </div>}
      </>
    );
  }

  return (
    <aside
      className={`${
        mode === 'chemical' ? (isOpen ? 'w-full md:w-64' : 'w-full md:w-20') : (isOpen ? 'w-64' : 'w-20')
      } ${bgColor} text-white transition-colors duration-300 shrink-0 ${isPurple ? `sticky top-0 z-30 max-h-dvh md:h-dvh md:self-start ${mobileOpen ? 'h-dvh' : ''}` : 'min-h-screen'} flex flex-col`}
    >
      {/* Header */}
      <div className={`flex shrink-0 items-center justify-between p-4 border-b ${borderColor}`}>
        {isOpen ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-white rounded-md p-1 flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ea-logo.svg" alt="EA SHE" width={36} height={27} />
            </div>
            <h1 className="text-base font-bold truncate">{sectionTitle}</h1>
          </div>
        ) : (
          <div className="bg-white rounded-md p-1 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ea-logo.svg" alt="EA SHE" width={32} height={24} />
          </div>
        )}
        <button
          aria-label={isOpen ? 'ย่อเมนู' : 'ขยายเมนู'}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className={`${isPurple ? 'hidden md:block' : ''} p-2 ${hoverBg} rounded-lg transition-colors shrink-0`}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        {isPurple && <button className="md:hidden p-2 rounded-lg" aria-label={mobileOpen ? 'ปิดเมนู Chemical' : 'เปิดเมนู Chemical'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>}
      </div>
      <div className={isPurple ? (mobileOpen ? 'flex' : 'hidden') + ' md:flex flex-col flex-1 min-h-0 overflow-hidden' : 'contents'}>
      {/* Company Selector / Display */}
      {isOpen && user && (
        <div className={`shrink-0 p-4 border-b ${borderColor}`}>
          <label className={`text-xs ${mutedText} block mb-1`}>
            {isAdmin ? 'เลือกบริษัท (Admin)' : 'บริษัท'}
          </label>

          {isAdmin ? (
            <div className="relative">
              <select
                aria-label="เลือกบริษัท"
                value={activeCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className={`w-full ${selectBg} border text-white text-sm rounded-lg pl-8 pr-8 py-2 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/30`}
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
      {/* PPE/SHE: no inner scroll — logout/home follow directly after the menu items */}
      <nav className={isPurple ? 'flex-1 min-h-0 p-4 space-y-1 overflow-y-auto overscroll-contain' : 'p-4 space-y-1'}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            onClick={() => setMobileOpen(false)}
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
        <div className="shrink-0 px-4 pb-2">
          <button
            aria-label="ออกจากระบบ"
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-4 py-2 ${mutedText} hover:text-white ${hoverBg} rounded-lg transition-colors`}
          >
            <LogOut size={18} />
            {isOpen && <span className="text-sm">ออกจากระบบ</span>}
          </button>
        </div>
      )}

      {/* Back to Home */}
      <div className={`shrink-0 px-4 pb-4 border-t ${borderColor} pt-3`}>
        <Link
          href="/"
          aria-label="กลับหน้าหลัก"
          className={`flex items-center gap-3 px-4 py-2 ${mutedText} hover:text-white ${hoverBg} rounded-lg transition-colors`}
        >
          <ArrowLeft size={18} />
          {isOpen && <span className="text-sm">กลับหน้าหลัก</span>}
        </Link>
      </div>

      {/* Footer */}
      {isOpen && (
        <div className={`shrink-0 p-4 border-t ${borderColor} text-xs ${mutedText} ${isPurple ? '' : 'mt-auto'}`}>
          <p className="mb-1">EA SHE Tools</p>
          <p>tools.eashe.org</p>
        </div>
      )}
      </div>
    </aside>
  );
}

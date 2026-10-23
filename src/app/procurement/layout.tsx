'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, FileText, LogOut, Search, Upload } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import SHELoginPage from '@/components/SHELoginPage';
import { Loading, VIZ, usePeriodParam, withPeriod } from './_components/ui';

type NavItem = { href: string; label: string; icon: typeof Search };
const NAV: NavItem[] = [
  { href: '/procurement', label: 'ค้นหาราคา', icon: Search },
  { href: '/procurement/vendors', label: 'ผู้ขาย', icon: Building2 },
  { href: '/procurement/pr', label: 'รายการ PR', icon: FileText },
  { href: '/procurement/summary', label: 'สรุปรายคน', icon: BarChart3 },
];

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [loginDone, setLoginDone] = useState(false);

  if (!user && !loginDone) {
    return <SHELoginPage onLoginSuccess={() => setLoginDone(true)} title="PR & Supplier Price" subtitle="เข้าสู่ระบบด้วยบัญชีทีม SHE เพื่อค้นหาราคาและผู้ขาย" />;
  }
  if (!user) return <div className="min-h-screen bg-gray-50"><Loading /></div>;

  const nav = user.role === 'admin'
    ? [...NAV, { href: '/procurement/import', label: 'นำเข้าข้อมูล', icon: Upload }]
    : NAV;
  return (
    <div className="min-h-screen" style={{ background: '#F7F7F7', color: VIZ.text }}>
      <header className="bg-white border-b border-gray-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: VIZ.lightText }}><ArrowLeft size={16} />หน้าหลัก</Link>
          <h1 className="text-lg font-bold" style={{ color: VIZ.primary }}>PR & Supplier Price</h1>
          <Suspense fallback={<nav className="order-last w-full md:order-none md:w-auto" />}>
            <Nav items={nav} pathname={pathname} />
          </Suspense>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span style={{ color: VIZ.lightText }}>{user.nickname || user.displayName}</span>
            <button onClick={logout} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-gray-100" style={{ color: VIZ.lightText }}><LogOut size={15} />ออก</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
    </div>
  );
}

/** Menu links keep the selected period (?y=) so every page shows the same years. */
function Nav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const y = usePeriodParam();
  return (
    <nav aria-label="เมนู PR" className="order-last flex w-full flex-wrap gap-1 md:order-none md:w-auto">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/procurement' ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href === '/procurement/import' ? href : withPeriod(href, y)} aria-current={active ? 'page' : undefined}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
            style={active ? { background: VIZ.primary, color: 'white' } : { color: VIZ.text }}>
            <Icon size={16} aria-hidden />{label}
          </Link>
        );
      })}
    </nav>
  );
}

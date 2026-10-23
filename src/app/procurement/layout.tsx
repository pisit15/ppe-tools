'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowLeft, BarChart3, Building2, ChevronRight, FileText, LogOut, Search, Database } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import ProcurementLogin from './_components/ProcurementLogin';
import { Loading, usePeriodParam, withPeriod } from './_components/ui';
import styles from './procurement.module.css';

type NavItem = { href: string; label: string; icon: typeof Search };
const NAV: NavItem[] = [
  { href: '/procurement', label: 'ค้นหาราคา', icon: Search },
  { href: '/procurement/vendors', label: 'ผู้ขาย', icon: Building2 },
  { href: '/procurement/pr', label: 'รายการ PR', icon: FileText },
  { href: '/procurement/summary', label: 'สรุปรายคน', icon: BarChart3 },
];
const ADMIN: NavItem = { href: '/procurement/import', label: 'นำเข้าข้อมูล', icon: Database };

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return <ProcurementLogin />;
  const current = [...NAV, ADMIN].find(item => item.href === pathname)?.label || 'งานจัดซื้อ';
  return (
    <div className={styles.workspace}>
      <a href="#procurement-content" className={styles.skip}>ข้ามไปเนื้อหา</a>
      <header className={styles.topbar}>
        <Link href="/procurement" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ea-logo.svg" alt="EA" width={44} height={36} />
          <span><span className={styles.brandName}>งานจัดซื้อ SHE</span><span className={styles.brandSub}>PR & Supplier Price</span></span>
        </Link>
        <div className={styles.account}>
          <div className={styles.identity}>{user.nickname || user.displayName}<div className={styles.role}>{user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ทีม SHE'}</div></div>
          <button type="button" onClick={() => void logout()} className={styles.logout}><LogOut size={15} aria-hidden />ออกจากระบบ</button>
        </div>
      </header>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <p className={styles.navLabel}>พื้นที่ทำงาน</p>
          <Suspense fallback={<Loading text="กำลังโหลดเมนู…" />}><Nav pathname={pathname} admin={user.role === 'admin'} /></Suspense>
          <Link href="/" className={styles.back}><ArrowLeft size={15} aria-hidden />กลับ EA SHE Tools</Link>
        </aside>
        <main id="procurement-content" className={styles.main}>
          <div className={styles.context}><span>งานจัดซื้อ</span><ChevronRight size={13} aria-hidden /><span>{current}</span></div>
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

/** Menu links keep the selected period (?y=) so every page shows the same years. */
function Nav({ pathname, admin }: { pathname: string; admin: boolean }) {
  const y = usePeriodParam();
  function item({ href, label, icon: Icon }: NavItem) {
    const active = href === '/procurement' ? pathname === href : pathname.startsWith(href);
    return <Link key={href} href={href === ADMIN.href ? href : withPeriod(href, y)} aria-current={active ? 'page' : undefined} className={`${styles.navLink} ${active ? styles.active : ''}`}><Icon size={18} aria-hidden />{label}</Link>;
  }
  return <nav aria-label="เมนู PR"><div className={styles.navigation}>{NAV.map(item)}</div>{admin && <div className={styles.adminNav}><p className={styles.navLabel}>ดูแลข้อมูล</p>{item(ADMIN)}</div>}</nav>;
}

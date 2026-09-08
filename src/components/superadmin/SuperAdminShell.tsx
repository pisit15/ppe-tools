'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  ServerCog,
  Settings,
  ShieldCheck,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { VIZ, saFetch } from './ui';

export type ConsoleUser = {
  username: string;
  displayName: string;
  role: string;
  lastLoginAt: string | null;
};

type ShellContext = {
  base: string;
  user: ConsoleUser | null;
  href: (path: string) => string;
};

const Ctx = createContext<ShellContext | null>(null);

export function useSuperAdmin() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSuperAdmin must be used inside SuperAdminShell');
  return ctx;
}

type NavItem = { path: string; label: string; icon: typeof Users; exact?: boolean };

type Section = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Users;
  nav: NavItem[];
};

// One entry per project on the launcher. `matches` decides which sidebar a
// given URL gets; the launcher itself matches none and renders sidebar-free.
const SECTIONS: (Section & { matches: (path: string) => boolean })[] = [
  {
    id: 'team',
    title: 'Team Management',
    subtitle: 'บุคลากรและใบอนุญาต',
    icon: Users2,
    matches: (path) => path.includes('/team'),
    nav: [
      { path: '/team', label: 'ภาพรวมทีม', icon: LayoutDashboard, exact: true },
      { path: '/team/manage', label: 'บุคลากร SHE / ISO', icon: Users2 },
      { path: '/team/org-chart', label: 'ORG chart', icon: Users2 },
      { path: '/team/license-matrix', label: 'License Matrix', icon: BadgeCheck },
      { path: '/team/performance', label: 'ผลงานและ IDP', icon: Activity },
      { path: '/team/personnel', label: 'บุคลากร SHE', icon: Users2 },
      { path: '/team/licenses', label: 'ใบอนุญาต / ใบรับรอง', icon: BadgeCheck },
    ],
  },
  {
    id: 'system',
    title: 'System Console',
    subtitle: 'ผู้ใช้ บริษัท และการตั้งค่า',
    icon: ServerCog,
    matches: () => true, // fallback for every non-team console page
    nav: [
      { path: '/system', label: 'ภาพรวมระบบ', icon: LayoutDashboard, exact: true },
      { path: '/users', label: 'ผู้ใช้ทุกระบบ', icon: Users },
      { path: '/companies', label: 'บริษัท', icon: Building2 },
      { path: '/admins', label: 'ผู้ดูแลระบบ', icon: ShieldCheck },
      { path: '/activity', label: 'ประวัติการใช้งาน', icon: Activity },
      { path: '/settings', label: 'ตั้งค่าส่วนกลาง', icon: Settings },
    ],
  },
];

export function SuperAdminShell({ base, children }: { base: string; children: ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const href = useCallback(
    (path: string) => (path === '/' ? base || '/' : `${base}${path}`),
    [base]
  );

  // Both spellings of every URL end the same way, whether the middleware
  // rewrote /login to /superadmin/login or the page was opened directly.
  const isLoginRoute = pathname.endsWith('/login');
  const isLauncher = pathname === href('/') || pathname === '/superadmin' || pathname === '/';

  const [user, setUser] = useState<ConsoleUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isLoginRoute) return;
    let cancelled = false;
    saFetch<{ user: ConsoleUser }>('/api/superadmin/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        /* saFetch already redirects on 401 */
      });
    return () => {
      cancelled = true;
    };
  }, [isLoginRoute]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/superadmin/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      router.replace(href('/login'));
      router.refresh();
    }
  }, [href, router]);

  if (isLoginRoute) {
    return <Ctx.Provider value={{ base, user: null, href }}>{children}</Ctx.Provider>;
  }

  const userBlock = (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-medium text-white">{user?.displayName || '...'}</p>
      <p className="text-[11px] text-slate-400">Super Admin</p>
      <button
        onClick={logout}
        className="mt-3 flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/20 hover:text-white"
      >
        <LogOut size={15} />
        ออกจากระบบ
      </button>
    </div>
  );

  // --- Launcher: no project sidebar, just a slim top bar ---------------
  if (isLauncher) {
    return (
      <Ctx.Provider value={{ base, user, href }}>
        <div className="min-h-screen" style={{ backgroundColor: '#F6F7F9' }}>
          <header
            className="px-5 py-4 lg:px-8"
            style={{ background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)' }}
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">EA SHE Admin</p>
                <p className="text-[11px] text-slate-400">admin.eashe.org</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-white">{user?.displayName || ''}</p>
                <button
                  onClick={logout}
                  className="text-xs text-slate-300 transition-colors hover:text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
            </div>
          </header>
          <main className="p-5 lg:p-8">{children}</main>
        </div>
      </Ctx.Provider>
    );
  }

  // --- Inside a project: sidebar for that project only ------------------
  const stripped = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const section = SECTIONS.find((s) => s.matches(stripped)) as Section;
  const SectionIcon = section.icon;

  const isActive = (item: NavItem) => {
    const target = href(item.path);
    if (item.exact) return pathname === target || pathname === `${target}/`;
    return pathname.startsWith(target);
  };

  return (
    <Ctx.Provider value={{ base, user, href }}>
      <div className="flex min-h-screen" style={{ backgroundColor: '#F6F7F9' }}>
        <aside
          className={`fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col transition-transform lg:static lg:translate-x-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' }}
        >
          <div className="px-4 pt-5">
            <div className="flex items-center">
              <Link
                href={href('/')}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-white"
              >
                <ArrowLeft size={13} />
                ทุกโปรเจกต์
              </Link>
              <button
                className="ml-auto text-slate-400 lg:hidden"
                onClick={() => setMenuOpen(false)}
                aria-label="ปิดเมนู"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 pb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <SectionIcon size={19} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{section.title}</p>
                <p className="truncate text-[11px] text-slate-400">{section.subtitle}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3">
            {section.nav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.path}
                  href={href(item.path)}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {userBlock}
        </aside>

        {menuOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3 lg:hidden">
            <button onClick={() => setMenuOpen(true)} aria-label="เปิดเมนู">
              <Menu size={20} style={{ color: VIZ.text }} />
            </button>
            <span className="text-sm font-semibold" style={{ color: VIZ.text }}>
              {section.title}
            </span>
          </header>
          <main className="min-w-0 flex-1 p-5 lg:p-8">{children}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

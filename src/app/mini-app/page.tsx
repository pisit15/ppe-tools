'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { AlertTriangle, ChevronRight, ExternalLink, HardHat, Info, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#EEEEEE',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
};

type MenuItem = {
  id: 'incident' | 'ppe';
  title: string;
  subtitle: string;
  description: string;
  href: string;
  external: boolean;
  host: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string;
};

const MENU: MenuItem[] = [
  {
    id: 'incident',
    title: 'Incident',
    subtitle: 'รายงานและติดตามอุบัติการณ์',
    description: 'แจ้งเหตุ ดูรายการ และติดตามการแก้ไข',
    href: 'https://eashe.org/projects/incidents',
    external: true,
    host: 'eashe.org',
    Icon: AlertTriangle,
    iconBg: 'from-orange-500 to-red-600',
  },
  {
    id: 'ppe',
    title: 'PPE',
    subtitle: 'อุปกรณ์ป้องกันส่วนบุคคล',
    description: 'รับเข้า เบิกออก และดูสต็อก PPE',
    href: '/ppe',
    external: false,
    host: 'tools.eashe.org',
    Icon: HardHat,
    iconBg: 'from-blue-600 to-blue-800',
  },
];

function MenuCard({ item }: { item: MenuItem }) {
  const { Icon } = item;
  const body = (
    <div className="flex items-center gap-4 bg-white rounded-2xl shadow-lg p-4 active:scale-[0.98] transition-transform">
      <div
        className={`w-14 h-14 shrink-0 bg-gradient-to-br ${item.iconBg} rounded-xl flex items-center justify-center`}
      >
        <Icon size={28} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold" style={{ color: VIZ.text }}>
          {item.title}
        </h3>
        <p className="text-sm font-medium" style={{ color: VIZ.primary }}>
          {item.subtitle}
        </p>
        <p className="text-xs mt-0.5" style={{ color: VIZ.lightText }}>
          {item.description}
        </p>
        <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: VIZ.neutral }}>
          {item.external && <ExternalLink size={11} />}
          {item.host}
        </p>
      </div>
      <ChevronRight size={22} className="shrink-0 text-gray-400" />
    </div>
  );

  // Incident lives on another site; a plain anchor keeps the navigation in the
  // same in-app browser window rather than spawning a new tab inside LINE.
  if (item.external) {
    return (
      <a href={item.href} aria-label={`เปิด ${item.title}`} className="block">
        {body}
      </a>
    );
  }
  return (
    <Link href={item.href} aria-label={`เปิด ${item.title}`} className="block">
      {body}
    </Link>
  );
}

export default function MiniAppHomePage() {
  const { user } = useAuth();

  return (
    <div
      className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <main className="w-full max-w-md mx-auto px-4 flex-1 flex flex-col">
        {/* Header */}
        <header className="pt-8 pb-6 text-center">
          <div className="inline-flex bg-white rounded-2xl px-5 py-3 shadow-lg mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ea-logo.svg" alt="EA SHE" width={92} height={70} />
          </div>
          <h1 className="text-2xl font-bold text-white">EA SHE Mini App</h1>
          <p className="text-blue-200 text-sm mt-1">เลือกระบบที่ต้องการใช้งาน</p>
        </header>

        {/* Signed-in state from tools.eashe.org only; no LINE-to-employee link is assumed */}
        {user && (
          <div className="mb-4 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
            <User size={16} className="text-blue-300 shrink-0" />
            <p className="text-blue-100 text-xs truncate">
              เข้าสู่ระบบ PPE แล้ว:{' '}
              <span className="text-white font-medium">{user.nickname || user.displayName}</span>
              {user.companyName ? ` (${user.companyName})` : ''}
            </p>
          </div>
        )}

        {/* Menu */}
        <nav aria-label="เมนูหลัก" className="flex flex-col gap-3">
          {MENU.map((item) => (
            <MenuCard key={item.id} item={item} />
          ))}
        </nav>

        {/* Login note */}
        <div className="mt-5 flex gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
          <Info size={16} className="text-blue-300 shrink-0 mt-0.5" />
          <p className="text-blue-200 text-xs leading-relaxed">
            แต่ละระบบใช้การเข้าสู่ระบบของตัวเอง หากยังไม่ได้เข้าสู่ระบบ
            ระบบจะแสดงหน้าเข้าสู่ระบบเมื่อเปิดเมนู
          </p>
        </div>

        <div className="flex-1" />

        <footer className="py-6 text-center text-blue-400 text-[11px]">EA SHE · tools.eashe.org</footer>
      </main>
    </div>
  );
}

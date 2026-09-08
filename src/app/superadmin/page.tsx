'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight, Lock, ServerCog, Users2 } from 'lucide-react';
import { useSuperAdmin } from '@/components/superadmin/SuperAdminShell';
import { VIZ } from '@/components/superadmin/ui';

type Project = {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  ready: boolean;
};

const PROJECTS: Project[] = [
  {
    id: 'team',
    name: 'Team Management',
    description:
      'บุคลากร SHE ทั้งกลุ่ม ใบอนุญาตตามกฎหมาย และใบรับรองพนักงาน พร้อมการแจ้งเตือนวันหมดอายุ',
    href: '/team',
    icon: Users2,
    accent: VIZ.primary,
    ready: true,
  },
  {
    id: 'system',
    name: 'System Console',
    description:
      'ผู้ใช้ทุกระบบ บริษัท ผู้ดูแล ประวัติการใช้งาน และสวิตช์ตั้งค่าส่วนกลางของทุกแอปบนฐานข้อมูลนี้',
    href: '/system',
    icon: ServerCog,
    accent: VIZ.secondary,
    ready: true,
  },
];

export default function SuperAdminHomePage() {
  const { user, href } = useSuperAdmin();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: VIZ.text }}>
          สวัสดี{user?.displayName ? ` ${user.displayName}` : ''}
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: VIZ.lightText }}>
          เลือกโปรเจกต์ที่ต้องการใช้งาน
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {PROJECTS.map((project) => {
          const Icon = project.icon;

          if (!project.ready) {
            return (
              <div
                key={project.id}
                className="cursor-not-allowed overflow-hidden rounded-2xl bg-white opacity-60 shadow-sm"
              >
                <div className="h-1.5" style={{ backgroundColor: VIZ.neutral }} />
                <div className="p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
                      <Icon size={22} className="text-gray-400" />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-400">{project.name}</h2>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Lock size={11} /> เร็ว ๆ นี้
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">{project.description}</p>
                </div>
              </div>
            );
          }

          return (
            <Link key={project.id} href={href(project.href)} className="group">
              <div className="h-full overflow-hidden rounded-2xl bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div
                  className="h-1.5 transition-all group-hover:h-2.5"
                  style={{ backgroundColor: project.accent }}
                />
                <div className="p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${project.accent}1A`, color: project.accent }}
                    >
                      <Icon size={22} />
                    </div>
                    <div className="flex-1">
                      <h2 className="font-bold" style={{ color: VIZ.text }}>
                        {project.name}
                      </h2>
                      <span className="text-xs font-medium" style={{ color: VIZ.positive }}>
                        พร้อมใช้งาน
                      </span>
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-gray-300 transition-colors group-hover:text-gray-600"
                    />
                  </div>
                  <p className="text-sm" style={{ color: VIZ.lightText }}>
                    {project.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-10 text-center text-xs" style={{ color: VIZ.lightText }}>
        admin.eashe.org · เข้าถึงได้เฉพาะบัญชี Super Admin
      </p>
    </div>
  );
}

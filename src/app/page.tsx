'use client';

import { Shield, FlaskConical, ClipboardCheck, Search, Lock, ArrowRight, User, Briefcase } from 'lucide-react';
import { PROJECTS, Project } from '@/lib/companies';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  shield: Shield,
  flask: FlaskConical,
  clipboard: ClipboardCheck,
  search: Search,
  briefcase: Briefcase,
};

function ProjectCard({ project }: { project: Project }) {
  const Icon = ICON_MAP[project.icon] || Shield;

  if (!project.ready) {
    return (
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden opacity-60 cursor-not-allowed">
        <div className={`h-2 bg-gradient-to-r ${project.color}`} />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <Icon size={24} className="text-gray-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-400">{project.name}</h3>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Lock size={12} /> Coming Soon
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-400">{project.description}</p>
        </div>
      </div>
    );
  }

  return (
    <Link href={project.href}>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer group">
        <div className={`h-2 bg-gradient-to-r ${project.color} group-hover:h-3 transition-all`} />
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 bg-gradient-to-br ${project.color} rounded-xl flex items-center justify-center`}>
              <Icon size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">{project.name}</h3>
              <span className="text-xs text-green-600 font-medium">พร้อมใช้งาน</span>
            </div>
            <ArrowRight size={20} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
          </div>
          <p className="text-sm text-gray-600">{project.description}</p>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Nav */}
      <nav className="p-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-2 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ea-logo.svg" alt="EA SHE" width={52} height={40} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">EA SHE Tools</h1>
              <p className="text-blue-300 text-xs">tools.eashe.org</p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-white font-medium">{user.displayName}</p>
                <p className="text-xs text-blue-300">{user.companyName}</p>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-4">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <div className="bg-white rounded-2xl px-6 py-4 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ea-logo.svg" alt="EA SHE" width={132} height={100} />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Safety & Environment Tools
          </h2>
          <p className="text-blue-200 text-lg">
            เลือกเครื่องมือที่ต้องการใช้งาน
          </p>
          {user && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
              <User size={16} className="text-blue-300" />
              <span className="text-blue-200 text-sm">
                เข้าสู่ระบบแล้ว: <span className="text-white font-medium">{user.nickname || user.displayName}</span> ({user.companyName})
              </span>
            </div>
          )}
        </div>

        {/* Project Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
          {PROJECTS.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 text-center text-blue-400 text-xs">
        EA SHE Tools Platform v1.0 | Powered by Next.js & Supabase
      </footer>
    </div>
  );
}

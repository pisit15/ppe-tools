'use client';

import { Shield, FlaskConical, ClipboardCheck, Search, Lock, ArrowRight, Briefcase } from 'lucide-react';
import Link from 'next/link';
import type { Project } from '@/lib/companies';
import { useHomeCards } from './useHomeCards';

const icons = { shield: Shield, flask: FlaskConical, clipboard: ClipboardCheck, search: Search, briefcase: Briefcase };

function ProjectCard({ project }: { project: Project }) {
  const Icon = icons[project.icon as keyof typeof icons] || Shield;
  const content = <>
    <div className={`h-2 bg-gradient-to-r ${project.color}`} />
    <div className="p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-12 h-12 shrink-0 bg-gradient-to-br ${project.color} rounded-xl flex items-center justify-center`}><Icon size={24} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 break-words">{project.name}</h3>
          {project.ready ? <span className="text-xs text-green-700 font-medium">พร้อมใช้งาน</span> : <span className="text-xs text-gray-600 flex items-center gap-1"><Lock size={12} /> Coming Soon</span>}
        </div>
        {project.ready && <ArrowRight size={20} className="shrink-0 text-gray-400 group-hover:text-blue-600" />}
      </div>
      <p className="text-sm text-gray-600 whitespace-pre-line break-words">{project.description}</p>
    </div>
  </>;
  return project.ready
    ? <Link href={project.href} className="group block h-full bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{content}</Link>
    : <div className="h-full bg-white/80 rounded-2xl shadow-lg overflow-hidden">{content}</div>;
}

export function HomeCardGrid() {
  const { cards, error, reload } = useHomeCards();
  if (error) return <div role="alert" className="rounded-xl bg-white p-6 text-center text-red-800"><p>{error}</p><button onClick={reload} className="mt-3 rounded-lg border px-4 py-2 text-blue-800">ลองใหม่</button></div>;
  if (!cards) return <p role="status" className="py-12 text-center text-blue-100">กำลังโหลดเครื่องมือ…</p>;
  if (!cards.length) return <p className="py-12 text-center text-blue-100">ยังไม่มีเครื่องมือที่แสดงบนหน้าแรก</p>;
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">{cards.map(card => <ProjectCard key={card.id} project={card} />)}</div>;
}

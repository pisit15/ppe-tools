'use client';

import { useParams, useRouter } from 'next/navigation';
import { Shield, FlaskConical, ClipboardCheck, Search, Lock, LogOut, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { PROJECTS } from '@/lib/companies';
import { useEffect } from 'react';

const ICON_MAP: Record<string, React.ReactNode> = {
  shield: <Shield size={32} />,
  flask: <FlaskConical size={32} />,
  clipboard: <ClipboardCheck size={32} />,
  search: <Search size={32} />,
};

export default function CompanyHubPage() {
  const params = useParams();
  const router = useRouter();
  const auth = useAuth();
  const companyId = params.companyId as string;

  // Auth gate — small delay to allow state propagation from login redirect
  useEffect(() => {
    if (!auth.isLoggedIn(companyId)) {
      const timer = setTimeout(() => {
        if (!auth.isLoggedIn(companyId)) {
          router.replace('/');
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [auth, companyId, router]);

  if (!auth.isLoggedIn(companyId)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const companyName = auth.getCompanyName(companyId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Top Bar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
              <Shield className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">EA SHE Tools</h1>
              <p className="text-xs text-gray-500">{companyName}</p>
            </div>
          </div>
          <button
            onClick={() => {
              auth.logout(companyId);
              router.push('/');
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            ออกจากระบบ
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-6">
        <h2 className="text-3xl font-bold text-gray-900">เลือกเครื่องมือ</h2>
        <p className="text-gray-600 mt-2">
          เลือกโปรเจคที่ต้องการใช้งานสำหรับ <span className="font-semibold">{companyName}</span>
        </p>
      </div>

      {/* Project Cards Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {PROJECTS.map((project) => {
            const isReady = project.ready;
            return (
              <div
                key={project.id}
                onClick={() => {
                  if (isReady) router.push(project.href(companyId));
                }}
                className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm border transition-all duration-300 ${
                  isReady
                    ? 'border-gray-200 hover:shadow-xl hover:border-blue-300 hover:-translate-y-1 cursor-pointer'
                    : 'border-gray-100 opacity-60 cursor-not-allowed'
                }`}
              >
                {/* Color Banner */}
                <div
                  className={`h-2 bg-gradient-to-r ${project.color}`}
                />

                {/* Content */}
                <div className="p-6">
                  {/* Icon */}
                  <div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${project.color} flex items-center justify-center text-white mb-4 ${
                      isReady ? 'group-hover:scale-110 transition-transform' : ''
                    }`}
                  >
                    {ICON_MAP[project.icon] || <Shield size={32} />}
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {project.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    {project.description}
                  </p>

                  {/* Status / Action */}
                  {isReady ? (
                    <div className="flex items-center gap-1 text-blue-600 font-medium text-sm group-hover:gap-2 transition-all">
                      เข้าใช้งาน
                      <ArrowRight size={16} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-gray-400 text-sm">
                      <Lock size={14} />
                      เร็วๆ นี้
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-400">
          <span>EA SHE Tools Platform v1.0</span>
          <span>tools.eashe.org</span>
        </div>
      </footer>
    </div>
  );
}

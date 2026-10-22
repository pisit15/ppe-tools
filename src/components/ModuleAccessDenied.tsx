'use client';

import { useRouter } from 'next/navigation';
import { ShieldOff, ArrowLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

const VIZ = {
  accent: '#E15759',
  text: '#333333',
  lightText: '#666666',
};

export default function ModuleAccessDenied({ moduleName }: { moduleName: string }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: `${VIZ.accent}15` }}
        >
          <ShieldOff size={30} style={{ color: VIZ.accent }} />
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ color: VIZ.text }}>
          ไม่มีสิทธิ์เข้าใช้งาน {moduleName}
        </h1>
        <p className="text-sm mb-6" style={{ color: VIZ.lightText }}>
          บัญชี &quot;{user?.displayName || user?.username}&quot; ไม่ได้รับสิทธิ์ให้ใช้ระบบนี้
          <br />
          หากต้องการใช้งาน กรุณาติดต่อผู้ดูแลระบบ
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft size={16} /> กลับหน้าหลัก
          </button>
          <button
            onClick={() => {
              logout();
              router.push('/');
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white hover:opacity-90"
            style={{ backgroundColor: VIZ.accent }}
          >
            <LogOut size={16} /> ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}

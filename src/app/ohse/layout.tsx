'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, FolderOpen, LogOut } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import SHELoginPage from '@/components/SHELoginPage';
import { CompanyContext, PAGE_BG, VIZ, getJson, type CompanyOption } from '@/app/inspect/_components/ui';

const STORAGE_KEY = 'ohse.company';

export default function OhseLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [loginDone, setLoginDone] = useState(false);
  const isAdmin = user?.role === 'admin';
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [company, setCompanyState] = useState(() => (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) || 'amt');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) { Promise.resolve().then(() => { setCompanyState(user.companyId); setCompanies([{ company_id: user.companyId, company_name: user.companyName }]); }); return; }
    getJson<CompanyOption[] | { data: CompanyOption[] }>('/api/companies').then(r => setCompanies(Array.isArray(r) ? r : r.data || [])).catch(() => setCompanies([]));
  }, [user, isAdmin]);

  const setCompany = useCallback((id: string) => { setCompanyState(id); if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id); }, []);
  const companyName = useMemo(() => companies.find(c => c.company_id === company)?.company_name || company.toUpperCase(), [companies, company]);
  const ctx = useMemo(() => ({ company, companyName, companies, setCompany, isAdmin }), [company, companyName, companies, setCompany, isAdmin]);

  if (!user && !loginDone) return <SHELoginPage onLoginSuccess={() => setLoginDone(true)} title="SHE Data Center" subtitle="เข้าสู่ระบบเพื่อจัดการเอกสาร SHE" />;
  if (!user) return <div className="min-h-screen flex items-center justify-center"><span className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#4E79A7] animate-spin" /></div>;

  return (
    <CompanyContext.Provider value={ctx}>
      <div className="min-h-screen" style={{ background: PAGE_BG, color: VIZ.text }}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <Link href="/ohse" className="flex items-center gap-3 shrink-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: VIZ.primary }}><FolderOpen size={18} /></span>
              <span><span className="block font-semibold leading-tight" style={{ color: VIZ.primary }}>SHE Data Center</span><span className="block text-xs text-gray-500">ศูนย์รวมเอกสาร ความปลอดภัย อาชีวอนามัย สิ่งแวดล้อม</span></span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 text-sm">
              {isAdmin ? (
                <div className="relative">
                  <button type="button" onClick={() => setMenuOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <span className="max-w-[140px] truncate">{companyName}</span><ChevronDown size={14} />
                  </button>
                  {menuOpen && (
                    <>
                      <button type="button" aria-label="ปิด" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                      <ul className="absolute right-0 mt-1 z-20 w-64 max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg py-1">
                        {companies.map(c => <li key={c.company_id}><button type="button" onClick={() => { setCompany(c.company_id); setMenuOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${c.company_id === company ? 'font-semibold text-[#4E79A7]' : 'text-gray-700'}`}>{c.company_name}<span className="ml-2 text-xs text-gray-400">{c.company_id.toUpperCase()}</span></button></li>)}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <><CompanySwitcher /><span className="hidden md:block text-right"><span className="block font-medium">{user.nickname || user.displayName}</span><span className="block text-xs text-gray-500">ทีม SHE · {user.companyName}</span></span></>
              )}
              <Link href="/" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100"><ArrowLeft size={15} /><span className="hidden sm:inline">หน้าหลัก</span></Link>
              <button type="button" onClick={logout} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100" aria-label="ออกจากระบบ"><LogOut size={15} /></button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </CompanyContext.Provider>
  );
}

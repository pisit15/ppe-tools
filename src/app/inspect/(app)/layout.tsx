'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown, ClipboardList, Eye, EyeOff, LayoutDashboard, ListChecks, ListPlus, LogOut, QrCode, Settings2 } from 'lucide-react';
import { useAuth, type LoginCompanyOption } from '@/components/AuthProvider';
import { CompanyContext, PAGE_BG, VIZ, btnPrimary, cardClass, getJson, inputClass, labelClass, type CompanyOption } from '../_components/ui';

const NAV = [
  { href: '/inspect', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/inspect/assets', label: 'ทะเบียนอุปกรณ์', icon: QrCode },
  { href: '/inspect/batch', label: 'บันทึกผลหลายรายการ', icon: ListPlus },
  { href: '/inspect/inspections', label: 'ประวัติการตรวจ', icon: ListChecks },
  { href: '/inspect/settings', label: 'ตั้งค่า', icon: Settings2 },
];
const STORAGE_KEY = 'insp.company';

export default function InspectLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user?.role === 'admin';
  // After logging in from a QR page (?next=/inspect/i/<token>) go back to that form.
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && /^\/inspect\/i\/[A-Za-z0-9_-]+$/.test(next)) router.replace(next);
  }, [user, router]);
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

  if (!user) return <InspectLogin />;
  const isLabels = pathname.startsWith('/inspect/labels');
  return (
    <CompanyContext.Provider value={ctx}>
      <div className="min-h-screen" style={{ background: PAGE_BG, color: VIZ.text }}>
        <header className={`bg-white border-b border-gray-200 sticky top-0 z-30 ${isLabels ? 'no-print' : ''}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <Link href="/inspect" className="flex items-center gap-3 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ea-logo.svg" alt="EA" width={40} height={32} />
              <span className="hidden sm:block"><span className="block font-semibold leading-tight" style={{ color: VIZ.primary }}>Equipment Inspection</span><span className="block text-xs text-gray-500">ตรวจอุปกรณ์ความปลอดภัยประจำรอบ</span></span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = href === '/inspect' ? pathname === href : pathname.startsWith(href);
                return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-[#4E79A7]/10 text-[#4E79A7]' : 'text-gray-600 hover:bg-gray-100'}`}><Icon size={16} />{label}</Link>;
              })}
            </nav>
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
                <span className="hidden md:block text-right"><span className="block font-medium">{user.nickname || user.displayName}</span><span className="block text-xs text-gray-500">ทีม SHE · {user.companyName}</span></span>
              )}
              <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs bg-white hover:bg-gray-50"><LogOut size={14} /><span className="hidden sm:inline">ออกจากระบบ</span></button>
            </div>
          </div>
          <nav className="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/inspect' ? pathname === href : pathname.startsWith(href);
              return <Link key={href} href={href} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${active ? 'bg-[#4E79A7]/10 text-[#4E79A7] font-medium' : 'text-gray-600'}`}><Icon size={14} />{label}</Link>;
            })}
          </nav>
        </header>
        <main className={isLabels ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}>{children}</main>
        {!isLabels && <footer className="max-w-7xl mx-auto px-6 pb-8 text-xs text-gray-400"><Link href="/" className="inline-flex items-center gap-1 hover:text-gray-600"><ArrowLeft size={12} />กลับ EA SHE Tools</Link></footer>}
      </div>
    </CompanyContext.Provider>
  );
}

function InspectLogin() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<LoginCompanyOption[] | null>(null);

  async function signIn(companyId?: string) {
    if (isLoading) return;
    setError('');
    const result = await login(username, password, companyId);
    if (result.success) { setPassword(''); return; }
    if (result.needCompanySelection && result.companies) setCompanies(result.companies);
    else setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  function submit(e: FormEvent) { e.preventDefault(); if (!username.trim() || !password) { setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; } void signIn(); }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: PAGE_BG }}>
      <div className={`${cardClass} w-full max-w-md`}>
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${VIZ.primary}1A`, color: VIZ.primary }}><ClipboardList size={24} /></span>
          <div><h1 className="text-xl font-semibold" style={{ color: VIZ.primary }}>Equipment Inspection — ทีม SHE</h1><p className="text-sm text-gray-500">เข้าสู่ระบบด้วยบัญชี SHE เดียวกับ eashe.org</p></div>
        </div>
        {companies ? (
          <div>
            <p className="text-sm text-gray-600 mb-3">เลือกบริษัทที่ต้องการเข้าใช้งาน</p>
            {companies.map(c => <button key={c.companyId} type="button" disabled={isLoading} onClick={() => void signIn(c.companyId)} className="w-full text-left rounded-lg border border-gray-200 px-4 py-3 mb-2 hover:bg-gray-50">{c.companyName}</button>)}
            {error && <p role="alert" className="text-sm mt-2" style={{ color: VIZ.accent }}>{error}</p>}
            <button type="button" className="mt-3 text-sm text-gray-500" onClick={() => { setCompanies(null); setError(''); }}>กลับไปแก้ไขบัญชี</button>
          </div>
        ) : (
          <form onSubmit={submit} aria-busy={isLoading} className="space-y-4">
            <div><label className={labelClass} htmlFor="iu">ชื่อผู้ใช้</label><input id="iu" className={inputClass} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required /></div>
            <div><label className={labelClass} htmlFor="ip">รหัสผ่าน</label>
              <div className="relative"><input id="ip" type={visible ? 'text' : 'password'} className={`${inputClass} pr-20`} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setVisible(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs text-gray-500">{visible ? <EyeOff size={14} /> : <Eye size={14} />}{visible ? 'ซ่อน' : 'แสดง'}</button></div></div>
            {error && <p role="alert" className="text-sm rounded-lg px-3 py-2" style={{ background: `${VIZ.accent}1A`, color: VIZ.accent }}>{error}</p>}
            <button type="submit" disabled={isLoading} className={`${btnPrimary} w-full`} style={{ background: VIZ.primary }}>{isLoading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          </form>
        )}
        <p className="mt-6 text-xs text-gray-400">ผู้ตรวจหน้างานสแกน QR ที่ตัวอุปกรณ์ได้โดยไม่ต้องเข้าสู่ระบบ (ตามโหมดที่บริษัทตั้งไว้)</p>
      </div>
    </div>
  );
}

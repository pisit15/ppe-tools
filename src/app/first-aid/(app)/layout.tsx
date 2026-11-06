'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ClipboardCheck, Image as ImageIcon, List, LogOut, PlusCircle, Settings2 } from 'lucide-react';
import { useAuth, type LoginCompanyOption } from '@/components/AuthProvider';
import ModuleAccessDenied from '@/components/ModuleAccessDenied';
import type { FaState } from '@/lib/first-aid/types';
import { FA_GREEN, FaContext, PAGE_BG, VIZ, btnPrimary, errMsg, getJson, inputClass, labelClass } from '../_components/fa';

const NAV = [
  { href: '/first-aid', label: 'รายการยา', icon: List },
  { href: '/first-aid/dispense', label: 'จ่ายวันนี้', icon: PlusCircle },
  { href: '/first-aid/count', label: 'รับเข้า / ตรวจนับ', icon: ClipboardCheck },
  { href: '/first-aid/report', label: 'รายงาน', icon: BarChart3 },
  { href: '/first-aid/images', label: 'รูปยา', icon: ImageIcon },
  { href: '/first-aid/settings', label: 'ตั้งค่า', icon: Settings2 },
];
const COMPANY_KEY = 'fa.company'; const SCOPE_KEY = 'fa.scope';
type CompanyOption = { company_id: string; company_name: string };

export default function FirstAidLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.role === 'admin';
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [company, setCompanyState] = useState(() => (typeof window !== 'undefined' && window.localStorage.getItem(COMPANY_KEY)) || '');
  const [scope, setScopeState] = useState(() => (typeof window !== 'undefined' && window.localStorage.getItem(SCOPE_KEY)) || 'all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [state, setState] = useState<FaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) { Promise.resolve().then(() => { setCompanyState(user.companyId); setCompanies([{ company_id: user.companyId, company_name: user.companyName }]); }); return; }
    getJson<CompanyOption[] | { data: CompanyOption[] }>('/api/companies').then(r => {
      const rows = (Array.isArray(r) ? r : r.data || []).filter(c => c.company_id && !['all', 'admin', 'default'].includes(c.company_id));
      setCompanies(rows);
      const requested = new URLSearchParams(window.location.search).get('company_id');
      setCompanyState(prev => rows.find(c => c.company_id === (requested || prev))?.company_id || prev || rows[0]?.company_id || '');
    }).catch(() => setCompanies([]));
  }, [user, isAdmin]);

  const setCompany = useCallback((id: string) => { setCompanyState(id); setScopeState('all'); window.localStorage.setItem(COMPANY_KEY, id); window.localStorage.setItem(SCOPE_KEY, 'all'); }, []);
  const setScope = useCallback((id: string) => { setScopeState(id); window.localStorage.setItem(SCOPE_KEY, id); }, []);
  const refresh = useCallback(async () => {
    if (!company) return;
    try { setError(''); const next = await getJson<FaState>(`/api/first-aid/state?company_id=${encodeURIComponent(company)}`); setState(next); }
    catch (e) { setError(errMsg(e, 'โหลดข้อมูลไม่สำเร็จ')); }
    finally { setLoading(false); }
  }, [company]);
  useEffect(() => { if (user && company) { setLoading(true); setState(null); void refresh(); } }, [user, company, refresh]);
  // Scope must point at a visible location of this company
  useEffect(() => { if (state && scope !== 'all' && !state.locations.some(l => l.id === scope && !l.isRegister)) setScope('all'); }, [state, scope, setScope]);

  const companyName = useMemo(() => companies.find(c => c.company_id === company)?.company_name || company.toUpperCase(), [companies, company]);
  const ctx = useMemo(() => ({ state, loading, error, refresh, company, setCompany, companies, isAdmin, scope, setScope }), [state, loading, error, refresh, company, setCompany, companies, isAdmin, scope, setScope]);

  if (!user) return <FirstAidLogin />;
  if (user.role !== 'admin' && (user.ppeRole === 'requester' || (user.allowedModules?.length && !user.allowedModules.includes('first-aid')))) return <ModuleAccessDenied moduleName="First Aid & Medicine Control" />;
  const visibleLocations = state?.locations.filter(l => !l.isRegister) || [];
  const isPrint = pathname.startsWith('/first-aid/settings/poster');

  return (
    <FaContext.Provider value={ctx}>
      <div className="min-h-screen" style={{ background: PAGE_BG, color: VIZ.text }}>
        <header className={`bg-white border-b border-gray-200 sticky top-0 z-30 ${isPrint ? 'print:hidden' : ''}`}>
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
            <Link href="/first-aid" className="flex items-center gap-2.5 shrink-0">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xl font-bold" style={{ background: FA_GREEN }} aria-hidden="true">+</span>
              <span className="hidden sm:block leading-tight"><span className="block font-semibold text-sm" style={{ color: FA_GREEN }}>First Aid</span><span className="block text-[11px] text-gray-500">{companyName}</span></span>
            </Link>
            <nav className="hidden md:flex items-center gap-1" aria-label="เมนูหลัก">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = href === '/first-aid' ? pathname === href : pathname.startsWith(href);
                return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`} style={active ? { background: FA_GREEN } : undefined}><Icon size={15} />{label}</Link>;
              })}
            </nav>
            <div className="flex items-center gap-2 text-sm">
              {visibleLocations.length > 1 && (
                <label className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">จุด
                  <select aria-label="เลือกจุดปฐมพยาบาล" value={scope} onChange={e => setScope(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 max-w-[200px]">
                    <option value="all">ทุกจุด ({visibleLocations.length})</option>
                    {visibleLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
              )}
              {isAdmin && (
                <div className="relative">
                  <button type="button" onClick={() => setMenuOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"><span className="max-w-[120px] truncate">{companyName}</span><ChevronDown size={14} /></button>
                  {menuOpen && (<>
                    <button type="button" aria-label="ปิด" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                    <ul className="absolute right-0 mt-1 z-20 w-64 max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg py-1">
                      {companies.map(c => <li key={c.company_id}><button type="button" onClick={() => { setCompany(c.company_id); setMenuOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${c.company_id === company ? 'font-semibold' : 'text-gray-700'}`} style={c.company_id === company ? { color: FA_GREEN } : undefined}>{c.company_name}<span className="ml-2 text-xs text-gray-400">{c.company_id.toUpperCase()}</span></button></li>)}
                    </ul>
                  </>)}
                </div>
              )}
              <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs bg-white hover:bg-gray-50"><LogOut size={14} /><span className="hidden sm:inline">ออกจากระบบ</span></button>
            </div>
          </div>
          <nav className="md:hidden flex gap-1 px-2 pb-2 overflow-x-auto" aria-label="เมนูหลัก">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/first-aid' ? pathname === href : pathname.startsWith(href);
              return <Link key={href} href={href} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${active ? 'text-white font-medium' : 'text-gray-600'}`} style={active ? { background: FA_GREEN } : undefined}><Icon size={14} />{label}</Link>;
            })}
          </nav>
        </header>
        <main className={isPrint ? '' : 'max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6'}>
          {error && !state && <div className="rounded-xl border px-4 py-3 text-sm mb-4" style={{ borderColor: `${VIZ.accent}66`, background: `${VIZ.accent}14`, color: VIZ.accent }}>{error} <button type="button" className="underline ml-2" onClick={() => void refresh()}>ลองใหม่</button></div>}
          {!company && isAdmin && <p className="text-sm text-gray-500">กรุณาเลือกบริษัทที่มุมขวาบน</p>}
          {children}
        </main>
        {!isPrint && <footer className="max-w-7xl mx-auto px-6 pb-8 text-xs text-gray-400"><Link href="/" className="inline-flex items-center gap-1 hover:text-gray-600"><ArrowLeft size={12} />กลับ EA SHE Tools</Link></footer>}
      </div>
    </FaContext.Provider>
  );
}

function FirstAidLogin() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [companies, setCompanies] = useState<LoginCompanyOption[] | null>(null);
  async function signIn(companyId?: string) {
    if (isLoading) return; setError('');
    const result = await login(username, password, companyId);
    if (result.success) { setPassword(''); return; }
    if (result.needCompanySelection && result.companies) setCompanies(result.companies);
    else setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  function submit(e: FormEvent) { e.preventDefault(); if (!username.trim() || !password) { setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; } void signIn(); }
  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: PAGE_BG }}>
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <Link href="/" className="text-xs text-gray-500">← กลับ EA SHE Tools</Link>
        <div className="mt-6 mb-6 flex items-center gap-3"><span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white text-3xl font-bold" style={{ background: FA_GREEN }} aria-hidden="true">+</span><div><h1 className="text-xl font-semibold" style={{ color: FA_GREEN }}>First Aid & Medicine Control</h1><p className="text-sm text-gray-500">เข้าสู่ระบบด้วยบัญชี EA SHE Tools</p></div></div>
        {companies ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">เลือกบริษัทที่ต้องการเข้าใช้งาน</p>
            {companies.map(c => <button key={c.companyId} type="button" disabled={isLoading} onClick={() => void signIn(c.companyId)} className="w-full text-left rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 disabled:opacity-50">{c.companyName}</button>)}
            <button type="button" className="text-sm text-gray-500 mt-2" onClick={() => { setCompanies(null); setError(''); }}>กลับไปแก้ไขบัญชี</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" aria-busy={isLoading}>
            <div><label className={labelClass} htmlFor="fu">ชื่อผู้ใช้</label><input id="fu" className={inputClass} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required /></div>
            <div><label className={labelClass} htmlFor="fp">รหัสผ่าน</label><input id="fp" type="password" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></div>
            <button type="submit" disabled={isLoading} className={`${btnPrimary} w-full`} style={{ background: FA_GREEN }}>{isLoading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          </form>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: `${VIZ.accent}14`, color: VIZ.accent }}>{error}</p>}
        <p className="mt-6 text-xs text-gray-400">ผู้ที่หยิบของจากตู้เองสแกน QR หน้าตู้ได้โดยไม่ต้องเข้าสู่ระบบ</p>
      </div>
    </main>
  );
}

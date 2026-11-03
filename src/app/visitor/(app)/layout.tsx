'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown, ClipboardCheck, Link2, LogOut, Eye, EyeOff, MonitorPlay } from 'lucide-react';
import { useAuth, type LoginCompanyOption } from '@/components/AuthProvider';
import { VIZ, cardClass, inputClass, labelClass } from '../_components/ui';

const NAV = [
  { href: '/visitor', label: 'คิวคัดกรอง-อนุมัติ', icon: ClipboardCheck },
  { href: '/visitor/settings', label: 'ลิงก์ขอ & จอ รปภ', icon: Link2 },
];

export default function VisitorLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  if (!user) return <VisitorLogin />;
  return (
    <div className="min-h-screen" style={{ background: '#F5F6F8', color: VIZ.text }}>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/visitor" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ea-logo.svg" alt="EA" width={40} height={32} />
            <span><span className="block font-semibold" style={{ color: VIZ.primary }}>Visitor Access</span><span className="block text-xs text-gray-500">คัดกรอง-อนุมัติบุคคลภายนอกเข้าพื้นที่</span></span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/visitor' ? pathname === href : pathname.startsWith(href);
              return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-[#4E79A7]/10 text-[#4E79A7]' : 'text-gray-600 hover:bg-gray-100'}`}><Icon size={16} />{label}</Link>;
            })}
            <BoardLink companyId={user.companyId} isAdmin={user.role === 'admin' || user.companyId === 'admin'} />
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden md:block text-right"><span className="block font-medium">{user.nickname || user.displayName}</span><span className="block text-xs text-gray-500">{user.role === 'admin' ? 'ผู้ดูแลระบบ' : `ทีม SHE · ${user.companyName}`}</span></span>
            <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs bg-white"><LogOut size={14} />ออกจากระบบ</button>
          </div>
        </div>
        <nav className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {NAV.map(({ href, label }) => <Link key={href} href={href} className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${pathname === href ? 'bg-[#4E79A7]/10 text-[#4E79A7]' : 'text-gray-600'}`}>{label}</Link>)}
          <BoardLink companyId={user.companyId} isAdmin={user.role === 'admin' || user.companyId === 'admin'} compact />
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      <footer className="max-w-7xl mx-auto px-6 pb-8 text-xs text-gray-400"><Link href="/" className="inline-flex items-center gap-1 hover:text-gray-600"><ArrowLeft size={12} />กลับ EA SHE Tools</Link></footer>
    </div>
  );
}

function VisitorLogin() {
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F5F6F8' }}>
      <div className={`${cardClass} w-full max-w-md`}>
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ea-logo.svg" alt="EA" width={44} height={36} />
          <div><h1 className="text-xl font-semibold" style={{ color: VIZ.primary }}>Visitor Access — ทีม SHE</h1><p className="text-sm text-gray-500">เข้าสู่ระบบด้วยบัญชี SHE เดียวกับ eashe.org</p></div>
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
            <div><label className={labelClass} htmlFor="vu">ชื่อผู้ใช้</label><input id="vu" className={inputClass} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required /></div>
            <div><label className={labelClass} htmlFor="vp">รหัสผ่าน</label>
              <div className="relative"><input id="vp" type={visible ? 'text' : 'password'} className={`${inputClass} pr-20`} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setVisible(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs text-gray-500">{visible ? <EyeOff size={14} /> : <Eye size={14} />}{visible ? 'ซ่อน' : 'แสดง'}</button></div></div>
            {error && <p role="alert" className="text-sm rounded-lg px-3 py-2" style={{ background: `${VIZ.accent}1A`, color: VIZ.accent }}>{error}</p>}
            <button type="submit" disabled={isLoading} className="w-full rounded-lg py-2.5 text-white font-medium disabled:opacity-60" style={{ background: VIZ.primary }}>{isLoading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          </form>
        )}
        <p className="mt-6 text-xs text-gray-400">หน้าสำหรับพนักงานยื่นคำขอและจอ รปภ ไม่ต้องเข้าสู่ระบบ — ขอลิงก์ได้จากทีม SHE</p>
      </div>
    </div>
  );
}

type CompanyOpt = { company_id: string; company_name: string };
const BOARD_PICK_KEY = 'visitor_admin_company';

/** "เปิดจอ รปภ": one link for a company user; for the super admin a picker of every company (board pages are public, one URL per company). */
function BoardLink({ companyId, isAdmin, compact }: { companyId: string; isAdmin: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const cls = compact ? 'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-gray-600 inline-flex items-center gap-1' : 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100';
  useEffect(() => {
    if (!isAdmin || !open || companies.length) return;
    fetch('/api/companies', { credentials: 'include' }).then(r => r.json()).then((d: unknown) => setCompanies(Array.isArray(d) ? (d as CompanyOpt[]) : [])).catch(() => setCompanies([]));
  }, [isAdmin, open, companies.length]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  if (!isAdmin) return <a href={`/visitor/board/${companyId}`} target="_blank" rel="noreferrer" className={cls}><MonitorPlay size={16} />เปิดจอ รปภ</a>;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} className={cls}><MonitorPlay size={16} />เปิดจอ รปภ<ChevronDown size={14} /></button>
      {open && (
        <div role="menu" className="absolute right-0 sm:left-0 sm:right-auto mt-1 w-64 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-30">
          <div className="px-3 py-1.5 text-xs text-gray-500">เลือกบริษัท — เปิดในแท็บใหม่</div>
          {companies.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">กำลังโหลด…</div>}
          {companies.map(c => (
            <a key={c.company_id} role="menuitem" href={`/visitor/board/${c.company_id}`} target="_blank" rel="noreferrer" onClick={() => { try { localStorage.setItem(BOARD_PICK_KEY, c.company_id); } catch { /* ignore */ } setOpen(false); }}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <span>{c.company_name}</span><span className="font-mono text-xs text-gray-400">{c.company_id.toUpperCase()}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

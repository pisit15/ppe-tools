'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth, type LoginCompanyOption } from '@/components/AuthProvider';
import ModuleAccessDenied from '@/components/ModuleAccessDenied';

type Company = { company_id: string; company_name: string };

export default function FirstAidPage() {
  const { user, login, logout, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginCompanies, setLoginCompanies] = useState<LoginCompanyOption[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [pendingResult, setPendingResult] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'first-aid-pending') setPendingResult(event.data.pending === true);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(() => {
    if (!user) { setCompany(''); return; }
    if (user.role !== 'admin') { setCompany(user.companyId); return; }
    let cancelled = false;
    setLoadingCompanies(true);
    fetch('/api/companies', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('โหลดรายชื่อบริษัทไม่สำเร็จ');
      return response.json() as Promise<Company[]>;
    }).then(rows => {
      if (cancelled) return;
      const valid = rows.filter(row => row.company_id && !['all', 'admin', 'default'].includes(row.company_id));
      setCompanies(valid);
      const requested = new URLSearchParams(window.location.search).get('company_id');
      setCompany(valid.find(row => row.company_id === requested)?.company_id || valid[0]?.company_id || '');
    }).catch(failure => { if (!cancelled) setError(failure.message); })
      .finally(() => { if (!cancelled) setLoadingCompanies(false); });
    return () => { cancelled = true; };
  }, [user]);

  async function signIn(event?: FormEvent, companyId?: string) {
    event?.preventDefault();
    setError('');
    const result = await login(username, password, companyId);
    if (result.needCompanySelection) setLoginCompanies(result.companies || []);
    else if (!result.success) setError(result.error || 'เข้าสู่ระบบไม่สำเร็จ');
    else { setPassword(''); setLoginCompanies(null); }
  }

  if (!user) return (
    <main className="min-h-screen bg-[#f4f7f4] flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border border-[#dce7dd] bg-white p-8 shadow-sm">
        <Link href="/" className="text-xs text-[#63796a]">← กลับ EA SHE Tools</Link>
        <div className="mt-8 mb-7">
          <div className="text-4xl text-[#29644b]">+</div>
          <h1 className="text-2xl font-semibold text-[#234434]">First Aid & Medicine Control</h1>
          <p className="mt-2 text-sm text-[#62786a]">เข้าสู่ระบบด้วยบัญชี EA SHE Tools เพื่อดูแลจุดปฐมพยาบาลของบริษัท</p>
        </div>
        {loginCompanies ? <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">เลือกบริษัทที่ต้องการเข้าใช้งาน</h2>
          {loginCompanies.map(row => <button key={row.companyId} disabled={isLoading} onClick={() => signIn(undefined, row.companyId)} className="w-full rounded-lg border border-[#dce7dd] p-3 text-left text-sm text-[#315b40] hover:bg-[#eff5f0] disabled:opacity-50">{row.companyName}</button>)}
        </div> : <form onSubmit={signIn} className="space-y-5">
          <label className="block text-sm text-[#405e49]">ชื่อผู้ใช้<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required className="mt-2 w-full rounded-lg border border-[#d6e2d8] px-3 py-3 text-gray-900 outline-[#659776]" /></label>
          <label className="block text-sm text-[#405e49]">รหัสผ่าน<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required className="mt-2 w-full rounded-lg border border-[#d6e2d8] px-3 py-3 text-gray-900 outline-[#659776]" /></label>
          <button disabled={isLoading} className="w-full rounded-lg bg-[#246047] p-3 text-sm font-medium text-white disabled:opacity-50">{isLoading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        </form>}
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="mt-6 text-xs leading-6 text-[#718374]">ผู้เบิกที่หยิบใช้เองสามารถเปิดจากลิงก์หรือ QR ประจำตู้และกระเป๋าได้โดยตรง</p>
      </div>
    </main>
  );

  if (user.role !== 'admin' && (user.ppeRole === 'requester' || (user.allowedModules?.length && !user.allowedModules.includes('first-aid')))) {
    return <ModuleAccessDenied moduleName="First Aid & Medicine Control" />;
  }

  return <main className="h-dvh overflow-hidden bg-[#f6f8f6]">
    <header className="h-14 border-b border-[#dce6de] bg-white px-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" onClick={event => { if (pendingResult) event.preventDefault(); }} aria-disabled={pendingResult} className="shrink-0 text-xs font-medium text-[#496a54]">← เครื่องมือทั้งหมด</Link>
        {user.role === 'admin' ? <label className="flex min-w-0 items-center gap-2 text-xs text-[#657c6b]"><span className="hidden sm:inline">บริษัท</span><select aria-label="เลือกบริษัท" value={company} onChange={event => setCompany(event.target.value)} disabled={loadingCompanies || pendingResult} className="max-w-[48vw] rounded-md border border-[#dce6de] bg-white p-2 text-xs text-[#30533d] sm:max-w-sm"><option value="">{loadingCompanies ? 'กำลังโหลดบริษัท…' : 'เลือกบริษัท'}</option>{companies.map(row => <option key={row.company_id} value={row.company_id}>{row.company_name}</option>)}</select></label> : <span className="truncate text-xs text-[#637b6a]">{user.companyName}</span>}
      </div>
      <button disabled={pendingResult} onClick={() => logout()} className="shrink-0 text-xs text-[#718575] hover:text-[#254c34]">ออกจากระบบ</button>
    </header>
    {company ? <iframe ref={frame} key={company} src={`/first-aid/index.html?company_id=${encodeURIComponent(company)}`} title={`First Aid & Medicine Control · ${companies.find(row => row.company_id === company)?.company_name || user.companyName}`} className="block h-[calc(100dvh-56px)] w-full border-0" referrerPolicy="same-origin" /> : <div className="p-10 text-center text-sm text-[#62796a]">{error || (loadingCompanies ? 'กำลังโหลดบริษัท…' : 'กรุณาเลือกบริษัทเพื่อเริ่มใช้งาน')}</div>}
  </main>;
}

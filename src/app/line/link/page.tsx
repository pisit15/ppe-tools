'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Link2 } from 'lucide-react';

const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#EEEEEE',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
};

type Company = { companyId: string; companyName: string };

function LinkForm() {
  const code = useSearchParams().get('code') || '';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneName, setDoneName] = useState('');

  async function submit(companyId?: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/line/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, username, password, ...(companyId ? { company_id: companyId } : {}) }),
      });
      const data = await res.json();
      if (data.success) {
        setDoneName(data.displayName || username);
        setPassword('');
      } else if (data.needCompanySelection) {
        setCompanies(data.companies as Company[]);
      } else {
        setError(data.error || 'เชื่อมบัญชีไม่สำเร็จ');
        setCompanies(null);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setBusy(false);
    }
  }

  if (!code) {
    return <p className="text-sm" style={{ color: VIZ.accent }}>ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากแชต LINE</p>;
  }

  if (doneName) {
    return (
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: VIZ.positive }} />
        <h2 className="text-lg font-bold" style={{ color: VIZ.text }}>เชื่อมบัญชีแล้ว</h2>
        <p className="text-sm mt-1" style={{ color: VIZ.lightText }}>
          {doneName} · กลับไปที่แชต LINE แล้วพิมพ์ &quot;เมนู&quot; เพื่อเริ่มใช้งาน
        </p>
      </div>
    );
  }

  if (companies) {
    return (
      <div>
        <p className="text-sm mb-3" style={{ color: VIZ.text }}>บัญชีนี้อยู่หลายบริษัท เลือกบริษัทที่จะใช้กับ LINE</p>
        <div className="flex flex-col gap-2">
          {companies.map(c => (
            <button
              key={c.companyId}
              disabled={busy}
              onClick={() => submit(c.companyId)}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white active:bg-gray-50 disabled:opacity-50"
              style={{ color: VIZ.text }}
            >
              {c.companyName}
            </button>
          ))}
        </div>
        {error && <p className="text-sm mt-3" style={{ color: VIZ.accent }}>{error}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <label className="text-sm" style={{ color: VIZ.text }}>
        ชื่อผู้ใช้
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
          className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400"
        />
      </label>
      <label className="text-sm" style={{ color: VIZ.text }}>
        รหัสผ่าน
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1 w-full px-3 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400"
        />
      </label>
      {error && <p className="text-sm" style={{ color: VIZ.accent }}>{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full py-3 rounded-xl text-white font-medium disabled:opacity-60"
        style={{ background: VIZ.primary }}
      >
        {busy ? 'กำลังตรวจสอบ…' : 'เชื่อมบัญชี'}
      </button>
      <p className="text-xs" style={{ color: VIZ.lightText }}>
        ใช้บัญชีเดียวกับที่เข้าสู่ระบบ tools.eashe.org · ระบบไม่เก็บรหัสผ่านไว้กับ LINE
      </p>
    </form>
  );
}

export default function LineLinkPage() {
  return (
    <div
      className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 px-4 py-10"
      style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}
    >
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex bg-white rounded-2xl px-4 py-3 shadow-lg mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ea-logo.svg" alt="EA SHE" width={66} height={50} />
          </div>
          <h1 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            <Link2 size={20} /> เชื่อมบัญชี LINE
          </h1>
          <p className="text-blue-200 text-sm mt-1">เข้าสู่ระบบเพื่อใช้ EA SHE Bot</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <Suspense fallback={null}>
            <LinkForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

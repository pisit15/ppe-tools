'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

/**
 * For non-admin people who have the same account in several companies: pick the company to work in.
 * Renders nothing when the user has only one company. Reloads the page after switching so every
 * module re-reads its company-scoped data.
 */
export function CompanySwitcher({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const { user, switchCompany } = useAuth();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  if (!user || user.role === 'admin' || !user.companies || user.companies.length < 2) return null;
  async function pick(id: string) {
    if (!user || id === user.companyId) return;
    setBusy(true); setErr('');
    const r = await switchCompany(id);
    if (!r.success) { setErr(r.error || 'สลับบริษัทไม่สำเร็จ'); setBusy(false); return; }
    window.location.reload();
  }
  const base = dark ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-gray-300 text-gray-800';
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs ${dark ? 'text-blue-200' : 'text-gray-500'} ${className}`} title={err || 'สลับบริษัท'}>
      <span className="hidden sm:inline">บริษัท</span>
      <span className="relative inline-flex items-center">
        <select aria-label="สลับบริษัท" disabled={busy} value={user.companyId} onChange={e => void pick(e.target.value)} className={`appearance-none rounded-lg border pl-3 pr-7 py-1.5 text-sm font-medium ${base} disabled:opacity-60`}>
          {user.companies.map(c => <option key={c.companyId} value={c.companyId} className="text-gray-900">{c.companyName}</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2" />
      </span>
      {err && <span className="text-red-500">{err}</span>}
    </label>
  );
}

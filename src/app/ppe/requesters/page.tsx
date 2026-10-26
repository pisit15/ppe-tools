'use client';

export const dynamic = 'force-dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import type { PPERequester } from '@/lib/types';

const input = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const button = 'min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const blank = { username: '', password: '', display_name: '', employee_code: '', department: '' };
export default function PPERequestersPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const company = user?.role === 'admin' ? params.get('company_id') || 'all' : user?.companyId;
  const [rows, setRows] = useState<PPERequester[]>([]);
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetUser, setResetUser] = useState<PPERequester | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const endpoint = `/api/ppe/requesters?company_id=${encodeURIComponent(company || '')}`;
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: 'no-store', signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'โหลดผู้ใช้งานไม่สำเร็จ');
    setRows(result.data);
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setForm(blank); setResetUser(null); setError(''); setMessage('');
    if (company && company !== 'all' && user?.ppeRole !== 'requester') void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [load, company, user?.ppeRole]);
  async function save(method: string, body: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
      setMessage(method === 'POST' ? `สร้างบัญชีแล้ว ชื่อผู้ใช้: ${result.data.username} · เข้าสู่ระบบที่ tools.eashe.org/ppe` : 'บันทึกแล้ว การปิดบัญชีหรือเปลี่ยนรหัสผ่านจะยกเลิกสิทธิ์ของการเข้าสู่ระบบเดิมทันที');
      setForm(blank); setResetUser(null); setNewPassword(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  if (user?.ppeRole === 'requester') return <p>เฉพาะผู้ดูแล PPE</p>;
  if (!company || company === 'all') return <p className="rounded-xl border bg-white p-6 text-slate-900">เลือกบริษัทจากเมนูด้านซ้ายก่อนสร้างผู้ใช้งาน PPE</p>;
  return <div className="min-w-0 space-y-5 text-slate-900">
    <header><h1 className="text-2xl font-bold">ผู้ใช้งาน PPE</h1><p className="mt-1 text-sm text-slate-500">สร้างบัญชีดูอุปกรณ์ ขอเบิก และยืนยันรับ เฉพาะบริษัท {company.toUpperCase()}</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {message && <p role="status" className="break-words rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); void save('POST', form); }}>
      <h2 className="font-semibold">เพิ่มผู้ขอเบิก</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm">ชื่อ–นามสกุล<input required maxLength={150} className={input} value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} /></label>
        <label className="text-sm">รหัสพนักงาน<input required maxLength={100} className={input} value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} /></label>
        <label className="text-sm">แผนก<input maxLength={150} className={input} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} /></label>
        <label className="text-sm">ชื่อผู้ใช้<input aria-label="ชื่อผู้ใช้" required pattern="[a-zA-Z0-9][a-zA-Z0-9.-]{2,39}" maxLength={40} autoComplete="off" className={input} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} /><span className="mt-1 block break-all text-xs text-slate-500">ชื่อเข้าใช้: ppe.{company}.{form.username || 'ชื่อผู้ใช้'} (อังกฤษ/ตัวเลข 3–40 ตัว)</span></label>
        <label className="text-sm">รหัสผ่านเริ่มต้น<input aria-label="รหัสผ่านเริ่มต้น" required type="password" minLength={10} maxLength={72} autoComplete="new-password" className={input} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /><span className="mt-1 block text-xs text-slate-500">อย่างน้อย 10 ตัวอักษร</span></label>
      </div>
      <p className="text-xs text-slate-500">บัญชีนี้ไม่สามารถแก้สต็อก อนุมัติคำขอ ดูข้อมูลบริษัทอื่น หรือเข้าโมดูลอื่นได้</p>
      <button className={button} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'สร้างบัญชี PPE'}</button>
    </form>
    <label className="block max-w-lg text-sm">ค้นหาผู้ใช้งาน<input className={input} placeholder="ชื่อ รหัสพนักงาน หรือชื่อผู้ใช้" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <div className="space-y-3">{rows.filter(r => `${r.display_name} ${r.employee_code} ${r.username}`.toLowerCase().includes(search.toLowerCase())).map(r => <article key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4"><div className="min-w-0"><h2 className="font-semibold">{r.display_name} <span className={`ml-2 rounded-full px-2 py-1 text-xs ${r.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{r.is_active ? 'ใช้งานได้' : 'ปิดบัญชี'}</span></h2><p className="mt-1 break-all text-sm text-blue-700">{r.username}</p><p className="mt-1 text-xs text-slate-500">{r.employee_code} · {r.department || 'ไม่ระบุแผนก'}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => { setResetUser(r); setNewPassword(''); }}>ตั้งรหัสผ่านใหม่</button><button disabled={busy} className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => void save('PATCH', { id: r.id, is_active: !r.is_active })}>{r.is_active ? 'ปิดบัญชี' : 'เปิดบัญชี'}</button></div></article>)}</div>
    {resetUser && <form className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-5" onSubmit={e => { e.preventDefault(); void save('PATCH', { id: resetUser.id, password: newPassword }); }}><h2 className="font-semibold">ตั้งรหัสผ่านใหม่ให้ {resetUser.display_name}</h2><label className="block text-sm">รหัสผ่านใหม่<input autoFocus required type="password" minLength={10} maxLength={72} autoComplete="new-password" className={input} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label><div className="flex gap-2"><button disabled={busy} className={button}>บันทึกรหัสผ่าน</button><button type="button" className="min-h-11 px-3 text-sm" onClick={() => setResetUser(null)}>ปิด</button></div></form>}
  </div>;
}

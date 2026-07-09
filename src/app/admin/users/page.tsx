'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, ArrowLeft, LogOut, Users, Plus, Pencil, X, RefreshCw,
  KeyRound, Trash2, Search, ChevronLeft, ChevronRight, Copy, Check,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

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

type CompanyUser = {
  id: number;
  company_id: string;
  username: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Company = { company_id: string; company_name: string };

type ModalState =
  | { mode: 'add' }
  | { mode: 'edit'; user: CompanyUser }
  | null;

const PAGE_SIZE = 30;

function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const rand = new Uint32Array(10);
  crypto.getRandomValues(rand);
  for (let i = 0; i < 10; i++) out += chars[rand[i] % chars.length];
  return out;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const authHeaders = useCallback((): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user?.token || ''}`,
  }), [user?.token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, cRes] = await Promise.all([
        fetch('/api/admin/users', { headers: authHeaders() }),
        fetch('/api/companies'),
      ]);
      if (uRes.status === 401) {
        setToast({ type: 'error', msg: 'สิทธิ์หมดอายุ กรุณาออกจากระบบแล้วเข้าใหม่' });
        setUsers([]);
      } else {
        const uData = await uRes.json();
        setUsers(uData.data || []);
      }
      const cData = await cRes.json();
      setCompanies(Array.isArray(cData) ? cData : []);
    } catch {
      setToast({ type: 'error', msg: 'โหลดข้อมูลไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!isAdmin) {
      router.push('/admin');
      return;
    }
    loadData();
  }, [isAdmin, router, loadData]);

  const companyName = useCallback(
    (id: string) => companies.find(c => c.company_id === id)?.company_name || id.toUpperCase(),
    [companies]
  );

  const filtered = useMemo(() => {
    let list = users;
    if (companyFilter !== 'all') list = list.filter(u => u.company_id === companyFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        u =>
          u.username.toLowerCase().includes(q) ||
          (u.display_name || '').toLowerCase().includes(q) ||
          u.company_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, companyFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [companyFilter, search]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: VIZ.bg }}>
      {/* Top Bar */}
      <header className="bg-slate-800 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-blue-400" />
            <div>
              <h1 className="text-lg font-bold">จัดการผู้ใช้</h1>
              <p className="text-sm text-gray-400">บัญชีเข้าใช้งานระบบ — ทุกบริษัท</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/admin')} className="text-sm text-gray-300 hover:text-white flex items-center gap-1">
              <ArrowLeft size={16} /> Admin Dashboard
            </button>
            <button onClick={() => { logout(); router.push('/admin'); }} className="text-sm text-gray-300 hover:text-red-300 flex items-center gap-1">
              <LogOut size={16} /> ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-4">
        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Users size={18} style={{ color: VIZ.primary }} />
            <span className="font-semibold" style={{ color: VIZ.text }}>
              ผู้ใช้ทั้งหมด {filtered.length} คน
            </span>
          </div>

          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
          >
            <option value="all">ทุกบริษัท</option>
            {companies.map(c => (
              <option key={c.company_id} value={c.company_id}>
                {c.company_name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้ใช้ / ชื่อแสดง"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <button
            onClick={loadData}
            className="p-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
            title="รีเฟรช"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setModal({ mode: 'add' })}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90"
            style={{ backgroundColor: VIZ.positive }}
          >
            <Plus size={16} /> เพิ่มผู้ใช้
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ backgroundColor: VIZ.bg, color: VIZ.lightText }}>
                <th className="px-4 py-3 font-semibold">บริษัท</th>
                <th className="px-4 py-3 font-semibold">ชื่อผู้ใช้</th>
                <th className="px-4 py-3 font-semibold">ชื่อแสดง</th>
                <th className="px-4 py-3 font-semibold text-center">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-center">แก้ไข</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    ไม่พบผู้ใช้
                  </td>
                </tr>
              ) : (
                pageRows.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-blue-50/40">
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-1 rounded-md text-xs font-semibold"
                        style={{ backgroundColor: VIZ.bg, color: VIZ.primary }}
                      >
                        {companyName(u.company_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: VIZ.text }}>{u.username}</td>
                    <td className="px-4 py-3" style={{ color: VIZ.lightText }}>{u.display_name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-semibold"
                        style={
                          u.is_active
                            ? { backgroundColor: '#EAF3EA', color: VIZ.positive }
                            : { backgroundColor: VIZ.bg, color: VIZ.lightText }
                        }
                      >
                        {u.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setModal({ mode: 'edit', user: u })}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                        style={{ color: VIZ.primary }}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs" style={{ color: VIZ.lightText }}>
                หน้า {pageSafe} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={pageSafe <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs" style={{ color: VIZ.lightText }}>
          หมายเหตุ: รหัสผ่านถูกเก็บแบบเข้ารหัส (bcrypt) ระบบไม่สามารถแสดงรหัสเดิมได้ — ทำได้เฉพาะตั้งรหัสใหม่
        </p>
      </div>

      {/* Modal */}
      {modal && (
        <UserModal
          modal={modal}
          companies={companies}
          authHeaders={authHeaders}
          onClose={() => setModal(null)}
          onSaved={(msg) => {
            setModal(null);
            setToast({ type: 'success', msg });
            loadData();
          }}
          onError={(msg) => setToast({ type: 'error', msg })}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50"
          style={{ backgroundColor: toast.type === 'success' ? VIZ.positive : VIZ.accent }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function UserModal({
  modal,
  companies,
  authHeaders,
  onClose,
  onSaved,
  onError,
}: {
  modal: NonNullable<ModalState>;
  companies: Company[];
  authHeaders: () => Record<string, string>;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = modal.mode === 'edit';
  const editUser = isEdit ? modal.user : null;

  const [companyId, setCompanyId] = useState(editUser?.company_id || companies[0]?.company_id || '');
  const [username, setUsername] = useState(editUser?.username || '');
  const [displayName, setDisplayName] = useState(editUser?.display_name || '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(editUser ? editUser.is_active : true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setPassword(generatePassword());
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      onError('กรุณาใส่ชื่อผู้ใช้');
      return;
    }
    if (!isEdit && !password) {
      onError('กรุณาตั้งรหัสผ่าน');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...(isEdit ? { id: editUser!.id } : {}),
          company_id: companyId,
          username: username.trim(),
          display_name: displayName,
          is_active: isActive,
          ...(password ? { password } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      onSaved(isEdit ? 'บันทึกการแก้ไขแล้ว' : `เพิ่มผู้ใช้ "${username.trim()}" แล้ว`);
    } catch {
      onError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users?id=${editUser.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || 'ลบไม่สำเร็จ');
        return;
      }
      onSaved(`ลบผู้ใช้ "${editUser.username}" แล้ว`);
    } catch {
      onError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">
            {isEdit ? `แก้ไขผู้ใช้ — ${editUser!.username}` : 'เพิ่มผู้ใช้ใหม่'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">บริษัท</label>
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 bg-white"
            >
              {companies.map(c => (
                <option key={c.company_id} value={c.company_id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">ชื่อผู้ใช้</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="เช่น somchai"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">ชื่อแสดง</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="เช่น สมชาย ใจดี"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <KeyRound size={13} className="inline mr-1" />
              {isEdit ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isEdit ? 'ไม่เปลี่ยนรหัสผ่าน' : 'อย่างน้อย 6 ตัวอักษร'}
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-gray-900 placeholder:text-gray-400 font-mono"
              />
              <button
                type="button"
                onClick={handleGenerate}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap"
              >
                สุ่มรหัส
              </button>
              {password && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-sm hover:bg-gray-50"
                  style={{ color: copied ? VIZ.positive : VIZ.lightText }}
                  title="คัดลอก"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              )}
            </div>
            {password && (
              <p className="text-xs mt-1.5" style={{ color: VIZ.secondary }}>
                จดหรือคัดลอกรหัสนี้ไว้ — บันทึกแล้วจะแสดงอีกไม่ได้
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">เปิดใช้งานบัญชีนี้</span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2">
          {isEdit && (
            confirmDelete ? (
              <div className="flex items-center gap-2 mr-auto">
                <span className="text-xs" style={{ color: VIZ.accent }}>ยืนยันลบถาวร?</span>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: VIZ.accent }}
                >
                  ลบเลย
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="mr-auto px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 hover:bg-red-50"
                style={{ color: VIZ.accent }}
              >
                <Trash2 size={15} /> ลบผู้ใช้
              </button>
            )
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90"
            style={{ backgroundColor: VIZ.primary }}
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

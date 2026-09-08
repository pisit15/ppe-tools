'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { CompanyPicker } from '@/components/superadmin/CompanyPicker';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  Toast,
  VIZ,
  formatDateTime,
  inputClass,
  saFetch,
  useToast,
} from '@/components/superadmin/ui';

type SourceKey = 'company_users' | 'tools_users' | 'company_credentials';

type UserRow = {
  id: string | number;
  company_id: string;
  username: string;
  display_name?: string | null;
  company_name?: string | null;
  nickname?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type UsersResponse = {
  data: UserRow[];
  source: { key: SourceKey; label: string; hashPasswords: boolean };
  sources: { key: SourceKey; label: string }[];
};

type Company = { company_id: string; company_name: string };

const PAGE_SIZE = 30;

type FormState = {
  id?: string | number;
  company_id: string;
  username: string;
  password: string;
  display_name: string;
  nickname: string;
  position: string;
  email: string;
  phone: string;
  role: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  company_id: '',
  username: '',
  password: '',
  display_name: '',
  nickname: '',
  position: '',
  email: '',
  phone: '',
  role: 'user',
  is_active: true,
};

export default function SuperAdminUsersPage() {
  const { toast, setToast, success, error } = useToast();

  const [source, setSource] = useState<SourceKey>('company_users');
  const [sources, setSources] = useState<{ key: SourceKey; label: string }[]>([]);
  const [hashPasswords, setHashPasswords] = useState(false);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: keyof UserRow; dir: 'asc' | 'desc' }>({
    key: 'company_id',
    dir: 'asc',
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ source });
      if (companyFilter !== 'all') params.set('company_id', companyFilter);
      const data = await saFetch<UsersResponse>(`/api/superadmin/users?${params}`);
      setRows(data.data);
      setSources(data.sources);
      setHashPasswords(data.source.hashPasswords);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyFilter, error, source]);

  useEffect(() => {
    saFetch<{ data: Company[] }>('/api/superadmin/companies')
      .then((data) => setCompanies(data.data))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter changes reset paging and re-show the spinner from the handler, not
  // from an effect, so the render pass stays free of cascading setState.
  const changeSource = (next: SourceKey) => {
    setSource(next);
    setPage(1);
    setLoading(true);
  };

  const changeCompany = (next: string) => {
    setCompanyFilter(next);
    setPage(1);
    setLoading(true);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? rows.filter((r) =>
          [r.username, r.display_name, r.company_id, r.email, r.nickname]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
        )
      : rows;

    return [...list].sort((a, b) => {
      const left = String(a[sort.key] ?? '');
      const right = String(b[sort.key] ?? '');
      const cmp = left.localeCompare(right, 'th');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, sort]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const toggleSort = (key: keyof UserRow) =>
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));

  const openCreate = () =>
    setForm({ ...EMPTY_FORM, company_id: companyFilter === 'all' ? '' : companyFilter });

  const openEdit = (row: UserRow) =>
    setForm({
      id: row.id,
      company_id: row.company_id,
      username: row.username,
      password: '',
      display_name: row.display_name || '',
      nickname: row.nickname || '',
      position: row.position || '',
      email: row.email || '',
      phone: row.phone || '',
      role: row.role || 'user',
      is_active: row.is_active,
    });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const isEdit = form.id !== undefined;
      const payload: Record<string, unknown> = {
        company_id: form.company_id,
        username: form.username,
        is_active: form.is_active,
      };
      if (form.password) payload.password = form.password;
      if (source !== 'company_credentials') payload.display_name = form.display_name;
      if (source === 'tools_users') {
        payload.nickname = form.nickname;
        payload.position = form.position;
        payload.email = form.email;
        payload.phone = form.phone;
        payload.role = form.role;
        const company = companies.find((c) => c.company_id === form.company_id);
        if (company) payload.company_name = company.company_name;
      }
      if (isEdit) payload.id = form.id;

      await saFetch(`/api/superadmin/users?source=${source}`, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      success(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้ใช้แล้ว');
      setForm(null);
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: UserRow) => {
    try {
      await saFetch(`/api/superadmin/users?source=${source}`, {
        method: 'PATCH',
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      });
      success(row.is_active ? 'ปิดใช้งานบัญชีแล้ว' : 'เปิดใช้งานบัญชีแล้ว');
      load();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await saFetch(`/api/superadmin/users?source=${source}&id=${pendingDelete.id}`, {
        method: 'DELETE',
      });
      success('ลบผู้ใช้แล้ว');
      setPendingDelete(null);
      load();
    } catch (err) {
      error((err as Error).message);
      setPendingDelete(null);
    }
  };

  const sortableHeader = (key: keyof UserRow, label: string) => (
    <th
      className="cursor-pointer px-4 py-3 text-left font-semibold select-none"
      onClick={() => toggleSort(key)}
    >
      {label}
      {sort.key === key && <span className="ml-1 text-xs">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="ผู้ใช้ทุกระบบ"
        description="จัดการบัญชีผู้ใช้ของทุกแอปที่ใช้ฐานข้อมูลเดียวกัน"
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} className="mr-1 inline" />
            เพิ่มผู้ใช้
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {sources.map((s) => (
          <button
            key={s.key}
            onClick={() => changeSource(s.key)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={
              source === s.key
                ? { backgroundColor: VIZ.primary, color: '#fff' }
                : { backgroundColor: '#fff', color: VIZ.lightText, border: `1px solid ${VIZ.muted}` }
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {!hashPasswords && (
        <p
          className="mb-4 rounded-lg px-4 py-2.5 text-xs"
          style={{ backgroundColor: `${VIZ.secondary}12`, color: VIZ.text }}
        >
          ตารางนี้เก็บรหัสผ่านแบบ plaintext เพื่อให้แอปเดิมยังล็อกอินได้ — รหัสที่ตั้งใหม่จะถูกเก็บแบบเดียวกัน
        </p>
      )}

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <SearchInput value={search} onChange={changeSearch} placeholder="ค้นหาชื่อผู้ใช้ / ชื่อ / อีเมล" />
          </div>
          <CompanyPicker
            companies={companies}
            value={companyFilter}
            onChange={changeCompany}
            allowAll
          />
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState message="ไม่พบผู้ใช้ตามเงื่อนไขที่เลือก" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                  <tr>
                    {sortableHeader('company_id', 'บริษัท')}
                    {sortableHeader('username', 'ชื่อผู้ใช้')}
                    {source !== 'company_credentials' && sortableHeader('display_name', 'ชื่อที่แสดง')}
                    {source === 'tools_users' && sortableHeader('role', 'สิทธิ์')}
                    <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                    <th className="px-4 py-3 text-left font-semibold">แก้ไขล่าสุด</th>
                    <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((row) => (
                    <tr key={String(row.id)} className="hover:bg-gray-50">
                      <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                        {row.company_id}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: VIZ.text }}>
                        {row.username}
                      </td>
                      {source !== 'company_credentials' && (
                        <td className="px-4 py-3" style={{ color: VIZ.text }}>
                          {row.display_name || '-'}
                        </td>
                      )}
                      {source === 'tools_users' && (
                        <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                          {row.role || 'user'}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(row)} title="คลิกเพื่อสลับสถานะ">
                          <Badge color={row.is_active ? VIZ.positive : VIZ.neutral}>
                            {row.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                        {formatDateTime(row.updated_at || row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(row)}
                            className="rounded-md p-1.5 hover:bg-gray-100"
                            title="แก้ไข"
                          >
                            <Pencil size={15} style={{ color: VIZ.primary }} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(row)}
                            className="rounded-md p-1.5 hover:bg-gray-100"
                            title="ลบ"
                          >
                            <Trash2 size={15} style={{ color: VIZ.accent }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm" style={{ color: VIZ.lightText }}>
              <span>
                {filtered.length.toLocaleString('th-TH')} รายการ · หน้า {page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={form !== null}
        title={form?.id !== undefined ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}
        onClose={() => setForm(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label="บริษัท">
              <CompanyPicker
                companies={companies}
                value={form.company_id}
                onChange={(value) => setForm({ ...form, company_id: value })}
              />
            </Field>

            <Field label="ชื่อผู้ใช้">
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>

            <Field
              label={form.id !== undefined ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'}
              hint={
                form.id !== undefined
                  ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน'
                  : 'อย่างน้อย 6 ตัวอักษร'
              }
            >
              <div className="relative">
                <KeyRound
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  className={`${inputClass} pl-9`}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </Field>

            {source !== 'company_credentials' && (
              <Field label="ชื่อที่แสดง">
                <input
                  className={inputClass}
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                />
              </Field>
            )}

            {source === 'tools_users' && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="ชื่อเล่น">
                  <input
                    className={inputClass}
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  />
                </Field>
                <Field label="ตำแหน่ง">
                  <input
                    className={inputClass}
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  />
                </Field>
                <Field label="อีเมล">
                  <input
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="เบอร์โทร">
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="สิทธิ์">
                  <select
                    className={inputClass}
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </Field>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm" style={{ color: VIZ.text }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              เปิดใช้งานบัญชีนี้
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ยืนยันการลบผู้ใช้"
        message={`ต้องการลบบัญชี "${pendingDelete?.username}" ของบริษัท ${pendingDelete?.company_id} ใช่หรือไม่ การลบไม่สามารถย้อนกลับได้`}
        confirmLabel="ลบผู้ใช้"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

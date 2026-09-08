'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Toast,
  VIZ,
  formatDateTime,
  inputClass,
  saFetch,
  useToast,
} from '@/components/superadmin/ui';

type Admin = {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

type FormState = {
  id?: number;
  username: string;
  display_name: string;
  password: string;
  role: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  username: '',
  display_name: '',
  password: '',
  role: 'admin',
  is_active: true,
};

export default function SuperAdminAdminsPage() {
  const { toast, setToast, success, error } = useToast();
  const [rows, setRows] = useState<Admin[]>([]);
  const [currentUser, setCurrentUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Admin | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await saFetch<{ data: Admin[]; currentUser: string }>('/api/superadmin/admins');
      setRows(data.data);
      setCurrentUser(data.currentUser);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const isEdit = form.id !== undefined;
      const payload: Record<string, unknown> = {
        username: form.username,
        display_name: form.display_name,
        role: form.role,
        is_active: form.is_active,
      };
      if (form.password) payload.password = form.password;
      if (isEdit) payload.id = form.id;

      await saFetch('/api/superadmin/admins', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      success(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้ดูแลแล้ว');
      setForm(null);
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: Admin) => {
    try {
      await saFetch('/api/superadmin/admins', {
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
      await saFetch(`/api/superadmin/admins?id=${pendingDelete.id}`, { method: 'DELETE' });
      success('ลบผู้ดูแลแล้ว');
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="ผู้ดูแลระบบ"
        description="เฉพาะบัญชี super_admin เท่านั้นที่เข้า admin.eashe.org ได้ · บัญชี admin ใช้ได้เฉพาะหน้า /admin บน tools.eashe.org"
        actions={
          <Button onClick={() => setForm({ ...EMPTY })}>
            <Plus size={15} className="mr-1 inline" />
            เพิ่มผู้ดูแล
          </Button>
        }
      />

      <Card>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="ยังไม่มีบัญชีผู้ดูแล" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อผู้ใช้</th>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อที่แสดง</th>
                  <th className="px-4 py-3 text-left font-semibold">สิทธิ์</th>
                  <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                  <th className="px-4 py-3 text-left font-semibold">เข้าใช้ล่าสุด</th>
                  <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const isSelf = row.username.toLowerCase() === currentUser.toLowerCase();
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium" style={{ color: VIZ.text }}>
                        {row.username}
                        {isSelf && (
                          <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>
                            (คุณ)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: VIZ.text }}>
                        {row.display_name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={row.role === 'super_admin' ? VIZ.primary : VIZ.neutral}>
                          {row.role === 'super_admin' && (
                            <ShieldCheck size={12} className="mr-1 inline" />
                          )}
                          {row.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(row)} disabled={isSelf} title="คลิกเพื่อสลับสถานะ">
                          <Badge color={row.is_active ? VIZ.positive : VIZ.neutral}>
                            {row.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                        {formatDateTime(row.last_login_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() =>
                              setForm({
                                id: row.id,
                                username: row.username,
                                display_name: row.display_name || '',
                                password: '',
                                role: row.role,
                                is_active: row.is_active,
                              })
                            }
                            className="rounded-md p-1.5 hover:bg-gray-100"
                            title="แก้ไข"
                          >
                            <Pencil size={15} style={{ color: VIZ.primary }} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(row)}
                            disabled={isSelf}
                            className="rounded-md p-1.5 hover:bg-gray-100 disabled:opacity-30"
                            title="ลบ"
                          >
                            <Trash2 size={15} style={{ color: VIZ.accent }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={form !== null}
        title={form?.id !== undefined ? 'แก้ไขผู้ดูแล' : 'เพิ่มผู้ดูแล'}
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
            <Field label="ชื่อผู้ใช้">
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field label="ชื่อที่แสดง">
              <input
                className={inputClass}
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </Field>
            <Field
              label={form.id !== undefined ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'}
              hint={
                form.id !== undefined
                  ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน · อย่างน้อย 8 ตัวอักษร'
                  : 'อย่างน้อย 8 ตัวอักษร (เก็บแบบ bcrypt)'
              }
            >
              <input
                type="text"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="สิทธิ์" hint="super_admin เท่านั้นที่เข้า admin.eashe.org ได้">
              <select
                className={inputClass}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            </Field>
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
        title="ยืนยันการลบผู้ดูแล"
        message={`ต้องการลบบัญชี "${pendingDelete?.username}" ใช่หรือไม่`}
        confirmLabel="ลบผู้ดูแล"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
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
  inputClass,
  saFetch,
  useToast,
} from '@/components/superadmin/ui';

type Company = {
  company_id: string;
  company_name: string;
  full_name: string | null;
  group_name: string | null;
  bu: string | null;
  sheet_id: string | null;
  safety_sheet: string | null;
  envi_sheet: string | null;
};

type FormState = Company & { isNew: boolean };

const EMPTY: FormState = {
  isNew: true,
  company_id: '',
  company_name: '',
  full_name: '',
  group_name: '',
  bu: '',
  sheet_id: '',
  safety_sheet: '',
  envi_sheet: '',
};

export default function SuperAdminCompaniesPage() {
  const { toast, setToast, success, error } = useToast();
  const [rows, setRows] = useState<Company[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await saFetch<{ data: Company[]; userCounts: Record<string, number> }>(
        '/api/superadmin/companies'
      );
      setRows(data.data);
      setUserCounts(data.userCounts);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.company_id, row.company_name, row.full_name, row.group_name, row.bu]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [rows, search]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        company_id: form.company_id,
        company_name: form.company_name,
        full_name: form.full_name,
        group_name: form.group_name,
        bu: form.bu,
        sheet_id: form.sheet_id,
        safety_sheet: form.safety_sheet,
        envi_sheet: form.envi_sheet,
      };
      await saFetch('/api/superadmin/companies', {
        method: form.isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(payload),
      });
      success(form.isNew ? 'เพิ่มบริษัทแล้ว' : 'บันทึกการแก้ไขแล้ว');
      setForm(null);
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await saFetch(`/api/superadmin/companies?company_id=${encodeURIComponent(pendingDelete.company_id)}`, {
        method: 'DELETE',
      });
      success('ลบบริษัทแล้ว');
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
        title="บริษัท"
        description="รหัสบริษัทถูกใช้เป็น company_id ในทุกระบบ เปลี่ยนแล้วกระทบข้อมูลเดิม จึงแก้ไขได้เฉพาะชื่อและกลุ่ม"
        actions={
          <Button onClick={() => setForm({ ...EMPTY })}>
            <Plus size={15} className="mr-1 inline" />
            เพิ่มบริษัท
          </Button>
        }
      />

      <Card>
        <div className="mb-4 md:max-w-md">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหารหัส / ชื่อ / BU" />
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState message="ไม่พบบริษัท" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">รหัส</th>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อบริษัท</th>
                  <th className="px-4 py-3 text-left font-semibold">กลุ่ม</th>
                  <th className="px-4 py-3 text-left font-semibold">BU</th>
                  <th className="px-4 py-3 text-right font-semibold">ผู้ใช้</th>
                  <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <tr key={row.company_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: VIZ.lightText }}>
                      {row.company_id}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: VIZ.text }}>
                      {row.company_name}
                      {row.full_name && (
                        <span className="block text-xs font-normal" style={{ color: VIZ.lightText }}>
                          {row.full_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                      {row.group_name || '-'}
                    </td>
                    <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                      {row.bu || '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: VIZ.primary }}>
                      {userCounts[row.company_id] || 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setForm({ ...row, isNew: false })}
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
        )}
      </Card>

      <Modal
        open={form !== null}
        title={form?.isNew ? 'เพิ่มบริษัท' : `แก้ไข ${form?.company_name || ''}`}
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
            <Field
              label="รหัสบริษัท (company_id)"
              hint={form.isNew ? 'ใช้ได้เฉพาะ a-z, 0-9, - และ _' : 'แก้ไขไม่ได้หลังสร้างแล้ว'}
            >
              <input
                className={inputClass}
                value={form.company_id}
                disabled={!form.isNew}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              />
            </Field>
            <Field label="ชื่อบริษัท">
              <input
                className={inputClass}
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </Field>
            <Field label="ชื่อเต็ม">
              <input
                className={inputClass}
                value={form.full_name || ''}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="กลุ่ม">
                <input
                  className={inputClass}
                  value={form.group_name || ''}
                  onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                />
              </Field>
              <Field label="BU">
                <input
                  className={inputClass}
                  value={form.bu || ''}
                  onChange={(e) => setForm({ ...form, bu: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Google Sheet ID" hint="ใช้โดยระบบนำเข้าข้อมูลเดิม">
              <input
                className={inputClass}
                value={form.sheet_id || ''}
                onChange={(e) => setForm({ ...form, sheet_id: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="ชีต Safety">
                <input
                  className={inputClass}
                  value={form.safety_sheet || ''}
                  onChange={(e) => setForm({ ...form, safety_sheet: e.target.value })}
                />
              </Field>
              <Field label="ชีต Environment">
                <input
                  className={inputClass}
                  value={form.envi_sheet || ''}
                  onChange={(e) => setForm({ ...form, envi_sheet: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ยืนยันการลบบริษัท"
        message={`ต้องการลบ "${pendingDelete?.company_name}" (${pendingDelete?.company_id}) ใช่หรือไม่ ระบบจะปฏิเสธถ้ายังมีผู้ใช้ผูกอยู่`}
        confirmLabel="ลบบริษัท"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

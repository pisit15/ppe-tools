'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { CompanyPicker, type CompanyOption } from '@/components/superadmin/CompanyPicker';
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
  inputClass,
  saFetch,
  useToast,
} from '@/components/superadmin/ui';

type Person = {
  id: string;
  company_id: string;
  bu: string | null;
  full_name: string;
  nick_name: string | null;
  position: string | null;
  responsibility: string | null;
  department: string | null;
  employment_type: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_she_team: boolean;
};

type FormState = Omit<Person, 'id'> & { id?: string };

const EMPLOYMENT_TYPES = [
  { value: 'permanent', label: 'พนักงานประจำ' },
  { value: 'contract', label: 'สัญญาจ้าง' },
  { value: 'outsource', label: 'จ้างเหมา / Outsource' },
];

const EMPTY: FormState = {
  company_id: '',
  bu: '',
  full_name: '',
  nick_name: '',
  position: '',
  responsibility: '',
  department: '',
  employment_type: 'permanent',
  phone: '',
  email: '',
  is_active: true,
  is_she_team: true,
};

const PAGE_SIZE = 30;

export default function TeamPersonnelPage() {
  const { toast, setToast, success, error } = useToast();

  const [rows, setRows] = useState<Person[]>([]);
  const [licenseCounts, setLicenseCounts] = useState<Record<string, { total: number; held: number }>>({});
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [sheTeamOnly, setSheTeamOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (companyFilter !== 'all') params.set('company_id', companyFilter);
      if (sheTeamOnly) params.set('she_team_only', '1');
      const data = await saFetch<{
        data: Person[];
        licenseCounts: Record<string, { total: number; held: number }>;
      }>(`/api/superadmin/team/personnel?${params}`);
      setRows(data.data);
      setLicenseCounts(data.licenseCounts);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyFilter, error, sheTeamOnly]);

  useEffect(() => {
    saFetch<{ data: CompanyOption[] }>('/api/superadmin/companies')
      .then((data) => setCompanies(data.data))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter changes reset paging from the handler, not from an effect.
  const changeCompany = (next: string) => {
    setCompanyFilter(next);
    setPage(1);
    setLoading(true);
  };

  const toggleSheTeamOnly = () => {
    setSheTeamOnly((prev) => !prev);
    setPage(1);
    setLoading(true);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.full_name, row.nick_name, row.position, row.department, row.bu, row.email, row.company_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [rows, search]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const isEdit = form.id !== undefined;
      await saFetch('/api/superadmin/team/personnel', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      });
      success(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มบุคลากรแล้ว');
      setForm(null);
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (row: Person, field: 'is_active' | 'is_she_team') => {
    try {
      await saFetch('/api/superadmin/team/personnel', {
        method: 'PATCH',
        body: JSON.stringify({ id: row.id, [field]: !row[field] }),
      });
      load();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const query = `id=${pendingDelete.id}${forceDelete ? '&force=1' : ''}`;
      await saFetch(`/api/superadmin/team/personnel?${query}`, { method: 'DELETE' });
      success('ลบบุคลากรแล้ว');
      setPendingDelete(null);
      setForceDelete(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      error(message);
      // The API refuses the first attempt when licences would be deleted too;
      // keep the dialog open so the next confirm can force it.
      if (message.includes('ใบอนุญาต')) setForceDelete(true);
      else setPendingDelete(null);
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="บุคลากร SHE"
        description="ข้อมูลชุดเดียวกับหน้า SHE Workforce บน tools.eashe.org — ที่นี่แก้ไขข้ามบริษัทได้"
        actions={
          <Button onClick={() => setForm({ ...EMPTY, company_id: companyFilter === 'all' ? '' : companyFilter })}>
            <Plus size={15} className="mr-1 inline" />
            เพิ่มบุคลากร
          </Button>
        }
      />

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <SearchInput value={search} onChange={changeSearch} placeholder="ค้นหาชื่อ / ตำแหน่ง / แผนก" />
          </div>
          <CompanyPicker companies={companies} value={companyFilter} onChange={changeCompany} allowAll />
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm" style={{ color: VIZ.text }}>
          <input type="checkbox" checked={sheTeamOnly} onChange={toggleSheTeamOnly} />
          แสดงเฉพาะคนที่อยู่ในทีม SHE
        </label>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState message="ไม่พบบุคลากรตามเงื่อนไขที่เลือก" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">บริษัท</th>
                    <th className="px-4 py-3 text-left font-semibold">ชื่อ</th>
                    <th className="px-4 py-3 text-left font-semibold">ตำแหน่ง</th>
                    <th className="px-4 py-3 text-left font-semibold">BU / แผนก</th>
                    <th className="px-4 py-3 text-left font-semibold">ใบอนุญาต</th>
                    <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                    <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((row) => {
                    const counts = licenseCounts[row.id];
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: VIZ.lightText }}>
                          {row.company_id}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium" style={{ color: VIZ.text }}>
                            {row.full_name}
                          </span>
                          {row.nick_name && (
                            <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>
                              ({row.nick_name})
                            </span>
                          )}
                          {row.email && (
                            <span className="block text-xs" style={{ color: VIZ.lightText }}>
                              {row.email}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.text }}>
                          {row.position || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                          {row.bu || '-'}
                          {row.department ? ` · ${row.department}` : ''}
                        </td>
                        <td className="px-4 py-3">
                          {counts ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs"
                              style={{ color: counts.held > 0 ? VIZ.positive : VIZ.lightText }}
                            >
                              <BadgeCheck size={13} />
                              {counts.held}/{counts.total}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: VIZ.lightText }}>
                              -
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => toggleField(row, 'is_active')} title="คลิกเพื่อสลับ">
                              <Badge color={row.is_active ? VIZ.positive : VIZ.neutral}>
                                {row.is_active ? 'ทำงานอยู่' : 'พ้นสภาพ'}
                              </Badge>
                            </button>
                            <button onClick={() => toggleField(row, 'is_she_team')} title="คลิกเพื่อสลับ">
                              <Badge color={row.is_she_team ? VIZ.primary : VIZ.neutral}>
                                {row.is_she_team ? 'ทีม SHE' : 'ไม่อยู่ในทีม'}
                              </Badge>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setForm({ ...row })}
                              className="rounded-md p-1.5 hover:bg-gray-100"
                              title="แก้ไข"
                            >
                              <Pencil size={15} style={{ color: VIZ.primary }} />
                            </button>
                            <button
                              onClick={() => {
                                setPendingDelete(row);
                                setForceDelete(false);
                              }}
                              className="rounded-md p-1.5 hover:bg-gray-100"
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

            <div className="mt-4 flex items-center justify-between text-sm" style={{ color: VIZ.lightText }}>
              <span>
                {filtered.length.toLocaleString('th-TH')} คน · หน้า {page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
        title={form?.id !== undefined ? 'แก้ไขบุคลากร' : 'เพิ่มบุคลากร'}
        onClose={() => setForm(null)}
        width="max-w-2xl"
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
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="บริษัท">
                <CompanyPicker
                  companies={companies}
                  value={form.company_id}
                  onChange={(value) => setForm({ ...form, company_id: value })}
                />
              </Field>
              <Field label="BU">
                <input
                  className={inputClass}
                  value={form.bu || ''}
                  onChange={(e) => setForm({ ...form, bu: e.target.value })}
                />
              </Field>
              <Field label="ชื่อ-นามสกุล">
                <input
                  className={inputClass}
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </Field>
              <Field label="ชื่อเล่น">
                <input
                  className={inputClass}
                  value={form.nick_name || ''}
                  onChange={(e) => setForm({ ...form, nick_name: e.target.value })}
                />
              </Field>
              <Field label="ตำแหน่ง">
                <input
                  className={inputClass}
                  value={form.position || ''}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                />
              </Field>
              <Field label="แผนก">
                <input
                  className={inputClass}
                  value={form.department || ''}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </Field>
              <Field label="ประเภทการจ้าง">
                <select
                  className={inputClass}
                  value={form.employment_type || 'permanent'}
                  onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                >
                  {EMPLOYMENT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="เบอร์โทร">
                <input
                  className={inputClass}
                  value={form.phone || ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="อีเมล">
                <input
                  className={inputClass}
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
            </div>

            <Field label="ความรับผิดชอบ">
              <textarea
                className={`${inputClass} min-h-20`}
                value={form.responsibility || ''}
                onChange={(e) => setForm({ ...form, responsibility: e.target.value })}
              />
            </Field>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm" style={{ color: VIZ.text }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                ยังทำงานอยู่
              </label>
              <label className="flex items-center gap-2 text-sm" style={{ color: VIZ.text }}>
                <input
                  type="checkbox"
                  checked={form.is_she_team}
                  onChange={(e) => setForm({ ...form, is_she_team: e.target.checked })}
                />
                อยู่ในทีม SHE
              </label>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ยืนยันการลบบุคลากร"
        message={
          forceDelete
            ? `"${pendingDelete?.full_name}" มีข้อมูลใบอนุญาตผูกอยู่ ถ้ายืนยันอีกครั้ง ใบอนุญาตทั้งหมดของคนนี้จะถูกลบไปด้วย`
            : `ต้องการลบ "${pendingDelete?.full_name}" ใช่หรือไม่`
        }
        confirmLabel={forceDelete ? 'ลบพร้อมใบอนุญาต' : 'ลบบุคลากร'}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null);
          setForceDelete(false);
        }}
      />
    </>
  );
}

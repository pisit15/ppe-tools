'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  CompanyPicker,
  SearchablePicker,
  type CompanyOption,
} from '@/components/superadmin/CompanyPicker';
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

type Kind = 'legal' | 'certificate';

const SOON_DAYS = 90;

type LegalRow = {
  id: string;
  personnel_id: string;
  requirement_type_id: string;
  has_license: boolean;
  license_no: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  she_personnel: {
    id: string;
    full_name: string;
    nick_name: string | null;
    company_id: string;
    position: string | null;
  } | null;
  legal_requirement_types: {
    id: string;
    name: string;
    short_name: string | null;
    category: string | null;
    is_required: boolean;
  } | null;
};

type CertRow = {
  id: string;
  company_id: string;
  employee_id: string;
  emp_code: string | null;
  certificate_name: string;
  issued_date: string | null;
  expiry_date: string | null;
  no_expiry: boolean;
  certificate_number: string | null;
  issuer: string | null;
  notes: string | null;
  company_employees: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    emp_code: string | null;
    department: string | null;
    position: string | null;
  } | null;
};

type References = {
  requirementTypes: {
    id: string;
    company_id: string;
    name: string;
    short_name: string | null;
    category: string | null;
  }[];
  personnel: {
    id: string;
    company_id: string;
    full_name: string;
    nick_name: string | null;
    position: string | null;
  }[];
  employees: {
    id: string;
    company_id: string;
    emp_code: string | null;
    first_name: string | null;
    last_name: string | null;
    department: string | null;
  }[];
  companies: CompanyOption[];
};

type LegalForm = {
  id?: string;
  personnel_id: string;
  requirement_type_id: string;
  has_license: boolean;
  license_no: string;
  issue_date: string;
  expiry_date: string;
  notes: string;
};

type CertForm = {
  id?: string;
  company_id: string;
  employee_id: string;
  emp_code: string;
  certificate_name: string;
  certificate_number: string;
  issuer: string;
  issued_date: string;
  expiry_date: string;
  no_expiry: boolean;
  notes: string;
};

const EMPTY_LEGAL: LegalForm = {
  personnel_id: '',
  requirement_type_id: '',
  has_license: true,
  license_no: '',
  issue_date: '',
  expiry_date: '',
  notes: '',
};

const EMPTY_CERT: CertForm = {
  company_id: '',
  employee_id: '',
  emp_code: '',
  certificate_name: '',
  certificate_number: '',
  issuer: '',
  issued_date: '',
  expiry_date: '',
  no_expiry: false,
  notes: '',
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function ExpiryBadge({ date, noExpiry }: { date: string | null; noExpiry?: boolean }) {
  if (noExpiry) return <Badge color={VIZ.neutral}>ไม่มีวันหมดอายุ</Badge>;
  const days = daysUntil(date);
  if (days === null) return <Badge color={VIZ.secondary}>ยังไม่ระบุวันหมดอายุ</Badge>;
  if (days < 0) return <Badge color={VIZ.accent}>หมดอายุแล้ว {Math.abs(days)} วัน</Badge>;
  if (days <= SOON_DAYS) return <Badge color={VIZ.secondary}>อีก {days} วัน</Badge>;
  return <Badge color={VIZ.positive}>ปกติ</Badge>;
}

export default function TeamLicensesPage() {
  const { toast, setToast, success, error } = useToast();

  const [kind, setKind] = useState<Kind>('legal');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [legalRows, setLegalRows] = useState<LegalRow[]>([]);
  const [certRows, setCertRows] = useState<CertRow[]>([]);
  const [refs, setRefs] = useState<References | null>(null);

  const [legalForm, setLegalForm] = useState<LegalForm | null>(null);
  const [certForm, setCertForm] = useState<CertForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ kind });
      if (companyFilter !== 'all') params.set('company_id', companyFilter);
      const data = await saFetch<{ kind: Kind; data: LegalRow[] | CertRow[] }>(
        `/api/superadmin/team/licenses?${params}`
      );
      if (kind === 'legal') setLegalRows(data.data as LegalRow[]);
      else setCertRows(data.data as CertRow[]);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [companyFilter, error, kind]);

  useEffect(() => {
    saFetch<References>('/api/superadmin/team/references')
      .then(setRefs)
      .catch(() => setRefs(null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeKind = (next: Kind) => {
    setKind(next);
    setSearch('');
    setLoading(true);
  };

  const changeCompany = (next: string) => {
    setCompanyFilter(next);
    setLoading(true);
  };

  const filteredLegal = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return legalRows;
    return legalRows.filter((row) =>
      [
        row.she_personnel?.full_name,
        row.she_personnel?.company_id,
        row.legal_requirement_types?.name,
        row.legal_requirement_types?.short_name,
        row.license_no,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [legalRows, search]);

  const filteredCerts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return certRows;
    return certRows.filter((row) =>
      [
        row.certificate_name,
        row.certificate_number,
        row.issuer,
        row.emp_code,
        row.company_id,
        row.company_employees?.first_name,
        row.company_employees?.last_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [certRows, search]);

  const personnelOptions = useMemo(
    () =>
      (refs?.personnel || [])
        .filter((p) => companyFilter === 'all' || p.company_id === companyFilter)
        .map((p) => ({
          value: p.id,
          label: p.nick_name ? `${p.full_name} (${p.nick_name})` : p.full_name,
          hint: `${p.company_id}${p.position ? ` · ${p.position}` : ''}`,
        })),
    [companyFilter, refs]
  );

  const typeOptionsFor = useCallback(
    (personnelId: string) => {
      const person = (refs?.personnel || []).find((p) => p.id === personnelId);
      const scope = person?.company_id;
      return (refs?.requirementTypes || [])
        .filter((t) => !scope || t.company_id === scope)
        .map((t) => ({
          value: t.id,
          label: t.short_name || t.name,
          hint: t.category === 'safety' ? 'ความปลอดภัย' : 'สิ่งแวดล้อม',
        }));
    },
    [refs]
  );

  const employeeOptions = useMemo(
    () =>
      (refs?.employees || [])
        .filter((e) => companyFilter === 'all' || e.company_id === companyFilter)
        .map((e) => ({
          value: e.id,
          label: `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.emp_code || e.id,
          hint: `${e.company_id}${e.emp_code ? ` · ${e.emp_code}` : ''}`,
        })),
    [companyFilter, refs]
  );

  const save = async () => {
    const payload = kind === 'legal' ? legalForm : certForm;
    if (!payload) return;
    setSaving(true);
    try {
      const isEdit = payload.id !== undefined;
      await saFetch(`/api/superadmin/team/licenses?kind=${kind}`, {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      success(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการแล้ว');
      setLegalForm(null);
      setCertForm(null);
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
      await saFetch(`/api/superadmin/team/licenses?kind=${kind}&id=${pendingDelete.id}`, {
        method: 'DELETE',
      });
      success('ลบรายการแล้ว');
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setPendingDelete(null);
    }
  };

  const openCreate = () => {
    if (kind === 'legal') {
      setLegalForm({ ...EMPTY_LEGAL });
    } else {
      setCertForm({ ...EMPTY_CERT, company_id: companyFilter === 'all' ? '' : companyFilter });
    }
  };

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="ใบอนุญาต / ใบรับรอง"
        description={`ติดตามวันหมดอายุ — รายการที่เหลือไม่ถึง ${SOON_DAYS} วันจะถูกทำเครื่องหมายไว้`}
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} className="mr-1 inline" />
            เพิ่มรายการ
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: 'legal', label: 'ใบอนุญาตตามกฎหมาย' },
            { key: 'certificate', label: 'ใบรับรองพนักงาน' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => changeKind(tab.key)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={
              kind === tab.key
                ? { backgroundColor: VIZ.primary, color: '#fff' }
                : { backgroundColor: '#fff', color: VIZ.lightText, border: `1px solid ${VIZ.muted}` }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อคน / ชื่อใบ / เลขที่" />
          </div>
          <CompanyPicker
            companies={refs?.companies || []}
            value={companyFilter}
            onChange={changeCompany}
            allowAll
          />
        </div>

        {loading ? (
          <Spinner />
        ) : kind === 'legal' ? (
          filteredLegal.length === 0 ? (
            <EmptyState message="ไม่พบใบอนุญาตตามเงื่อนไขที่เลือก" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">บุคลากร</th>
                    <th className="px-4 py-3 text-left font-semibold">ประเภทใบอนุญาต</th>
                    <th className="px-4 py-3 text-left font-semibold">เลขที่</th>
                    <th className="px-4 py-3 text-left font-semibold">หมดอายุ</th>
                    <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                    <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLegal.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium" style={{ color: VIZ.text }}>
                          {row.she_personnel?.full_name || '-'}
                        </span>
                        <span className="block font-mono text-xs" style={{ color: VIZ.lightText }}>
                          {row.she_personnel?.company_id || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: VIZ.text }}>
                        {row.legal_requirement_types?.short_name ||
                          row.legal_requirement_types?.name ||
                          '-'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                        {row.license_no || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                        {row.expiry_date || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge color={row.has_license ? VIZ.positive : VIZ.accent}>
                            {row.has_license ? 'มีใบอนุญาต' : 'ยังไม่มี'}
                          </Badge>
                          {row.has_license && <ExpiryBadge date={row.expiry_date} />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() =>
                              setLegalForm({
                                id: row.id,
                                personnel_id: row.personnel_id,
                                requirement_type_id: row.requirement_type_id,
                                has_license: row.has_license,
                                license_no: row.license_no || '',
                                issue_date: row.issue_date || '',
                                expiry_date: row.expiry_date || '',
                                notes: row.notes || '',
                              })
                            }
                            className="rounded-md p-1.5 hover:bg-gray-100"
                            title="แก้ไข"
                          >
                            <Pencil size={15} style={{ color: VIZ.primary }} />
                          </button>
                          <button
                            onClick={() =>
                              setPendingDelete({
                                id: row.id,
                                label: `${row.she_personnel?.full_name || ''} · ${
                                  row.legal_requirement_types?.short_name || ''
                                }`,
                              })
                            }
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
          )
        ) : filteredCerts.length === 0 ? (
          <EmptyState message="ไม่พบใบรับรองตามเงื่อนไขที่เลือก" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">พนักงาน</th>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อใบรับรอง</th>
                  <th className="px-4 py-3 text-left font-semibold">ผู้ออก</th>
                  <th className="px-4 py-3 text-left font-semibold">หมดอายุ</th>
                  <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                  <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCerts.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium" style={{ color: VIZ.text }}>
                        {`${row.company_employees?.first_name || ''} ${
                          row.company_employees?.last_name || ''
                        }`.trim() || row.emp_code || '-'}
                      </span>
                      <span className="block font-mono text-xs" style={{ color: VIZ.lightText }}>
                        {row.company_id}
                        {row.emp_code ? ` · ${row.emp_code}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: VIZ.text }}>
                      {row.certificate_name}
                      {row.certificate_number && (
                        <span className="block text-xs" style={{ color: VIZ.lightText }}>
                          {row.certificate_number}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                      {row.issuer || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                      {row.no_expiry ? '-' : row.expiry_date || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <ExpiryBadge date={row.expiry_date} noExpiry={row.no_expiry} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() =>
                            setCertForm({
                              id: row.id,
                              company_id: row.company_id,
                              employee_id: row.employee_id,
                              emp_code: row.emp_code || '',
                              certificate_name: row.certificate_name,
                              certificate_number: row.certificate_number || '',
                              issuer: row.issuer || '',
                              issued_date: row.issued_date || '',
                              expiry_date: row.expiry_date || '',
                              no_expiry: row.no_expiry,
                              notes: row.notes || '',
                            })
                          }
                          className="rounded-md p-1.5 hover:bg-gray-100"
                          title="แก้ไข"
                        >
                          <Pencil size={15} style={{ color: VIZ.primary }} />
                        </button>
                        <button
                          onClick={() =>
                            setPendingDelete({ id: row.id, label: row.certificate_name })
                          }
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

      {/* ---- legal licence form ---- */}
      <Modal
        open={legalForm !== null}
        title={legalForm?.id ? 'แก้ไขใบอนุญาต' : 'เพิ่มใบอนุญาตตามกฎหมาย'}
        onClose={() => setLegalForm(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLegalForm(null)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </>
        }
      >
        {legalForm && (
          <div className="space-y-4">
            <Field label="บุคลากร">
              <SearchablePicker
                options={personnelOptions}
                value={legalForm.personnel_id}
                onChange={(value) =>
                  setLegalForm({ ...legalForm, personnel_id: value, requirement_type_id: '' })
                }
                placeholder="เลือกบุคลากร"
              />
            </Field>
            <Field
              label="ประเภทใบอนุญาต"
              hint={legalForm.personnel_id ? undefined : 'เลือกบุคลากรก่อน เพื่อกรองตามบริษัท'}
            >
              <SearchablePicker
                options={typeOptionsFor(legalForm.personnel_id)}
                value={legalForm.requirement_type_id}
                onChange={(value) => setLegalForm({ ...legalForm, requirement_type_id: value })}
                placeholder="เลือกประเภท"
                emptyText="บริษัทนี้ยังไม่ได้กำหนดตำแหน่งตามกฎหมาย"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm" style={{ color: VIZ.text }}>
              <input
                type="checkbox"
                checked={legalForm.has_license}
                onChange={(e) => setLegalForm({ ...legalForm, has_license: e.target.checked })}
              />
              มีใบอนุญาตแล้ว
            </label>
            <Field label="เลขที่ใบอนุญาต">
              <input
                className={inputClass}
                value={legalForm.license_no}
                onChange={(e) => setLegalForm({ ...legalForm, license_no: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="วันที่ออก">
                <input
                  type="date"
                  className={inputClass}
                  value={legalForm.issue_date}
                  onChange={(e) => setLegalForm({ ...legalForm, issue_date: e.target.value })}
                />
              </Field>
              <Field label="วันหมดอายุ" hint="เว้นว่างถ้าใบนี้ไม่มีวันหมดอายุ">
                <input
                  type="date"
                  className={inputClass}
                  value={legalForm.expiry_date}
                  onChange={(e) => setLegalForm({ ...legalForm, expiry_date: e.target.value })}
                />
              </Field>
            </div>
            <Field label="หมายเหตุ">
              <textarea
                className={`${inputClass} min-h-20`}
                value={legalForm.notes}
                onChange={(e) => setLegalForm({ ...legalForm, notes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---- employee certificate form ---- */}
      <Modal
        open={certForm !== null}
        title={certForm?.id ? 'แก้ไขใบรับรอง' : 'เพิ่มใบรับรองพนักงาน'}
        onClose={() => setCertForm(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCertForm(null)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </>
        }
      >
        {certForm && (
          <div className="space-y-4">
            <Field label="บริษัท">
              <CompanyPicker
                companies={refs?.companies || []}
                value={certForm.company_id}
                onChange={(value) =>
                  setCertForm({ ...certForm, company_id: value, employee_id: '', emp_code: '' })
                }
              />
            </Field>
            <Field label="พนักงาน">
              <SearchablePicker
                options={employeeOptions.filter(
                  (option) => !certForm.company_id || option.hint?.startsWith(certForm.company_id)
                )}
                value={certForm.employee_id}
                onChange={(value) => {
                  const employee = (refs?.employees || []).find((e) => e.id === value);
                  setCertForm({
                    ...certForm,
                    employee_id: value,
                    emp_code: employee?.emp_code || '',
                    company_id: employee?.company_id || certForm.company_id,
                  });
                }}
                placeholder="เลือกพนักงาน"
                emptyText="ไม่พบพนักงานในบริษัทนี้"
              />
            </Field>
            <Field label="ชื่อใบรับรอง">
              <input
                className={inputClass}
                value={certForm.certificate_name}
                onChange={(e) => setCertForm({ ...certForm, certificate_name: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="เลขที่">
                <input
                  className={inputClass}
                  value={certForm.certificate_number}
                  onChange={(e) =>
                    setCertForm({ ...certForm, certificate_number: e.target.value })
                  }
                />
              </Field>
              <Field label="ผู้ออกใบรับรอง">
                <input
                  className={inputClass}
                  value={certForm.issuer}
                  onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })}
                />
              </Field>
              <Field label="วันที่ออก">
                <input
                  type="date"
                  className={inputClass}
                  value={certForm.issued_date}
                  onChange={(e) => setCertForm({ ...certForm, issued_date: e.target.value })}
                />
              </Field>
              <Field label="วันหมดอายุ">
                <input
                  type="date"
                  className={inputClass}
                  value={certForm.expiry_date}
                  disabled={certForm.no_expiry}
                  onChange={(e) => setCertForm({ ...certForm, expiry_date: e.target.value })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: VIZ.text }}>
              <input
                type="checkbox"
                checked={certForm.no_expiry}
                onChange={(e) =>
                  setCertForm({
                    ...certForm,
                    no_expiry: e.target.checked,
                    expiry_date: e.target.checked ? '' : certForm.expiry_date,
                  })
                }
              />
              ใบรับรองนี้ไม่มีวันหมดอายุ
            </label>
            <Field label="หมายเหตุ">
              <textarea
                className={`${inputClass} min-h-20`}
                value={certForm.notes}
                onChange={(e) => setCertForm({ ...certForm, notes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="ยืนยันการลบรายการ"
        message={`ต้องการลบ "${pendingDelete?.label}" ใช่หรือไม่`}
        confirmLabel="ลบรายการ"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

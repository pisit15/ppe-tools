'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Search, Plus, Users, Building2, X, Settings2, Pencil, History, UserRoundX, UserRoundCheck } from 'lucide-react';
import type { PPEEmployee, PPEEmployeeChange, PPEEmployeeImpact, PPEDepartment } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/constants';

const VIZ = { primary: '#4E79A7', secondary: '#F28E2B', accent: '#E15759', positive: '#59A14F', neutral: '#BAB0AC', text: '#333333', lightText: '#666666' };
const input = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-blue-500';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const statusOptions = [{ value: 'active', label: 'กำลังใช้งาน' }, { value: 'inactive', label: 'ปิดใช้งาน' }, { value: 'all', label: 'ทั้งหมด' }] as const;
type Status = typeof statusOptions[number]['value'];
const deptLabels = Object.fromEntries(DEPARTMENTS.map(d => [d.value, d.label]));
const deptLabel = (name: string | null) => name ? deptLabels[name] || name : 'ไม่ระบุแผนก';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่';
async function requestData<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const result = await response.json() as { data: T; error?: string };
  if (!response.ok) throw new Error(result.error || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
  return result.data;
}
const employeeUrl = (employee: PPEEmployee, view: string) => `/api/ppe/employees?company_id=${encodeURIComponent(employee.company_id)}&id=${employee.id}&view=${view}`;

function Dialog({ title, busy = false, children, onClose }: { title: string; busy?: boolean; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40">
    <header className="flex items-start justify-between gap-4 border-b border-gray-100 p-5"><h2 id={titleId} className="text-lg font-bold">{title}</h2><button type="button" aria-label="ปิดหน้าต่าง" disabled={busy} onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X size={20} /></button></header>
    <div className="space-y-4 p-5">{children}</div>
  </dialog>;
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const company = user?.role === 'admin' ? params.get('company_id') || 'all' : user?.companyId || '';
  if (!company) return <p role="status">กำลังโหลดข้อมูลผู้ใช้งาน…</p>;
  return <EmployeeDirectory key={company} company={company} />;
}

function EmployeeDirectory({ company }: { company: string }) {
  const [employees, setEmployees] = useState<PPEEmployee[]>([]);
  const [status, setStatus] = useState<Status>('active');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<PPEEmployee | 'new' | null>(null);
  const [statusEmployee, setStatusEmployee] = useState<PPEEmployee | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<PPEEmployee | null>(null);
  const [showDepartments, setShowDepartments] = useState(false);
  const key = `${company}:${status}:${reload}`;
  const loading = key !== loadedKey;
  const canCreate = company !== 'all' && company !== 'admin';
  useEffect(() => {
    const controller = new AbortController();
    requestData<PPEEmployee[]>(`/api/ppe/employees?company_id=${encodeURIComponent(company)}&status=${status}`, { signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) { setEmployees(rows); setError(''); setLoadedKey(key); } })
      .catch(e => { if (!controller.signal.aborted) { setEmployees([]); setError(errorMessage(e)); setLoadedKey(key); } });
    return () => controller.abort();
  }, [company, status, key]);
  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const employee of employees) if (employee.department) counts.set(employee.department, (counts.get(employee.department) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
  }, [employees]);
  const filtered = employees.filter(e => (!department || e.department === department) && [e.name, e.employee_code, e.department, e.position, e.company_id].join(' ').toLocaleLowerCase('th').includes(search.toLocaleLowerCase('th')));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 30, currentPage * 30);
  const refresh = () => setReload(n => n + 1);
  const saved = (text: string) => { setMessage(text); setEditor(null); setStatusEmployee(null); refresh(); };
  return <div className="min-w-0 space-y-5 text-gray-900">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="rounded-xl p-3" style={{ backgroundColor: `${VIZ.primary}15`, color: VIZ.primary }}><Users size={25} /></div><div><h1 className="text-2xl font-bold">พนักงาน</h1><p className="mt-1 text-sm text-gray-500">แก้ไขรายชื่อปัจจุบัน โดยเก็บประวัติการเบิกเดิมไว้</p></div></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={!canCreate} onClick={() => setShowDepartments(true)}><Settings2 size={17} />จัดการแผนก</button><button className={primary} style={{ backgroundColor: VIZ.primary }} disabled={!canCreate} onClick={() => { setMessage(''); setEditor('new'); }}><Plus size={18} />เพิ่มพนักงาน</button></div>
    </header>
    {!canCreate && <p className="text-sm text-gray-500">เลือกบริษัทด้านซ้ายก่อนเพิ่มพนักงานหรือจัดการแผนก ส่วนรายชื่อเดิมแก้ไขได้ตามบริษัทที่แสดงในแต่ละรายการ</p>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    <div className="flex flex-wrap gap-2" aria-label="กรองสถานะพนักงาน">{statusOptions.map(option => <button key={option.value} aria-pressed={status === option.value} onClick={() => { setStatus(option.value); setDepartment(''); setPage(1); }} className={button} style={status === option.value ? { color: VIZ.primary, borderColor: VIZ.primary, backgroundColor: `${VIZ.primary}10` } : undefined}>{option.label}</button>)}</div>
    {!loading && !error && departments.length > 0 && <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{departments.map(([name, count]) => <button key={name} aria-pressed={department === name} className="min-w-0 rounded-xl border bg-white p-3 text-left text-sm" style={{ borderColor: department === name ? VIZ.primary : '#eeeeee' }} onClick={() => { setDepartment(current => current === name ? '' : name); setPage(1); }}><span className="mb-1 flex items-center gap-2 text-gray-500"><Building2 size={16} />{count} คน</span><span className="break-words">{deptLabel(name)}</span></button>)}</div>}
    <div className="relative"><Search aria-hidden="true" size={19} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input aria-label="ค้นหาพนักงาน" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="ค้นหาชื่อ รหัสพนักงาน หรือแผนก" className={`${input} mt-0 pl-10`} /></div>
    {department && <button className="text-sm underline" style={{ color: VIZ.primary }} onClick={() => { setDepartment(''); setPage(1); }}>ล้างตัวกรองแผนก: {deptLabel(department)}</button>}
    {loading ? <p role="status" className="p-8 text-center text-gray-500">กำลังโหลดรายชื่อ…</p> : error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800"><p>{error}</p><button className={`${button} mt-3`} onClick={refresh}>ลองใหม่</button></div> : <>
      <p className="text-sm text-gray-500">แสดง {filtered.length} จาก {employees.length} คน · {statusOptions.find(s => s.value === status)?.label}</p>
      <table className="block w-full table-fixed rounded-xl border border-gray-100 bg-white text-sm lg:table">
        <thead className="hidden border-b bg-gray-50 lg:table-header-group"><tr><th className="w-[26%] p-4 text-left">พนักงาน</th><th className="w-[16%] p-4 text-left">รหัส / ตำแหน่ง</th><th className="w-[24%] p-4 text-left">แผนก</th><th className="w-[34%] p-4 text-left">จัดการ</th></tr></thead>
        <tbody className="block lg:table-row-group">{visible.map(employee => <tr key={employee.id} className="grid min-w-0 grid-cols-2 gap-x-3 border-b border-gray-100 p-4 last:border-b-0 lg:table-row lg:p-0">
          <td className="col-span-2 min-w-0 pb-3 align-top lg:p-4"><span className="block break-words font-semibold">{employee.name}</span><span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs ${employee.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{employee.is_active ? 'กำลังใช้งาน' : 'ปิดใช้งาน'}</span>{!canCreate && <span className="ml-2 text-xs font-semibold text-gray-500">{employee.company_id.toUpperCase()}</span>}</td>
          <td className="min-w-0 pb-3 align-top lg:p-4"><span className="block text-xs text-gray-400 lg:hidden">รหัส / ตำแหน่ง</span><span className="block break-all">{employee.employee_code}</span><span className="mt-1 block break-words text-gray-500">{employee.position || 'ไม่ระบุตำแหน่ง'}</span></td>
          <td className="min-w-0 pb-3 align-top lg:p-4"><span className="block text-xs text-gray-400 lg:hidden">แผนก</span><span className="break-words">{deptLabel(employee.department)}</span></td>
          <td className="col-span-2 align-top lg:p-4"><div className="flex flex-wrap gap-2"><button className={button} aria-label={`แก้ไข ${employee.name}`} onClick={() => setEditor(employee)}><Pencil size={15} />แก้ไข</button><button className={button} aria-label={`${employee.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} ${employee.name}`} onClick={() => setStatusEmployee(employee)}>{employee.is_active ? <UserRoundX size={15} /> : <UserRoundCheck size={15} />}{employee.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button><button className={button} aria-label={`ประวัติการแก้ไข ${employee.name}`} onClick={() => setHistoryEmployee(employee)}><History size={15} />ประวัติแก้ไข</button></div></td>
        </tr>)}{filtered.length === 0 && <tr className="block lg:table-row"><td colSpan={4} className="block p-8 text-center text-gray-500 lg:table-cell">ไม่พบพนักงานตามตัวกรองที่เลือก</td></tr>}</tbody>
      </table>
      {filtered.length > 0 && <nav aria-label="หน้ารายชื่อพนักงาน" className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500"><span>รายการ {(currentPage - 1) * 30 + 1}–{Math.min(currentPage * 30, filtered.length)} จาก {filtered.length} คน · หน้า {currentPage}/{pages}</span><div className="flex gap-2"><button className={button} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button><button className={button} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>ถัดไป</button></div></nav>}
    </>}
    {editor && <EmployeeEditor employee={editor === 'new' ? null : editor} company={editor === 'new' ? company : editor.company_id} onClose={() => setEditor(null)} onSaved={saved} onRefresh={refresh} />}
    {statusEmployee && <EmployeeStatus employee={statusEmployee} onClose={() => setStatusEmployee(null)} onSaved={saved} onRefresh={refresh} />}
    {historyEmployee && <EmployeeHistory employee={historyEmployee} onClose={() => setHistoryEmployee(null)} />}
    {showDepartments && <DepartmentManager company={company} onClose={() => setShowDepartments(false)} onChanged={refresh} />}
  </div>;
}

function EmployeeEditor({ employee, company, onClose, onSaved, onRefresh }: { employee: PPEEmployee | null; company: string; onClose: () => void; onSaved: (message: string) => void; onRefresh: () => void }) {
  const [form, setForm] = useState({ employee_code: employee?.employee_code || '', name: employee?.name || '', position: employee?.position || '', department: employee?.department || '' });
  const [departments, setDepartments] = useState<PPEDepartment[]>([]);
  const [departmentError, setDepartmentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listId = useId();
  useEffect(() => {
    const controller = new AbortController();
    requestData<PPEDepartment[]>(`/api/ppe/departments?company_id=${encodeURIComponent(company)}`, { signal: controller.signal }).then(rows => { if (!controller.signal.aborted) setDepartments(rows); }).catch(() => { if (!controller.signal.aborted) setDepartmentError(true); });
    return () => controller.abort();
  }, [company]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await requestData<PPEEmployee>('/api/ppe/employees', { method: employee ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, company_id: company, ...(employee ? { id: employee.id, expected_revision: employee.revision } : {}) }) });
      onSaved(employee ? 'บันทึกข้อมูลพนักงานแล้ว ประวัติการเบิกเดิมไม่เปลี่ยนแปลง' : 'เพิ่มพนักงานแล้ว');
    } catch (e) { setError(errorMessage(e)); onRefresh(); } finally { setBusy(false); }
  }
  return <Dialog title={employee ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงานใหม่'} busy={busy} onClose={onClose}>
    <p className="text-sm text-gray-500">บริษัท {company.toUpperCase()}</p>
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium">รหัสพนักงาน<input required readOnly={!!employee} maxLength={100} value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} className={`${input} read-only:bg-gray-100`} /></label>
      {employee && <p className="text-xs text-gray-500">รหัสพนักงานคงเดิมเพื่อรักษาการเชื่อมโยงกับประวัติ และไม่ใช้รหัสของพนักงานเก่าซ้ำกับบุคคลใหม่</p>}
      <label className="block text-sm font-medium">ชื่อ-นามสกุล<input required maxLength={150} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={input} /></label>
      <label className="block text-sm font-medium">ตำแหน่ง<input maxLength={150} value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} className={input} /></label>
      <label className="block text-sm font-medium">แผนก<input list={listId} maxLength={150} placeholder="เลือกหรือพิมพ์ชื่อแผนก" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className={input} /></label>
      <datalist id={listId}>{departments.map(dept => <option key={dept.id} value={dept.name} />)}</datalist>
      {departmentError && <p className="text-xs text-amber-700">โหลดตัวเลือกแผนกไม่สำเร็จ สามารถกรอกชื่อแผนกได้โดยตรง</p>}
      {employee && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">ข้อมูลใหม่ใช้กับรายชื่อปัจจุบันและการเลือกพนักงานครั้งต่อไป รายการเบิกเก่ายังคงชื่อและแผนก ณ วันที่บันทึก · บัญชีผู้ขอเบิกจัดการแยกจากรายชื่อพนักงาน</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className={primary} style={{ backgroundColor: VIZ.primary }}>{busy ? 'กำลังบันทึก…' : employee ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'}</button><button type="button" disabled={busy} onClick={onClose} className={button}>ยกเลิก</button></div>
    </form>
  </Dialog>;
}

function EmployeeStatus({ employee, onClose, onSaved, onRefresh }: { employee: PPEEmployee; onClose: () => void; onSaved: (message: string) => void; onRefresh: () => void }) {
  const [impact, setImpact] = useState<PPEEmployeeImpact | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const deactivating = employee.is_active;
  const currentEmployee = impact?.employee || employee;
  useEffect(() => {
    const controller = new AbortController();
    requestData<PPEEmployeeImpact>(employeeUrl(employee, 'impact'), { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setImpact(data); setError(''); } }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); });
    return () => controller.abort();
  }, [employee, retry]);
  async function save() {
    if (!impact) return;
    setBusy(true); setError('');
    try {
      await requestData<PPEEmployee>('/api/ppe/employees', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: employee.id, company_id: employee.company_id, is_active: !deactivating, expected_revision: impact.employee.revision }) });
      onSaved(deactivating ? 'ปิดใช้งานรายชื่อแล้ว ประวัติและรายการค้างยังคงอยู่ บัญชีผู้ขอเบิกไม่ได้ถูกปิดตาม' : 'เปิดใช้งานรายชื่อพนักงานแล้ว');
    } catch (e) { setError(errorMessage(e)); setImpact(null); onRefresh(); } finally { setBusy(false); }
  }
  return <Dialog title={deactivating ? 'ปิดใช้งานพนักงาน' : 'เปิดใช้งานพนักงาน'} busy={busy} onClose={onClose}>
    <p className="break-words font-semibold">{currentEmployee.name}</p><p className="text-sm text-gray-500">{currentEmployee.employee_code} · {employee.company_id.toUpperCase()} · {currentEmployee.is_active ? 'กำลังใช้งาน' : 'ปิดใช้งาน'}</p>
    {impact && impact.employee.revision !== employee.revision && <p className="text-sm text-amber-700">ข้อมูลรายชื่อนี้มีการเปลี่ยนแปลงแล้ว กรุณาตรวจสอบข้อมูลล่าสุดที่แสดงก่อนยืนยัน</p>}
    <p className="text-sm">{deactivating ? 'รายชื่อนี้จะไม่ปรากฏให้เลือกเบิกใหม่ ประวัติการเบิกและรายงานเก่ายังคงเดิม และสามารถเปิดใช้งานกลับได้' : 'รายชื่อนี้จะกลับมาให้เลือกเบิกใหม่ โดยใช้ประวัติเดิมต่อเนื่อง'}</p>
    {!impact && !error && <p role="status" className="text-sm text-gray-500">กำลังตรวจสอบข้อมูลที่เกี่ยวข้อง…</p>}
    {impact && <div className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
      <p>คำขอที่ยังไม่เสร็จสิ้น: <strong>{impact.open_request_count}</strong> รายการ</p>
      <p>ประวัติการยืม: <strong>{impact.borrow_record_count}</strong> รายการ <span className="block text-xs">เป็นจำนวนรายการยืมที่เคยบันทึก ไม่ใช่ยอดค้างคืน กรุณาตรวจสอบรายการรับคืนประกอบ</span></p>
      <p>บัญชีผู้ขอเบิกที่ใช้รหัสพนักงานเดียวกัน: <strong>{impact.requester_accounts.length}</strong> บัญชี</p>
      {impact.requester_accounts.length > 0 && <ul className="space-y-1">{impact.requester_accounts.map(account => <li key={account.id} className="break-all">{account.username} · {account.is_active ? 'ยังเปิดใช้งาน' : 'ปิดบัญชีแล้ว'}</li>)}</ul>}
      <p>การเปลี่ยนสถานะรายชื่อพนักงานไม่เปลี่ยนบัญชีเข้าสู่ระบบหรือยกเลิกคำขอ หากพนักงานลาออก ให้ตรวจสอบบัญชีผู้ขอเบิกแยกต่างหาก</p>
      <div className="flex flex-wrap gap-4 underline"><a href={`/ppe/requests?company_id=${encodeURIComponent(employee.company_id)}`} target="_blank" rel="noreferrer">ดูคำขอ PPE</a><a href={`/ppe/history?company_id=${encodeURIComponent(employee.company_id)}`} target="_blank" rel="noreferrer">ดูประวัติเบิกและรับคืน</a><a href={`/ppe/requesters?company_id=${encodeURIComponent(employee.company_id)}`} target="_blank" rel="noreferrer">จัดการบัญชีผู้ขอเบิก</a></div>
    </div>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>{error}</p>{!impact && <button type="button" className={`${button} mt-2`} onClick={() => { setError(''); setRetry(n => n + 1); }}>ตรวจสอบอีกครั้ง</button>}</div>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !impact} onClick={save} className={primary} style={{ backgroundColor: deactivating ? VIZ.accent : VIZ.positive }}>{busy ? 'กำลังบันทึก…' : deactivating ? 'ยืนยันปิดใช้งาน' : 'ยืนยันเปิดใช้งาน'}</button><button type="button" disabled={busy} onClick={onClose} className={button}>ยกเลิก</button></div>
  </Dialog>;
}

const actionLabels: Record<PPEEmployeeChange['action'], string> = { create: 'เพิ่มพนักงาน', update: 'แก้ไขข้อมูล', deactivate: 'ปิดใช้งาน', reactivate: 'เปิดใช้งาน', department_rename: 'เปลี่ยนชื่อแผนก' };
const historyFields = [{ key: 'name', label: 'ชื่อ' }, { key: 'position', label: 'ตำแหน่ง' }, { key: 'department', label: 'แผนก' }, { key: 'is_active', label: 'สถานะ' }] as const;
const historyValue = (value: string | boolean | null | undefined) => value === true ? 'กำลังใช้งาน' : value === false ? 'ปิดใช้งาน' : value || 'ไม่ระบุ';
function EmployeeHistory({ employee, onClose }: { employee: PPEEmployee; onClose: () => void }) {
  const [rows, setRows] = useState<PPEEmployeeChange[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); requestData<PPEEmployeeChange[]>(employeeUrl(employee, 'history'), { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setRows(data); }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }); return () => controller.abort(); }, [employee]);
  return <Dialog title="ประวัติการแก้ไขพนักงาน" onClose={onClose}>
    <p className="break-words font-semibold">{employee.name} · {employee.employee_code}</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : rows === null ? <p role="status">กำลังโหลดประวัติ…</p> : rows.length === 0 ? <p className="text-sm text-gray-500">ยังไม่มีประวัติการแก้ไขตั้งแต่เริ่มใช้ระบบบันทึกประวัตินี้</p> : <ol className="space-y-3">{rows.map(row => <li key={row.id} className="space-y-2 rounded-xl border border-gray-100 p-4 text-sm"><div className="font-semibold">{actionLabels[row.action]}</div><p className="break-words text-gray-500">{row.actor_name} · {new Date(row.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</p>{historyFields.filter(field => row.before_data?.[field.key] !== row.after_data[field.key]).map(field => <p key={field.key} className="break-words"><span className="font-medium">{field.label}: </span>{row.before_data ? `${historyValue(row.before_data[field.key])} → ` : ''}{historyValue(row.after_data[field.key])}</p>)}</li>)}</ol>}
    {rows && rows.length >= 100 && <p className="text-xs text-gray-500">แสดงการแก้ไขล่าสุด 100 รายการ</p>}
  </Dialog>;
}

function DepartmentManager({ company, onClose, onChanged }: { company: string; onClose: () => void; onChanged: () => void }) {
  const [departments, setDepartments] = useState<PPEDepartment[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<PPEDepartment | null>(null);
  const [removing, setRemoving] = useState<PPEDepartment | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); requestData<PPEDepartment[]>(`/api/ppe/departments?company_id=${encodeURIComponent(company)}`, { signal: controller.signal }).then(rows => { if (!controller.signal.aborted) { setDepartments(rows); setLoading(false); } }).catch(e => { if (!controller.signal.aborted) { setError(errorMessage(e)); setLoading(false); } }); return () => controller.abort(); }, [company, reload]);
  async function save(method: 'POST' | 'PATCH' | 'DELETE', department?: PPEDepartment) {
    setBusy(true); setError(''); setMessage('');
    try {
      const url = method === 'DELETE' ? `/api/ppe/departments?id=${department!.id}&company_id=${encodeURIComponent(company)}` : '/api/ppe/departments';
      await requestData<PPEDepartment>(url, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'DELETE' ? {} : { body: JSON.stringify({ company_id: company, name: name.trim(), ...(department ? { id: department.id, expected_name: department.name } : {}) }) }) });
      setName(''); setEditing(null); setRemoving(null); setMessage(method === 'DELETE' ? 'นำแผนกออกจากตัวเลือกแล้ว ประวัติเดิมยังอยู่' : 'บันทึกแผนกแล้ว ประวัติเบิกเดิมยังคงชื่อเดิม'); setReload(n => n + 1); onChanged();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Dialog title="จัดการแผนก" busy={busy} onClose={onClose}>
    <p className="text-sm text-gray-500">บริษัท {company.toUpperCase()} · เปลี่ยนชื่อแผนกจะปรับรายชื่อพนักงานปัจจุบัน ประวัติการเบิกเดิมคงชื่อแผนกเดิม</p>
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void save(editing ? 'PATCH' : 'POST', editing || undefined); }}><label className="block text-sm font-medium">{editing ? 'ชื่อแผนกใหม่' : 'เพิ่มแผนก'}<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} className={input} /></label><div className="flex flex-wrap gap-2"><button disabled={busy || !name.trim()} className={primary} style={{ backgroundColor: VIZ.primary }}>{editing ? 'บันทึกชื่อแผนก' : 'เพิ่มแผนก'}</button>{editing && <button type="button" className={button} onClick={() => { setEditing(null); setName(''); }}>ยกเลิกแก้ไข</button>}</div></form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {removing && <div className="space-y-3 rounded-lg bg-red-50 p-3 text-sm"><p>นำแผนก “{removing.name}” ออกจากตัวเลือก? รายชื่อพนักงานและประวัติเดิมจะยังคงอยู่</p><div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={() => void save('DELETE', removing)}>ยืนยันนำออก</button><button className={button} disabled={busy} onClick={() => setRemoving(null)}>ยกเลิก</button></div></div>}
    {loading ? <p role="status">กำลังโหลดแผนก…</p> : <ul className="space-y-2">{departments.map(dept => <li key={dept.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3"><span className="min-w-0 flex-1 break-words text-sm">{dept.name}</span><button className={button} disabled={busy} aria-label={`เปลี่ยนชื่อแผนก ${dept.name}`} onClick={() => { setEditing(dept); setName(dept.name); setRemoving(null); }}>แก้ไข</button><button className={button} disabled={busy} aria-label={`นำแผนก ${dept.name} ออก`} onClick={() => { setRemoving(dept); setEditing(null); setName(''); }}>นำออก</button></li>)}</ul>}
  </Dialog>;
}

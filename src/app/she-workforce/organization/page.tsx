'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import OrgChart, { OrgPerson } from '@/components/OrgChart';
import { PALETTE, RESP_COLORS } from '@/lib/she-theme';
import {
  AlertTriangle, Plus, Search, X, Pencil, Trash2, KeyRound,
  Copy, Check, RefreshCw, Share2, Eye, EyeOff,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
type Company = { company_id: string; company_name: string };
type Toast = { type: 'success' | 'error'; msg: string };
type AccessCode = {
  id: string;
  code: string;
  label: string | null;
  company_id: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
};

const STATUSES = ['active', 'on_leave', 'transferred', 'resigned', 'vacant'];
const STATUS_LABELS: Record<string, string> = {
  active: 'ปฏิบัติงาน',
  on_leave: 'ลาพัก',
  transferred: 'โยกย้าย',
  resigned: 'ลาออก',
  vacant: 'ตำแหน่งว่าง',
};

// ── Page ───────────────────────────────────────────────────
export default function OrganizationPage() {
  const { user, isLoading } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (isLoading) {
    return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>กำลังโหลด...</div>;
  }
  if (!user || !isAdmin) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, background: '#fff', border: '1px solid #fecaca', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={48} color="#dc2626" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>ไม่มีสิทธิ์เข้าถึง</h2>
          <p style={{ color: '#6b7280', marginTop: 8 }}>หน้านี้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น</p>
        </div>
      </div>
    );
  }

  return <OrganizationDashboard />;
}

// ── Dashboard ──────────────────────────────────────────────
function OrganizationDashboard() {
  const searchParams = useSearchParams();
  const urlCompany = searchParams.get('company_id') || 'all';

  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  // modals
  const [detailModal, setDetailModal] = useState<OrgPerson | null>(null);
  const [editModal, setEditModal] = useState<OrgPerson | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OrgPerson | null>(null);
  const [codesOpen, setCodesOpen] = useState(false);

  // load tree
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/she-workforce/organization?company_id=${encodeURIComponent(urlCompany)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setPeople(j.data || []);
      setCompanies(j.companies || []);
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ' });
    } finally {
      setLoading(false);
    }
  }, [urlCompany]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // filtered people (when filter active, show full tree but search highlights)
  const filteredPeople = useMemo(() => people, [people]);

  // ── Drag-drop reparent ──────────────────────────────────
  const onReparent = useCallback(async (childId: string, newParentId: string | null) => {
    // optimistic
    setPeople((prev) => prev.map((p) => (p.id === childId ? { ...p, parent_id: newParentId } : p)));
    try {
      const r = await fetch('/api/she-workforce/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_parent', id: childId, parent_id: newParentId }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setToast({ type: 'success', msg: 'ย้ายตำแหน่งในผังสำเร็จ' });
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'ย้ายไม่สำเร็จ' });
      fetchData(); // rollback
    }
  }, [fetchData]);

  const onSavePerson = useCallback(async (data: Partial<OrgPerson>) => {
    try {
      const r = await fetch('/api/she-workforce/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert', data }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setToast({ type: 'success', msg: 'บันทึกข้อมูลสำเร็จ' });
      setEditModal(null);
      setAddOpen(false);
      fetchData();
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    }
  }, [fetchData]);

  const onDeletePerson = useCallback(async (id: string) => {
    try {
      const r = await fetch('/api/she-workforce/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setToast({ type: 'success', msg: 'ลบข้อมูลสำเร็จ' });
      setConfirmDelete(null);
      setDetailModal(null);
      fetchData();
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'ลบไม่สำเร็จ' });
    }
  }, [fetchData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: PALETTE.text, margin: 0 }}>
          ผังองค์กร SHE
        </h1>
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          {urlCompany === 'all' ? 'ทุกบริษัท' : (companies.find(c => c.company_id === urlCompany)?.company_name || urlCompany)}
        </span>
        <span style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ ตำแหน่ง..."
            style={{ paddingLeft: 32, paddingRight: 12, paddingBlock: 8, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, width: 220, color: '#111' }}
          />
        </div>
        <button onClick={() => setCodesOpen(true)} style={btnSecondary}>
          <KeyRound size={14} /> รหัสผู้เยี่ยมชม
        </button>
        <button onClick={() => setAddOpen(true)} style={btnPrimary}>
          <Plus size={14} /> เพิ่มพนักงาน
        </button>
      </div>

      {/* Chart */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 8, height: 'calc(100vh - 220px)', minHeight: 540 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            กำลังโหลด...
          </div>
        ) : (
          <OrgChart
            people={filteredPeople}
            editable
            searchQuery={search}
            onNodeClick={(p) => setDetailModal(p)}
            onReparent={onReparent}
          />
        )}
      </div>

      {/* Detail modal */}
      {detailModal && (
        <DetailModal
          person={detailModal}
          parent={people.find((p) => p.id === detailModal.parent_id) || null}
          onClose={() => setDetailModal(null)}
          onEdit={() => { setEditModal(detailModal); setDetailModal(null); }}
          onDelete={() => { setConfirmDelete(detailModal); }}
        />
      )}

      {/* Edit / Add modal */}
      {(editModal || addOpen) && (
        <PersonForm
          initial={editModal || undefined}
          companies={companies}
          allPeople={people}
          defaultCompanyId={urlCompany !== 'all' ? urlCompany : (companies[0]?.company_id || '')}
          onClose={() => { setEditModal(null); setAddOpen(false); }}
          onSave={onSavePerson}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmDialog
          title="ยืนยันการลบ"
          message={`ต้องการลบ "${confirmDelete.full_name}" ออกจากผังองค์กรหรือไม่? ลูกน้องจะถูกย้ายเป็น "ไม่มีหัวหน้า"`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => onDeletePerson(confirmDelete.id)}
        />
      )}

      {/* Access codes modal */}
      {codesOpen && (
        <AccessCodesModal
          companies={companies}
          onClose={() => setCodesOpen(false)}
          onToast={setToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '12px 18px', borderRadius: 10, color: '#fff',
          background: toast.type === 'success' ? '#16a34a' : '#dc2626',
          fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Detail modal (read-only view of personnel info) ────────
function DetailModal({ person, parent, onClose, onEdit, onDelete }: {
  person: OrgPerson; parent: OrgPerson | null; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const color = person.chart_node_color || (person.responsibility ? RESP_COLORS[person.responsibility] : null) || PALETTE.primary;
  return (
    <ModalShell onClose={onClose} title="รายละเอียดพนักงาน" headerColor={color}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="ชื่อ-นามสกุล" value={person.full_name} bold />
        {person.nick_name && <Field label="ชื่อเล่น" value={person.nick_name} />}
        {person.position && <Field label="ตำแหน่ง" value={person.position} />}
        {person.department && <Field label="แผนก" value={person.department} />}
        {person.responsibility && <Field label="หน้าที่หลัก" value={person.responsibility} />}
        <Field
          label="สถานะ"
          value={STATUS_LABELS[person.status || 'active'] || person.status || '-'}
        />
        {parent && <Field label="ผู้บังคับบัญชา" value={parent.full_name} />}
        {person.details && (
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>รายละเอียด</div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, color: '#111', whiteSpace: 'pre-wrap' }}>
              {person.details}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onDelete} style={{ ...btnSecondary, color: '#dc2626' }}>
          <Trash2 size={14} /> ลบ
        </button>
        <button onClick={onEdit} style={btnPrimary}>
          <Pencil size={14} /> แก้ไข
        </button>
      </div>
    </ModalShell>
  );
}

// ── Person Form (add / edit) ──────────────────────────────
function PersonForm({ initial, companies, allPeople, defaultCompanyId, onClose, onSave }: {
  initial?: OrgPerson; companies: Company[]; allPeople: OrgPerson[];
  defaultCompanyId: string;
  onClose: () => void; onSave: (data: Partial<OrgPerson>) => void;
}) {
  const [form, setForm] = useState<Partial<OrgPerson>>(initial ? { ...initial } : {
    company_id: defaultCompanyId,
    full_name: '',
    nick_name: '',
    position: '',
    department: '',
    responsibility: '',
    status: 'active',
    details: '',
    parent_id: null,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof OrgPerson>(k: K, v: OrgPerson[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name?.trim()) return;
    if (!form.company_id) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  // valid parents (can't pick self or descendants)
  const isDescendant = (id: string, ancestor: string): boolean => {
    if (id === ancestor) return true;
    const stack = [ancestor];
    const map = new Map(allPeople.map((p) => [p.id, p]));
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of allPeople.filter((x) => x.parent_id === cur)) {
        if (c.id === id) return true;
        stack.push(c.id);
      }
    }
    return false;
  };
  const parentOptions = allPeople.filter((p) =>
    (!form.company_id || p.company_id === form.company_id) &&
    (!initial?.id || (!isDescendant(p.id, initial.id) && p.id !== initial.id))
  );

  return (
    <ModalShell onClose={onClose} title={initial ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'} headerColor={PALETTE.primary}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FormRow label="บริษัท *">
          <select value={form.company_id || ''} onChange={(e) => set('company_id', e.target.value)} style={inputStyle}>
            <option value="">— เลือกบริษัท —</option>
            {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}
          </select>
        </FormRow>
        <FormRow label="ชื่อ-นามสกุล *">
          <input value={form.full_name || ''} onChange={(e) => set('full_name', e.target.value)} style={inputStyle} />
        </FormRow>
        <FormRow label="ชื่อเล่น">
          <input value={form.nick_name || ''} onChange={(e) => set('nick_name', e.target.value)} style={inputStyle} />
        </FormRow>
        <FormRow label="ตำแหน่ง">
          <input value={form.position || ''} onChange={(e) => set('position', e.target.value)} style={inputStyle} />
        </FormRow>
        <FormRow label="แผนก">
          <input value={form.department || ''} onChange={(e) => set('department', e.target.value)} style={inputStyle} />
        </FormRow>
        <FormRow label="หน้าที่หลัก">
          <select value={form.responsibility || ''} onChange={(e) => set('responsibility', e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {Object.keys(RESP_COLORS).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </FormRow>
        <FormRow label="สถานะ">
          <select value={form.status || 'active'} onChange={(e) => set('status', e.target.value)} style={inputStyle}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </FormRow>
        <FormRow label="ผู้บังคับบัญชา">
          <select value={form.parent_id || ''} onChange={(e) => set('parent_id', e.target.value || null)} style={inputStyle}>
            <option value="">— ไม่มี (ระดับบนสุด) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name} ({p.position || '-'})</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="รายละเอียด">
          <textarea value={form.details || ''} onChange={(e) => set('details', e.target.value)}
            rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </FormRow>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnSecondary}>ยกเลิก</button>
        <button onClick={submit} disabled={saving || !form.full_name?.trim() || !form.company_id} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Access codes management ─────────────────────────────
function AccessCodesModal({ companies, onClose, onToast }: {
  companies: Company[]; onClose: () => void;
  onToast: (t: Toast) => void;
}) {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFull, setShowFull] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/she-workforce/access-codes');
    const j = await r.json();
    setCodes(j.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    const r = await fetch('/api/she-workforce/access-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', label: newLabel || null, company_id: newCompany || null }),
    });
    const j = await r.json();
    if (j.error) {
      onToast({ type: 'error', msg: j.error });
    } else {
      onToast({ type: 'success', msg: 'สร้างรหัสสำเร็จ' });
      setShowCreate(false); setNewLabel(''); setNewCompany('');
      refresh();
    }
  };

  const revoke = async (id: string) => {
    await fetch('/api/she-workforce/access-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', id }),
    });
    refresh();
  };

  const remove = async (id: string) => {
    await fetch('/api/she-workforce/access-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    refresh();
  };

  const copyLink = (code: string, id: string) => {
    const url = `${window.location.origin}/org/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <ModalShell onClose={onClose} title="รหัสเข้าชมผังองค์กร (สำหรับบุคคลทั่วไป)" headerColor="#0f3460" width={620}>
      <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
        แชร์รหัส 4 ตัวให้ผู้ที่ต้องการดูผังองค์กรโดยไม่ต้อง login — เปิดผ่านลิงก์ <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: 3 }}>/org/[code]</code>
      </div>
      {!showCreate && (
        <button onClick={() => setShowCreate(true)} style={{ ...btnPrimary, marginBottom: 12 }}>
          <Plus size={14} /> สร้างรหัสใหม่
        </button>
      )}
      {showCreate && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FormRow label="ป้ายกำกับ (เช่น สำหรับ HR, สำหรับการประชุม)">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={inputStyle} placeholder="ไม่บังคับ" />
          </FormRow>
          <FormRow label="จำกัดเฉพาะบริษัท">
            <select value={newCompany} onChange={(e) => setNewCompany(e.target.value)} style={inputStyle}>
              <option value="">ดูได้ทุกบริษัท</option>
              {companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}
            </select>
          </FormRow>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} style={btnSecondary}>ยกเลิก</button>
            <button onClick={create} style={btnPrimary}>สร้าง</button>
          </div>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>กำลังโหลด...</div>
      ) : codes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>
          ยังไม่มีรหัสในระบบ
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {codes.map((c) => {
            const masked = '••' + c.code.slice(-2);
            const display = showFull[c.id] ? c.code : masked;
            return (
              <div key={c.id} style={{
                border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                background: c.is_active ? '#fff' : '#f9fafb',
                opacity: c.is_active ? 1 : 0.6,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: c.is_active ? '#111' : '#6b7280', minWidth: 70 }}>
                  {display}
                </div>
                <button onClick={() => setShowFull((s) => ({ ...s, [c.id]: !s[c.id] }))}
                  style={{ ...btnSecondary, padding: 6 }} title="แสดง/ซ่อน">
                  {showFull[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <div style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                  <div style={{ fontWeight: 600 }}>{c.label || '(ไม่มีป้าย)'}</div>
                  <div style={{ color: '#6b7280', fontSize: 11 }}>
                    {c.company_id ? `บริษัท: ${companies.find(x => x.company_id === c.company_id)?.company_name || c.company_id}` : 'ทุกบริษัท'}
                    {' • '}สร้าง: {new Date(c.created_at).toLocaleDateString('th-TH')}
                    {!c.is_active && ' • ❌ ปิดใช้'}
                  </div>
                </div>
                <button onClick={() => copyLink(c.code, c.id)} style={{ ...btnSecondary, padding: 6 }} title="คัดลอกลิงก์">
                  {copiedId === c.id ? <Check size={14} color="#16a34a" /> : <Share2 size={14} />}
                </button>
                {c.is_active ? (
                  <button onClick={() => revoke(c.id)} style={{ ...btnSecondary, padding: 6 }} title="ปิดใช้">
                    <RefreshCw size={14} />
                  </button>
                ) : (
                  <button onClick={() => remove(c.id)} style={{ ...btnSecondary, padding: 6, color: '#dc2626' }} title="ลบ">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}

// ── Common UI ──────────────────────────────────────────
function ModalShell({ children, title, onClose, headerColor = '#0f3460', width = 480 }: {
  children: React.ReactNode; title: string; onClose: () => void;
  headerColor?: string; width?: number;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: width,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          background: `linear-gradient(135deg, ${headerColor} 0%, #533483 100%)`,
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#fff" />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, onCancel, onConfirm }: {
  title: string; message: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <ModalShell title={title} onClose={onCancel} headerColor="#dc2626">
      <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnSecondary}>ยกเลิก</button>
        <button onClick={onConfirm} style={{ ...btnPrimary, background: '#dc2626' }}>ยืนยันลบ</button>
      </div>
    </ModalShell>
  );
}

function Field({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 700 : 500, color: '#111' }}>{value}</div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, color: '#111',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, background: PALETTE.primary,
  color: '#fff', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, background: '#f3f4f6',
  color: '#374151', fontWeight: 600, fontSize: 13, border: '1px solid #e5e7eb', cursor: 'pointer',
};

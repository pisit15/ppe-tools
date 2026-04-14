'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Users, ShieldCheck, Briefcase, Plus, Pencil, Trash2, X, Check,
  Search, AlertTriangle, FileText, ChevronDown, Building2,
} from 'lucide-react';
import {
  RESP_COLORS, EMP_TYPE_COLORS, EMP_TYPES, STATUS, LICENSE, BULLET,
  CATEGORY_COLORS, PALETTE,
} from '@/lib/she-theme';

// ── Types ──────────────────────────────────────────────────────
interface Personnel {
  id?: string;
  company_id: string;
  bu: string;
  full_name: string;
  nick_name: string;
  position: string;
  responsibility: string;
  department: string;
  employment_type: string;
  employee_level: string;
  hiring_type: string;
  me_status: string;
  phone: string;
  email: string;
  is_active: boolean;
  is_she_team: boolean;
}

interface LegalReq {
  id?: string;
  company_id: string;
  name: string;
  short_name: string;
  category: string;
  required_count: number;
  description: string;
  law_reference: string;
  sort_order: number;
  is_active: boolean;
  is_required: boolean;
}

interface License {
  id?: string;
  personnel_id: string;
  requirement_type_id: string;
  has_license: boolean;
}

interface Workload {
  id?: string;
  company_id: string;
  personnel_id?: string;
  function_name: string;
  job_level1: string;
  job_level2: string;
  job_level3: string;
  job_rank: string;
  job_type: string;
  time_usage_min: number;
  frequency: string;
  frequency_count: number;
  work_section: string;
  assigned_personnel_ids: string[];
  worker_type: string;
}

// ── Constants ──────────────────────────────────────────────────
const TABS = ['ภาพรวม', 'บุคลากร', 'ใบอนุญาต', 'วิเคราะห์ภาระงาน'];
const POSITIONS = [
  'ผู้จัดการ', 'ผู้จัดการแผนก', 'ผู้ช่วยผู้จัดการแผนก',
  'หัวหน้าแผนก', 'หัวหน้าแผนกความปลอดภัย', 'หัวหน้าแผนกสิ่งแวดล้อม',
  'หัวหน้าแผนกอาชีวอนามัยเเละความปลอดภัย', 'หัวหน้าแผนกสิ่งแวดล้อมเเละชุมชนสัมพันธ์',
  'หัวหน้าแผนกระบบคุณภาพ', 'หัวหน้ากะการจัดการของเสีย',
  'เจ้าหน้าที่ความปลอดภัยระดับวิชาชีพ', 'จป.วิชาชีพ',
  'เจ้าหน้าที่สิ่งแวดล้อม', 'เจ้าหน้าที่แผนกระบบคุณภาพ', 'เจ้าหน้าที่',
  'พนักงานปฏิบัติการแผนกความปลอดภัยอาชีวอนามัย',
  'พนักงานปฏิบัติการ วิเคราะห์และบำบัดคุณภาพสิ่งแวดล้อม',
  'พนักงานปฏิบัติการผลิต', 'พนักงานปฏิบัติการ',
  'อื่นๆ',
];
const RESPONSIBILITIES = ['SHE', 'Safety', 'Environment', 'ISO', 'Safety & ISO', 'อื่นๆ'];
const EMPLOYEE_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const HIRING_TYPES: Record<string, string> = { permanent: 'ประจำ', temporary: 'ชั่วคราว', outsource: 'Outsource', unspecified: 'ไม่ระบุ' };
const ME_STATUSES = ['ไม่เปลี่ยน', 'LDL', 'OUT', 'ORG', 'TECH', 'NR', 'RET', 'TRF', 'DM', 'Overflow'];
const FREQ_LABELS: Record<string, string> = { daily: 'รายวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน', yearly: 'รายปี' };
const FREQ_MULTIPLIER: Record<string, number> = { daily: 232, weekly: 48, monthly: 12, yearly: 1 };
const FREQ_MULTIPLIER_6DAY: Record<string, number> = { daily: 284, weekly: 52, monthly: 12, yearly: 1 };
const ANNUAL_MINUTES_PER_PERSON = 97440;
const WORK_SECTIONS = ['SHE', 'Safety', 'Environment', 'ISO', 'Safety & ISO', 'อื่นๆ'];
const WORK_SECTION_COLORS: Record<string, string> = {
  'SHE': '#0f3460', 'Safety': '#e94560', 'Environment': '#0f9b58',
  'ISO': '#4285f4', 'Safety & ISO': '#ff6d00', 'อื่นๆ': '#6b7280'
};
const WORKER_TYPE_INFO = {
  '5day': { label: 'ทำงาน 5 วัน (จ-ศ)', days: 232, hours: 1624, minutes: 97440, color: '#4285f4' },
  '6day': { label: 'ทำงาน 6 วัน (จ-ส)', days: 284, hours: 1988, minutes: 119280, color: '#ff6d00' },
};

// ── Shared styles ────────────────────────────────────────────
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', fontSize: 14, color: '#111', outline: 'none' };
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as const, cursor: 'pointer' };
const _btnPrimary: React.CSSProperties = { padding: '10px 20px', borderRadius: 10, background: `linear-gradient(135deg, ${PALETTE.primary} 0%, #5856d6 100%)`, color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer' };
const _btnSecondary: React.CSSProperties = { padding: '10px 20px', borderRadius: 10, background: '#e5e7eb', color: '#374151', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer' };

// ── Modal ────────────────────────────────────────────────────
function Modal({ show, title, onClose, onSave, saving, children }: { show: boolean; title: string; onClose: () => void; onSave: () => void; saving?: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-2xl w-full max-w-[500px] overflow-hidden" style={{ background: '#ffffff', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0f3460 0%, #533483 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#fff" /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={_btnSecondary} onClick={onClose}>ยกเลิก</button>
          <button style={{ ..._btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={onSave} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>;
}

// ── Helper ─────────────────────────────────────────────────────
function emptyPersonnel(companyId: string): Personnel {
  return { company_id: companyId, bu: '', full_name: '', nick_name: '', position: '', responsibility: '', department: 'HSE', employment_type: 'permanent', employee_level: '', hiring_type: 'permanent', me_status: 'ไม่เปลี่ยน', phone: '', email: '', is_active: true, is_she_team: true };
}
function emptyReq(companyId: string): LegalReq {
  return { company_id: companyId, name: '', short_name: '', category: 'safety', required_count: 0, description: '', law_reference: '', sort_order: 0, is_active: true, is_required: true };
}
function emptyWorkload(companyId: string): Workload {
  return { company_id: companyId, function_name: '', job_level1: '', job_level2: '', job_level3: '', job_rank: 'B', job_type: 'fixed', time_usage_min: 0, frequency: 'daily', frequency_count: 1, work_section: 'SHE', assigned_personnel_ids: [], worker_type: '5day' };
}

// ================================================================
export default function SHEWorkforcePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Admin company switcher
  const [companies, setCompanies] = useState<Array<{ company_id: string; company_name: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [companiesLoading, setCompaniesLoading] = useState(isAdmin);

  // Determine the active company ID and name
  const activeCompanyId = isAdmin && selectedCompanyId ? selectedCompanyId : (user?.companyId || 'default');
  const companyName = isAdmin && activeCompanyId === 'all' ? 'ทุกบริษัท (ภาพรวม)' : (user?.companyName || activeCompanyId.toUpperCase());

  // Data
  const [activeTab, setActiveTab] = useState(0);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [requirements, setRequirements] = useState<LegalReq[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showPModal, setShowPModal] = useState(false);
  const [editP, setEditP] = useState<Personnel | null>(null);
  const [showRModal, setShowRModal] = useState(false);
  const [editR, setEditR] = useState<LegalReq | null>(null);
  const [showWModal, setShowWModal] = useState(false);
  const [editW, setEditW] = useState<Workload | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Fetch companies (admin only) ──────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const fetchCompanies = async () => {
      try {
        const res = await fetch('/api/companies');
        const data = await res.json();
        setCompanies(data || []);
        // Set initial selected company to first company
        if (data && data.length > 0 && !selectedCompanyId) {
          setSelectedCompanyId(data[0].company_id);
        }
      } catch { /* ignore */ }
      setCompaniesLoading(false);
    };
    fetchCompanies();
  }, [isAdmin, selectedCompanyId]);

  // ── Fetch ────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/she-workforce?companyId=${activeCompanyId}`);
      const d = await res.json();
      setPersonnel(d.personnel || []);
      setRequirements(d.requirements || []);
      setLicenses(d.licenses || []);
      setWorkload(d.workload || []);
      if (d.latestManHours) setEmployeeCount(d.latestManHours.employee_count || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── API helpers ──────────────────────────────────────────────
  const apiPost = async (body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/she-workforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { ok: false, error: d.error || `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 6000);
  };

  const savePersonnel = async () => {
    if (!editP || !editP.full_name.trim()) return;
    setSaving(true);
    const result = await apiPost({ action: 'upsert_personnel', data: editP });
    setSaving(false);
    if (!result.ok) {
      showError(`บันทึกไม่สำเร็จ: ${result.error}`);
      return;
    }
    setShowPModal(false);
    setEditP(null);
    fetchData();
  };

  const deletePersonnel = async (id: string) => {
    if (!confirm('ลบบุคลากรนี้?')) return;
    const result = await apiPost({ action: 'delete_personnel', id });
    if (!result.ok) { showError(`ลบไม่สำเร็จ: ${result.error}`); return; }
    fetchData();
  };

  const saveReq = async () => {
    if (!editR || !editR.name.trim()) return;
    setSaving(true);
    const result = await apiPost({ action: 'upsert_requirement', data: editR });
    setSaving(false);
    if (!result.ok) {
      showError(`บันทึกไม่สำเร็จ: ${result.error}`);
      return;
    }
    setShowRModal(false);
    setEditR(null);
    fetchData();
  };

  const toggleLicense = async (personnelId: string, reqId: string) => {
    const existing = licenses.find(l => l.personnel_id === personnelId && l.requirement_type_id === reqId);
    const newVal = !(existing?.has_license);
    await apiPost({ action: 'upsert_license', data: { personnel_id: personnelId, requirement_type_id: reqId, has_license: newVal } });
    setLicenses(prev => {
      const idx = prev.findIndex(l => l.personnel_id === personnelId && l.requirement_type_id === reqId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], has_license: newVal };
        return copy;
      }
      return [...prev, { personnel_id: personnelId, requirement_type_id: reqId, has_license: newVal }];
    });
  };

  const saveWorkload = async () => {
    if (!editW) return;
    setSaving(true);
    const result = await apiPost({ action: 'upsert_workload', data: editW });
    setSaving(false);
    if (!result.ok) {
      showError(`บันทึกไม่สำเร็จ: ${result.error}`);
      return;
    }
    setShowWModal(false);
    setEditW(null);
    fetchData();
  };

  const deleteWorkload = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    const result = await apiPost({ action: 'delete_workload', id });
    if (!result.ok) { showError(`ลบไม่สำเร็จ: ${result.error}`); return; }
    fetchData();
  };

  // ── Computed ─────────────────────────────────────────────────
  const sheTeam = personnel.filter(p => p.is_she_team !== false);
  const sheCount = sheTeam.length;
  const ratioNum = employeeCount > 0 && sheCount > 0 ? Math.round(employeeCount / sheCount) : 0;
  const ratio = ratioNum > 0 ? `1:${ratioNum}` : '-';
  const totalReqSlots = personnel.length * requirements.length;

  const requiredReqs = requirements.filter(r => r.is_required);
  const complianceMet = requiredReqs.filter(req => {
    const held = licenses.filter(l => l.requirement_type_id === req.id && l.has_license).length;
    return req.required_count === 0 ? held > 0 : held >= req.required_count;
  }).length;
  const complianceRate = requiredReqs.length > 0 ? Math.round((complianceMet / requiredReqs.length) * 100) : 100;

  const respMap: Record<string, number> = {};
  sheTeam.forEach(p => { const r = p.responsibility || 'อื่นๆ'; respMap[r] = (respMap[r] || 0) + 1; });
  const maxResp = Math.max(...Object.values(respMap), 1);

  const empMap: Record<string, number> = {};
  sheTeam.forEach(p => { const t = p.employment_type || 'permanent'; empMap[t] = (empMap[t] || 0) + 1; });
  const maxEmp = Math.max(...Object.values(empMap), 1);

  const filteredP = personnel.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.full_name.toLowerCase().includes(q) || p.nick_name.toLowerCase().includes(q) || p.position.toLowerCase().includes(q);
  });

  const workloadByFn: Record<string, { totalMin: number; entries: number }> = {};
  const workloadBySection: Record<string, { totalMin: number; entries: number }> = {};
  let grandTotalMin = 0;
  workload.forEach(w => {
    const mult = w.worker_type === '6day' ? FREQ_MULTIPLIER_6DAY : FREQ_MULTIPLIER;
    const annual = w.time_usage_min * w.frequency_count * (mult[w.frequency] || 1);
    grandTotalMin += annual;
    const fn = w.function_name || 'ไม่ระบุ';
    if (!workloadByFn[fn]) workloadByFn[fn] = { totalMin: 0, entries: 0 };
    workloadByFn[fn].totalMin += annual;
    workloadByFn[fn].entries++;
    const sec = w.work_section || 'SHE';
    if (!workloadBySection[sec]) workloadBySection[sec] = { totalMin: 0, entries: 0 };
    workloadBySection[sec].totalMin += annual;
    workloadBySection[sec].entries++;
  });
  const manpowerNeed = grandTotalMin / ANNUAL_MINUTES_PER_PERSON;
  const manpowerGap = sheCount - manpowerNeed;

  // ── Styles ──────────────────────────────────────────────────
  const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 13 };

  // ================================================================
  return (
    <>
      {/* ── Error Toast ──────────────────────────────────────── */}
      {errorMsg && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: '14px 20px', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#dc2626" />
          <span style={{ fontSize: 14, color: '#991b1b', fontWeight: 500 }}>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={14} color="#991b1b" /></button>
        </div>
      )}
      {/* ── Hero ────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', padding: '24px 32px 36px', position: 'relative', margin: '-24px -24px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Briefcase size={22} color="#fff" />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.5, margin: 0 }}>SHE Workforce</h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginLeft: 54, margin: '4px 0 0 54px' }}>
              {companyName} — บุคลากรด้านความปลอดภัย อาชีวอนามัย และสิ่งแวดล้อม
            </p>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', marginTop: 4 }}>
            อัปเดตล่าสุด: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ── Admin Company Switcher ──────────────────────────────── */}
      {isAdmin && !companiesLoading && (
        <div style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: PALETTE.primary + '15', border: `1px solid ${PALETTE.primary}33` }}>
              <Building2 size={16} color={PALETTE.primary} />
              <label style={{ fontSize: 13, fontWeight: 600, color: PALETTE.primary, marginRight: 8 }}>เลือกบริษัท:</label>
              <select
                value={activeCompanyId}
                onChange={e => setSelectedCompanyId(e.target.value)}
                style={{
                  ...selectStyle,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: '#fff',
                  border: `1px solid ${PALETTE.primary}`,
                  minWidth: 180,
                }}
              >
                <option value="all">ทุกบริษัท (ภาพรวม)</option>
                {companies.map(comp => (
                  <option key={comp.company_id} value={comp.company_id}>
                    {comp.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '-12px auto 0', padding: '0 24px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'inline-flex', borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#fff' }}>
          {TABS.map((tab, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{
              padding: '12px 22px', fontSize: 14, fontWeight: activeTab === i ? 700 : 500, border: 'none', cursor: 'pointer',
              background: activeTab === i ? '#fff' : 'transparent',
              color: activeTab === i ? PALETTE.primary : '#6b7280',
              borderBottom: activeTab === i ? `3px solid ${PALETTE.primary}` : '3px solid transparent',
              transition: 'all 0.15s ease',
            }}>{tab}</button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '20px auto 40px', padding: '0 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: PALETTE.primary, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
            กำลังโหลดข้อมูล...
          </div>
        ) : (
          <>
            {/* ═══════ TAB 0: ภาพรวม ═══════ */}
            {activeTab === 0 && (
              <div>
                {/* ── KPI Cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {/* Compliance Rate */}
                  {(() => {
                    const cColor = complianceRate === 100 ? STATUS.ok : complianceRate >= 80 ? STATUS.warning : STATUS.critical;
                    const cBg = complianceRate === 100 ? STATUS.okBg : complianceRate >= 80 ? STATUS.warningBg : STATUS.criticalBg;
                    const complianceTitle = complianceRate === 100 ? 'Compliance ครบทุกรายการ' : `ยังขาดใบอนุญาต ${requiredReqs.length - complianceMet} ประเภท`;
                    return (
                      <div style={{ padding: '20px 18px', borderRadius: 12, border: `2px solid ${cColor}44`, background: cBg }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Compliance</div>
                        <div style={{ fontSize: 38, fontWeight: 800, color: cColor, lineHeight: 1 }}>{complianceRate}<span style={{ fontSize: 18, fontWeight: 700 }}>%</span></div>
                        <div style={{ fontSize: 12, color: '#1f2937', marginTop: 6, fontWeight: 500 }}>{complianceTitle}</div>
                        <div style={{ height: 5, borderRadius: 3, background: PALETTE.border, marginTop: 8 }}>
                          <div style={{ height: '100%', borderRadius: 3, width: `${complianceRate}%`, background: cColor, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })()}
                  {/* SHE : พนักงาน */}
                  {(() => {
                    const rColor = ratioNum > 200 ? STATUS.critical : ratioNum > 100 ? STATUS.warning : STATUS.ok;
                    const ratioTitle = ratioNum > 100 ? `อัตราส่วน SHE เกิน 1:${ratioNum}` : (ratioNum > 0 ? `อัตราส่วน SHE ตามเกณฑ์` : 'ยังไม่มีข้อมูล');
                    return (
                      <div style={{ padding: 16, borderRadius: 12, border: `1.5px solid ${ratioNum > 100 ? rColor + '44' : '#e5e7eb'}`, background: ratioNum > 200 ? STATUS.criticalBg : '#fff' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>SHE : พนักงาน</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: rColor, lineHeight: 1 }}>{ratio}</div>
                        <div style={{ fontSize: 12, color: '#1f2937', marginTop: 4, fontWeight: 500 }}>{ratioTitle}</div>
                      </div>
                    );
                  })()}
                  {/* บุคลากร SHE */}
                  {(() => {
                    const respBreakdown = Object.entries(respMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, c]) => `${r} ${c}`).join(', ');
                    return (
                      <div style={{ padding: 16, borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#fff' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>บุคลากร SHE</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: STATUS.ok, lineHeight: 1 }}>{sheCount}</div>
                        <div style={{ fontSize: 11, color: '#1f2937', marginTop: 4, fontWeight: 500 }}>{respBreakdown || 'ยังไม่มีข้อมูล'}</div>
                      </div>
                    );
                  })()}
                  {/* Workload Gap */}
                  {(() => {
                    const gColor = workload.length === 0 ? STATUS.neutral : manpowerGap < 0 ? STATUS.critical : STATUS.positive;
                    const gapTitle = workload.length === 0 ? 'ยังไม่มีข้อมูลภาระงาน' : manpowerGap < 0 ? `ขาดกำลังคน ${Math.abs(manpowerGap).toFixed(1)} ตำแหน่ง` : 'กำลังคนเพียงพอ';
                    return (
                      <div style={{ padding: 16, borderRadius: 12, border: `1.5px solid ${manpowerGap < 0 ? gColor + '44' : '#e5e7eb'}`, background: manpowerGap < 0 ? STATUS.criticalBg : '#fff' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>กำลังคน</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: gColor, lineHeight: 1 }}>
                          {workload.length === 0 ? '-' : manpowerGap >= 0 ? `+${manpowerGap.toFixed(1)}` : manpowerGap.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 12, color: '#1f2937', marginTop: 4, fontWeight: 500 }}>{gapTitle}</div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Charts Row ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  {/* Responsibility */}
                  {(() => {
                    const sortedResp = Object.entries(respMap).sort((a, b) => b[1] - a[1]);
                    const topResp = sortedResp[0]?.[0] || 'ไม่ระบุ';
                    const respTitle = sortedResp.length > 0 ? `${topResp} เป็นหน้าที่หลักที่มีบุคลากรมากที่สุด` : 'หน้าที่หลัก (Responsibility)';
                    return (
                      <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', margin: '0 0 14px' }}>{respTitle}</p>
                        {sortedResp.length === 0 ? (
                          <p style={{ color: '#6b7280', fontSize: 13 }}>ยังไม่มีข้อมูล</p>
                        ) : sortedResp.map(([resp, count]) => (
                          <div key={resp} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, alignItems: 'center' }}>
                              <span style={{ color: '#1f2937', fontWeight: 500 }}>{resp}</span>
                              <span style={{ fontWeight: 700, color: RESP_COLORS[resp] || '#6b7280' }}>{count} คน ({Math.round((count / sheCount) * 100)}%)</span>
                            </div>
                            <div style={{ height: 7, borderRadius: 4, background: 'rgba(107,114,128,0.08)' }}>
                              <div style={{ height: '100%', borderRadius: 4, width: `${(count / maxResp) * 100}%`, background: RESP_COLORS[resp] || '#6b7280', transition: 'width 0.3s ease' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Employment Type */}
                  {(() => {
                    const sortedEmp = Object.entries(empMap).sort((a, b) => b[1] - a[1]);
                    const topEmp = sortedEmp[0]?.[0] || 'ไม่ระบุ';
                    const empTitle = sortedEmp.length > 0 ? `${EMP_TYPES[topEmp] || topEmp} เป็นประเภทการจ้างที่มากที่สุด` : 'ประเภทการจ้าง';
                    return (
                      <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', margin: '0 0 14px' }}>{empTitle}</p>
                        {sortedEmp.length === 0 ? (
                          <p style={{ color: '#6b7280', fontSize: 13 }}>ยังไม่มีข้อมูล</p>
                        ) : sortedEmp.map(([type, count]) => (
                          <div key={type} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, alignItems: 'center' }}>
                              <span style={{ color: '#1f2937', fontWeight: 500 }}>{EMP_TYPES[type] || type}</span>
                              <span style={{ fontWeight: 700, color: EMP_TYPE_COLORS[type] || '#6b7280' }}>{count} คน ({Math.round((count / sheCount) * 100)}%)</span>
                            </div>
                            <div style={{ height: 7, borderRadius: 4, background: 'rgba(107,114,128,0.08)' }}>
                              <div style={{ height: '100%', borderRadius: 4, width: `${(count / maxEmp) * 100}%`, background: EMP_TYPE_COLORS[type] || '#6b7280', transition: 'width 0.3s ease' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* ── Compliance: Card Grid ── */}
                <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>ใบอนุญาตตามกฎหมาย</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                        {complianceMet}/{requiredReqs.length} ประเภทบังคับผ่าน · {licenses.filter(l => l.has_license).length} ใบรวม
                      </p>
                    </div>
                    <div style={{ position: 'relative', width: 56, height: 56 }}>
                      <svg viewBox="0 0 56 56" style={{ width: 56, height: 56 }}>
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                        <circle cx="28" cy="28" r="22" fill="none" stroke={complianceRate === 100 ? STATUS.ok : complianceRate >= 80 ? STATUS.warning : STATUS.critical} strokeWidth="6" strokeDasharray={`${(complianceRate / 100) * 138} 138`} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '28px 28px' }} />
                      </svg>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 14, fontWeight: 800, color: complianceRate === 100 ? STATUS.ok : complianceRate >= 80 ? STATUS.warning : STATUS.critical }}>{complianceRate}%</div>
                    </div>
                  </div>
                  {requirements.length === 0 ? (
                    <p style={{ color: '#6b7280', fontSize: 13 }}>ยังไม่ได้ตั้งค่าประเภทใบอนุญาต — ไปที่แท็บ &quot;ใบอนุญาต&quot; เพื่อเพิ่ม</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {requirements.map(req => {
                        const held = licenses.filter(l => l.requirement_type_id === req.id && l.has_license).length;
                        const needed = req.required_count || 0;
                        const ok = needed === 0 ? held > 0 : held >= needed;
                        const catColor = CATEGORY_COLORS[req.category] || PALETTE.primary;
                        return (
                          <div key={req.id} style={{
                            padding: '12px 14px', borderRadius: 10,
                            border: `1.5px solid ${ok ? `${STATUS.ok}30` : `${STATUS.warning}40`}`,
                            background: ok ? `${STATUS.ok}06` : `${STATUS.warning}06`,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{req.short_name}</span>
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${catColor}15`, color: catColor, fontWeight: 600 }}>{req.category}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontSize: 24, fontWeight: 800, color: ok ? STATUS.ok : STATUS.warning, lineHeight: 1 }}>{held}</span>
                              {needed > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>/ {needed} คน</span>}
                              {needed === 0 && held > 0 && <span style={{ fontSize: 10, color: STATUS.ok }}>มี</span>}
                              {needed === 0 && held === 0 && <span style={{ fontSize: 10, color: STATUS.warning }}>ยังไม่มี</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              {ok ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: STATUS.ok, fontWeight: 600 }}>
                                  <Check size={10} /> ผ่าน
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: STATUS.warning, fontWeight: 600 }}>
                                  <AlertTriangle size={10} /> ขาด {needed - held}
                                </span>
                              )}
                              {!req.is_required && <span style={{ fontSize: 9, color: PALETTE.muted, marginLeft: 'auto' }}>ไม่บังคับ</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════ TAB 1: บุคลากร ═══════ */}
            {activeTab === 1 && (() => {
              const sheFiltered = filteredP.filter(p => p.is_she_team !== false);
              const appointedFiltered = filteredP.filter(p => p.is_she_team === false);

              const PersonnelTable = ({ rows, headers }: { rows: Personnel[]; headers: string[] }) => (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      {headers.map((h, i) => <th key={i} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={headers.length} style={{ padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>ไม่มีข้อมูล</td></tr>
                    ) : rows.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ ...tdStyle, color: '#6b7280', width: 40 }}>{i + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#1f2937' }}>
                          {p.full_name}
                          {p.nick_name ? <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}> ({p.nick_name})</span> : null}
                        </td>
                        {p.is_she_team === false && <td style={{ ...tdStyle, fontSize: 12, color: '#6b7280' }}>{p.department || '-'}</td>}
                        <td style={tdStyle}><span style={{ fontSize: 12, color: '#1f2937' }}>{p.position || '-'}</span></td>
                        <td style={tdStyle}>
                          {p.responsibility && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${RESP_COLORS[p.responsibility] || '#6b7280'}15`, color: RESP_COLORS[p.responsibility] || '#6b7280', fontWeight: 600 }}>{p.responsibility}</span>}
                        </td>
                        <td style={tdStyle}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${EMP_TYPE_COLORS[p.employment_type] || '#6b7280'}15`, color: EMP_TYPE_COLORS[p.employment_type] || '#6b7280', fontWeight: 600 }}>{EMP_TYPES[p.employment_type] || p.employment_type}</span></td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#6b7280' }}>{p.phone || '-'}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <button onClick={() => { setEditP({ ...p }); setShowPModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Pencil size={14} color={PALETTE.primary} /></button>
                          <button onClick={() => p.id && deletePersonnel(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={14} color={STATUS.critical} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );

              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 250px' }}>
                      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                      <input placeholder="ค้นหาชื่อ, ตำแหน่ง..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, paddingLeft: 36, background: '#fff', border: '1px solid #e5e7eb', color: '#1f2937' }} />
                    </div>
                  </div>

                  {/* ── ทีม SHE ── */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShieldCheck size={18} color={STATUS.ok} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>บุคลากรทีม SHE</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>({sheFiltered.length} คน)</span>
                      </div>
                      <button onClick={() => { setEditP(emptyPersonnel(activeCompanyId)); setShowPModal(true); }} style={{ ..._btnPrimary, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13, padding: '8px 16px' }}>
                        <Plus size={14} /> เพิ่มบุคลากร SHE
                      </button>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
                      <PersonnelTable rows={sheFiltered} headers={['#', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'หน้าที่', 'การจ้าง', 'โทร', '']} />
                    </div>
                  </div>

                  {/* ── ผู้ได้รับแต่งตั้ง ── */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users size={18} color={STATUS.warning} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>ผู้ได้รับแต่งตั้ง</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>({appointedFiltered.length} คน) — จากแผนกอื่น ไม่นับเป็นบุคลากร SHE</span>
                      </div>
                      <button onClick={() => { setEditP({ ...emptyPersonnel(activeCompanyId), is_she_team: false, department: '' }); setShowPModal(true); }} style={{ ..._btnSecondary, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13, padding: '8px 16px' }}>
                        <Plus size={14} /> เพิ่มผู้ได้รับแต่งตั้ง
                      </button>
                    </div>
                    <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
                      <PersonnelTable rows={appointedFiltered} headers={['#', 'ชื่อ-นามสกุล', 'แผนกที่สังกัด', 'ตำแหน่ง', 'หน้าที่', 'การจ้าง', 'โทร', '']} />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ═══════ TAB 2: ใบอนุญาต ═══════ */}
            {activeTab === 2 && (
              <div>
                {/* ── KPI Strip ── */}
                {requirements.length > 0 && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    {(() => {
                      const totalHeld = licenses.filter(l => l.has_license).length;
                      const failReqs = requiredReqs.filter(req => {
                        const h = licenses.filter(l => l.requirement_type_id === req.id && l.has_license).length;
                        return req.required_count === 0 ? h === 0 : h < req.required_count;
                      });
                      return (
                        <>
                          <div style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${complianceRate === 100 ? `${STATUS.ok}44` : `${STATUS.critical}44`}`, background: complianceRate === 100 ? STATUS.okBg : STATUS.criticalBg, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: complianceRate === 100 ? STATUS.ok : STATUS.critical }}>{complianceRate}%</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>Compliance ({complianceMet}/{requiredReqs.length})</span>
                          </div>
                          <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: PALETTE.primary }}>{totalHeld}</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>ใบอนุญาตที่มี</span>
                          </div>
                          {failReqs.length > 0 && (
                            <div style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${STATUS.critical}44`, background: STATUS.criticalBg, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <AlertTriangle size={14} color={STATUS.critical} />
                              <span style={{ fontSize: 11, color: STATUS.critical, fontWeight: 600 }}>ขาด: {failReqs.map(r => r.short_name).join(', ')}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: '#6b7280' }}>
                    <span>คลิกที่ช่องเพื่อเปลี่ยนสถานะใบอนุญาต</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: LICENSE.required, display: 'inline-block' }} /> บริษัทต้องมี</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: LICENSE.optional, display: 'inline-block' }} /> บุคลากรมี (ไม่บังคับ)</span>
                  </div>
                  <button onClick={() => { setEditR(emptyReq(activeCompanyId)); setShowRModal(true); }} style={{ ..._btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} /> เพิ่มประเภทใบอนุญาต
                  </button>
                </div>

                {requirements.length === 0 ? (
                  <div style={{ padding: 60, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
                    <ShieldCheck size={40} style={{ margin: '0 auto 12px', opacity: 0.3, color: '#6b7280' }} />
                    <div style={{ color: '#6b7280', fontSize: 14 }}>ยังไม่มีประเภทใบอนุญาต</div>
                    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>กดปุ่ม &quot;เพิ่มประเภทใบอนุญาต&quot; เพื่อเริ่มต้น</div>
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
                    <div style={{ overflowX: 'auto', overflowY: 'hidden', height: 14, borderBottom: '1px solid #e5e7eb' }}
                      onScroll={(e) => { const el = (e.target as HTMLElement).nextElementSibling as HTMLElement; if (el) el.scrollLeft = (e.target as HTMLElement).scrollLeft; }}>
                      <div style={{ width: requirements.length * 90 + 160, height: 1 }} />
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 360px)' }}
                      onScroll={(e) => { const el = (e.target as HTMLElement).previousElementSibling as HTMLElement; if (el) el.scrollLeft = (e.target as HTMLElement).scrollLeft; }}>
                      <table style={{ borderCollapse: 'collapse', minWidth: requirements.length * 90 + 160 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#f9fafb', zIndex: 3, minWidth: 150 }}>ชื่อ</th>
                            {requirements.map(r => (
                              <th key={r.id} style={{ ...thStyle, textAlign: 'center', minWidth: 80, borderBottom: r.is_required ? `3px solid ${LICENSE.required}` : `3px solid ${LICENSE.optional}`, cursor: 'pointer' }}
                                onClick={() => { setEditR({ ...r }); setShowRModal(true); }}>
                                <div style={{ fontSize: 11, lineHeight: 1.3 }}>{r.short_name}</div>
                                <div style={{ fontSize: 10, color: r.is_required ? LICENSE.required : '#6b7280', fontWeight: r.is_required ? 600 : 400 }}>{r.is_required ? 'บังคับ' : 'ไม่บังคับ'}</div>
                                <Pencil size={10} style={{ marginTop: 2, opacity: 0.4 }} />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {personnel.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ ...tdStyle, fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1, color: '#1f2937', minWidth: 150 }}>
                                {p.full_name}
                                {p.is_she_team === false && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 10, background: `${STATUS.warning}15`, color: STATUS.warning, fontWeight: 600, marginLeft: 4 }}>{p.department || 'แต่งตั้ง'}</span>}
                              </td>
                              {requirements.map(r => {
                                const lic = licenses.find(l => l.personnel_id === p.id && l.requirement_type_id === r.id);
                                const has = lic?.has_license;
                                return (
                                  <td key={r.id} style={{ ...tdStyle, textAlign: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onClick={() => p.id && r.id && toggleLicense(p.id, r.id)}>
                                    {has ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: LICENSE.hasBg, color: LICENSE.has }}>
                                        <Check size={16} />
                                      </span>
                                    ) : (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: LICENSE.missingBg, color: LICENSE.missing }}>
                                        <X size={14} />
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {/* Summary row */}
                          <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                            <td style={{ ...tdStyle, fontWeight: 700, position: 'sticky', left: 0, background: '#f9fafb', zIndex: 1, color: '#1f2937' }}>รวม</td>
                            {requirements.map(r => {
                              const count = licenses.filter(l => l.requirement_type_id === r.id && l.has_license).length;
                              const isOk = !r.is_required || count >= (r.required_count || 1);
                              return (
                                <td key={r.id} style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                                  <span style={{ color: r.is_required ? (isOk ? STATUS.ok : STATUS.warning) : '#6b7280' }}>{count}</span>
                                  {r.is_required && r.required_count > 0 && <span style={{ color: '#6b7280', fontWeight: 400 }}>/{r.required_count}</span>}
                                  {r.is_required && r.required_count === 0 && count === 0 && <span style={{ color: STATUS.warning, fontSize: 10, display: 'block' }}>ขาด</span>}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════ TAB 3: วิเคราะห์ภาระงาน ═══════ */}
            {activeTab === 3 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#6b7280' }}>วิเคราะห์ภาระงานและคำนวณจำนวนคนที่ต้องการ</p>
                  <button onClick={() => { setEditW(emptyWorkload(activeCompanyId)); setShowWModal(true); }} style={{ ..._btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} /> เพิ่มรายการ
                  </button>
                </div>

                {/* ── Hero Insight: Capacity vs Demand ── */}
                {workload.length > 0 && (
                  <div style={{ padding: 20, borderRadius: 12, border: `2px solid ${manpowerGap < 0 ? STATUS.critical : STATUS.ok}30`, background: manpowerGap < 0 ? `${STATUS.critical}08` : `${STATUS.ok}08`, marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }}>
                      {/* Left: Text insight + stats */}
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 800, color: '#1f2937', margin: '0 0 8px' }}>
                          {manpowerGap < 0 ? (
                            <span style={{ color: STATUS.critical }}>ขาดกำลังคน {Math.abs(manpowerGap).toFixed(1)} ตำแหน่ง</span>
                          ) : (
                            <span style={{ color: STATUS.ok }}>กำลังคนเพียงพอ เหลือ {manpowerGap.toFixed(1)} ตำแหน่ง</span>
                          )}
                        </p>
                        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px', lineHeight: 1.4 }}>
                          {manpowerGap < 0 ? 'ต้องเพิ่มบุคลากรเพื่อให้สามารถจัดการภาระงานทั้งหมด' : 'ทีมปัจจุบันสามารถจัดการภาระงานได้อย่างมีประสิทธิภาพ'}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>ต้องการ</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: BULLET.target }}>{manpowerNeed.toFixed(1)}</div>
                            <div style={{ fontSize: 9, color: '#9ca3af' }}>คน/ปี</div>
                          </div>
                          <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>มีอยู่</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: BULLET.actual }}>{sheCount}</div>
                            <div style={{ fontSize: 9, color: '#9ca3af' }}>คน</div>
                          </div>
                          <div style={{ padding: 10, borderRadius: 8, background: manpowerGap < 0 ? `${STATUS.critical}15` : `${STATUS.ok}15`, border: `1px solid ${manpowerGap < 0 ? STATUS.critical : STATUS.ok}30` }}>
                            <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>ผลต่าง</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: manpowerGap < 0 ? STATUS.critical : STATUS.ok }}>{Math.abs(manpowerGap).toFixed(1)}</div>
                            <div style={{ fontSize: 9, color: '#6b7280' }}>คน</div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Utilization gauge (semicircle-like arc using SVG) */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <svg width="160" height="100" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet">
                          <defs>
                            <linearGradient id="capacityGradient" x1="0%" x2="100%">
                              <stop offset="0%" stopColor={STATUS.ok} />
                              <stop offset="100%" stopColor={manpowerGap < 0 ? STATUS.critical : STATUS.ok} />
                            </linearGradient>
                          </defs>
                          {/* Background arc */}
                          <path d="M 20 100 A 60 60 0 0 1 140 100" fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" />
                          {/* Utilization arc */}
                          <path d="M 20 100 A 60 60 0 0 1 140 100" fill="none" stroke="url(#capacityGradient)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.min((sheCount / Math.max(sheCount, manpowerNeed)) * 120, 120)} 120`} style={{ transition: 'stroke-dasharray 0.3s' }} />
                          {/* Center text */}
                          <text x="80" y="50" textAnchor="middle" fontSize="28" fontWeight="800" fill="#1f2937">
                            {(Math.min((sheCount / Math.max(sheCount, manpowerNeed)) * 100, 100)).toFixed(0)}%
                          </text>
                          <text x="80" y="68" textAnchor="middle" fontSize="11" fill="#6b7280">
                            ใช้ประสิทธิภาพ
                          </text>
                        </svg>
                        <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
                          สูตร: เวลารวม ÷ 97,440 นาที/ปี/คน
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Workload Distribution by Section ── */}
                {workload.length > 0 && Object.keys(workloadBySection).length > 0 && (() => {
                  const secEntries = Object.entries(workloadBySection).sort((a, b) => b[1].totalMin - a[1].totalMin);
                  const total = secEntries.reduce((sum, [, data]) => sum + data.totalMin, 0);
                  return (
                    <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', marginBottom: 20 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', margin: '0 0 12px' }}>ภาระงานตามส่วนงาน</p>
                      <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6', gap: 0 }}>
                        {secEntries.map(([sec, data]) => {
                          const pct = (data.totalMin / total) * 100;
                          const sColor = WORK_SECTION_COLORS[sec] || '#6b7280';
                          return (
                            <div
                              key={sec}
                              style={{
                                flex: pct,
                                background: sColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                overflow: 'hidden',
                                minWidth: pct > 12 ? 'auto' : 0,
                              }}
                            >
                              {pct > 12 && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', textAlign: 'center', zIndex: 1 }}>
                                  {pct.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                        {secEntries.map(([sec, data]) => {
                          const pct = (data.totalMin / total) * 100;
                          const sColor = WORK_SECTION_COLORS[sec] || '#6b7280';
                          return (
                            <div key={sec} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: sColor }} />
                              <span style={{ color: '#1f2937', fontWeight: 500 }}>{sec}</span>
                              <span style={{ color: '#6b7280' }}>({pct.toFixed(0)}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Section Summary with percentages */}
                {Object.keys(workloadBySection).length > 0 && (() => {
                  const secEntries = Object.entries(workloadBySection).sort((a, b) => b[1].totalMin - a[1].totalMin);
                  const secMax = secEntries[0]?.[1].totalMin || 1;
                  const totalMin = secEntries.reduce((sum, [, data]) => sum + data.totalMin, 0);
                  return (
                    <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', marginBottom: 14 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', margin: '0 0 12px' }}>ปริมาณงานตามส่วนงาน</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {secEntries.map(([sec, data]) => {
                          const manpower = data.totalMin / ANNUAL_MINUTES_PER_PERSON;
                          const pct = (data.totalMin / totalMin) * 100;
                          const sColor = WORK_SECTION_COLORS[sec] || '#6b7280';
                          return (
                            <div key={sec}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: sColor, flex: 1 }}>{sec}</span>
                                <span style={{ fontSize: 9, color: '#9ca3af' }}>{data.entries} งาน</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: sColor, minWidth: 50, textAlign: 'right' }}>{manpower.toFixed(1)} คน</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', minWidth: 35, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                              </div>
                              <div style={{ height: 8, borderRadius: 4, background: BULLET.bgBand }}>
                                <div style={{ height: '100%', borderRadius: 4, width: `${(data.totalMin / secMax) * 100}%`, background: sColor, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Function Summary with percentages */}
                {Object.keys(workloadByFn).length > 0 && (() => {
                  const fnEntries = Object.entries(workloadByFn).sort((a, b) => b[1].totalMin - a[1].totalMin);
                  const fnMax = fnEntries[0]?.[1].totalMin || 1;
                  const totalMin = fnEntries.reduce((sum, [, data]) => sum + data.totalMin, 0);
                  return (
                    <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', margin: '0 0 12px' }}>ปริมาณงานตาม Function</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {fnEntries.map(([fn, data]) => {
                          const manpower = data.totalMin / ANNUAL_MINUTES_PER_PERSON;
                          const pct = (data.totalMin / totalMin) * 100;
                          return (
                            <div key={fn}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', flex: 1 }}>{fn}</span>
                                <span style={{ fontSize: 9, color: '#9ca3af' }}>{data.entries} งาน</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.primary, minWidth: 50, textAlign: 'right' }}>{manpower.toFixed(1)} คน</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', minWidth: 35, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                              </div>
                              <div style={{ height: 8, borderRadius: 4, background: BULLET.bgBand }}>
                                <div style={{ height: '100%', borderRadius: 4, width: `${(data.totalMin / fnMax) * 100}%`, background: PALETTE.primary, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Working Hours Reference (Compact Strip) */}
                <div style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: WORKER_TYPE_INFO['5day'].color }} />
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>5 วัน:</span>
                      <span style={{ color: '#6b7280' }}>232 วัน / 1,624 ชม.</span>
                    </div>
                    <div style={{ width: 1, height: 16, background: '#e5e7eb' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: WORKER_TYPE_INFO['6day'].color }} />
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>6 วัน:</span>
                      <span style={{ color: '#6b7280' }}>284 วัน / 1,988 ชม.</span>
                    </div>
                  </div>
                </div>

                {/* Workload Table (Full — no vertical scroll, at bottom) */}
                <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff', marginBottom: 20 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                          {['#', 'ส่วนงาน', 'Function', 'รายละเอียดงาน', 'ผู้รับผิดชอบ', 'เวลา(นาที)', 'ความถี่', 'รวม/ปี', ''].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {workload.length === 0 ? (
                          <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                            <FileText size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                            <div>ยังไม่มีข้อมูลภาระงาน</div>
                          </td></tr>
                        ) : workload.map((w, i) => {
                          const mult = w.worker_type === '6day' ? FREQ_MULTIPLIER_6DAY : FREQ_MULTIPLIER;
                          const annual = w.time_usage_min * w.frequency_count * (mult[w.frequency] || 1);
                          const assignedNames = (w.assigned_personnel_ids || []).map(pid => {
                            const p = personnel.find(pp => pp.id === pid);
                            return p ? (p.nick_name || p.full_name.split(' ')[0]) : '';
                          }).filter(Boolean);
                          const secColor = WORK_SECTION_COLORS[w.work_section] || '#6b7280';
                          const wtInfo = WORKER_TYPE_INFO[w.worker_type as keyof typeof WORKER_TYPE_INFO] || WORKER_TYPE_INFO['5day'];
                          const details = [w.job_level1, w.job_level2, w.job_level3].filter(Boolean).join(' > ') || '-';
                          return (
                            <tr key={w.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ ...tdStyle, color: '#6b7280', width: 40 }}>{i + 1}</td>
                              <td style={tdStyle}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${secColor}15`, color: secColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{w.work_section || 'SHE'}</span></td>
                              <td style={{ ...tdStyle, fontWeight: 600, color: '#1f2937' }}>{w.function_name || '-'}</td>
                              <td style={{ ...tdStyle, fontSize: 11, color: '#374151' }} title={`Rank: ${w.job_rank} | Type: ${w.job_type === 'fixed' ? 'Fixed' : 'Variable'} | Days: ${w.worker_type === '6day' ? '6 days' : '5 days'}`}>
                                <div style={{ lineHeight: 1.3 }}>{details}</div>
                              </td>
                              <td style={{ ...tdStyle, fontSize: 11 }}>{assignedNames.length > 0 ? assignedNames.join(', ') : <span style={{ color: '#6b7280' }}>-</span>}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{w.time_usage_min.toLocaleString()}</td>
                              <td style={{ ...tdStyle, fontSize: 11 }}>{FREQ_LABELS[w.frequency] || w.frequency} ×{w.frequency_count}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#1f2937' }}>{annual.toLocaleString()}</td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <button onClick={() => { setEditW({ ...w }); setShowWModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} title="แก้ไข"><Pencil size={14} color={PALETTE.primary} /></button>
                                <button onClick={() => w.id && deleteWorkload(w.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} title="ลบ"><Trash2 size={14} color={STATUS.critical} /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════ MODALS ═══════ */}

      {/* Personnel Modal */}
      <Modal show={showPModal} title={editP?.id ? 'แก้ไขบุคลากร' : 'เพิ่มบุคลากร'} onClose={() => { setShowPModal(false); setEditP(null); }} onSave={savePersonnel} saving={saving}>
        {editP && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: editP.is_she_team !== false ? `${STATUS.ok}10` : `${STATUS.warning}10`, border: `1px solid ${editP.is_she_team !== false ? `${STATUS.ok}30` : `${STATUS.warning}30`}`, cursor: 'pointer' }} onClick={() => setEditP({ ...editP, is_she_team: !editP.is_she_team, department: !editP.is_she_team ? 'HSE' : editP.department })}>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: editP.is_she_team !== false ? STATUS.ok : STATUS.warning, position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: editP.is_she_team !== false ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{editP.is_she_team !== false ? 'บุคลากรทีม SHE' : 'ผู้ได้รับแต่งตั้ง (นอกแผนก SHE)'}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{editP.is_she_team !== false ? 'สังกัดแผนกความปลอดภัยและสิ่งแวดล้อม' : 'สังกัดแผนกอื่น แต่ได้รับแต่งตั้งตามกฎหมาย'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><FieldLabel>ชื่อ-นามสกุล *</FieldLabel><input style={inputStyle} value={editP.full_name} onChange={e => setEditP({ ...editP, full_name: e.target.value })} /></div>
              <div><FieldLabel>ชื่อเล่น</FieldLabel><input style={inputStyle} value={editP.nick_name} onChange={e => setEditP({ ...editP, nick_name: e.target.value })} /></div>
            </div>
            {editP.is_she_team === false && (
              <div><FieldLabel>แผนกที่สังกัด *</FieldLabel><input style={inputStyle} placeholder="เช่น Production, Engineering, QA" value={editP.department} onChange={e => setEditP({ ...editP, department: e.target.value })} /></div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><FieldLabel>ตำแหน่ง</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editP.position} onChange={e => setEditP({ ...editP, position: e.target.value })}>
                    <option value="">เลือก...</option>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>หน้าที่หลัก</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editP.responsibility} onChange={e => setEditP({ ...editP, responsibility: e.target.value })}>
                    <option value="">เลือก...</option>
                    {RESPONSIBILITIES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><FieldLabel>Employee Level</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editP.employee_level} onChange={e => setEditP({ ...editP, employee_level: e.target.value })}>
                    <option value="">เลือก...</option>
                    {EMPLOYEE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>การจ้าง</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editP.hiring_type} onChange={e => setEditP({ ...editP, hiring_type: e.target.value })}>
                    {Object.entries(HIRING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>ME Status</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editP.me_status} onChange={e => setEditP({ ...editP, me_status: e.target.value })}>
                    {ME_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
            </div>
            <div><FieldLabel>ประเภทการจ้าง</FieldLabel>
              <div style={{ position: 'relative' }}>
                <select style={selectStyle} value={editP.employment_type} onChange={e => setEditP({ ...editP, employment_type: e.target.value })}>
                  {Object.entries(EMP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><FieldLabel>โทรศัพท์</FieldLabel><input style={inputStyle} value={editP.phone} onChange={e => setEditP({ ...editP, phone: e.target.value })} /></div>
              <div><FieldLabel>อีเมล</FieldLabel><input style={inputStyle} type="email" value={editP.email} onChange={e => setEditP({ ...editP, email: e.target.value })} /></div>
            </div>
          </div>
        )}
      </Modal>

      {/* Requirement Modal */}
      <Modal show={showRModal} title={editR?.id ? 'แก้ไขประเภทใบอนุญาต' : 'เพิ่มประเภทใบอนุญาต'} onClose={() => { setShowRModal(false); setEditR(null); }} onSave={saveReq} saving={saving}>
        {editR && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><FieldLabel>ชื่อเต็ม *</FieldLabel><input style={inputStyle} placeholder="เจ้าหน้าที่ความปลอดภัยระดับวิชาชีพ" value={editR.name} onChange={e => setEditR({ ...editR, name: e.target.value })} /></div>
            <div><FieldLabel>ชื่อย่อ *</FieldLabel><input style={inputStyle} placeholder="จป.วิชาชีพ" value={editR.short_name} onChange={e => setEditR({ ...editR, short_name: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><FieldLabel>หมวด</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editR.category} onChange={e => setEditR({ ...editR, category: e.target.value })}>
                    <option value="safety">Safety</option>
                    <option value="environment">Environment</option>
                    <option value="health">Occupational Health</option>
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>จำนวนที่กฎหมายกำหนด</FieldLabel><input style={inputStyle} type="number" min="0" value={editR.required_count} onChange={e => setEditR({ ...editR, required_count: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: editR.is_required ? `${PALETTE.primary}10` : '#f3f4f6', border: `1px solid ${editR.is_required ? `${PALETTE.primary}30` : '#e5e7eb'}`, cursor: 'pointer' }} onClick={() => setEditR({ ...editR, is_required: !editR.is_required })}>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: editR.is_required ? PALETTE.primary : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: editR.is_required ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{editR.is_required ? 'บริษัทต้องมี (บังคับ)' : 'บุคลากรมี (ไม่บังคับ)'}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{editR.is_required ? 'นับเข้า compliance ตามกฎหมาย' : 'บุคลากรมีใบอนุญาตนี้ แต่บริษัทไม่จำเป็นต้องมี'}</div>
              </div>
            </div>
            <div><FieldLabel>อ้างอิงกฎหมาย</FieldLabel><input style={inputStyle} placeholder="พ.ร.บ. ความปลอดภัยฯ พ.ศ. 2554" value={editR.law_reference} onChange={e => setEditR({ ...editR, law_reference: e.target.value })} /></div>
            <div><FieldLabel>คำอธิบาย</FieldLabel><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={editR.description} onChange={e => setEditR({ ...editR, description: e.target.value })} /></div>
          </div>
        )}
      </Modal>

      {/* Workload Modal */}
      <Modal show={showWModal} title={editW?.id ? 'แก้ไขรายการ' : 'เพิ่มรายการภาระงาน'} onClose={() => { setShowWModal(false); setEditW(null); }} onSave={saveWorkload} saving={saving}>
        {editW && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><FieldLabel>ส่วนงาน</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editW.work_section} onChange={e => setEditW({ ...editW, work_section: e.target.value })}>
                    {WORK_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>ประเภทวันทำงาน</FieldLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['5day', '6day'] as const).map(wt => {
                    const info = WORKER_TYPE_INFO[wt];
                    const isActive = editW.worker_type === wt;
                    return (
                      <button key={wt} onClick={() => setEditW({ ...editW, worker_type: wt })} style={{
                        flex: 1, padding: '8px 10px', borderRadius: 8, border: `2px solid ${isActive ? info.color : '#e5e7eb'}`,
                        background: isActive ? `${info.color}10` : '#f9fafb', cursor: 'pointer', textAlign: 'center',
                        fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? info.color : '#6b7280', transition: 'all 0.15s',
                      }}>
                        {wt === '5day' ? '5 วัน' : '6 วัน'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {(() => {
              const wti = WORKER_TYPE_INFO[editW.worker_type as keyof typeof WORKER_TYPE_INFO] || WORKER_TYPE_INFO['5day'];
              return (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: `${wti.color}08`, border: `1px solid ${wti.color}20`, fontSize: 11, color: '#555' }}>
                  <b style={{ color: wti.color }}>{wti.label}</b>: {wti.days} วัน/ปี · {wti.hours.toLocaleString()} ชม. · {wti.minutes.toLocaleString()} นาที
                  {editW.worker_type === '6day' && (
                    <div style={{ marginTop: 4, fontSize: 10, color: '#888' }}>
                      หักวันหยุดนักขัตฤกษ์ 15 วัน, วันหยุดสุดสัปดาห์ 52 วัน, Heat break 6 วัน, ลาป่วย 5 วัน, ลาอื่น 3 วัน
                    </div>
                  )}
                </div>
              );
            })()}
            <div><FieldLabel>Function</FieldLabel><input style={inputStyle} placeholder="Safety & Health" value={editW.function_name} onChange={e => setEditW({ ...editW, function_name: e.target.value })} /></div>
            <div><FieldLabel>Level 1 (หัวข้องานหลัก)</FieldLabel><input style={inputStyle} value={editW.job_level1} onChange={e => setEditW({ ...editW, job_level1: e.target.value })} /></div>
            <div><FieldLabel>Level 2 (ฟังก์ชั่นย่อย)</FieldLabel><input style={inputStyle} value={editW.job_level2} onChange={e => setEditW({ ...editW, job_level2: e.target.value })} /></div>
            <div><FieldLabel>Level 3 (รายละเอียด)</FieldLabel><input style={inputStyle} value={editW.job_level3} onChange={e => setEditW({ ...editW, job_level3: e.target.value })} /></div>
            {/* Assigned Personnel Multi-select */}
            <div>
              <FieldLabel>ผู้รับผิดชอบ (เลือกได้หลายคน)</FieldLabel>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb', maxHeight: 150, overflowY: 'auto', padding: 6 }}>
                {personnel.filter(p => p.is_active).length === 0 ? (
                  <div style={{ padding: 8, color: '#999', fontSize: 12 }}>ยังไม่มีบุคลากร — เพิ่มในแท็บ &quot;บุคลากร&quot;</div>
                ) : personnel.filter(p => p.is_active).map(p => {
                  const isSelected = (editW.assigned_personnel_ids || []).includes(p.id!);
                  return (
                    <div key={p.id} onClick={() => {
                      const ids = editW.assigned_personnel_ids || [];
                      setEditW({ ...editW, assigned_personnel_ids: isSelected ? ids.filter(id => id !== p.id!) : [...ids, p.id!] });
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                      background: isSelected ? `${PALETTE.primary}10` : 'transparent', transition: 'background 0.1s',
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? PALETTE.primary : '#d1d5db'}`,
                        background: isSelected ? PALETTE.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', flexShrink: 0,
                      }}>
                        {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: 13, color: '#333' }}>{p.nick_name ? `${p.nick_name} (${p.full_name})` : p.full_name}</span>
                      <span style={{ fontSize: 10, color: '#999', marginLeft: 'auto' }}>{p.position}</span>
                    </div>
                  );
                })}
              </div>
              {(editW.assigned_personnel_ids || []).length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, color: PALETTE.primary }}>
                  เลือกแล้ว {editW.assigned_personnel_ids.length} คน
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><FieldLabel>Job Rank</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editW.job_rank} onChange={e => setEditW({ ...editW, job_rank: e.target.value })}>
                    <option value="A">A (ทักษะสูง)</option>
                    <option value="B">B (ซับซ้อน)</option>
                    <option value="C">C (ทั่วไป)</option>
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>Job Type</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editW.job_type} onChange={e => setEditW({ ...editW, job_type: e.target.value })}>
                    <option value="fixed">Fixed</option>
                    <option value="variable">Variable</option>
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>เวลา (นาที)</FieldLabel><input style={inputStyle} type="number" min="0" value={editW.time_usage_min} onChange={e => setEditW({ ...editW, time_usage_min: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><FieldLabel>ความถี่</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <select style={selectStyle} value={editW.frequency} onChange={e => setEditW({ ...editW, frequency: e.target.value })}>
                    <option value="daily">รายวัน</option>
                    <option value="weekly">รายสัปดาห์</option>
                    <option value="monthly">รายเดือน</option>
                    <option value="yearly">รายปี</option>
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
              </div>
              <div><FieldLabel>จำนวนครั้ง</FieldLabel><input style={inputStyle} type="number" min="1" value={editW.frequency_count} onChange={e => setEditW({ ...editW, frequency_count: parseInt(e.target.value) || 1 })} /></div>
            </div>
          </div>
        )}
      </Modal>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

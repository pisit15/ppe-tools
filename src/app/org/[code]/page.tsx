'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, use } from 'react';
import OrgChart, { OrgPerson } from '@/components/OrgChart';
import { PALETTE, RESP_COLORS } from '@/lib/she-theme';
import { Search, Lock, AlertTriangle, X } from 'lucide-react';

type Company = { company_id: string; company_name: string };

const STATUS_LABELS: Record<string, string> = {
  active: 'ปฏิบัติงาน', on_leave: 'ลาพัก', transferred: 'โยกย้าย',
  resigned: 'ลาออก', vacant: 'ตำแหน่งว่าง',
};

export default function PublicOrgPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const initialCode = (rawCode || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 20);

  const [pin, setPin] = useState(initialCode);
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [scope, setScope] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<OrgPerson | null>(null);

  const tryLoad = async (codeArg: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/she-workforce/public-org?code=${encodeURIComponent(codeArg)}`);
      const j = await r.json();
      if (!r.ok || j.error) {
        setError(j.error || 'รหัสไม่ถูกต้อง');
        setAuthed(false);
        return;
      }
      setPeople(j.data || []);
      setCompanies(j.companies || []);
      setScope(j.scope);
      setLabel(j.label);
      setAuthed(true);
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  };

  // Auto-try if URL had a code
  useEffect(() => {
    if (initialCode && initialCode.length >= 4) tryLoad(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f3460 0%, #533483 100%)', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{ background: PALETTE.primary, color: '#fff', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={26} />
            </div>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111', textAlign: 'center', margin: '0 0 8px' }}>
            ผังองค์กร EA SHE
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', margin: '0 0 20px' }}>
            กรุณากรอกรหัสเข้าชม 4 หลักที่ได้รับ
          </p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && tryLoad(pin)}
            placeholder="0000"
            inputMode="numeric"
            style={{
              width: '100%', textAlign: 'center', fontSize: 28, fontWeight: 700,
              padding: '14px 12px', borderRadius: 12, border: '2px solid #e5e7eb',
              letterSpacing: 12, color: '#111', background: '#f9fafb', outline: 'none',
              fontFamily: 'monospace',
            }}
            autoFocus
          />
          {error && (
            <div style={{ marginTop: 12, padding: 10, background: '#fee2e2', borderRadius: 8, color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <button
            onClick={() => tryLoad(pin)}
            disabled={pin.length < 4 || loading}
            style={{
              width: '100%', marginTop: 16, padding: 12, borderRadius: 10, border: 'none',
              background: PALETTE.primary, color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: pin.length < 4 ? 'not-allowed' : 'pointer',
              opacity: pin.length < 4 || loading ? 0.5 : 1,
            }}
          >
            {loading ? 'กำลังตรวจสอบ...' : 'เข้าชมผังองค์กร'}
          </button>
          <p style={{ marginTop: 16, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
            หากไม่มีรหัส กรุณาติดต่อผู้ดูแลระบบ EA SHE Tools
          </p>
        </div>
      </div>
    );
  }

  // Authed view
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: 0 }}>
            ผังองค์กร EA SHE
          </h1>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {scope === 'company' && companies.length > 0
              ? `บริษัท: ${companies[0].company_name}`
              : 'ทุกบริษัท (ภาพรวม)'}
            {label && ` • ${label}`}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ ตำแหน่ง..."
            style={{ paddingLeft: 32, paddingRight: 12, paddingBlock: 8, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: 220, color: '#111' }}
          />
        </div>
      </header>

      {/* Chart */}
      <main style={{ flex: 1, padding: 12 }}>
        <div style={{ background: '#fff', borderRadius: 12, height: 'calc(100vh - 90px)', overflow: 'hidden' }}>
          <OrgChart
            people={people}
            editable={false}
            searchQuery={search}
            onNodeClick={(p) => setDetail(p)}
          />
        </div>
      </main>

      {/* Detail modal (read-only) */}
      {detail && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              background: `linear-gradient(135deg, ${detail.chart_node_color || (detail.responsibility ? RESP_COLORS[detail.responsibility] : null) || PALETTE.primary} 0%, #533483 100%)`,
              padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>รายละเอียดพนักงาน</h3>
              <button onClick={() => setDetail(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#fff" />
              </button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DetailRow label="ชื่อ-นามสกุล" value={detail.full_name} bold />
              {detail.nick_name && <DetailRow label="ชื่อเล่น" value={detail.nick_name} />}
              {detail.position && <DetailRow label="ตำแหน่ง" value={detail.position} />}
              {detail.department && <DetailRow label="แผนก" value={detail.department} />}
              {detail.responsibility && <DetailRow label="หน้าที่หลัก" value={detail.responsibility} />}
              <DetailRow label="สถานะ" value={STATUS_LABELS[detail.status || 'active'] || detail.status || '-'} />
              {detail.details && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>รายละเอียด</div>
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, color: '#111', whiteSpace: 'pre-wrap' }}>
                    {detail.details}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 700 : 500, color: '#111' }}>{value}</div>
    </div>
  );
}

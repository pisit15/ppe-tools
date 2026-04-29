'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ClipboardCheck, Plus, Calendar, User, Building2, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';

const VIZ = {
  primary: '#14b8a6',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#f0fdfa',
  text: '#333333',
  lightText: '#666666',
};

interface Assessment {
  id: number;
  company_id: string;
  assessment_type: 'self' | 'admin';
  assessment_date: string;
  assessor_name: string;
  auditee_name: string;
  status: 'draft' | 'completed';
  total_score: number;
  max_possible_score: number;
  notes: string;
}

export default function SiteVisitOverview() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [companies, setCompanies] = useState<Array<{ company_id: string; company_name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const companyId = user?.companyId || '';

  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCompanies(data);
        else if (Array.isArray(data?.data)) setCompanies(data.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, []);

  async function fetchAssessments() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (!isAdmin && companyId) params.set('company_id', companyId);
      const res = await fetch(`/api/site-visit/assessments?${params}`);
      const json = await res.json();
      if (json.data) setAssessments(json.data);
    } catch (err) {
      console.error('Failed to fetch assessments:', err);
    } finally {
      setLoading(false);
    }
  }

  const getCompanyName = (cid: string) => {
    const c = companies.find(x => x.company_id === cid);
    return c?.company_name || cid.toUpperCase();
  };

  const getScorePercent = (a: Assessment) =>
    a.max_possible_score > 0 ? Math.round((a.total_score / a.max_possible_score) * 100) : 0;

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return VIZ.positive;
    if (pct >= 60) return VIZ.secondary;
    return VIZ.accent;
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: VIZ.text, display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClipboardCheck size={32} color={VIZ.primary} />
            ตรวจเยี่ยมสถานประกอบการ
          </h1>
          <p style={{ color: VIZ.lightText, marginTop: 4, fontSize: 15 }}>
            ประเมินสถานะ Safety & Environment ของแต่ละบริษัท
          </p>
        </div>
        {!isAdmin && companyId && (
          <Link
            href={`/projects/site-visit/${companyId}/assess`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: VIZ.primary, color: '#fff', textDecoration: 'none',
            }}
          >
            <Plus size={18} /> เริ่มประเมินใหม่
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'ประเมินทั้งหมด', value: assessments.length, color: VIZ.primary },
          { label: 'เสร็จสิ้น', value: assessments.filter(a => a.status === 'completed').length, color: VIZ.positive },
          { label: 'ร่างอยู่', value: assessments.filter(a => a.status === 'draft').length, color: VIZ.secondary },
          { label: 'บริษัท', value: new Set(assessments.map(a => a.company_id)).size, color: '#4E79A7' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 12, padding: '20px 24px',
            borderLeft: `4px solid ${kpi.color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ color: VIZ.lightText, fontSize: 13, marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: VIZ.text }}>รายการประเมินล่าสุด</h2>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: VIZ.lightText }}>กำลังโหลด...</div>
        ) : assessments.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <FileText size={48} color={VIZ.muted} style={{ margin: '0 auto 16px' }} />
            <p style={{ color: VIZ.lightText, fontSize: 15 }}>ยังไม่มีการประเมิน</p>
            {companyId && (
              <Link
                href={`/projects/site-visit/${companyId}/assess`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16,
                  padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                  background: VIZ.primary, color: '#fff', textDecoration: 'none',
                }}
              >
                <Plus size={18} /> เริ่มประเมินครั้งแรก
              </Link>
            )}
          </div>
        ) : (
          <div>
            {assessments.map((a) => {
              const pct = getScorePercent(a);
              return (
                <Link
                  key={a.id}
                  href={`/projects/site-visit/${a.company_id}/assess?id=${a.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '16px 24px',
                    borderBottom: '1px solid #f5f5f5', textDecoration: 'none', color: 'inherit',
                  }}
                  className="hover:bg-gray-50"
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Building2 size={16} color={VIZ.primary} />
                      <span style={{ fontWeight: 600, fontSize: 15, color: VIZ.text }}>
                        {getCompanyName(a.company_id)}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                        background: a.assessment_type === 'admin' ? '#dbeafe' : '#f0fdf4',
                        color: a.assessment_type === 'admin' ? '#2563eb' : '#16a34a',
                      }}>
                        {a.assessment_type === 'admin' ? 'Admin Audit' : 'Self-Evaluation'}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                        background: a.status === 'completed' ? '#f0fdf4' : '#fffbeb',
                        color: a.status === 'completed' ? '#16a34a' : '#d97706',
                      }}>
                        {a.status === 'completed' ? 'เสร็จสิ้น' : 'ร่าง'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: VIZ.lightText }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={13} /> {a.assessment_date}
                      </span>
                      {a.assessor_name && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <User size={13} /> {a.assessor_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {a.status === 'completed' && a.max_possible_score > 0 && (
                    <div style={{ textAlign: 'right', marginRight: 16 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: getScoreColor(pct) }}>{pct}%</div>
                      <div style={{ fontSize: 12, color: VIZ.lightText }}>{a.total_score}/{a.max_possible_score}</div>
                    </div>
                  )}
                  <ChevronRight size={20} color={VIZ.neutral} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { History, Calendar, User, Building2, ChevronRight, TrendingUp, BarChart3 } from 'lucide-react';
import Link from 'next/link';

const VIZ = {
  primary: '#14b8a6',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
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

export default function CompanyHistoryPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [companyName, setCompanyName] = useState(companyId.toUpperCase());
  const [assessments, setAssessments] = useState<Assessment[]>([]);

  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        const c = list.find((x: { company_id: string }) => x.company_id === companyId);
        if (c) setCompanyName(c.company_name);
      })
      .catch(() => {});
  }, [companyId]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [companyId]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const res = await fetch(`/api/site-visit/assessments?company_id=${companyId}`);
      const json = await res.json();
      if (json.data) setAssessments(json.data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  }

  const completed = assessments.filter(a => a.status === 'completed');
  const getScorePct = (a: Assessment) =>
    a.max_possible_score > 0 ? Math.round((a.total_score / a.max_possible_score) * 100) : 0;

  // Trend: compare last 2 completed assessments
  const trend = completed.length >= 2
    ? getScorePct(completed[0]) - getScorePct(completed[1])
    : null;

  return (
    <div style={{ padding: '32px', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: VIZ.text, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <History size={28} color={VIZ.primary} />
        ประวัติการประเมิน — {companyName}
      </h1>
      <p style={{ color: VIZ.lightText, fontSize: 14, marginBottom: 24 }}>
        ผลการประเมินทั้งหมด เรียงตามวันที่ล่าสุด
      </p>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${VIZ.primary}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, color: VIZ.lightText }}>ประเมินทั้งหมด</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: VIZ.primary }}>{assessments.length}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${VIZ.positive}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, color: VIZ.lightText }}>เสร็จสิ้น</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: VIZ.positive }}>{completed.length}</div>
        </div>
        {completed.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${VIZ.secondary}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12, color: VIZ.lightText }}>คะแนนล่าสุด</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: VIZ.secondary }}>{getScorePct(completed[0])}%</div>
          </div>
        )}
        {trend !== null && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${trend >= 0 ? VIZ.positive : VIZ.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12, color: VIZ.lightText }}>แนวโน้ม</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: trend >= 0 ? VIZ.positive : VIZ.accent, display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={20} style={{ transform: trend < 0 ? 'rotate(180deg)' : undefined }} />
              {trend > 0 ? '+' : ''}{trend}%
            </div>
          </div>
        )}
      </div>

      {/* Score Trend Chart (simple SVG bar chart) */}
      {completed.length > 1 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: VIZ.text, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BarChart3 size={18} color={VIZ.primary} /> แนวโน้มคะแนน
          </h2>
          <svg viewBox={`0 0 ${Math.max(completed.length * 80, 300)} 160`} style={{ width: '100%', height: 160 }}>
            {[...completed].reverse().map((a, i) => {
              const pct = getScorePct(a);
              const barH = (pct / 100) * 120;
              const x = i * 80 + 20;
              const color = pct >= 80 ? VIZ.positive : pct >= 60 ? VIZ.secondary : VIZ.accent;
              return (
                <g key={a.id}>
                  <rect x={x} y={140 - barH} width={50} height={barH} rx={4} fill={color} opacity={0.85} />
                  <text x={x + 25} y={140 - barH - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
                    {pct}%
                  </text>
                  <text x={x + 25} y={155} textAnchor="middle" fontSize={10} fill={VIZ.lightText}>
                    {a.assessment_date.slice(5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Assessment List */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: VIZ.lightText }}>กำลังโหลด...</div>
        ) : assessments.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: VIZ.lightText }}>ยังไม่มีประวัติการประเมิน</div>
        ) : (
          assessments.map(a => {
            const pct = getScorePct(a);
            return (
              <Link
                key={a.id}
                href={`/projects/site-visit/${companyId}/assess?id=${a.id}`}
                style={{
                  display: 'flex', alignItems: 'center', padding: '16px 24px',
                  borderBottom: '1px solid #f5f5f5', textDecoration: 'none', color: 'inherit',
                }}
                className="hover:bg-gray-50"
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: VIZ.text }}>
                      {a.assessment_date}
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
                    {a.assessor_name && <span><User size={12} style={{ display: 'inline', verticalAlign: -1 }} /> {a.assessor_name}</span>}
                    {a.notes && <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes}</span>}
                  </div>
                </div>
                {a.status === 'completed' && a.max_possible_score > 0 && (
                  <div style={{ textAlign: 'right', marginRight: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: pct >= 80 ? VIZ.positive : pct >= 60 ? VIZ.secondary : VIZ.accent }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: 12, color: VIZ.lightText }}>{a.total_score}/{a.max_possible_score}</div>
                  </div>
                )}
                <ChevronRight size={18} color={VIZ.neutral} />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  ClipboardCheck, Save, CheckCircle, ChevronDown, ChevronUp,
  AlertTriangle, Calendar, User, MessageSquare, Wrench, Info,
} from 'lucide-react';

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

interface Category {
  id: number;
  name: string;
  name_th: string;
  sort_order: number;
}

interface Criterion {
  id: number;
  item_id: number;
  score: number;
  description: string;
}

interface Item {
  id: number;
  category_id: number;
  item_no: number;
  question: string;
  max_score: number;
  sort_order: number;
  site_visit_criteria: Criterion[];
}

interface ResponseData {
  score: number;
  comment: string;
  corrective_action: string;
  due_date: string;
  is_na: boolean;
}

export default function AssessmentForm() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const companyId = params.companyId as string;
  const existingId = searchParams.get('id');
  const [companyName, setCompanyName] = useState(companyId.toUpperCase());

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Record<number, ResponseData>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set());
  const [assessmentId, setAssessmentId] = useState<number | null>(existingId ? parseInt(existingId) : null);
  const [assessmentType, setAssessmentType] = useState<'self' | 'admin'>(isAdmin ? 'admin' : 'self');
  const [assessorName, setAssessorName] = useState('');
  const [auditeeName, setAuditeeName] = useState('');
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load categories and items
      const [catRes, itemRes] = await Promise.all([
        fetch('/api/site-visit/categories'),
        fetch('/api/site-visit/items'),
      ]);
      const catJson = await catRes.json();
      const itemJson = await itemRes.json();
      if (catJson.data) setCategories(catJson.data);
      if (itemJson.data) {
        setItems(itemJson.data);
        // Expand first category by default
        if (catJson.data?.[0]) {
          setExpandedCategories(new Set([catJson.data[0].id]));
        }
      }

      // Load existing assessment if editing
      if (existingId) {
        const respRes = await fetch(`/api/site-visit/responses?assessment_id=${existingId}`);
        const respJson = await respRes.json();
        if (respJson.data) {
          const map: Record<number, ResponseData> = {};
          for (const r of respJson.data) {
            map[r.item_id] = {
              score: r.score,
              comment: r.comment || '',
              corrective_action: r.corrective_action || '',
              due_date: r.due_date || '',
              is_na: r.is_na || false,
            };
          }
          setResponses(map);
        }
        // Load assessment metadata
        const aRes = await fetch(`/api/site-visit/assessments?company_id=${companyId}`);
        const aJson = await aRes.json();
        const found = aJson.data?.find((a: { id: number }) => a.id === parseInt(existingId));
        if (found) {
          setAssessmentType(found.assessment_type);
          setAssessorName(found.assessor_name || '');
          setAuditeeName(found.auditee_name || '');
          setAssessmentDate(found.assessment_date);
          setNotes(found.notes || '');
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }

  const setScore = useCallback((itemId: number, score: number) => {
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { comment: '', corrective_action: '', due_date: '', is_na: false }), score },
    }));
  }, []);

  const setField = useCallback((itemId: number, field: keyof ResponseData, value: string | boolean) => {
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { score: 0, comment: '', corrective_action: '', due_date: '', is_na: false }), [field]: value },
    }));
  }, []);

  const toggleNA = useCallback((itemId: number) => {
    setResponses(prev => {
      const cur = prev[itemId] || { score: 0, comment: '', corrective_action: '', due_date: '', is_na: false };
      return { ...prev, [itemId]: { ...cur, is_na: !cur.is_na, score: !cur.is_na ? 0 : cur.score } };
    });
  }, []);

  const toggleCategory = (catId: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const toggleDetails = (itemId: number) => {
    setExpandedDetails(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  async function handleSave(finalize: boolean) {
    setSaving(true);
    try {
      let aid = assessmentId;

      // Create or update assessment
      if (!aid) {
        const res = await fetch('/api/site-visit/assessments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyId,
            assessment_type: assessmentType,
            assessment_date: assessmentDate,
            assessor_name: assessorName,
            auditee_name: auditeeName,
            notes,
            status: finalize ? 'completed' : 'draft',
            total_score: totalScore,
            max_possible_score: maxPossible,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        aid = json.data.id;
        setAssessmentId(aid);
      } else {
        await fetch('/api/site-visit/assessments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: aid,
            assessment_date: assessmentDate,
            assessor_name: assessorName,
            auditee_name: auditeeName,
            notes,
            status: finalize ? 'completed' : 'draft',
            total_score: totalScore,
            max_possible_score: maxPossible,
          }),
        });
      }

      // Save all responses
      const responseRows = items.map(item => ({
        assessment_id: aid,
        item_id: item.id,
        score: responses[item.id]?.is_na ? 0 : (responses[item.id]?.score ?? 0),
        comment: responses[item.id]?.comment || '',
        corrective_action: responses[item.id]?.corrective_action || '',
        due_date: responses[item.id]?.due_date || null,
        is_na: responses[item.id]?.is_na || false,
      }));

      await fetch('/api/site-visit/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: responseRows }),
      });

      setToast({ type: 'success', msg: finalize ? 'บันทึกและส่งผลเรียบร้อย' : 'บันทึกร่างเรียบร้อย' });
      if (finalize) {
        setTimeout(() => router.push(`/projects/site-visit/${companyId}/history`), 1500);
      }
    } catch (err) {
      console.error('Save failed:', err);
      setToast({ type: 'error', msg: 'บันทึกไม่สำเร็จ' });
    } finally {
      setSaving(false);
    }
  }

  // Compute totals
  const answeredItems = items.filter(i => responses[i.id] && !responses[i.id].is_na);
  const naItems = items.filter(i => responses[i.id]?.is_na);
  const totalScore = answeredItems.reduce((sum, i) => sum + (responses[i.id]?.score || 0), 0);
  const maxPossible = (items.length - naItems.length) * 4;
  const scorePct = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

  const getItemsByCategory = (catId: number) =>
    items.filter(i => i.category_id === catId).sort((a, b) => a.sort_order - b.sort_order);

  const getCategoryScore = (catId: number) => {
    const catItems = getItemsByCategory(catId);
    const answered = catItems.filter(i => responses[i.id] && !responses[i.id]?.is_na);
    const score = answered.reduce((s, i) => s + (responses[i.id]?.score || 0), 0);
    const na = catItems.filter(i => responses[i.id]?.is_na).length;
    const max = (catItems.length - na) * 4;
    return { score, max, pct: max > 0 ? Math.round((score / max) * 100) : 0 };
  };

  if (loading) {
    return (
      <div style={{ padding: 64, textAlign: 'center', color: VIZ.lightText }}>
        กำลังโหลดแบบประเมิน...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 50,
          padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
          background: toast.type === 'success' ? VIZ.positive : VIZ.accent,
          color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: VIZ.text, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardCheck size={28} color={VIZ.primary} />
          {existingId ? 'แก้ไขการประเมิน' : 'ประเมินใหม่'} — {companyName}
        </h1>
      </div>

      {/* Meta Info */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: VIZ.lightText, display: 'block', marginBottom: 4 }}>ประเภทการประเมิน</label>
            <select
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value as 'self' | 'admin')}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #e5e7eb', fontSize: 14, color: VIZ.text,
              }}
            >
              <option value="self">Self-Evaluation</option>
              {isAdmin && <option value="admin">Admin Audit</option>}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: VIZ.lightText, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Calendar size={13} /> วันที่ประเมิน
            </label>
            <input
              type="date"
              value={assessmentDate}
              onChange={(e) => setAssessmentDate(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #e5e7eb', fontSize: 14, color: VIZ.text,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: VIZ.lightText, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <User size={13} /> ผู้ประเมิน
            </label>
            <input
              type="text"
              value={assessorName}
              onChange={(e) => setAssessorName(e.target.value)}
              placeholder="ชื่อผู้ประเมิน"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #e5e7eb', fontSize: 14, color: VIZ.text,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: VIZ.lightText, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <User size={13} /> ผู้รับการประเมิน
            </label>
            <input
              type="text"
              value={auditeeName}
              onChange={(e) => setAuditeeName(e.target.value)}
              placeholder="ชื่อผู้รับการประเมิน"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #e5e7eb', fontSize: 14, color: VIZ.text,
              }}
            />
          </div>
        </div>
      </div>

      {/* Score Summary Bar */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '16px 24px', marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 24,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: scorePct >= 80 ? VIZ.positive : scorePct >= 60 ? VIZ.secondary : VIZ.accent }}>
              {scorePct}%
            </span>
            <span style={{ fontSize: 14, color: VIZ.lightText }}>{totalScore}/{maxPossible} คะแนน</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', marginTop: 8 }}>
            <div style={{
              height: '100%', borderRadius: 3, width: `${scorePct}%`, transition: 'width 0.3s',
              background: scorePct >= 80 ? VIZ.positive : scorePct >= 60 ? VIZ.secondary : VIZ.accent,
            }} />
          </div>
        </div>
        <div style={{ fontSize: 13, color: VIZ.lightText, textAlign: 'right' }}>
          ตอบแล้ว {answeredItems.length + naItems.length}/{items.length}
          {naItems.length > 0 && <span> (N/A: {naItems.length})</span>}
        </div>
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${VIZ.primary}`,
            background: '#fff', color: VIZ.primary, fontWeight: 600, fontSize: 13,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Save size={15} /> บันทึกร่าง
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: VIZ.positive, color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <CheckCircle size={15} /> ส่งผลประเมิน
        </button>
      </div>

      {/* Categories & Items */}
      {categories.map(cat => {
        const catItems = getItemsByCategory(cat.id);
        if (catItems.length === 0) return null;
        const isExpanded = expandedCategories.has(cat.id);
        const catScore = getCategoryScore(cat.id);

        return (
          <div key={cat.id} style={{ marginBottom: 16 }}>
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(cat.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 20px', background: VIZ.bg, borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                border: `1px solid ${VIZ.primary}30`, cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {isExpanded ? <ChevronUp size={20} color={VIZ.primary} /> : <ChevronDown size={20} color={VIZ.primary} />}
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: VIZ.text }}>{cat.name_th}</span>
                <span style={{ fontSize: 13, color: VIZ.lightText, marginLeft: 8 }}>({catItems.length} ข้อ)</span>
              </div>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: catScore.pct >= 80 ? VIZ.positive : catScore.pct >= 60 ? VIZ.secondary : catScore.pct > 0 ? VIZ.accent : VIZ.neutral,
              }}>
                {catScore.max > 0 ? `${catScore.score}/${catScore.max} (${catScore.pct}%)` : '—'}
              </span>
            </button>

            {/* Items */}
            {isExpanded && (
              <div style={{ border: `1px solid ${VIZ.primary}20`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                {catItems.map((item, idx) => {
                  const resp = responses[item.id] || { score: 0, comment: '', corrective_action: '', due_date: '', is_na: false };
                  const criteria = (item.site_visit_criteria || []).sort((a, b) => a.score - b.score);
                  const showDetails = expandedDetails.has(item.id);

                  return (
                    <div key={item.id} style={{
                      padding: '16px 20px',
                      borderBottom: idx < catItems.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: resp.is_na ? '#fafafa' : '#fff',
                    }}>
                      {/* Question */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: VIZ.primary, minWidth: 28 }}>
                          {item.item_no}.
                        </span>
                        <span style={{ fontSize: 14, color: VIZ.text, flex: 1, opacity: resp.is_na ? 0.5 : 1 }}>
                          {item.question}
                        </span>
                        <button
                          onClick={() => toggleNA(item.id)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                            border: `1px solid ${resp.is_na ? VIZ.accent : VIZ.neutral}`,
                            background: resp.is_na ? '#fef2f2' : '#fff',
                            color: resp.is_na ? VIZ.accent : VIZ.lightText,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          N/A
                        </button>
                      </div>

                      {/* Score buttons */}
                      {!resp.is_na && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, marginLeft: 36 }}>
                          {[0, 1, 2, 3, 4].map(s => {
                            const criterion = criteria.find(c => c.score === s);
                            const desc = criterion?.description || '-';
                            const isSelected = resp.score === s;
                            const isClickable = desc !== '-';
                            return (
                              <button
                                key={s}
                                onClick={() => isClickable && setScore(item.id, s)}
                                disabled={!isClickable}
                                title={desc !== '-' ? desc : undefined}
                                style={{
                                  width: 40, height: 36, borderRadius: 8, fontSize: 14, fontWeight: 700,
                                  border: isSelected ? 'none' : `1px solid ${isClickable ? VIZ.primary + '40' : '#e5e7eb'}`,
                                  background: isSelected
                                    ? (s === 0 ? VIZ.accent : s <= 2 ? VIZ.secondary : VIZ.positive)
                                    : isClickable ? '#fff' : '#fafafa',
                                  color: isSelected ? '#fff' : isClickable ? VIZ.text : VIZ.muted,
                                  cursor: isClickable ? 'pointer' : 'default',
                                  opacity: isClickable ? 1 : 0.4,
                                  transition: 'all 0.15s',
                                }}
                              >
                                {s}
                              </button>
                            );
                          })}

                          {/* Info toggle for criteria descriptions */}
                          <button
                            onClick={() => toggleDetails(item.id)}
                            style={{
                              width: 36, height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
                              background: showDetails ? VIZ.bg : '#fff', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Info size={16} color={showDetails ? VIZ.primary : VIZ.lightText} />
                          </button>
                        </div>
                      )}

                      {/* Criteria Descriptions */}
                      {showDetails && !resp.is_na && (
                        <div style={{
                          marginLeft: 36, marginBottom: 8, padding: '10px 14px',
                          background: '#f8fafc', borderRadius: 8, fontSize: 13,
                        }}>
                          {criteria.filter(c => c.description !== '-').map(c => (
                            <div key={c.score} style={{
                              display: 'flex', gap: 8, padding: '4px 0',
                              color: resp.score === c.score ? VIZ.primary : VIZ.lightText,
                              fontWeight: resp.score === c.score ? 600 : 400,
                            }}>
                              <span style={{ minWidth: 20, fontWeight: 700 }}>{c.score}:</span>
                              <span>{c.description}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Comment & Corrective Action */}
                      {!resp.is_na && (
                        <div style={{ marginLeft: 36, display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <MessageSquare size={14} color={VIZ.neutral} style={{ position: 'absolute', left: 10, top: 9 }} />
                            <input
                              type="text"
                              value={resp.comment}
                              onChange={(e) => setField(item.id, 'comment', e.target.value)}
                              placeholder="ความคิดเห็น..."
                              style={{
                                width: '100%', padding: '6px 10px 6px 30px', borderRadius: 6,
                                border: '1px solid #e5e7eb', fontSize: 13, color: VIZ.text,
                              }}
                            />
                          </div>
                          {resp.score < 3 && resp.score > 0 && (
                            <>
                              <div style={{ flex: 1, position: 'relative' }}>
                                <Wrench size={14} color={VIZ.secondary} style={{ position: 'absolute', left: 10, top: 9 }} />
                                <input
                                  type="text"
                                  value={resp.corrective_action}
                                  onChange={(e) => setField(item.id, 'corrective_action', e.target.value)}
                                  placeholder="Corrective Action..."
                                  style={{
                                    width: '100%', padding: '6px 10px 6px 30px', borderRadius: 6,
                                    border: `1px solid ${VIZ.secondary}40`, fontSize: 13, color: VIZ.text,
                                  }}
                                />
                              </div>
                              <input
                                type="date"
                                value={resp.due_date}
                                onChange={(e) => setField(item.id, 'due_date', e.target.value)}
                                style={{
                                  padding: '6px 10px', borderRadius: 6,
                                  border: `1px solid ${VIZ.secondary}40`, fontSize: 13, color: VIZ.text,
                                  width: 140,
                                }}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Notes */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 20, marginTop: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: VIZ.text, display: 'block', marginBottom: 8 }}>
          บันทึกเพิ่มเติม
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="หมายเหตุ หรือข้อเสนอแนะเพิ่มเติม..."
          rows={3}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid #e5e7eb', fontSize: 14, color: VIZ.text, resize: 'vertical',
          }}
        />
      </div>

      {/* Bottom action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingBottom: 48 }}>
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          style={{
            padding: '12px 24px', borderRadius: 10, border: `1px solid ${VIZ.primary}`,
            background: '#fff', color: VIZ.primary, fontWeight: 600, fontSize: 15,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <Save size={18} /> บันทึกร่าง
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          style={{
            padding: '12px 24px', borderRadius: 10, border: 'none',
            background: VIZ.positive, color: '#fff', fontWeight: 600, fontSize: 15,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <CheckCircle size={18} /> ส่งผลประเมิน
        </button>
      </div>
    </div>
  );
}

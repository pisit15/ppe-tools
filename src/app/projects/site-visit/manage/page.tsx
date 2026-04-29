'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { Settings, ChevronDown, ChevronUp, Edit2, Plus, Trash2, Save, X } from 'lucide-react';

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

interface Category {
  id: number;
  parent_type: string;
  name: string;
  name_th: string;
  sort_order: number;
  is_active: boolean;
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
  is_active: boolean;
  site_visit_categories?: { name: string; name_th: string };
  site_visit_criteria: Criterion[];
}

export default function ManageCriteriaPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    if (user && !isAdmin) {
      router.push('/');
    }
  }, [user, isAdmin, router]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        fetch('/api/site-visit/categories'),
        fetch('/api/site-visit/items'),
      ]);
      const catJson = await catRes.json();
      const itemJson = await itemRes.json();
      if (catJson.data) setCategories(catJson.data);
      if (itemJson.data) setItems(itemJson.data);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }

  const toggleCategory = (catId: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const toggleItem = (itemId: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const getItemsByCategory = (catId: number) =>
    items.filter(i => i.category_id === catId).sort((a, b) => a.sort_order - b.sort_order);

  if (!isAdmin) return null;

  return (
    <div style={{ padding: '32px', maxWidth: 1000, margin: '0 auto' }}>
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

      <h1 style={{ fontSize: 24, fontWeight: 700, color: VIZ.text, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Settings size={28} color={VIZ.primary} />
        จัดการเกณฑ์ประเมิน
      </h1>
      <p style={{ color: VIZ.lightText, fontSize: 14, marginBottom: 24 }}>
        ดูและจัดการหมวดหมู่ รายการตรวจ และเกณฑ์คะแนน
      </p>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: VIZ.lightText }}>กำลังโหลด...</div>
      ) : (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${VIZ.primary}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 12, color: VIZ.lightText }}>หมวดหมู่</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: VIZ.primary }}>{categories.length}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${VIZ.secondary}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 12, color: VIZ.lightText }}>รายการตรวจ</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: VIZ.secondary }}>{items.length}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${VIZ.positive}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 12, color: VIZ.lightText }}>คะแนนรวมสูงสุด</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: VIZ.positive }}>{items.length * 4}</div>
            </div>
          </div>

          {/* Category list */}
          {categories.map(cat => {
            const catItems = getItemsByCategory(cat.id);
            const isExpanded = expandedCategories.has(cat.id);

            return (
              <div key={cat.id} style={{ marginBottom: 12 }}>
                <button
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 20px', background: '#fff', borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                    border: '1px solid #e5e7eb', cursor: 'pointer', textAlign: 'left',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  {isExpanded ? <ChevronUp size={18} color={VIZ.primary} /> : <ChevronDown size={18} color={VIZ.primary} />}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: VIZ.text }}>{cat.sort_order}. {cat.name_th}</span>
                    <span style={{ fontSize: 13, color: VIZ.lightText, marginLeft: 8 }}>({cat.name})</span>
                  </div>
                  <span style={{ fontSize: 13, color: VIZ.lightText, fontWeight: 600 }}>{catItems.length} ข้อ</span>
                </button>

                {isExpanded && (
                  <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                    {catItems.map((item, idx) => {
                      const criteria = (item.site_visit_criteria || []).sort((a, b) => a.score - b.score);
                      const isItemExpanded = expandedItems.has(item.id);

                      return (
                        <div key={item.id} style={{ borderBottom: idx < catItems.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                          <div
                            onClick={() => toggleItem(item.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '12px 20px', cursor: 'pointer', background: isItemExpanded ? '#fafafa' : '#fff',
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: 13, color: VIZ.primary, minWidth: 28 }}>{item.item_no}.</span>
                            <span style={{ fontSize: 14, color: VIZ.text, flex: 1 }}>{item.question}</span>
                            <span style={{ fontSize: 12, color: VIZ.lightText }}>0-{item.max_score}</span>
                            {isItemExpanded ? <ChevronUp size={16} color={VIZ.neutral} /> : <ChevronDown size={16} color={VIZ.neutral} />}
                          </div>

                          {isItemExpanded && criteria.length > 0 && (
                            <div style={{ padding: '8px 20px 12px 56px', background: '#f8fafc' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: VIZ.lightText, marginBottom: 6 }}>เกณฑ์คะแนน:</div>
                              {criteria.map(c => (
                                <div key={c.id} style={{
                                  display: 'flex', gap: 8, padding: '4px 0', fontSize: 13,
                                  color: c.description === '-' ? VIZ.muted : VIZ.text,
                                }}>
                                  <span style={{
                                    fontWeight: 700, minWidth: 20, textAlign: 'center',
                                    color: c.description === '-' ? VIZ.muted :
                                      c.score === 0 ? VIZ.accent : c.score <= 2 ? VIZ.secondary : VIZ.positive,
                                  }}>
                                    {c.score}
                                  </span>
                                  <span>{c.description}</span>
                                </div>
                              ))}
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
        </div>
      )}
    </div>
  );
}

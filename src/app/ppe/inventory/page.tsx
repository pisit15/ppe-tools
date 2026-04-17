'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Plus,
  Trash2,
  Package,
  Search,
  Image as ImageIcon,
  X,
  Check,
  Clipboard,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { PPEProduct, PPEStockSummary } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#EEEEEE',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
};

const PPE_EMOJI: Record<string, string> = Object.fromEntries(
  PPE_TYPES.map((t) => [t.value, t.icon])
);

function getTypeLabel(value: string) {
  return PPE_TYPES.find((t) => t.value === value)?.label ?? value;
}
function getTypeEmoji(value: string) {
  return PPE_EMOJI[value] ?? '📦';
}
function getUnitLabel(value: string) {
  return UNIT_TYPES.find((u) => u.value === value)?.label ?? value;
}

type Toast = { type: 'success' | 'error'; msg: string } | null;

export default function InventoryPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';

  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, PPEStockSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [toast, setToast] = useState<Toast>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'gloves',
    unit: 'piece',
    min_stock: 10,
    image_url: '',
  });
  const [imgError, setImgError] = useState(false);

  // Image editor state
  const [editing, setEditing] = useState<PPEProduct | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [savingImg, setSavingImg] = useState(false);
  const editorPreviewRef = useRef<HTMLImageElement>(null);

  // Delete confirm state
  const [deleting, setDeleting] = useState<PPEProduct | null>(null);
  const [isDeletingNow, setIsDeletingNow] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    fetchAll();
  }, [companyId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function fetchAll() {
    try {
      setIsLoading(true);
      const [prodRes, stockRes] = await Promise.all([
        fetch(`/api/ppe/products?company_id=${companyId}`).then((r) => r.json()),
        fetch(`/api/ppe/stock?company_id=${companyId}`).then((r) => r.json()),
      ]);
      if (prodRes.data) setProducts(prodRes.data as PPEProduct[]);
      if (stockRes.data) {
        const map: Record<string, PPEStockSummary> = {};
        (stockRes.data as PPEStockSummary[]).forEach((s) => {
          map[s.product_id] = s;
        });
        setStockMap(map);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      setToast({ type: 'error', msg: 'ไม่สามารถโหลดข้อมูลสต็อก' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/ppe/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, ...formData }),
      });
      if (res.ok) {
        setFormData({ name: '', type: 'gloves', unit: 'piece', min_stock: 10, image_url: '' });
        setShowForm(false);
        setImgError(false);
        setToast({ type: 'success', msg: 'เพิ่มสินค้าสำเร็จ' });
        fetchAll();
      } else {
        setToast({ type: 'error', msg: 'ไม่สามารถเพิ่มสินค้า' });
      }
    } catch (error) {
      console.error('Error creating product:', error);
      setToast({ type: 'error', msg: 'เกิดข้อผิดพลาดในการเพิ่มสินค้า' });
    }
  }

  function openImageEditor(product: PPEProduct) {
    setEditing(product);
    setEditUrl(product.image_url || '');
  }

  function closeImageEditor() {
    setEditing(null);
    setEditUrl('');
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setEditUrl(text.trim());
    } catch {
      setToast({ type: 'error', msg: 'ไม่สามารถอ่าน clipboard ได้' });
    }
  }

  async function handleSaveImage() {
    if (!editing) return;
    setSavingImg(true);
    try {
      const newUrl = editUrl.trim() || null;
      const res = await fetch('/api/ppe/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, image_url: newUrl }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editing.id ? { ...p, image_url: newUrl } : p))
        );
        setToast({ type: 'success', msg: 'บันทึกรูปภาพแล้ว' });
        closeImageEditor();
      } else {
        setToast({ type: 'error', msg: 'ไม่สามารถบันทึกรูปภาพ' });
      }
    } catch (error) {
      console.error('Error updating image:', error);
      setToast({ type: 'error', msg: 'เกิดข้อผิดพลาด' });
    } finally {
      setSavingImg(false);
    }
  }

  async function handleRemoveImage() {
    if (!editing) return;
    setSavingImg(true);
    try {
      const res = await fetch('/api/ppe/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, image_url: null }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editing.id ? { ...p, image_url: null } : p))
        );
        setToast({ type: 'success', msg: 'ลบรูปภาพแล้ว' });
        closeImageEditor();
      }
    } catch (error) {
      console.error('Error removing image:', error);
    } finally {
      setSavingImg(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setIsDeletingNow(true);
    try {
      // Soft-delete via PATCH is_active=false to preserve transaction history
      const res = await fetch('/api/ppe/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleting.id, is_active: false }),
      });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== deleting.id));
        setToast({ type: 'success', msg: `ปิดใช้งาน "${deleting.name}" แล้ว` });
        setDeleting(null);
      } else {
        setToast({ type: 'error', msg: 'ไม่สามารถลบสินค้า' });
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      setToast({ type: 'error', msg: 'เกิดข้อผิดพลาด' });
    } finally {
      setIsDeletingNow(false);
    }
  }

  const filtered = useMemo(() => {
    let list = products;
    if (filterType !== 'all') list = list.filter((p) => p.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          getTypeLabel(p.type).toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, search, filterType]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: VIZ.primary }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
          style={{
            background: toast.type === 'success' ? '#DCFCE7' : '#FEE2E2',
            color: toast.type === 'success' ? VIZ.positive : VIZ.accent,
            border: `1px solid ${toast.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: VIZ.text }}>
            จัดการสต็อก PPE
          </h1>
          <p className="text-sm mt-1" style={{ color: VIZ.lightText }}>
            {filtered.length} รายการ · รวม {products.length} สินค้า
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl font-medium transition-all hover:shadow-lg"
          style={{ backgroundColor: VIZ.primary }}
        >
          <Plus size={20} />
          เพิ่มสินค้า
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          className="rounded-2xl p-6 shadow-sm border bg-white"
          style={{ borderColor: '#f0f0f0', borderLeft: `4px solid ${VIZ.primary}` }}
        >
          <h2 className="text-lg font-bold mb-4" style={{ color: VIZ.text }}>
            เพิ่มสินค้า PPE ใหม่
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: VIZ.text }}>
                  ชื่อสินค้า *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: VIZ.text }}>
                  ประเภท *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                >
                  {PPE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: VIZ.text }}>
                  หน่วย *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                >
                  {UNIT_TYPES.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: VIZ.text }}>
                  สต็อกขั้นต่ำ
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.min_stock}
                  onChange={(e) =>
                    setFormData({ ...formData, min_stock: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: VIZ.text }}>
                <ImageIcon size={14} className="inline mr-1" />
                URL รูปภาพ (ไม่บังคับ)
              </label>
              <div className="flex gap-3 items-start">
                <input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={formData.image_url}
                  onChange={(e) => {
                    setFormData({ ...formData, image_url: e.target.value });
                    setImgError(false);
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                />
                {formData.image_url && (
                  <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 bg-gray-50 flex items-center justify-center">
                    {imgError ? (
                      <span className="text-2xl">{getTypeEmoji(formData.type)}</span>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={formData.image_url}
                        alt="preview"
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                style={{ backgroundColor: VIZ.positive }}
              >
                <CheckCircle2 size={16} />
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2.5 rounded-xl font-medium transition-colors"
                style={{ backgroundColor: '#f0f0f0', color: VIZ.text }}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: VIZ.lightText }}
          />
          <input
            type="text"
            placeholder="ค้นหาสินค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
        >
          <option value="all">ทุกประเภท</option>
          {PPE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Glass Panel image editor — modal over the table */}
      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 animate-in fade-in duration-150"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          onClick={closeImageEditor}
        >
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl border bg-white/90 backdrop-blur-xl"
            style={{ borderColor: 'rgba(255,255,255,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-5 py-4 flex items-center justify-between border-b"
              style={{ borderColor: VIZ.grid }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${VIZ.primary}15` }}
                >
                  <ImageIcon size={16} style={{ color: VIZ.primary }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: VIZ.text }}>
                    แก้ไขรูปภาพสินค้า
                  </h3>
                  <p className="text-[11px]" style={{ color: VIZ.lightText }}>
                    {editing.name}
                  </p>
                </div>
              </div>
              <button
                onClick={closeImageEditor}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="ปิด"
              >
                <X size={18} style={{ color: VIZ.lightText }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Preview */}
              <div className="flex justify-center">
                <div
                  className="w-28 h-28 rounded-2xl border-2 overflow-hidden flex items-center justify-center"
                  style={{
                    borderColor: VIZ.grid,
                    background: '#F8FAFC',
                  }}
                >
                  {editUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      ref={editorPreviewRef}
                      key={editUrl}
                      src={editUrl}
                      alt="preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        const sib = el.nextElementSibling as HTMLElement | null;
                        if (sib) sib.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-full h-full flex items-center justify-center text-4xl"
                    style={{ display: editUrl ? 'none' : 'flex' }}
                  >
                    {getTypeEmoji(editing.type)}
                  </div>
                </div>
              </div>

              {/* URL input */}
              <div>
                <label
                  className="block text-[11px] font-semibold mb-1.5"
                  style={{ color: VIZ.lightText }}
                >
                  URL รูปภาพ
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    autoFocus
                    placeholder="https://example.com/gloves.jpg"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveImage();
                      if (e.key === 'Escape') closeImageEditor();
                    }}
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={pasteFromClipboard}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      borderColor: VIZ.grid,
                      background: '#F8FAFC',
                      color: VIZ.primary,
                    }}
                  >
                    <Clipboard size={14} />
                    วาง
                  </button>
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: VIZ.lightText }}>
                  วาง URL รูปภาพจาก Google Drive, Imgur หรือ CDN อื่น ๆ
                </p>
              </div>
            </div>

            <div
              className="px-5 py-4 flex items-center justify-between gap-2 border-t"
              style={{ borderColor: VIZ.grid }}
            >
              {editing.image_url ? (
                <button
                  onClick={handleRemoveImage}
                  disabled={savingImg}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ color: VIZ.accent, background: '#FEF2F2' }}
                >
                  <Trash2 size={14} />
                  ลบรูป
                </button>
              ) : <span />}

              <div className="flex gap-2">
                <button
                  onClick={closeImageEditor}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: VIZ.lightText }}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSaveImage}
                  disabled={savingImg}
                  className="flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: VIZ.primary }}
                >
                  {savingImg ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      บันทึก
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
          onClick={() => !isDeletingNow && setDeleting(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: `${VIZ.accent}15` }}
                >
                  <AlertTriangle size={20} style={{ color: VIZ.accent }} />
                </div>
                <h3 className="text-base font-bold" style={{ color: VIZ.text }}>
                  ยืนยันการลบสินค้า
                </h3>
              </div>
              <p className="text-sm" style={{ color: VIZ.lightText }}>
                ต้องการปิดใช้งาน{' '}
                <span className="font-semibold" style={{ color: VIZ.text }}>
                  &ldquo;{deleting.name}&rdquo;
                </span>{' '}
                หรือไม่? ประวัติการเบิก-รับคืนจะยังคงอยู่ แต่สินค้านี้จะไม่ปรากฏในรายการอีก
              </p>
            </div>
            <div
              className="px-6 py-4 flex justify-end gap-2 border-t"
              style={{ borderColor: VIZ.grid }}
            >
              <button
                onClick={() => setDeleting(null)}
                disabled={isDeletingNow}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: VIZ.lightText }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeletingNow}
                className="flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: VIZ.accent }}
              >
                {isDeletingNow ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    ปิดใช้งาน
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products table */}
      <div
        className="rounded-2xl shadow-sm overflow-hidden bg-white"
        style={{ border: '1px solid #f0f0f0' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ background: `${VIZ.primary}05` }}>
                <th
                  className="px-4 py-3 text-center font-semibold text-sm w-16"
                  style={{ color: VIZ.text }}
                >
                  รูป
                </th>
                <th
                  className="px-6 py-3 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  ชื่อสินค้า
                </th>
                <th
                  className="px-6 py-3 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  ประเภท
                </th>
                <th
                  className="px-6 py-3 text-left font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  หน่วย
                </th>
                <th
                  className="px-6 py-3 text-center font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  คงเหลือ
                </th>
                <th
                  className="px-6 py-3 text-center font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  สต็อกขั้นต่ำ
                </th>
                <th
                  className="px-6 py-3 text-center font-semibold text-sm"
                  style={{ color: VIZ.text }}
                >
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((product) => {
                  const stock = stockMap[product.id];
                  const current = stock?.current_stock ?? 0;
                  const minStock = product.min_stock ?? 0;
                  const isOutOfStock = current <= 0;
                  const isLow = !isOutOfStock && minStock > 0 && current < minStock;
                  return (
                    <tr
                      key={product.id}
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-center">
                        <button
                          title="คลิกเพื่อแก้ไขรูปภาพ"
                          onClick={() => openImageEditor(product)}
                          className="w-10 h-10 rounded-lg border overflow-hidden mx-auto flex items-center justify-center cursor-pointer transition-all group relative"
                          style={{ borderColor: VIZ.grid, background: '#F8FAFC' }}
                        >
                          {product.image_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const el = e.currentTarget;
                                el.style.display = 'none';
                                const sib = el.nextElementSibling as HTMLElement | null;
                                if (sib) sib.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <span
                            className="text-xl w-full h-full items-center justify-center"
                            style={{ display: product.image_url ? 'none' : 'flex' }}
                          >
                            {getTypeEmoji(product.type)}
                          </span>
                          <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                            <ImageIcon
                              size={14}
                              className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-3 font-medium text-sm" style={{ color: VIZ.text }}>
                        {product.name}
                      </td>
                      <td className="px-6 py-3 text-sm" style={{ color: VIZ.lightText }}>
                        {getTypeLabel(product.type)}
                      </td>
                      <td className="px-6 py-3 text-sm" style={{ color: VIZ.lightText }}>
                        {getUnitLabel(product.unit)}
                      </td>
                      <td className="px-6 py-3 text-center tabular-nums">
                        <span
                          className="inline-block px-2.5 py-1 rounded-lg text-sm font-bold"
                          style={{
                            background: isOutOfStock
                              ? `${VIZ.accent}15`
                              : isLow
                                ? `${VIZ.secondary}15`
                                : `${VIZ.positive}15`,
                            color: isOutOfStock
                              ? VIZ.accent
                              : isLow
                                ? VIZ.secondary
                                : VIZ.positive,
                          }}
                        >
                          {current.toLocaleString('th-TH')}
                        </span>
                      </td>
                      <td
                        className="px-6 py-3 text-center text-sm tabular-nums"
                        style={{ color: VIZ.lightText }}
                      >
                        {minStock || '—'}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <button
                          onClick={() => setDeleting(product)}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: VIZ.accent }}
                          aria-label={`ลบ ${product.name}`}
                          title="ลบสินค้า"
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = '#FEF2F2')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = 'transparent')
                          }
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Package
                      size={48}
                      className="mx-auto mb-3 opacity-40"
                      style={{ color: VIZ.neutral }}
                    />
                    <p className="text-sm" style={{ color: VIZ.lightText }}>
                      ไม่มีสินค้า — คลิก &quot;เพิ่มสินค้า&quot; เพื่อเริ่มต้น
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

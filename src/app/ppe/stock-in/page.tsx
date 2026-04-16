'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Search, Package, CheckCircle2, Clock, X, ChevronDown } from 'lucide-react';
import type { PPEProduct } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

const VIZ = {
  primary: '#4E79A7',
  positive: '#59A14F',
  secondary: '#F28E2B',
  accent: '#E15759',
  text: '#333333',
  lightText: '#666666',
  neutral: '#BAB0AC',
};

function getTypeLabel(v: string) { return PPE_TYPES.find(t => t.value === v)?.label ?? v; }
function getTypeEmoji(v: string) { return PPE_TYPES.find(t => t.value === v)?.icon ?? '📦'; }
function getUnitLabel(v: string) { return UNIT_TYPES.find(u => u.value === v)?.label ?? v; }

type RecentTx = { id: string; product_name: string; quantity: number; unit: string; transaction_date: string; transaction_type: string; po_number?: string; notes?: string };

export default function StockInPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);

  /* ── Product Search ── */
  const [productSearch, setProductSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    product_id: '',
    transaction_type: 'stock_in',
    quantity: '',
    unit: '',
    transaction_date: new Date().toISOString().split('T')[0],
    po_number: '',
    notes: '',
    recorded_by: '',
  });

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      fetch(`/api/ppe/products?company_id=${companyId}`).then(r => r.json()),
      fetch(`/api/ppe/transactions?company_id=${companyId}&limit=20`).then(r => r.json()),
    ]).then(([prodData, txData]) => {
      if (prodData.data) setProducts(prodData.data);
      if (txData.data) {
        const recent = txData.data
          .filter((t: Record<string, unknown>) => t.transaction_type === 'stock_in' || t.transaction_type === 'return')
          .slice(0, 8)
          .map((t: Record<string, unknown>) => ({
            id: t.id as string,
            product_name: ((t.ppe_products as Record<string, string> | null)?.name) || '—',
            quantity: t.quantity as number,
            unit: t.unit as string,
            transaction_date: t.transaction_date as string,
            transaction_type: t.transaction_type as string,
            po_number: (t.po_number as string) || undefined,
            notes: (t.notes as string) || undefined,
          }));
        setRecentTx(recent);
      }
    }).catch(console.error).finally(() => setIsLoading(false));
  }, [companyId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.sort((a, b) => a.name.localeCompare(b.name));
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || getTypeLabel(p.type).toLowerCase().includes(q));
  }, [products, productSearch]);

  const selectedProduct = products.find(p => p.id === formData.product_id);

  function selectProduct(p: PPEProduct) {
    setFormData({ ...formData, product_id: p.id, unit: p.unit });
    setProductSearch(p.name);
    setShowDropdown(false);
  }

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.product_id) { showToast('error', 'กรุณาเลือกสินค้า'); return; }
    if (!formData.quantity || parseInt(formData.quantity) < 1) { showToast('error', 'กรุณากรอกจำนวน'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/ppe/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          product_id: formData.product_id,
          transaction_type: formData.transaction_type,
          quantity: parseInt(formData.quantity),
          unit: formData.unit,
          transaction_date: formData.transaction_date,
          po_number: formData.po_number || null,
          notes: formData.notes || null,
          recorded_by: formData.recorded_by || null,
        }),
      });

      if (res.ok) {
        const prodName = selectedProduct?.name || '';
        const qty = formData.quantity;
        const unit = getUnitLabel(formData.unit);
        const typeLabel = formData.transaction_type === 'stock_in' ? 'รับเข้า' : 'รับคืน';
        showToast('success', `${typeLabel} "${prodName}" จำนวน ${qty} ${unit} สำเร็จ`);

        // Add to recent
        setRecentTx(prev => [{
          id: Date.now().toString(),
          product_name: prodName,
          quantity: parseInt(qty),
          unit: formData.unit,
          transaction_date: formData.transaction_date,
          transaction_type: formData.transaction_type,
        }, ...prev].slice(0, 8));

        setFormData({
          product_id: '', transaction_type: 'stock_in', quantity: '', unit: '',
          transaction_date: new Date().toISOString().split('T')[0], po_number: '', notes: '', recorded_by: '',
        });
        setProductSearch('');
      } else {
        showToast('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } catch {
      showToast('error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="space-y-5 max-w-[1100px]">
      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in"
          style={{
            background: toast.type === 'success' ? '#DCFCE7' : '#FEE2E2',
            color: toast.type === 'success' ? VIZ.positive : VIZ.accent,
            border: `1px solid ${toast.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <X size={16} />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: VIZ.text }}>📥 บันทึกรับเข้า</h1>
        <p className="text-sm mt-1" style={{ color: VIZ.lightText }}>บันทึกสต็อก PPE ที่รับเข้าหรือรับคืน</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Form (2 cols) ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #f0f0f0' }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Row 1: Product + Type */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2" ref={dropdownRef}>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>สินค้า <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="พิมพ์ค้นหาสินค้า..."
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); setShowDropdown(true); if (!e.target.value) setFormData(f => ({ ...f, product_id: '', unit: '' })); }}
                      onFocus={() => setShowDropdown(true)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                    />
                    {productSearch && (
                      <button type="button" onClick={() => { setProductSearch(''); setFormData(f => ({ ...f, product_id: '', unit: '' })); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    )}
                  </div>
                  {showDropdown && (
                    <div className="absolute z-40 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto" style={{ width: 'calc(100% - 2rem)', maxWidth: 500 }}>
                      {filteredProducts.length === 0 && <p className="text-gray-400 text-sm p-3">ไม่พบสินค้า</p>}
                      {filteredProducts.slice(0, 50).map(p => (
                        <button type="button" key={p.id} onClick={() => selectProduct(p)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 transition-colors ${formData.product_id === p.id ? 'bg-blue-50' : ''}`}>
                          <span className="text-lg flex-shrink-0">{p.image_url ? <img src={p.image_url} alt="" className="w-6 h-6 rounded object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : getTypeEmoji(p.type)}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                            <div className="text-[10px] text-gray-400">{getTypeLabel(p.type)} · {getUnitLabel(p.unit)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>ประเภท <span className="text-red-400">*</span></label>
                  <div className="flex gap-2">
                    {[{ v: 'stock_in', l: '📥 รับเข้า', c: VIZ.positive }, { v: 'return', l: '🔄 รับคืน', c: VIZ.primary }].map(opt => (
                      <button type="button" key={opt.v}
                        onClick={() => setFormData(f => ({ ...f, transaction_type: opt.v }))}
                        className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: formData.transaction_type === opt.v ? opt.c : '#f9fafb',
                          color: formData.transaction_type === opt.v ? '#fff' : VIZ.lightText,
                          border: `1.5px solid ${formData.transaction_type === opt.v ? opt.c : '#e5e7eb'}`,
                        }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Selected Product Info */}
              {selectedProduct && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: '#F0F9FF', border: '1px solid #DBEAFE' }}>
                  <span className="text-2xl">{selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" className="w-8 h-8 rounded object-cover" /> : getTypeEmoji(selectedProduct.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900">{selectedProduct.name}</div>
                    <div className="text-[11px] text-gray-500">{getTypeLabel(selectedProduct.type)} · หน่วย: {getUnitLabel(selectedProduct.unit)} · ขั้นต่ำ: {selectedProduct.min_stock}</div>
                  </div>
                  <Package size={20} style={{ color: VIZ.primary }} />
                </div>
              )}

              {/* Row 2: Quantity + Date */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>จำนวน <span className="text-red-400">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" required value={formData.quantity}
                      onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="0"
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none tabular-nums text-center font-bold text-lg" />
                    <span className="text-xs font-medium px-3 py-2.5 rounded-lg" style={{ background: '#f3f4f6', color: VIZ.lightText }}>{formData.unit ? getUnitLabel(formData.unit) : 'หน่วย'}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>วันที่ <span className="text-red-400">*</span></label>
                  <input type="date" required value={formData.transaction_date}
                    onChange={e => setFormData({ ...formData, transaction_date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>เลข PO</label>
                  <input type="text" value={formData.po_number}
                    onChange={e => setFormData({ ...formData, po_number: e.target.value })}
                    placeholder="PO-xxxx"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                </div>
              </div>

              {/* Row 3: Notes + Recorded By */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>หมายเหตุ</label>
                  <input type="text" value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="รายละเอียดเพิ่มเติม..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>บันทึกโดย</label>
                  <input type="text" value={formData.recorded_by}
                    onChange={e => setFormData({ ...formData, recorded_by: e.target.value })}
                    placeholder="ชื่อผู้บันทึก"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: VIZ.positive }}>
                  {isSubmitting ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังบันทึก...</> : <><CheckCircle2 size={16} /> บันทึกรับเข้า</>}
                </button>
                <button type="button"
                  onClick={() => { setFormData({ product_id: '', transaction_type: 'stock_in', quantity: '', unit: '', transaction_date: new Date().toISOString().split('T')[0], po_number: '', notes: '', recorded_by: '' }); setProductSearch(''); }}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                  ล้างฟอร์ม
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Recent Transactions (1 col) ── */}
        <div>
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #f0f0f0' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: VIZ.primary }} />
              <h3 className="text-sm font-bold" style={{ color: VIZ.text }}>รายการล่าสุด</h3>
            </div>
            {recentTx.length > 0 ? (
              <div className="space-y-2">
                {recentTx.map(tx => (
                  <div key={tx.id} className="flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors" style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5" style={{
                      background: tx.transaction_type === 'stock_in' ? '#DCFCE7' : '#DBEAFE',
                      color: tx.transaction_type === 'stock_in' ? VIZ.positive : VIZ.primary,
                    }}>
                      {tx.transaction_type === 'stock_in' ? 'เข้า' : 'คืน'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">{tx.product_name}</div>
                      <div className="text-[10px]" style={{ color: VIZ.lightText }}>
                        {tx.quantity} {getUnitLabel(tx.unit)} · {new Date(tx.transaction_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center py-4" style={{ color: VIZ.neutral }}>ยังไม่มีรายการ</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Search, Package, CheckCircle2, Clock, X, AlertTriangle, Users } from 'lucide-react';
import type { PPEProduct, PPEEmployee } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES, DEPARTMENTS } from '@/lib/constants';
import DateInput from '@/components/DateInput';

const DEPT_LABEL: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.value, d.label])
);
function deptLabel(v: string | null | undefined): string {
  if (!v) return '';
  return DEPT_LABEL[v] || v;
}

const VIZ = {
  primary: '#4E79A7', positive: '#59A14F', secondary: '#F28E2B',
  accent: '#E15759', text: '#333333', lightText: '#666666', neutral: '#BAB0AC',
};

function getTypeLabel(v: string) { return PPE_TYPES.find(t => t.value === v)?.label ?? v; }
function getTypeEmoji(v: string) { return PPE_TYPES.find(t => t.value === v)?.icon ?? '📦'; }
function getUnitLabel(v: string) { return UNIT_TYPES.find(u => u.value === v)?.label ?? v; }

type StockInfo = { product_id: string; current_stock: number; min_stock: number };
type RecentTx = { id: string; product_name: string; employee_name: string; quantity: number; unit: string; transaction_date: string; transaction_type: string };

export default function StockOutPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [employees, setEmployees] = useState<PPEEmployee[]>([]);
  const [stockInfo, setStockInfo] = useState<StockInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);

  /* ── Searchable dropdowns ── */
  const [productSearch, setProductSearch] = useState('');
  const [showProductDD, setShowProductDD] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDD, setShowEmployeeDD] = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);
  const empRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    product_id: '', transaction_type: 'stock_out', quantity: '', unit: '',
    transaction_date: new Date().toISOString().split('T')[0],
    employee_code: '', employee_name: '', department: '', notes: '', recorded_by: '',
  });

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      fetch(`/api/ppe/products?company_id=${companyId}`).then(r => r.json()),
      fetch(`/api/ppe/employees?company_id=${companyId}`).then(r => r.json()),
      fetch(`/api/ppe/stock?company_id=${companyId}`).then(r => r.json()),
      fetch(`/api/ppe/transactions?company_id=${companyId}&limit=20`).then(r => r.json()),
    ]).then(([prodData, empData, stockData, txData]) => {
      if (prodData.data) setProducts(prodData.data);
      if (empData.data) setEmployees(empData.data);
      if (stockData.data) setStockInfo(stockData.data.map((s: Record<string, unknown>) => ({ product_id: s.product_id, current_stock: s.current_stock, min_stock: s.min_stock })));
      if (txData.data) {
        setRecentTx(txData.data
          .filter((t: Record<string, unknown>) => t.transaction_type === 'stock_out' || t.transaction_type === 'borrow')
          .slice(0, 8)
          .map((t: Record<string, unknown>) => ({
            id: t.id as string,
            product_name: ((t.ppe_products as Record<string, string> | null)?.name) || '—',
            employee_name: (t.employee_name as string) || '—',
            quantity: t.quantity as number, unit: t.unit as string,
            transaction_date: t.transaction_date as string,
            transaction_type: t.transaction_type as string,
          })));
      }
    }).catch(console.error).finally(() => setIsLoading(false));
  }, [companyId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setShowProductDD(false);
      if (empRef.current && !empRef.current.contains(e.target as Node)) setShowEmployeeDD(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.sort((a, b) => a.name.localeCompare(b.name));
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || getTypeLabel(p.type).toLowerCase().includes(q));
  }, [products, productSearch]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees.sort((a, b) => a.name.localeCompare(b.name));
    const q = employeeSearch.toLowerCase();
    return employees.filter(e => e.name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q));
  }, [employees, employeeSearch]);

  const selectedProduct = products.find(p => p.id === formData.product_id);
  const currentStock = stockInfo.find(s => s.product_id === formData.product_id);
  const isLowStock = currentStock && currentStock.min_stock > 0 && currentStock.current_stock <= currentStock.min_stock;

  function selectProduct(p: PPEProduct) {
    setFormData(f => ({ ...f, product_id: p.id, unit: p.unit }));
    setProductSearch(p.name);
    setShowProductDD(false);
  }

  function selectEmployee(e: PPEEmployee) {
    setFormData(f => ({ ...f, employee_code: e.employee_code, employee_name: e.name, department: e.department || '' }));
    setEmployeeSearch(`${e.name} (${e.employee_code})`);
    setShowEmployeeDD(false);
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId, product_id: formData.product_id,
          transaction_type: formData.transaction_type, quantity: parseInt(formData.quantity),
          unit: formData.unit, transaction_date: formData.transaction_date,
          employee_code: formData.employee_code || null, employee_name: formData.employee_name || null,
          department: formData.department || null, notes: formData.notes || null, recorded_by: formData.recorded_by || null,
        }),
      });

      if (res.ok) {
        const prodName = selectedProduct?.name || '';
        const empName = formData.employee_name || '';
        const typeLabel = formData.transaction_type === 'stock_out' ? 'เบิก' : 'ยืม';
        showToast('success', `${typeLabel} "${prodName}" → ${empName || '(ไม่ระบุ)'} จำนวน ${formData.quantity} ${getUnitLabel(formData.unit)} สำเร็จ`);

        setRecentTx(prev => [{
          id: Date.now().toString(), product_name: prodName, employee_name: empName,
          quantity: parseInt(formData.quantity), unit: formData.unit,
          transaction_date: formData.transaction_date, transaction_type: formData.transaction_type,
        }, ...prev].slice(0, 8));

        // Update local stock info
        setStockInfo(prev => prev.map(s => s.product_id === formData.product_id ? { ...s, current_stock: s.current_stock - parseInt(formData.quantity) } : s));

        setFormData({ product_id: '', transaction_type: 'stock_out', quantity: '', unit: '', transaction_date: new Date().toISOString().split('T')[0], employee_code: '', employee_name: '', department: '', notes: '', recorded_by: '' });
        setProductSearch(''); setEmployeeSearch('');
      } else { showToast('error', 'เกิดข้อผิดพลาด กรุณาลองใหม่'); }
    } catch { showToast('error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์'); }
    finally { setIsSubmitting(false); }
  }

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-5 max-w-[1100px]">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium"
          style={{ background: toast.type === 'success' ? '#DCFCE7' : '#FEE2E2', color: toast.type === 'success' ? VIZ.positive : VIZ.accent, border: `1px solid ${toast.type === 'success' ? '#BBF7D0' : '#FECACA'}` }}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <X size={16} />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: VIZ.text }}>📤 บันทึกเบิก/ยืม</h1>
        <p className="text-sm mt-1" style={{ color: VIZ.lightText }}>บันทึกการเบิกหรือยืม PPE สำหรับพนักงาน</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Form (2 cols) ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #f0f0f0' }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Product + Type */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2" ref={prodRef}>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>สินค้า <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="พิมพ์ค้นหาสินค้า..."
                      value={productSearch} onChange={e => { setProductSearch(e.target.value); setShowProductDD(true); if (!e.target.value) setFormData(f => ({ ...f, product_id: '', unit: '' })); }}
                      onFocus={() => setShowProductDD(true)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                    {productSearch && <button type="button" onClick={() => { setProductSearch(''); setFormData(f => ({ ...f, product_id: '', unit: '' })); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
                  </div>
                  {showProductDD && (
                    <div className="absolute z-40 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto" style={{ width: 'calc(100% - 2rem)', maxWidth: 500 }}>
                      {filteredProducts.length === 0 && <p className="text-gray-400 text-sm p-3">ไม่พบสินค้า</p>}
                      {filteredProducts.slice(0, 50).map(p => {
                        const st = stockInfo.find(s => s.product_id === p.id);
                        return (
                          <button type="button" key={p.id} onClick={() => selectProduct(p)}
                            className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 transition-colors ${formData.product_id === p.id ? 'bg-blue-50' : ''}`}>
                            <span className="text-lg flex-shrink-0">{getTypeEmoji(p.type)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                              <div className="text-[10px] text-gray-400">{getTypeLabel(p.type)} · {getUnitLabel(p.unit)}</div>
                            </div>
                            {st && <span className="text-[10px] font-bold tabular-nums" style={{ color: st.current_stock <= st.min_stock && st.min_stock > 0 ? VIZ.accent : VIZ.positive }}>คงเหลือ {st.current_stock}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>ประเภท <span className="text-red-400">*</span></label>
                  <div className="flex gap-2">
                    {[{ v: 'stock_out', l: '📤 เบิก', c: VIZ.accent }, { v: 'borrow', l: '🤝 ยืม', c: VIZ.secondary }].map(opt => (
                      <button type="button" key={opt.v} onClick={() => setFormData(f => ({ ...f, transaction_type: opt.v }))}
                        className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: formData.transaction_type === opt.v ? opt.c : '#f9fafb', color: formData.transaction_type === opt.v ? '#fff' : VIZ.lightText, border: `1.5px solid ${formData.transaction_type === opt.v ? opt.c : '#e5e7eb'}` }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Product Info + Stock Warning */}
              {selectedProduct && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: isLowStock ? '#FEF2F2' : '#F0F9FF', border: `1px solid ${isLowStock ? '#FECACA' : '#DBEAFE'}` }}>
                  <span className="text-2xl">{getTypeEmoji(selectedProduct.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900">{selectedProduct.name}</div>
                    <div className="text-[11px] text-gray-500">{getTypeLabel(selectedProduct.type)} · หน่วย: {getUnitLabel(selectedProduct.unit)}</div>
                  </div>
                  {currentStock && (
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums" style={{ color: isLowStock ? VIZ.accent : VIZ.positive }}>{currentStock.current_stock}</div>
                      <div className="text-[10px]" style={{ color: VIZ.lightText }}>คงเหลือ (ขั้นต่ำ {currentStock.min_stock})</div>
                    </div>
                  )}
                  {isLowStock && <AlertTriangle size={20} style={{ color: VIZ.accent }} />}
                </div>
              )}

              {/* Quantity + Date + Employee */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>จำนวน <span className="text-red-400">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" required value={formData.quantity}
                      onChange={e => setFormData({ ...formData, quantity: e.target.value })} placeholder="0"
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none tabular-nums text-center font-bold text-lg" />
                    <span className="text-xs font-medium px-3 py-2.5 rounded-lg" style={{ background: '#f3f4f6', color: VIZ.lightText }}>{formData.unit ? getUnitLabel(formData.unit) : 'หน่วย'}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>วันที่ <span className="text-red-400">*</span></label>
                  <DateInput
                    value={formData.transaction_date}
                    onChange={iso => setFormData({ ...formData, transaction_date: iso })}
                    required
                    ariaLabel="เลือกวันที่เบิกออก"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>แผนก</label>
                  {/* Department values in the DB are free-form English names (e.g. "Pack Module"),
                      but the canonical enum is Thai. Include the current value as an option so
                      selecting an employee with an English department doesn't clear the field. */}
                  {(() => {
                    const options = new Map<string, string>();
                    DEPARTMENTS.forEach(d => options.set(d.value, d.label));
                    // Seed with any departments we've seen on employees so the dropdown
                    // has the full set actually used in the company.
                    employees.forEach(e => {
                      const v = (e.department || '').trim();
                      if (v && !options.has(v)) options.set(v, deptLabel(v));
                    });
                    // Ensure the currently selected value (if any) is present.
                    if (formData.department && !options.has(formData.department)) {
                      options.set(formData.department, deptLabel(formData.department));
                    }
                    return (
                      <select
                        value={formData.department}
                        onChange={e => setFormData({ ...formData, department: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                      >
                        <option value="">— เลือกแผนก —</option>
                        {Array.from(options.entries())
                          .sort((a, b) => a[1].localeCompare(b[1], 'th'))
                          .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    );
                  })()}
                </div>
              </div>

              {/* Employee Search */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div ref={empRef}>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>พนักงาน</label>
                  <div className="relative">
                    <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="ค้นหาพนักงาน..."
                      value={employeeSearch} onChange={e => { setEmployeeSearch(e.target.value); setShowEmployeeDD(true); if (!e.target.value) setFormData(f => ({ ...f, employee_code: '', employee_name: '', department: '' })); }}
                      onFocus={() => setShowEmployeeDD(true)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                    {employeeSearch && <button type="button" onClick={() => { setEmployeeSearch(''); setFormData(f => ({ ...f, employee_code: '', employee_name: '', department: '' })); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
                  </div>
                  {showEmployeeDD && (
                    <div className="absolute z-40 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-52 overflow-auto" style={{ width: 'calc(100% - 2rem)', maxWidth: 400 }}>
                      {filteredEmployees.length === 0 && <p className="text-gray-400 text-sm p-3">ไม่พบพนักงาน</p>}
                      {filteredEmployees.slice(0, 40).map(emp => (
                        <button type="button" key={emp.id} onClick={() => selectEmployee(emp)}
                          className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-50 transition-colors">
                          <div className="text-sm font-medium text-gray-900">{emp.name}</div>
                          <div className="text-[10px] text-gray-400">{emp.employee_code} · {emp.department || '—'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: VIZ.lightText }}>หมายเหตุ</label>
                  <input type="text" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="รายละเอียดเพิ่มเติม..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none" />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: VIZ.accent }}>
                  {isSubmitting ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังบันทึก...</> : <><CheckCircle2 size={16} /> บันทึก{formData.transaction_type === 'stock_out' ? 'เบิก' : 'ยืม'}</>}
                </button>
                <button type="button"
                  onClick={() => { setFormData({ product_id: '', transaction_type: 'stock_out', quantity: '', unit: '', transaction_date: new Date().toISOString().split('T')[0], employee_code: '', employee_name: '', department: '', notes: '', recorded_by: '' }); setProductSearch(''); setEmployeeSearch(''); }}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                  ล้างฟอร์ม
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Recent Transactions ── */}
        <div>
          <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #f0f0f0' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: VIZ.accent }} />
              <h3 className="text-sm font-bold" style={{ color: VIZ.text }}>รายการล่าสุด</h3>
            </div>
            {recentTx.length > 0 ? (
              <div className="space-y-2">
                {recentTx.map(tx => (
                  <div key={tx.id} className="py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors" style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{
                        background: tx.transaction_type === 'stock_out' ? '#FEE2E2' : '#FEF3C7',
                        color: tx.transaction_type === 'stock_out' ? VIZ.accent : VIZ.secondary,
                      }}>{tx.transaction_type === 'stock_out' ? 'เบิก' : 'ยืม'}</span>
                      <span className="text-xs font-medium text-gray-900 truncate flex-1">{tx.product_name}</span>
                    </div>
                    <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: VIZ.lightText }}>
                      <span>→ {tx.employee_name}</span>
                      <span>·</span>
                      <span>{tx.quantity} {getUnitLabel(tx.unit)}</span>
                      <span>·</span>
                      <span>{new Date(tx.transaction_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
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

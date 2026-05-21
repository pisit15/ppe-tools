'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Trash2, Save, AlertTriangle, Search, Users } from 'lucide-react';
import type { PPEProduct, PPEEmployee, PPETransaction } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/constants';

const DEPT_LABEL: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.value, d.label])
);

type Mode = 'stock_in_return' | 'stock_out_borrow';

type Props = {
  /** Transaction to edit. null = closed */
  transaction: PPETransaction | null;
  products: PPEProduct[];
  employees: PPEEmployee[];
  mode: Mode;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

export default function EditTransactionModal({
  transaction, products, employees, mode, onClose, onSaved, onDeleted,
}: Props) {
  const [form, setForm] = useState<Partial<PPETransaction>>(transaction || {});
  const [productSearch, setProductSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showProductDD, setShowProductDD] = useState(false);
  const [showEmployeeDD, setShowEmployeeDD] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prodRef = useRef<HTMLDivElement>(null);
  const empRef = useRef<HTMLDivElement>(null);

  // Reset form whenever a new transaction is opened
  useEffect(() => {
    if (transaction) {
      setForm({ ...transaction });
      const p = products.find((x) => x.id === transaction.product_id);
      setProductSearch(p?.name || '');
      setEmployeeSearch(transaction.employee_name || '');
      setConfirmDelete(false);
      setError(null);
    }
  }, [transaction, products]);

  // Outside click closes dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setShowProductDD(false);
      if (empRef.current && !empRef.current.contains(e.target as Node)) setShowEmployeeDD(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 30);
    const q = productSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, productSearch]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees.slice(0, 30);
    const q = employeeSearch.toLowerCase();
    return employees
      .filter((e) =>
        e.name.toLowerCase().includes(q) ||
        (e.employee_code || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [employees, employeeSearch]);

  if (!transaction) return null;

  const isStockIn = mode === 'stock_in_return';
  const primaryTxType = isStockIn ? 'stock_in' : 'stock_out';
  const secondaryTxType = isStockIn ? 'return' : 'borrow';
  const primaryLabel = isStockIn ? 'รับเข้า' : 'เบิก';
  const secondaryLabel = isStockIn ? 'รับคืน' : 'ยืม';
  const accentColor = isStockIn ? '#59A14F' : '#E15759';

  const selectProduct = (p: PPEProduct) => {
    setForm((f) => ({ ...f, product_id: p.id, unit: p.unit }));
    setProductSearch(p.name);
    setShowProductDD(false);
  };

  const selectEmployee = (e: PPEEmployee) => {
    setForm((f) => ({
      ...f,
      employee_code: e.employee_code,
      employee_name: e.name,
      department: e.department || f.department || '',
    }));
    setEmployeeSearch(e.name);
    setShowEmployeeDD(false);
  };

  const handleSave = async () => {
    if (!form.product_id || !form.quantity || !form.transaction_date) {
      setError('กรุณากรอกข้อมูลให้ครบ (สินค้า, จำนวน, วันที่)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ppe/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: form.product_id,
          transaction_type: form.transaction_type,
          quantity: Number(form.quantity),
          unit: form.unit,
          transaction_date: form.transaction_date,
          po_number: form.po_number || null,
          employee_code: form.employee_code || null,
          employee_name: form.employee_name || null,
          department: form.department || null,
          notes: form.notes || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || 'บันทึกไม่สำเร็จ');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ppe/transactions/${transaction.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || 'ลบไม่สำเร็จ');
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === form.product_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${accentColor} 0%, #533483 100%)` }}>
          <h3 className="text-white font-bold text-base">แก้ไขรายการ {isStockIn ? 'รับเข้า/รับคืน' : 'เบิก/ยืม'}</h3>
          <button onClick={onClose}
            className="bg-white/20 hover:bg-white/30 rounded-lg w-8 h-8 flex items-center justify-center transition-colors">
            <X size={16} color="#fff" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {/* Type toggle */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">ประเภท</label>
            <div className="flex gap-2">
              <button onClick={() => setForm((f) => ({ ...f, transaction_type: primaryTxType }))}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                style={form.transaction_type === primaryTxType
                  ? { background: accentColor, color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }}>
                {primaryLabel}
              </button>
              <button onClick={() => setForm((f) => ({ ...f, transaction_type: secondaryTxType }))}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                style={form.transaction_type === secondaryTxType
                  ? { background: '#F28E2B', color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }}>
                {secondaryLabel}
              </button>
            </div>
          </div>

          {/* Product */}
          <div ref={prodRef} className="relative">
            <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">สินค้า *</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowProductDD(true); }}
                onFocus={() => setShowProductDD(true)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="พิมพ์ค้นหาสินค้า..." />
            </div>
            {showProductDD && (
              <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-52 overflow-auto w-full">
                {filteredProducts.length === 0 && <p className="text-gray-400 text-sm p-3">ไม่พบสินค้า</p>}
                {filteredProducts.map((p) => (
                  <button key={p.id} onClick={() => selectProduct(p)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 transition-colors">
                    <div className="text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="text-[10px] text-gray-400">{p.type} · หน่วย: {p.unit}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">จำนวน *</label>
              <div className="flex items-center gap-2">
                <input type="number" min="1" value={form.quantity || ''}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 tabular-nums text-center font-bold outline-none" />
                <span className="text-xs px-3 py-2 rounded-lg bg-gray-100 text-gray-500">
                  {selectedProduct?.unit || form.unit || 'หน่วย'}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">วันที่ *</label>
              <input type="date" value={form.transaction_date?.slice(0, 10) || ''}
                onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none" />
            </div>
          </div>

          {/* Department */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">แผนก</label>
            <select value={form.department || ''}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none">
              <option value="">— เลือกแผนก —</option>
              {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              {form.department && !DEPT_LABEL[form.department] && (
                <option value={form.department}>{form.department}</option>
              )}
            </select>
          </div>

          {/* Employee */}
          <div ref={empRef} className="relative">
            <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">พนักงาน</label>
            <div className="relative">
              <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setShowEmployeeDD(true);
                  if (!e.target.value) setForm((f) => ({ ...f, employee_code: '', employee_name: '' }));
                }}
                onFocus={() => setShowEmployeeDD(true)}
                placeholder="ค้นหาพนักงาน..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none" />
            </div>
            {showEmployeeDD && (
              <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-44 overflow-auto w-full">
                {filteredEmployees.length === 0 && <p className="text-gray-400 text-sm p-3">ไม่พบพนักงาน</p>}
                {filteredEmployees.map((e) => (
                  <button key={e.id} onClick={() => selectEmployee(e)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 transition-colors">
                    <div className="text-sm font-medium text-gray-900">{e.name}</div>
                    <div className="text-[10px] text-gray-400">{e.employee_code} · {e.department || '—'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 text-gray-500">หมายเหตุ</label>
            <input type="text" value={form.notes || ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none" />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-800 mb-2 font-medium">ยืนยันลบรายการนี้? การลบจะคืนผลต่อสต๊อกและไม่สามารถย้อนกลับได้</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={saving}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50">
                  {saving ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
                <button onClick={() => setConfirmDelete(false)} disabled={saving}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2 bg-gray-50">
          <button onClick={() => setConfirmDelete(true)} disabled={saving || confirmDelete}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
            <Trash2 size={14} /> ลบ
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              ยกเลิก
            </button>
            <button onClick={handleSave} disabled={saving || confirmDelete}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: accentColor }}>
              <Save size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { PPEProduct } from '@/lib/types';

export default function StockInPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
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
    fetchProducts();
  }, [companyId]);

  async function fetchProducts() {
    try {
      const res = await fetch(`/api/ppe/products?company_id=${companyId}`);
      const data = await res.json();
      if (data.data) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.product_id || !formData.quantity) {
      alert('กรุณากรอกข้อมูลที่จำเป็น');
      return;
    }

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
        setSuccessMessage('บันทึกสต็อกเข้าสำเร็จ!');
        setFormData({
          product_id: '',
          transaction_type: 'stock_in',
          quantity: '',
          unit: '',
          transaction_date: new Date().toISOString().split('T')[0],
          po_number: '',
          notes: '',
          recorded_by: '',
        });
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedProduct = products.find((p) => p.id === formData.product_id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">บันทึกรับเข้า</h1>
        <p className="text-gray-600 mt-2">บันทึกสต็อก PPE ที่รับเข้าหรือรับคืน</p>
      </div>

      {successMessage && (
        <div className="bg-green-100 border-l-4 border-green-600 p-4 rounded text-green-700">
          {successMessage}
        </div>
      )}

      <div className="bg-white rounded-lg p-6 shadow">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Product Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลือกสินค้า *
              </label>
              <select
                value={formData.product_id}
                onChange={(e) => {
                  const product = products.find((p) => p.id === e.target.value);
                  setFormData({
                    ...formData,
                    product_id: e.target.value,
                    unit: product?.unit || '',
                  });
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Transaction Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ประเภท *
              </label>
              <select
                value={formData.transaction_type}
                onChange={(e) =>
                  setFormData({ ...formData, transaction_type: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="stock_in">รับเข้า</option>
                <option value="return">รับคืน</option>
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                จำนวน *
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หน่วย
              </label>
              <input
                type="text"
                disabled
                value={formData.unit}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                วันที่รับเข้า *
              </label>
              <input
                type="date"
                required
                value={formData.transaction_date}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    transaction_date: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* PO Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเลข PO
              </label>
              <input
                type="text"
                value={formData.po_number}
                onChange={(e) =>
                  setFormData({ ...formData, po_number: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              หมายเหตุ
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Recorded By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              บันทึกโดย
            </label>
            <input
              type="text"
              value={formData.recorded_by}
              onChange={(e) =>
                setFormData({ ...formData, recorded_by: e.target.value })
              }
              placeholder="ชื่อผู้บันทึก"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Submit Button */}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
            >
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรับเข้า'}
            </button>
            <button
              type="reset"
              className="bg-gray-300 hover:bg-gray-400 text-gray-900 px-6 py-2 rounded-lg transition-colors"
            >
              ล้างแบบฟอร์ม
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

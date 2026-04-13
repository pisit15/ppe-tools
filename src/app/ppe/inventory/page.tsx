'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Plus, Trash2 } from 'lucide-react';
import type { PPEProduct } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

export default function InventoryPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'gloves',
    unit: 'piece',
    min_stock: 10,
    image_url: '',
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
    try {
      const res = await fetch('/api/ppe/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          ...formData,
        }),
      });

      if (res.ok) {
        setFormData({
          name: '',
          type: 'gloves',
          unit: 'piece',
          min_stock: 10,
          image_url: '',
        });
        setShowForm(false);
        fetchProducts();
      }
    } catch (error) {
      console.error('Error creating product:', error);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">จัดการสต็อก PPE</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          เพิ่มสินค้า
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg p-6 shadow border-l-4 border-blue-600">
          <h2 className="text-lg font-bold text-gray-900 mb-4">เพิ่มสินค้า PPE ใหม่</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อสินค้า *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภท *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {PPE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หน่วย *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {UNIT_TYPES.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  สต็อกขั้นต่ำ
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.min_stock}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_stock: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-900 px-6 py-2 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ชื่อสินค้า
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  ประเภท
                </th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  หน่วย
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  สต็อกขั้นต่ำ
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  วันที่สร้าง
                </th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">
                  การจัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {product.name}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{product.type}</td>
                    <td className="px-6 py-3 text-gray-600">{product.unit}</td>
                    <td className="px-6 py-3 text-center font-semibold">
                      {product.min_stock}
                    </td>
                    <td className="px-6 py-3 text-center text-gray-600">
                      {new Date(product.created_at).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button className="text-red-600 hover:text-red-700 p-2 rounded hover:bg-red-50">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    ไม่มีสินค้า. คลิก "เพิ่มสินค้า" เพื่อเริ่มต้น
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

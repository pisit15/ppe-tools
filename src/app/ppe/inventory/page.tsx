'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Plus, Trash2, Package, Search, Image as ImageIcon } from 'lucide-react';
import type { PPEProduct } from '@/lib/types';
import { PPE_TYPES, UNIT_TYPES } from '@/lib/constants';

/* ── emoji fallback per type ── */
const PPE_EMOJI: Record<string, string> = Object.fromEntries(
  PPE_TYPES.map((t) => [t.value, t.icon])
);

function getTypeLabel(value: string) {
  return PPE_TYPES.find((t) => t.value === value)?.label ?? value;
}
function getUnitLabel(value: string) {
  return UNIT_TYPES.find((u) => u.value === value)?.label ?? value;
}

export default function InventoryPage() {
  const { user } = useAuth();
  const companyId = user?.companyId || '';
  const [products, setProducts] = useState<PPEProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    type: 'gloves',
    unit: 'piece',
    min_stock: 10,
    image_url: '',
  });
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [companyId]);

  async function fetchProducts() {
    try {
      const res = await fetch(`/api/ppe/products?company_id=${companyId}`);
      const data = await res.json();
      if (data.data) setProducts(data.data);
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
        body: JSON.stringify({ company_id: companyId, ...formData }),
      });
      if (res.ok) {
        setFormData({ name: '', type: 'gloves', unit: 'piece', min_stock: 10, image_url: '' });
        setShowForm(false);
        setImgError(false);
        fetchProducts();
      }
    } catch (error) {
      console.error('Error creating product:', error);
    }
  }

  /* ── filtered list ── */
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">จัดการสต็อก PPE</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} รายการ</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          เพิ่มสินค้า
        </button>
      </div>

      {/* ── add form ── */}
      {showForm && (
        <div className="bg-white rounded-lg p-6 shadow border-l-4 border-blue-600">
          <h2 className="text-lg font-bold text-gray-900 mb-4">เพิ่มสินค้า PPE ใหม่</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อสินค้า *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {PPE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.icon} {type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หน่วย *</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {UNIT_TYPES.map((unit) => (
                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สต็อกขั้นต่ำ</label>
                <input
                  type="number"
                  min="0"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* ── image url ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <ImageIcon size={14} className="inline mr-1" />
                URL รูปภาพ (ไม่บังคับ)
              </label>
              <div className="flex gap-3 items-start">
                <input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={formData.image_url}
                  onChange={(e) => { setFormData({ ...formData, image_url: e.target.value }); setImgError(false); }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {formData.image_url && (
                  <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0 bg-gray-50 flex items-center justify-center">
                    {imgError ? (
                      <span className="text-2xl">{PPE_EMOJI[formData.type] || '📦'}</span>
                    ) : (
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

            <div className="flex gap-2">
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors">บันทึก</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-900 px-6 py-2 rounded-lg transition-colors">ยกเลิก</button>
            </div>
          </form>
        </div>
      )}

      {/* ── search + filter ── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="ค้นหาสินค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">ทุกประเภท</option>
          {PPE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>

      {/* ── products table ── */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-center font-semibold text-gray-700 w-16">📷</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">ชื่อสินค้า</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">ประเภท</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">หน่วย</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">สต็อกขั้นต่ำ</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">วันที่สร้าง</th>
                <th className="px-6 py-3 text-center font-semibold text-gray-700">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    {/* thumbnail */}
                    <td className="px-4 py-3 text-center">
                      <div className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden mx-auto bg-gray-50 flex items-center justify-center">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.style.display = 'none';
                              el.parentElement!.innerHTML = `<span style="font-size:1.4rem">${PPE_EMOJI[product.type] || '📦'}</span>`;
                            }}
                          />
                        ) : (
                          <span className="text-xl">{PPE_EMOJI[product.type] || '📦'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-900 font-medium">{product.name}</td>
                    <td className="px-6 py-3 text-gray-600">{getTypeLabel(product.type)}</td>
                    <td className="px-6 py-3 text-gray-600">{getUnitLabel(product.unit)}</td>
                    <td className="px-6 py-3 text-center font-semibold">{product.min_stock}</td>
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
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    <Package size={48} className="mx-auto mb-3 opacity-40" />
                    <p>ไม่มีสินค้า — คลิก &quot;เพิ่มสินค้า&quot; เพื่อเริ่มต้น</p>
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

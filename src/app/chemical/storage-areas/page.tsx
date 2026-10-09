'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { Warehouse, Plus, Pencil, Check, X, Grid3x3 } from 'lucide-react';
import type { ChemStorageArea, ChemSubstance } from '@/lib/types';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { StorageClassChip, Toast, inputCls } from '../components/ui';

export default function StorageAreasPage() {
  const { q } = useCompanyScope();
  return <ScopedStorageAreas key={q} />;
}
function ScopedStorageAreas() {
  const { companyId, isAll, canWrite, q } = useCompanyScope();
  const [refresh, setRefresh] = useState(0);
  const storage = useChemicalData<{data: ChemStorageArea[]}>('/api/chemical/storage-areas' + q, refresh);
  const substances = useChemicalData<{data: ChemSubstance[]}>('/api/chemical/substances' + q, refresh);
  const areas = storage.data?.data || [];
  const items = substances.data?.data || [];
  const loading = storage.loading || substances.loading;
  const error = storage.error || substances.error;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const add = async () => {
    if (!name.trim()) return;
    const r = await fetch('/api/chemical/storage-areas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: companyId, name, description: desc }) });
    const d = await r.json();
    if (!r.ok) { setToast({ type: 'error', msg: d.error || 'บันทึกไม่สำเร็จ' }); return; }
    setRefresh(v => v + 1);
    setName(''); setDesc(''); setToast({ type: 'success', msg: 'เพิ่มพื้นที่เก็บแล้ว' });
  };
  const rename = async (id: string) => {
    const r = await fetch('/api/chemical/storage-areas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: editName }) });
    const d = await r.json();
    if (!r.ok) { setToast({ type: 'error', msg: d.error || 'บันทึกไม่สำเร็จ' }); return; }
    setRefresh(v => v + 1); setEditId(null);
  };
  const deactivate = async (id: string) => {
    const r = await fetch('/api/chemical/storage-areas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: false }) });
    if (r.ok) { setRefresh(v => v + 1); setToast({ type: 'success', msg: 'ปิดใช้งานพื้นที่เก็บแล้ว' }); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Warehouse className="text-purple-600" /> พื้นที่จัดเก็บสารเคมี</h1>
        <p className="text-sm text-gray-500 mt-1">กำหนดพื้นที่/ห้อง/ตู้เก็บ เพื่อผูกกับสารเคมีและตรวจสอบการเก็บร่วมกันต่อพื้นที่</p>
      </div>
      {error && <p role="alert">{error} <button onClick={() => setRefresh(v => v + 1)}>ลองใหม่</button></p>}
      {loading && <p role="status">กำลังโหลดพื้นที่จัดเก็บ…</p>}
      {canWrite && !loading && !error && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]"><label htmlFor="area-name" className="block text-sm font-semibold text-gray-700 mb-1">ชื่อพื้นที่เก็บ</label><input className={inputCls} id="area-name" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ห้องเก็บสารเคมี A, ตู้ไวไฟ โรงซ่อม" /></div>
          <div className="flex-1 min-w-[200px]"><label htmlFor="area-description" className="block text-sm font-semibold text-gray-700 mb-1">รายละเอียด</label><input className={inputCls} id="area-description" value={desc} onChange={e => setDesc(e.target.value)} placeholder="อาคาร/ชั้น/ผู้รับผิดชอบ" /></div>
          <button onClick={add} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700"><Plus size={15} /> เพิ่ม</button>
        </div>
      )}
      {isAll && <p className="text-sm text-gray-500">เลือกบริษัทที่แถบด้านซ้ายเพื่อจัดการพื้นที่เก็บ</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {areas.map(a => {
          const inArea = items.filter(i => i.storage_area_id === a.id);
          const classes = Array.from(new Set(inArea.map(i => i.storage_class).filter(Boolean))) as string[];
          return (
            <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                {editId === a.id ? (
                  <div className="flex gap-1 flex-1">
                    <input className={inputCls} aria-label="ชื่อพื้นที่เก็บใหม่" value={editName} onChange={e => setEditName(e.target.value)} />
                    <button aria-label="บันทึกชื่อพื้นที่เก็บ" onClick={() => rename(a.id)} className="p-2 text-green-700"><Check size={16} /></button>
                    <button aria-label="ยกเลิกแก้ชื่อ" onClick={() => setEditId(null)} className="p-2 text-gray-500"><X size={16} /></button>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-bold text-gray-900">{a.name}</h3>
                    {a.description && <p className="text-xs text-gray-500">{a.description}</p>}
                  </div>
                )}
                {canWrite && editId !== a.id && (
                  <div className="flex gap-1">
                    <button onClick={() => { setEditId(a.id); setEditName(a.name); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="เปลี่ยนชื่อ" aria-label={`เปลี่ยนชื่อ ${a.name}`}><Pencil size={14} /></button>
                    <button onClick={() => deactivate(a.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600" title="ปิดใช้งาน" aria-label={`ปิดใช้งาน ${a.name}`}><X size={14} /></button>
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs text-gray-600">สารเคมี {inArea.length} รายการ · ประเภทการจัดเก็บ: {classes.length ? classes.map(c => <StorageClassChip key={c} code={c} />) : '—'}</div>
              {inArea.length > 0 && <ul className="mt-2 text-xs text-gray-700 space-y-0.5 max-h-28 overflow-y-auto">{inArea.map(i => <li key={i.id}>• {i.name}</li>)}</ul>}
              {inArea.length >= 2 && (
                <Link href={`/chemical/compatibility${q}`} className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-purple-700"><Grid3x3 size={12} /> ตรวจสอบการเก็บร่วมกันในพื้นที่นี้</Link>
              )}
            </div>
          );
        })}
        {areas.length === 0 && !loading && !error && !isAll && <p className="text-sm text-gray-500">ยังไม่มีพื้นที่เก็บ</p>}
      </div>
      <Toast toast={toast} />
    </div>
  );
}

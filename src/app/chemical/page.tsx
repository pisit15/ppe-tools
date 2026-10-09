'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FileText, Link2, Printer, Pencil, Trash2, FlaskConical, ShieldAlert, FileWarning, Boxes } from 'lucide-react';
import type { ChemStorageArea, ChemSubstance } from '@/lib/types';
import { GHS_PICTOGRAMS } from '@/lib/chemical/ghs';
import { STORAGE_CLASSES } from '@/lib/chemical/storage-classes';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import SubstanceForm from './components/SubstanceForm';
import { GhsIcons, StorageClassChip, SignalWordBadge, Toast, VIZ, inputCls } from './components/ui';

const PAGE_SIZE = 30;
type SortKey = 'name' | 'storage_class' | 'updated_at' | 'quantity';

export default function ChemicalRegisterPage() {
  const { user, companyId, isAll, canWrite, q } = useCompanyScope();
  const [items, setItems] = useState<ChemSubstance[]>([]);
  const [areas, setAreas] = useState<ChemStorageArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [pictoFilter, setPictoFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ChemSubstance | null | 'new'>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChemSubstance | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [s, a] = await Promise.all([
        fetch(`/api/chemical/substances?company_id=${companyId}`).then(r => r.json()),
        fetch(`/api/chemical/storage-areas?company_id=${companyId}`).then(r => r.json()),
      ]);
      if (s.error) throw new Error(s.error);
      setItems(s.data || []);
      setAreas(a.data || []);
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'); }
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(i => {
      if (s && ![i.name, i.chemical_name, i.cas_no, i.un_no, i.supplier, i.usage_purpose].some(v => (v || '').toLowerCase().includes(s))) return false;
      if (classFilter === '__none') { if (i.storage_class) return false; } else if (classFilter && i.storage_class !== classFilter) return false;
      if (pictoFilter && !i.ghs_pictograms.includes(pictoFilter as ChemSubstance['ghs_pictograms'][number])) return false;
      if (areaFilter && i.storage_area_id !== areaFilter) return false;
      return true;
    });
  }, [items, search, classFilter, pictoFilter, areaFilter]);

  const sorted = useMemo(() => {
    const d = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'quantity') return ((a.quantity || 0) - (b.quantity || 0)) * d;
      if (sortKey === 'updated_at') return a.updated_at.localeCompare(b.updated_at) * d;
      return String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'th') * d;
    });
  }, [filtered, sortKey, sortAsc]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // KPI
  const fiveYearsAgo = new Date(); fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const kpi = {
    total: items.length,
    withSds: items.filter(i => i.sds_file_path || i.sds_url).length,
    noClass: items.filter(i => !i.storage_class).length,
    staleSds: items.filter(i => !i.sds_revision_date || new Date(i.sds_revision_date) < fiveYearsAgo).length,
    danger: items.filter(i => i.signal_word === 'Danger').length,
  };

  const openSds = async (i: ChemSubstance) => {
    if (i.sds_url && !i.sds_file_path) { window.open(i.sds_url, '_blank', 'noopener'); return; }
    if (!i.sds_file_path) return;
    try {
      const r = await fetch(`/api/chemical/sds?path=${encodeURIComponent(i.sds_file_path)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      window.open(d.url, '_blank', 'noopener');
    } catch (e) { setToast({ type: 'error', msg: e instanceof Error ? e.message : 'เปิดไฟล์ไม่สำเร็จ' }); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const r = await fetch(`/api/chemical/substances/${confirmDelete.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error);
      setItems(prev => prev.filter(x => x.id !== confirmDelete.id));
      setToast({ type: 'success', msg: `นำ "${confirmDelete.name}" ออกจากทะเบียนแล้ว` });
    } catch (e) { setToast({ type: 'error', msg: e instanceof Error ? e.message : 'ลบไม่สำเร็จ' }); }
    setConfirmDelete(null);
  };

  const th = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
      onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}>
      {label} <span style={{ opacity: sortKey === key ? 1 : 0.25 }}>{sortKey === key && !sortAsc ? '▼' : '▲'}</span>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FlaskConical className="text-purple-600" /> ทะเบียนสารเคมี</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAll ? 'ทุกบริษัท (ภาพรวม) — เลือกบริษัทที่แถบด้านซ้ายเพื่อเพิ่ม/แก้ไข' : `บริษัท ${user?.companyName || companyId.toUpperCase()}`} · {items.length} รายการ
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/chemical/compatibility${q}`} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">ตารางเก็บร่วม/แยก</Link>
          <button onClick={() => setEditing('new')} disabled={!canWrite} title={canWrite ? '' : 'เลือกบริษัทก่อน'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
            <Plus size={16} /> เพิ่มสารเคมี
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'สารเคมีในทะเบียน', value: kpi.total, color: VIZ.primary, icon: <Boxes size={18} /> },
          { label: 'มี SDS แนบ/ลิงก์', value: `${kpi.withSds}/${kpi.total}`, color: VIZ.positive, icon: <FileText size={18} /> },
          { label: 'ยังไม่ระบุประเภทการจัดเก็บ', value: kpi.noClass, color: kpi.noClass ? VIZ.secondary : VIZ.neutral, icon: <ShieldAlert size={18} /> },
          { label: 'SDS เก่ากว่า 5 ปี / ไม่มีวันที่', value: kpi.staleSds, color: kpi.staleSds ? VIZ.accent : VIZ.neutral, icon: <FileWarning size={18} /> },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4" style={{ borderLeft: `4px solid ${k.color}` }}>
            <div className="flex items-center justify-between text-xs text-gray-500"><span>{k.label}</span><span style={{ color: k.color }}>{k.icon}</span></div>
            <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} pl-9`} placeholder="ค้นหาชื่อ / CAS / UN / ผู้ผลิต / แผนกที่ใช้" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className={`${inputCls} w-auto`} value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}>
          <option value="">ทุกประเภทการจัดเก็บ</option><option value="__none">ยังไม่ระบุประเภท</option>
          {STORAGE_CLASSES.map(c => <option key={c.code} value={c.code}>{c.code} · {c.nameTh}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={pictoFilter} onChange={e => { setPictoFilter(e.target.value); setPage(1); }}>
          <option value="">ทุกสัญลักษณ์ GHS</option>
          {GHS_PICTOGRAMS.map(p => <option key={p.code} value={p.code}>{p.code} {p.nameTh}</option>)}
        </select>
        {areas.length > 0 && (
          <select className={`${inputCls} w-auto`} value={areaFilter} onChange={e => { setAreaFilter(e.target.value); setPage(1); }}>
            <option value="">ทุกพื้นที่เก็บ</option>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {(search || classFilter || pictoFilter || areaFilter) && (
          <button onClick={() => { setSearch(''); setClassFilter(''); setPictoFilter(''); setAreaFilter(''); }} className="text-xs text-purple-700 font-semibold">ล้างตัวกรอง</button>
        )}
        <span className="text-xs text-gray-500 ml-auto">แสดง {sorted.length} จาก {items.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">กำลังโหลด…</div>
        ) : loadError ? (
          <div className="p-10 text-center text-sm" style={{ color: VIZ.accent }}>{loadError} <button onClick={load} className="underline ml-2">ลองใหม่</button></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <FlaskConical size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-600">{items.length === 0 ? 'ยังไม่มีสารเคมีในทะเบียน' : 'ไม่พบรายการตรงกับตัวกรอง'}</p>
            {items.length === 0 && canWrite && <button onClick={() => setEditing('new')} className="mt-3 text-sm text-purple-700 font-semibold">+ เพิ่มสารเคมีรายการแรก</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {th('name', 'สารเคมี')}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">GHS</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">สัญญาณ</th>
                  {th('storage_class', 'ประเภทจัดเก็บ')}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">พื้นที่เก็บ</th>
                  {th('quantity', 'ปริมาณ')}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">SDS</th>
                  {isAll && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">บริษัท</th>}
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(i => {
                  const stale = !i.sds_revision_date || new Date(i.sds_revision_date) < fiveYearsAgo;
                  return (
                    <tr key={i.id} className="border-b border-gray-100 hover:bg-purple-50/40">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-gray-900">{i.name}</div>
                        <div className="text-[11px] text-gray-500">{[i.chemical_name, i.cas_no && `CAS ${i.cas_no}`, i.un_no && `UN ${i.un_no}`].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-3 py-2.5"><GhsIcons codes={i.ghs_pictograms} size={26} /></td>
                      <td className="px-3 py-2.5"><SignalWordBadge word={i.signal_word} /></td>
                      <td className="px-3 py-2.5"><StorageClassChip code={i.storage_class} /></td>
                      <td className="px-3 py-2.5 text-xs text-gray-700">{i.chem_storage_areas?.name || '—'}{i.storage_location && <div className="text-gray-400">{i.storage_location}</div>}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{i.quantity != null ? `${i.quantity.toLocaleString('th-TH')} ${i.unit || ''}` : '—'}</td>
                      <td className="px-3 py-2.5">
                        {(i.sds_file_path || i.sds_url) ? (
                          <button onClick={() => openSds(i)} className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:underline" title={i.sds_file_name || i.sds_url || ''}>
                            {i.sds_file_path ? <FileText size={14} /> : <Link2 size={14} />} เปิด
                            {stale && <span title="SDS เก่ากว่า 5 ปีหรือไม่มีวันที่" className="ml-1 text-[10px] px-1 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>เก่า</span>}
                          </button>
                        ) : <span className="text-xs" style={{ color: VIZ.accent }}>ไม่มี</span>}
                      </td>
                      {isAll && <td className="px-3 py-2.5 text-xs font-semibold text-gray-700">{i.company_id.toUpperCase()}</td>}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Link href={`/chemical/${i.id}/poster`} title="โปสเตอร์สรุป SDS (A4)" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={16} /></Link>
                          <button onClick={() => setEditing(i)} disabled={isAll} title="แก้ไข" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30"><Pencil size={16} /></button>
                          <button onClick={() => setConfirmDelete(i)} disabled={isAll} title="นำออกจากทะเบียน" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-3 text-sm border-t border-gray-100">
            <button disabled={safePage === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40">← ก่อนหน้า</button>
            <span className="text-gray-600">หน้า {safePage}/{totalPages}</span>
            <button disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40">ถัดไป →</button>
          </div>
        )}
      </div>

      {editing && (
        <SubstanceForm
          companyId={editing === 'new' ? companyId : editing.company_id}
          areas={areas}
          initial={editing === 'new' ? null : editing}
          createdBy={user?.displayName || user?.username || ''}
          onClose={() => setEditing(null)}
          onToast={setToast}
          onSaved={s => {
            setItems(prev => editing === 'new' ? [s, ...prev] : prev.map(x => x.id === s.id ? s : x));
            setEditing(null);
            setToast({ type: 'success', msg: editing === 'new' ? `เพิ่ม "${s.name}" แล้ว` : 'บันทึกการแก้ไขแล้ว' });
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[2500] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900">นำออกจากทะเบียน?</h3>
            <p className="text-sm text-gray-600 mt-2">"{confirmDelete.name}" จะถูกซ่อนจากทะเบียน (ข้อมูลและไฟล์ SDS ยังอยู่ในระบบ)</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700">ยกเลิก</button>
              <button onClick={doDelete} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: VIZ.accent }}>นำออก</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FileText, Link2, Printer, Pencil, Trash2, FlaskConical } from 'lucide-react';
import type { ChemStorageArea, ChemSubstance } from '@/lib/types';
import { GHS_PICTOGRAMS } from '@/lib/chemical/ghs';
import { STORAGE_CLASSES } from '@/lib/chemical/storage-classes';
import { useCompanyScope } from '@/lib/chemical/useCompanyScope';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { matchesQuality, sdsState, type QualityFilter } from '@/lib/chemical/data-quality';
import type { ChemCompanySettings } from '@/lib/types';
import { GhsIcons, StorageClassChip, SignalWordBadge, Toast, VIZ, inputCls } from './components/ui';

import { ConfirmDialog } from './components/ConfirmDialog';

const PAGE_SIZE = 30;
const EMPTY_ITEMS: ChemSubstance[] = [];
type SortKey = 'name' | 'storage_class' | 'updated_at' | 'quantity';

export default function ChemicalRegisterPage() {
  const { q } = useCompanyScope();
  return <ScopedRegister key={q} />;
}
function ScopedRegister() {
  const { companyName, isAdmin, isAll, canWrite, q } = useCompanyScope();
  const [refresh, setRefresh] = useState(0);
  const [demo, setDemo] = useState(false);
  const [quality, setQuality] = useState<QualityFilter>('');
  const substances = useChemicalData<{data: ChemSubstance[]}>(`/api/chemical/substances${q}&demo=${demo ? 1 : 0}`, refresh);
  const storage = useChemicalData<{data: ChemStorageArea[]}>(`/api/chemical/storage-areas${q}`, refresh);
  const settings = useChemicalData<{data: ChemCompanySettings; policies?: ChemCompanySettings[]}>(`/api/chemical/settings${q}`, refresh);
  const items = substances.data?.data || EMPTY_ITEMS;
  const areas = storage.data?.data || [];
  const loading = substances.loading || storage.loading || settings.loading;
  const loadError = substances.error || storage.error || settings.error;
  const policyFor = useCallback((id: string) => settings.data?.policies?.find(p => p.company_id === id) || (settings.data?.data.company_id === id ? settings.data.data : undefined), [settings.data]);
  const load = () => setRefresh(v => v + 1);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [pictoFilter, setPictoFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<ChemSubstance | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(i => {
      if (!matchesQuality(i, quality, policyFor(i.company_id))) return false;
      if (s && ![i.name, i.chemical_name, i.cas_no, i.un_no, i.supplier, i.usage_purpose].some(v => (v || '').toLowerCase().includes(s))) return false;
      if (classFilter === '__none') { if (i.storage_class) return false; } else if (classFilter && i.storage_class !== classFilter) return false;
      if (pictoFilter && !i.ghs_pictograms.includes(pictoFilter as ChemSubstance['ghs_pictograms'][number])) return false;
      if (areaFilter && i.storage_area_id !== areaFilter) return false;
      return true;
    });
  }, [items, search, classFilter, pictoFilter, areaFilter, quality, policyFor]);

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

  const cards: { label: string; filter: QualityFilter; color: string; value: number }[] = [
    { label: 'สารเคมีในทะเบียน', filter: '', color: VIZ.primary, value: items.length },
    { label: 'ขาด SDS', filter: 'missing_sds', color: VIZ.accent, value: items.filter(i => matchesQuality(i, 'missing_sds')).length },
    { label: 'SDS ไม่มีวันที่ — ประเมินรอบไม่ได้', filter: 'missing_date', color: '#92400e', value: items.filter(i => matchesQuality(i, 'missing_date')).length },
    { label: isAll ? 'ถึงรอบทบทวนตามนโยบายแต่ละบริษัท' : settings.data?.data.sds_review_years ? `ถึงรอบทบทวน (ครบ ${settings.data.data.sds_review_years} ปีตามนโยบายบริษัท)` : 'ถึงรอบทบทวน — ยังไม่กำหนดนโยบาย', filter: 'due', color: '#92400e', value: items.filter(i => matchesQuality(i, 'due', policyFor(i.company_id))).length },
    { label: 'ยังไม่ระบุประเภทจัดเก็บ', filter: 'no_class', color: '#92400e', value: items.filter(i => !i.storage_class).length },
    { label: 'ยังไม่ตรวจทาน', filter: 'unreviewed', color: '#92400e', value: items.filter(i => i.review_status !== 'reviewed').length },
  ];

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

  const changeDemo = async (item: ChemSubstance) => {
    if (!window.confirm((item.is_demo ? 'นำกลับทะเบียนจริง: ' : 'ย้ายไปข้อมูลสาธิต (เก็บข้อมูลเดิมไว้): ') + item.name + '?')) return;
    try {
      const r = await fetch(`/api/chemical/substances/${item.id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({demo_action:item.is_demo ? 'restore' : 'mark',expected_updated_at:item.updated_at})});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      load();
    } catch(e) {setToast({type:'error',msg:e instanceof Error ? e.message : 'เปลี่ยนประเภทข้อมูลไม่สำเร็จ'});}
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const r = await fetch(`/api/chemical/substances/${confirmDelete.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error);
      load();
      setToast({ type: 'success', msg: `นำ "${confirmDelete.name}" ออกจากทะเบียนแล้ว` });
    } catch (e) { setToast({ type: 'error', msg: e instanceof Error ? e.message : 'ลบไม่สำเร็จ' }); }
    setConfirmDelete(null);
  };

  const th = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left text-sm text-gray-700 whitespace-nowrap" aria-sort={sortKey === key ? sortAsc ? 'ascending' : 'descending' : 'none'}>
      <button className="py-2 font-semibold focus-visible:ring-2 focus-visible:ring-purple-600" onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(true); } }}>
        {label} {sortKey === key && <span aria-hidden="true">{sortAsc ? '▲' : '▼'}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FlaskConical className="text-purple-600" /> ทะเบียนสารเคมี</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAll ? 'ทุกบริษัท (ภาพรวม) — เลือกบริษัทที่แถบด้านซ้ายเพื่อเพิ่ม/แก้ไข' : `บริษัท ${companyName}`} · {loading ? 'กำลังโหลด…' : loadError ? 'โหลดไม่สำเร็จ' : `${items.length} รายการ`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/chemical/compatibility${q}`} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">ตารางเก็บร่วม/แยก</Link>
          {canWrite && !demo ? <Link href={`/chemical/new${q}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700"><Plus size={16} /> เพิ่มสารเคมี</Link> : <span className="text-sm text-gray-600 self-center">{demo ? 'กำลังดูข้อมูลสาธิต' : 'เลือกบริษัทเพื่อเพิ่มสารเคมี'}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3" aria-busy={loading}>
        {cards.map(k => <button key={k.label} disabled={loading || !!loadError} aria-pressed={quality === k.filter} onClick={() => { setQuality(k.filter); setPage(1); setSearch(''); setClassFilter(''); setPictoFilter(''); setAreaFilter(''); }}
          className={`text-left bg-white rounded-xl border p-4 focus-visible:ring-2 focus-visible:ring-purple-600 ${quality === k.filter ? 'border-purple-600 ring-1 ring-purple-600' : 'border-gray-200'}`}>
          <span className="text-sm text-gray-700">{k.label}</span>
          <span className="block text-2xl font-bold mt-2" style={{ color: k.value > 0 ? k.color : '#4b5563' }}>{loading ? '…' : loadError ? '—' : k.filter === 'due' && !isAll && !settings.data?.data.sds_review_years ? '—' : k.value}</span>
        </button>)}
      </div>
      {!loading && !loadError && <div className="flex flex-wrap gap-3 text-sm text-gray-700">
        <button className="underline" onClick={() => { setQuality('no_policy'); setPage(1); setSearch(''); setClassFilter(''); setPictoFilter(''); setAreaFilter(''); }}>ยังประเมินรอบไม่ได้เพราะไม่กำหนดนโยบาย: {items.filter(i => matchesQuality(i, 'no_policy', policyFor(i.company_id))).length} รายการ</button>
        {!isAll && <Link className="text-purple-700 underline" href={`/chemical/settings${q}`}>ตั้งนโยบายรอบทบทวน</Link>}
        <label className="ml-auto flex gap-2"><input type="checkbox" checked={demo} onChange={e => { setDemo(e.target.checked); setPage(1); }} /> ดูข้อมูลสาธิต</label>
      </div>}
      {demo && <p className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-900">ข้อมูลสาธิต — ไม่รวมในทะเบียนใช้งานจริง</p>}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="relative md:col-span-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input className={`${inputCls} pl-9`} aria-label="ค้นหาสารเคมี" placeholder="ค้นหาชื่อ / CAS / UN / ผู้ผลิต / แผนกที่ใช้" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className={`${inputCls}`} aria-label="ประเภทการจัดเก็บ" value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }}>
          <option value="">ทุกประเภทการจัดเก็บ</option><option value="__none">ยังไม่ระบุประเภท</option>
          {STORAGE_CLASSES.map(c => <option key={c.code} value={c.code}>{c.code} · {c.nameTh}</option>)}
        </select>
        <select className={`${inputCls}`} aria-label="สัญลักษณ์ GHS" value={pictoFilter} onChange={e => { setPictoFilter(e.target.value); setPage(1); }}>
          <option value="">ทุกสัญลักษณ์ GHS</option>
          {GHS_PICTOGRAMS.map(p => <option key={p.code} value={p.code}>{p.code} {p.nameTh}</option>)}
        </select>
        {areas.length > 0 && (
          <select className={`${inputCls}`} aria-label="พื้นที่จัดเก็บ" value={areaFilter} onChange={e => { setAreaFilter(e.target.value); setPage(1); }}>
            <option value="">ทุกพื้นที่เก็บ</option>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {(search || classFilter || pictoFilter || areaFilter || quality) && (
          <button onClick={() => { setSearch(''); setClassFilter(''); setPictoFilter(''); setAreaFilter(''); setQuality(''); setPage(1); }} className="text-xs text-purple-700 font-semibold">ล้างตัวกรอง</button>
        )}
        <span className="text-xs text-gray-500 ml-auto">{loading ? 'กำลังโหลด…' : loadError ? 'โหลดไม่สำเร็จ' : `แสดง ${sorted.length} จาก ${items.length}`}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">กำลังโหลด…</div>
        ) : loadError ? (
          <div role="alert" className="p-10 text-center text-sm" style={{ color: VIZ.accent }}>{loadError} <button onClick={load} className="underline ml-2">ลองใหม่</button></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <FlaskConical size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-600">{items.length === 0 ? 'ยังไม่มีสารเคมีในทะเบียน' : 'ไม่พบรายการตรงกับตัวกรอง'}</p>
            {items.length === 0 && canWrite && !demo && <Link href={`/chemical/new${q}`} className="mt-3 inline-block text-sm text-purple-700 font-semibold">+ เพิ่มสารเคมีรายการแรก</Link>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
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
                  const status = sdsState(i, policyFor(i.company_id));
                  return (
                    <tr key={i.id} className="border-b border-gray-100 hover:bg-purple-50/40">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-gray-900">{i.name}</div>{isAdmin && <button onClick={() => changeDemo(i)} className="text-xs text-purple-800 underline my-1">{i.is_demo ? 'นำกลับทะเบียนจริง' : 'ย้ายไปข้อมูลสาธิต'}</button>}<div className="text-xs mt-1 text-gray-700">{i.review_status === 'reviewed' ? `✓ ตรวจทานแล้วโดย ${i.reviewed_by || '—'}` : '! ยังไม่ตรวจทาน'}{i.ai_filled_fields?.length ? ' · มีข้อมูลจาก AI' : ''}</div>
                        <div className="text-sm text-gray-500">{[i.chemical_name, i.cas_no && `CAS ${i.cas_no}`, i.un_no && `UN ${i.un_no}`].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="px-3 py-2.5"><GhsIcons codes={i.ghs_pictograms} size={26} /></td>
                      <td className="px-3 py-2.5"><SignalWordBadge word={i.signal_word} /></td>
                      <td className="px-3 py-2.5"><StorageClassChip code={i.storage_class} /></td>
                      <td className="px-3 py-2.5 text-xs text-gray-700">{i.chem_storage_areas?.name || '—'}{i.storage_location && <div className="text-gray-600">{i.storage_location}</div>}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{i.quantity != null ? `${i.quantity.toLocaleString('th-TH')} ${i.unit || ''}` : '—'}</td>
                      <td className="px-3 py-2.5">
                        {(i.sds_file_path || i.sds_url) ? (
                          <button onClick={() => openSds(i)} className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:underline" title={i.sds_file_name || i.sds_url || ''}>
                            {i.sds_file_path ? <FileText size={14} /> : <Link2 size={14} />} เปิด
                            {status !== 'current' && <span className="ml-1 text-xs px-1 rounded bg-amber-100 text-amber-900">{status === 'missing_date' ? 'ไม่มีวันที่' : status === 'due' ? 'ถึงรอบทบทวน' : 'ไม่กำหนดรอบ'}</span>}
                          </button>
                        ) : <span className="text-xs" style={{ color: VIZ.accent }}>ไม่มี</span>}
                      </td>
                      {isAll && <td className="px-3 py-2.5 text-xs font-semibold text-gray-700">{i.company_id.toUpperCase()}</td>}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Link href={`/chemical/${i.id}/poster`} aria-label={`โปสเตอร์สรุป SDS ของ ${i.name}`} title="โปสเตอร์สรุป SDS (A4)" className="p-3 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={16} /></Link>
                          <Link href={`/chemical/${i.id}/edit?company_id=${encodeURIComponent(i.company_id)}`} aria-label={`แก้ไข ${i.name}`} className="inline-flex p-3 rounded-lg hover:bg-purple-50"><Pencil size={18} /></Link>
                          <button onClick={() => setConfirmDelete(i)} disabled={isAll} aria-label={`นำ ${i.name} ออกจากทะเบียน`} title="นำออกจากทะเบียน" className="p-3 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 disabled:opacity-30"><Trash2 size={16} /></button>
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

      {confirmDelete && (
        <ConfirmDialog onCancel={() => setConfirmDelete(null)}>
            <h3 id="confirm-title" className="font-bold text-gray-900">นำออกจากทะเบียน?</h3>
            <p className="text-sm text-gray-600 mt-2">“{confirmDelete.name}” จะถูกซ่อนจากทะเบียน (ข้อมูลและไฟล์ SDS ยังอยู่ในระบบ)</p>
            <div className="flex justify-end gap-2 mt-5">
              <button autoFocus onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm bg-gray-100 text-gray-700">ยกเลิก</button>
              <button onClick={doDelete} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: VIZ.accent }}>นำออก</button>
            </div>
        </ConfirmDialog>
      )}

      <Toast toast={toast} />
    </div>
  );
}

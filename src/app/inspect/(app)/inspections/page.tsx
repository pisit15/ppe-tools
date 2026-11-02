'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, ListChecks, Search, X } from 'lucide-react';
import type { InspInspectionView } from '@/lib/inspect/types';
import { CategoryTile } from '../../_components/icons';
import { EmptyState, OverallBadge, Skeleton, ToastView, VIZ, btnGhost, btnPrimary, btnSecondary, cardClass, currentPeriod, errMsg, getJson, inputClass, postJson, selectCompact, shiftPeriod, thaiDate, thaiPeriod, useCompany, useToast } from '../../_components/ui';

const PAGE = 30;

export default function InspectionsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Inner /></Suspense>;
}

function Inner() {
  const { company, companyName } = useCompany();
  const sp = useSearchParams();
  const { toast, setToast } = useToast();
  const [open, setOpen] = useState(sp.get('open') === '1');
  const [period, setPeriod] = useState(sp.get('open') === '1' ? '' : currentPeriod());
  const [overall, setOverall] = useState<'' | 'pass' | 'fail'>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<InspInspectionView[] | null>(null);
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<{ id: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const params = new URLSearchParams({ company, limit: '2000' });
      if (open) params.set('open', '1'); else if (period) params.set('period', period);
      if (overall && !open) params.set('overall', overall);
      setRows((await getJson<{ data: InspInspectionView[] }>(`/api/inspect/inspections?${params}`)).data);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'โหลดข้อมูลไม่สำเร็จ') }); setRows([]); }
  }, [company, open, period, overall, setToast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, open, period, overall]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows || []).filter(r => !n || [r.asset?.code, r.asset?.name, r.asset?.department, r.asset?.location, r.inspector_name, r.note].some(s => s && s.toLowerCase().includes(n)));
  }, [rows, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice((page - 1) * PAGE, page * PAGE);
  const stats = useMemo(() => ({ total: filtered.length, fail: filtered.filter(r => r.overall === 'fail').length, openFail: filtered.filter(r => r.overall === 'fail' && !r.resolved_at).length }), [filtered]);

  async function resolve() {
    if (!resolving) return;
    try { await postJson(`/api/inspect/inspections/${resolving.id}`, { action: 'resolve', resolved_note: resolving.note }, 'PATCH'); setToast({ type: 'success', msg: 'ปิดงานแล้ว' }); setResolving(null); await load(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }

  async function exportExcel() {
    if (!rows?.length) { setToast({ type: 'info', msg: 'ไม่มีข้อมูลให้ส่งออก' }); return; }
    const XLSX = await import('xlsx');
    const data = filtered.map(r => ({ 'วันที่ตรวจ': r.inspected_on, 'รอบ': r.period, 'รหัสอุปกรณ์': r.asset?.code || '', 'ชื่อ': r.asset?.name || '', 'หมวด': r.asset?.category_name || '', 'แผนก': r.asset?.department || '', 'ตำแหน่ง': r.asset?.location || '', 'ผล': r.overall === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน', 'ข้อที่ไม่ผ่าน': r.fail_items.join(', '), 'ผู้ตรวจ': r.inspector_name, 'รหัสผู้ตรวจ': r.inspector_code, 'หมายเหตุ': r.note, 'ปิดงานเมื่อ': r.resolved_at ? r.resolved_at.slice(0, 10) : '', 'ปิดงานโดย': r.resolved_by || '', 'บันทึกการแก้ไข': r.resolved_note, 'จำนวนรูป': r.photos.length, 'ช่องทาง': r.source, ...Object.fromEntries(Object.entries(r.results).map(([k, v]) => [`ผล:${k}`, v === 'pass' ? 'ผ่าน' : v === 'fail' ? 'ไม่ผ่าน' : v === 'na' ? 'ไม่มี' : v ?? ''])) }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ผลตรวจ');
    XLSX.writeFile(wb, `inspections-${company}-${open ? 'open-failures' : period || 'all'}.xlsx`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-gray-900">ประวัติการตรวจ</h1><p className="text-sm text-gray-500 mt-1">{companyName} · {stats.total.toLocaleString()} รายการ{stats.fail ? <> · <span style={{ color: VIZ.accent }}>ไม่ผ่าน {stats.fail}</span></> : null}{stats.openFail ? <> · <span style={{ color: VIZ.secondary }}>รอแก้ไข {stats.openFail}</span></> : null}</p></div>
        <button type="button" className={btnSecondary} onClick={exportExcel}><Download size={16} />ส่งออก Excel</button>
      </div>

      <div className={`${cardClass} !p-0 overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button type="button" onClick={() => setOpen(false)} className={`rounded-md px-3 py-1.5 text-sm ${!open ? 'bg-[#4E79A7] text-white' : 'text-gray-600'}`}>ตามรอบ</button>
            <button type="button" onClick={() => setOpen(true)} className={`rounded-md px-3 py-1.5 text-sm ${open ? 'bg-[#F28E2B] text-white' : 'text-gray-600'}`}>ไม่ผ่าน รอแก้ไข</button>
          </div>
          {!open && (
            <>
              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
                <button type="button" onClick={() => setPeriod(p => shiftPeriod(p || currentPeriod(), -1))} className="p-2 text-gray-500 hover:bg-gray-50 rounded-l-lg" aria-label="เดือนก่อน"><ChevronLeft size={16} /></button>
                <span className="px-2 text-sm font-medium min-w-[100px] text-center">{period ? thaiPeriod(period) : 'ทุกช่วง'}</span>
                <button type="button" disabled={!period || period >= currentPeriod()} onClick={() => setPeriod(p => shiftPeriod(p, 1))} className="p-2 text-gray-500 hover:bg-gray-50 rounded-r-lg disabled:opacity-30" aria-label="เดือนถัดไป"><ChevronRight size={16} /></button>
              </div>
              <select className={selectCompact} value={overall} onChange={e => setOverall(e.target.value as '' | 'pass' | 'fail')} aria-label="ผล"><option value="">ผ่าน + ไม่ผ่าน</option><option value="pass">เฉพาะผ่าน</option><option value="fail">เฉพาะไม่ผ่าน</option></select>
            </>
          )}
          <div className="relative flex-1 min-w-[180px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className={`${inputClass} pl-9 py-2`} placeholder="ค้นหา รหัส แผนก ผู้ตรวจ…" value={q} onChange={e => setQ(e.target.value)} /></div>
          {q && <button type="button" className={btnGhost} onClick={() => setQ('')}><X size={14} /></button>}
        </div>

        {rows === null ? <div className="p-6 space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
        : view.length === 0 ? <EmptyState icon={open ? <CheckCircle2 size={40} /> : <ListChecks size={40} />} title={open ? 'ไม่มีรายการไม่ผ่านค้างแก้ไข' : 'ไม่มีการตรวจในช่วงนี้'} hint={open ? 'ทุกรายการที่ไม่ผ่านถูกปิดงานแล้ว' : 'ลองเปลี่ยนเดือนหรือตัวกรอง'} />
        : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100"><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">อุปกรณ์</th><th className="px-4 py-3">ผล</th><th className="px-4 py-3">รายละเอียด</th><th className="px-4 py-3">ผู้ตรวจ</th><th className="px-4 py-3" /></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {view.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/80 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800">{thaiDate(r.inspected_on)}</td>
                      <td className="px-4 py-3"><Link href={`/inspect/assets/${r.asset_id}`} className="flex items-center gap-2 hover:underline"><CategoryTile name={r.asset?.category_icon || 'shield'} color={r.asset?.category_color || VIZ.neutral} size={32} /><span><span className="block font-medium text-gray-900">{r.asset?.code}</span><span className="block text-xs text-gray-500">{r.asset?.category_name}{r.asset?.department ? ` · ${r.asset.department}` : ''}</span></span></Link></td>
                      <td className="px-4 py-3"><OverallBadge overall={r.overall} />{r.overall === 'fail' && (r.resolved_at ? <span className="block text-xs mt-1" style={{ color: VIZ.positive }}>ปิดงาน {thaiDate(r.resolved_at.slice(0, 10))}</span> : <span className="block text-xs mt-1 font-medium" style={{ color: VIZ.secondary }}>รอแก้ไข</span>)}</td>
                      <td className="px-4 py-3 max-w-[360px]">{r.fail_items.length > 0 && <p className="text-gray-800">{r.fail_items.length} ข้อ: {r.fail_items.join(', ')}</p>}{r.note && <p className="text-gray-500 text-xs mt-0.5">“{r.note}”</p>}{r.photos.length > 0 && <p className="text-xs text-gray-400 mt-0.5">รูป {r.photos.filter(p => !p.deleted_at).length}/{r.photos.length}</p>}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.inspector_name}<span className="block text-xs text-gray-400">{r.inspector_code}</span></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{r.overall === 'fail' && !r.resolved_at && <button type="button" className={btnGhost} onClick={() => setResolving({ id: r.id, note: '' })}><CheckCircle2 size={14} />ปิดงาน</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>{filtered.length.toLocaleString()} รายการ</span>
              <div className="inline-flex items-center gap-1"><button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button><span className="px-2">หน้า {page}/{pages}</span><button type="button" className={btnGhost} disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button></div>
            </div>
          </>
        )}
      </div>

      {resolving && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="ปิด" className="absolute inset-0 bg-black/30" onClick={() => setResolving(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">ปิดงานแก้ไข</h2>
            <textarea className={inputClass} rows={3} placeholder="สิ่งที่แก้ไข เช่น ส่งอัดใหม่แล้ว / เปลี่ยนสายฉีด" value={resolving.note} onChange={e => setResolving({ ...resolving, note: e.target.value })} />
            <div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={() => setResolving(null)}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: VIZ.positive }} onClick={resolve}><CheckCircle2 size={16} />ปิดงาน</button></div>
          </div>
        </div>
      )}
      <ToastView toast={toast} />
    </div>
  );
}

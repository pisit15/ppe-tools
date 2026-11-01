'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileSpreadsheet, Plus, Printer, QrCode, Search, X } from 'lucide-react';
import type { InspAssetView, InspCategoryRow, InspDueState, InspTemplateRow } from '@/lib/inspect/types';
import { DUE_STATE_LABEL } from '@/lib/inspect/constants';
import { AssetForm, type AssetFormValue } from '../../_components/AssetForm';
import { CategoryIcon, CategoryTile } from '../../_components/icons';
import { Drawer, DueBadge, EmptyState, Modal, Skeleton, ToastView, VIZ, bangkokToday, btnGhost, btnPrimary, btnSecondary, cardClass, daysUntil, errMsg, getJson, inputClass, postJson, relativeDays, selectCompact, thaiDate, useCompany, useToast } from '../../_components/ui';

const PAGE = 30;
type SortKey = 'code' | 'department' | 'last' | 'due' | 'service';
type Catalog = { categories: InspCategoryRow[]; templates: InspTemplateRow[] };

export default function AssetsPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><AssetsInner /></Suspense>;
}

function AssetsInner() {
  const { company, companyName } = useCompany();
  const router = useRouter();
  const sp = useSearchParams();
  const { toast, setToast } = useToast();
  const [assets, setAssets] = useState<InspAssetView[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], templates: [] });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState(sp.get('category') || '');
  const [department, setDepartment] = useState('');
  const [due, setDue] = useState<InspDueState | ''>((sp.get('due') as InspDueState) || '');
  const [serviceDue, setServiceDue] = useState(sp.get('service') === 'due');
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'code', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setAssets(null); setSelected(new Set());
    try {
      const [a, c] = await Promise.all([
        getJson<{ data: InspAssetView[] }>(`/api/inspect/assets?company=${encodeURIComponent(company)}&all=1`),
        getJson<{ data: Catalog }>(`/api/inspect/categories?company=${encodeURIComponent(company)}`),
      ]);
      setAssets(a.data); setCatalog(c.data);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'โหลดทะเบียนไม่สำเร็จ') }); setAssets([]); }
  }, [company, setToast]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  const departments = useMemo(() => [...new Set((assets || []).map(a => a.department).filter(Boolean))].sort(), [assets]);
  const [today] = useState(bangkokToday);
  const in90 = useMemo(() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 90); return d.toISOString().slice(0, 10); }, [today]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = (assets || []).filter(a => showInactive || a.status === 'active');
    if (category) list = list.filter(a => a.category_id === category);
    if (department) list = list.filter(a => a.department === department);
    if (due) list = list.filter(a => a.status_info.due_state === due);
    if (serviceDue) list = list.filter(a => a.status_info.next_service_due_on && a.status_info.next_service_due_on <= in90);
    if (needle) list = list.filter(a => [a.code, a.name, a.location, a.department, a.building, a.floor, ...Object.values(a.attributes || {}).map(String)].some(s => s && s.toLowerCase().includes(needle)));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (a: InspAssetView) => sort.key === 'code' ? a.code : sort.key === 'department' ? a.department : sort.key === 'last' ? (a.status_info.last_inspected_on || '') : sort.key === 'due' ? (a.status_info.next_due_on || '0000') : (a.status_info.next_service_due_on || '9999');
    return [...list].sort((x, y) => val(x).localeCompare(val(y), 'th', { numeric: true }) * dir);
  }, [assets, q, category, department, due, serviceDue, showInactive, sort, in90]);

  useEffect(() => { setPage(1); }, [q, category, department, due, serviceDue, showInactive]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleSort = (key: SortKey) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const hasFilter = !!(q || category || department || due || serviceDue || showInactive);

  async function create(v: AssetFormValue) {
    setBusy(true);
    try {
      await postJson('/api/inspect/assets', { ...v, company_id: company });
      setToast({ type: 'success', msg: `เพิ่ม ${v.code} แล้ว` });
      setDrawer(false);
      await load();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
    finally { setBusy(false); }
  }

  const printSelected = () => {
    const ids = selected.size ? [...selected] : filtered.map(a => a.id);
    if (!ids.length) { setToast({ type: 'info', msg: 'ไม่มีอุปกรณ์ให้พิมพ์' }); return; }
    router.push(`/inspect/labels?ids=${ids.join(',')}`);
  };

  const counts = useMemo(() => {
    const active = (assets || []).filter(a => a.status === 'active');
    return { total: active.length, overdue: active.filter(a => a.status_info.due_state === 'overdue').length, never: active.filter(a => a.status_info.due_state === 'never').length, service: active.filter(a => a.status_info.next_service_due_on && a.status_info.next_service_due_on <= in90).length };
  }, [assets, in90]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-gray-900">ทะเบียนอุปกรณ์</h1><p className="text-sm text-gray-500 mt-1">{companyName} · ใช้งาน {counts.total.toLocaleString()} ชิ้น{counts.overdue ? <> · <span style={{ color: VIZ.accent }}>เกินกำหนด {counts.overdue}</span></> : null}{counts.never ? <> · <span className="text-gray-500">ยังไม่เคยตรวจ {counts.never}</span></> : null}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSecondary} onClick={() => setImportOpen(true)}><FileSpreadsheet size={16} />นำเข้า Excel</button>
          <button type="button" className={btnSecondary} onClick={printSelected}><Printer size={16} />พิมพ์ QR {selected.size ? `(${selected.size})` : ''}</button>
          <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={() => setDrawer(true)}><Plus size={16} />เพิ่มอุปกรณ์</button>
        </div>
      </div>

      {/* category chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Chip active={!category} onClick={() => setCategory('')} label="ทุกหมวด" count={(assets || []).filter(a => a.status === 'active').length} />
        {catalog.categories.map(c => {
          const n = (assets || []).filter(a => a.status === 'active' && a.category_id === c.id).length;
          if (!n && !category) return null;
          return <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? '' : c.id)} label={c.name} count={n} color={c.color} icon={<CategoryIcon name={c.icon} size={14} />} />;
        })}
      </div>

      <div className={`${cardClass} !p-0 overflow-hidden`}>
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className={`${inputClass} pl-9 py-2`} placeholder="ค้นหา รหัส ชื่อ ตำแหน่ง…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select className={selectCompact} value={department} onChange={e => setDepartment(e.target.value)} aria-label="แผนก"><option value="">ทุกแผนก</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select className={selectCompact} value={due} onChange={e => setDue(e.target.value as InspDueState | '')} aria-label="สถานะรอบตรวจ"><option value="">ทุกสถานะ</option>{(['overdue', 'due', 'never', 'ok'] as InspDueState[]).map(s => <option key={s} value={s}>{DUE_STATE_LABEL[s]}</option>)}</select>
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 px-2"><input type="checkbox" className="accent-[#4E79A7]" checked={serviceDue} onChange={e => setServiceDue(e.target.checked)} />ถึงรอบทดสอบ 90 วัน{counts.service ? ` (${counts.service})` : ''}</label>
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 px-2"><input type="checkbox" className="accent-[#4E79A7]" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />รวมที่ไม่ใช้งาน</label>
          {hasFilter && <button type="button" className={btnGhost} onClick={() => { setQ(''); setCategory(''); setDepartment(''); setDue(''); setServiceDue(false); setShowInactive(false); }}><X size={14} />ล้างตัวกรอง</button>}
        </div>

        {assets === null ? <div className="p-6 space-y-3">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}</div>
        : filtered.length === 0 ? (
          <EmptyState icon={<QrCode size={40} />} title={assets.length === 0 ? 'ยังไม่มีอุปกรณ์ในทะเบียน' : 'ไม่พบอุปกรณ์ตามตัวกรอง'} hint={assets.length === 0 ? 'เพิ่มทีละชิ้น หรือนำเข้าจาก Excel แล้วพิมพ์ QR ไปติด' : 'ลองล้างตัวกรองหรือค้นด้วยคำอื่น'} action={assets.length === 0 ? <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={() => setDrawer(true)}><Plus size={16} />เพิ่มอุปกรณ์</button> : undefined} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-3 w-8"><input type="checkbox" aria-label="เลือกทั้งหน้า" className="accent-[#4E79A7]" checked={allOnPageSelected} onChange={e => setSelected(prev => { const n = new Set(prev); rows.forEach(r => { if (e.target.checked) n.add(r.id); else n.delete(r.id); }); return n; })} /></th>
                    <Th label="อุปกรณ์" k="code" sort={sort} onSort={toggleSort} />
                    <Th label="แผนก / ตำแหน่ง" k="department" sort={sort} onSort={toggleSort} />
                    <Th label="ตรวจล่าสุด" k="last" sort={sort} onSort={toggleSort} />
                    <Th label="รอบตรวจ" k="due" sort={sort} onSort={toggleSort} />
                    <Th label="ทดสอบถัดไป" k="service" sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map(a => {
                    const svcDays = daysUntil(a.status_info.next_service_due_on);
                    const svcColor = svcDays === null ? VIZ.lightText : svcDays < 0 ? VIZ.accent : svcDays <= 90 ? VIZ.secondary : VIZ.text;
                    return (
                      <tr key={a.id} className={`hover:bg-gray-50/80 ${a.status !== 'active' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3"><input type="checkbox" className="accent-[#4E79A7]" checked={selected.has(a.id)} onChange={e => setSelected(prev => { const n = new Set(prev); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} aria-label={`เลือก ${a.code}`} /></td>
                        <td className="px-4 py-3">
                          <Link href={`/inspect/assets/${a.id}`} className="flex items-center gap-3 group">
                            <CategoryTile name={a.category.icon} color={a.category.color} size={36} />
                            <span className="min-w-0"><span className="block font-medium text-gray-900 group-hover:underline">{a.code}</span><span className="block text-xs text-gray-500 truncate">{a.category.name}{a.name ? ` · ${a.name}` : ''}{attrSummary(a) ? ` · ${attrSummary(a)}` : ''}</span></span>
                          </Link>
                        </td>
                        <td className="px-4 py-3"><span className="block text-gray-800">{a.department || <span className="text-gray-400">—</span>}</span><span className="block text-xs text-gray-500 truncate max-w-[220px]">{[a.building, a.floor && `ชั้น ${a.floor}`, a.location].filter(Boolean).join(' · ')}</span></td>
                        <td className="px-4 py-3">{a.status_info.last_inspected_on ? <><span className="block text-gray-800">{thaiDate(a.status_info.last_inspected_on)}</span><span className="block text-xs text-gray-500 truncate max-w-[160px]">{a.status_info.last_overall === 'fail' ? <span style={{ color: VIZ.accent }}>ไม่ผ่าน · </span> : ''}{a.status_info.last_inspector_name}</span></> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3"><DueBadge state={a.status_info.due_state} />{a.status_info.next_due_on && a.status === 'active' && <span className="block text-xs text-gray-500 mt-1">{relativeDays(a.status_info.next_due_on)}</span>}{a.status_info.open_failures > 0 && <span className="block text-xs mt-1 font-medium" style={{ color: VIZ.secondary }}>ไม่ผ่านค้าง {a.status_info.open_failures}</span>}</td>
                        <td className="px-4 py-3">{a.status_info.next_service_due_on ? <><span className="block font-medium" style={{ color: svcColor }}>{thaiDate(a.status_info.next_service_due_on)}</span><span className="block text-xs text-gray-500">{relativeDays(a.status_info.next_service_due_on)}</span></> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {a.status === 'active' && <Link href={`/inspect/i/${a.qr_token}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:brightness-95" style={{ background: `${VIZ.primary}14`, color: VIZ.primary }}><ClipboardCheck size={14} />ตรวจ</Link>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>{filtered.length.toLocaleString()} รายการ{selected.size ? ` · เลือก ${selected.size}` : ''}</span>
              <div className="inline-flex items-center gap-1"><button type="button" className={btnGhost} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button><span className="px-2">หน้า {page}/{pages}</span><button type="button" className={btnGhost} disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button></div>
            </div>
          </>
        )}
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="เพิ่มอุปกรณ์" subtitle={`ทะเบียนของ ${companyName}`} wide>
        <AssetForm asset={null} categories={catalog.categories} templates={catalog.templates} departments={departments} busy={busy} onSubmit={create} onCancel={() => setDrawer(false)} submitLabel="เพิ่มอุปกรณ์" />
      </Drawer>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} company={company} catalog={catalog} onDone={() => { setImportOpen(false); void load(); }} setToast={setToast} />
      <ToastView toast={toast} />
    </div>
  );
}

function attrSummary(a: InspAssetView) {
  return Object.values(a.attributes || {}).filter(v => v !== null && v !== '').slice(0, 2).join(' · ');
}

function Chip({ active, onClick, label, count, color, icon }: { active: boolean; onClick: () => void; label: string; count: number; color?: string; icon?: React.ReactNode }) {
  const c = color || VIZ.primary;
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition ${active ? 'border-transparent font-medium' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`} style={active ? { background: `${c}1A`, color: c } : undefined}>
      {icon}{label}<span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/70' : 'bg-gray-100'}`}>{count}</span>
    </button>
  );
}

function Th({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return <th className="px-4 py-3 font-medium"><button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 ${active ? 'text-gray-900' : ''}`}>{label}{active ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}</button></th>;
}

// ---------------------------------------------------------------- Excel import
type ImportRow = Record<string, unknown>;
type Preview = { rows: number; create: number; update: number; problems: { row: number; message: string }[] };
const HEADERS = ['code', 'category', 'template', 'name', 'department', 'building', 'floor', 'location', 'mfg_year', 'mfg_month', 'last_service_on', 'note'];
const HEADER_TH: Record<string, string> = { code: 'รหัสอุปกรณ์*', category: 'หมวด*', template: 'รายการตรวจ', name: 'ชื่อ/คำอธิบาย', department: 'แผนก', building: 'อาคาร', floor: 'ชั้น', location: 'ตำแหน่ง', mfg_year: 'ปีผลิต (ค.ศ.)', mfg_month: 'เดือนผลิต (1-12)', last_service_on: 'ทดสอบล่าสุด (YYYY-MM-DD)', note: 'หมายเหตุ' };

function ImportModal({ open, onClose, company, catalog, onDone, setToast }: { open: boolean; onClose: () => void; company: string; catalog: Catalog; onDone: () => void; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setRows([]); setPreview(null); setFileName(''); } }, [open]);

  const attrKeys = useMemo(() => [...new Set(catalog.categories.flatMap(c => c.attributes.map(a => a.key)))], [catalog]);

  async function downloadTemplate() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const header = [...HEADERS.map(h => HEADER_TH[h]), ...catalog.categories.flatMap(c => c.attributes.map(a => `${a.label} [${c.name}]`))];
    const keys = [...HEADERS, ...catalog.categories.flatMap(c => c.attributes.map(a => `attr:${a.key}`))];
    const sample = ['F1-4G-01', catalog.categories[0]?.name || 'ถังดับเพลิง', '', 'ถังหน้าห้องไฟฟ้า', 'MMC', 'อาคาร 1', '1', 'ทางเดินหน้าห้อง Lab', 2022, 6, '2024-03-15', ''];
    const ws = XLSX.utils.aoa_to_sheet([keys, header, sample]);
    ws['!cols'] = keys.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'อุปกรณ์');
    const guide = [['คำอธิบาย'], ['แถวที่ 1 = คีย์สำหรับระบบ (ห้ามแก้) · แถวที่ 2 = หัวตารางภาษาไทย · กรอกข้อมูลตั้งแต่แถวที่ 3'], ['หมวด: ใส่ชื่อหมวดตามรายการด้านล่าง'], ...catalog.categories.map(c => [`${c.name} (key: ${c.key})`, ...catalog.templates.filter(t => t.category_id === c.id).map(t => `รายการตรวจ: ${t.name} (key: ${t.key})`)]), [''], ['รหัสอุปกรณ์ที่มีอยู่แล้ว = อัปเดตข้อมูล · รหัสใหม่ = เพิ่ม · ช่องว่าง = ไม่เปลี่ยนค่าเดิม']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), 'คำอธิบาย');
    XLSX.writeFile(wb, `inspect-import-template-${company}.xlsx`);
  }

  async function pick(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('รองรับไฟล์ไม่เกิน 10 MB');
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      if (aoa.length < 3) throw new Error('ไฟล์ไม่มีข้อมูล (ต้องมีแถวคีย์ แถวหัวตาราง และข้อมูล)');
      const keys = (aoa[0] as unknown[]).map(k => String(k).trim());
      const parsed: ImportRow[] = [];
      for (const line of aoa.slice(2)) {
        if (!line.some(v => String(v).trim())) continue;
        const r: ImportRow = {}; const attrs: Record<string, unknown> = {};
        keys.forEach((k, i) => {
          const v = line[i];
          if (!k) return;
          if (k.startsWith('attr:')) { if (String(v).trim() !== '') attrs[k.slice(5)] = v; return; }
          if (k === 'category') r.category_key = String(v).trim();
          else if (k === 'template') r.template_key = String(v).trim();
          else if (k === 'last_service_on') r.last_service_on = typeof v === 'number' ? excelDate(v) : String(v).trim();
          else r[k] = typeof v === 'string' ? v.trim() : v;
        });
        if (Object.keys(attrs).length) r.attributes = attrs;
        parsed.push(r);
      }
      setRows(parsed); setFileName(file.name); setPreview(null);
      const res = await postJson<{ data: Preview }>('/api/inspect/assets/import', { company_id: company, rows: parsed, mode: 'preview' });
      setPreview(res.data);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'อ่านไฟล์ไม่สำเร็จ') }); }
  }
  async function commit() {
    setBusy(true);
    try {
      const res = await postJson<{ data: Preview }>('/api/inspect/assets/import', { company_id: company, rows, mode: 'commit' });
      setToast({ type: 'success', msg: `นำเข้าแล้ว: เพิ่ม ${res.data.create} · อัปเดต ${res.data.update}` });
      onDone();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="นำเข้าทะเบียนจาก Excel" size="lg"
      footer={<div className="flex items-center justify-between gap-3"><button type="button" className={btnGhost} onClick={downloadTemplate}><Download size={16} />ดาวน์โหลดแม่แบบ{attrKeys.length ? ' (รวมฟิลด์เฉพาะหมวด)' : ''}</button><div className="flex gap-2"><button type="button" className={btnSecondary} onClick={onClose}>ปิด</button><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} disabled={!preview || preview.problems.length > 0 || busy} onClick={commit}>{busy ? 'กำลังนำเข้า…' : `นำเข้า ${preview ? preview.create + preview.update : ''} รายการ`}</button></div></div>}>
      <div className="space-y-4">
        <ol className="text-sm text-gray-600 list-decimal pl-5 space-y-1">
          <li>ดาวน์โหลดแม่แบบ แล้วกรอกตั้งแต่แถวที่ 3 (แถว 1–2 คือคีย์และหัวตาราง)</li>
          <li>หมวดใส่เป็นชื่อหรือ key เช่น <code className="bg-gray-100 px-1 rounded">ถังดับเพลิง</code> · รหัสที่มีอยู่แล้วจะถูกอัปเดต</li>
          <li>ระบบจะตรวจไฟล์ก่อน และนำเข้าเมื่อไม่มีแถวที่ผิดพลาด</li>
        </ol>
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-6 py-8 text-center cursor-pointer hover:border-[#4E79A7] hover:bg-[#4E79A7]/5 transition">
          <FileSpreadsheet size={28} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{fileName || 'เลือกไฟล์ .xlsx'}</span>
          <span className="text-xs text-gray-400">หรือลากไฟล์มาวาง · ไม่เกิน 10 MB</span>
          <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
        </label>
        {preview && (
          <div className="rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="แถวในไฟล์" value={preview.rows} />
              <Stat label="เพิ่มใหม่" value={preview.create} color={VIZ.positive} />
              <Stat label="อัปเดต" value={preview.update} color={VIZ.primary} />
            </div>
            {preview.problems.length > 0 ? (
              <div className="rounded-lg p-3 text-sm" style={{ background: `${VIZ.accent}12` }}>
                <p className="font-medium mb-1" style={{ color: VIZ.accent }}>พบ {preview.problems.length} แถวที่ต้องแก้ก่อนนำเข้า</p>
                <ul className="max-h-40 overflow-y-auto space-y-0.5 text-gray-700">{preview.problems.slice(0, 50).map((p, i) => <li key={i}>แถว {p.row}: {p.message}</li>)}</ul>
              </div>
            ) : <p className="text-sm" style={{ color: VIZ.positive }}>ไฟล์ถูกต้อง พร้อมนำเข้า</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div className="rounded-lg bg-gray-50 py-2"><p className="text-xl font-semibold tabular-nums" style={{ color: color || VIZ.text }}>{value}</p><p className="text-xs text-gray-500">{label}</p></div>;
}
function excelDate(serial: number) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

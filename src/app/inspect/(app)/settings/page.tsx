'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, GripVertical, Lock, MessageCircle, Plus, Save, Trash2, UserPlus, Users } from 'lucide-react';
import type { InspAttributeDef, InspCategoryRow, InspCompanySettingsRow, InspInspectorRow, InspItemDef, InspItemKind, InspLineUserRow, InspTemplateRow, InspectionMode } from '@/lib/inspect/types';
import { CATEGORY_ICONS, ITEM_KIND_LABEL, MODE_LABEL } from '@/lib/inspect/constants';
import { CategoryIcon, CategoryTile } from '../../_components/icons';
import { ConfirmButton, Modal, SectionTitle, Skeleton, ToastView, VIZ, btnGhost, btnPrimary, btnSecondary, cardClass, errMsg, getJson, inputClass, labelClass, postJson, selectClass, useCompany, useToast } from '../../_components/ui';

type Catalog = { categories: InspCategoryRow[]; templates: InspTemplateRow[] };
type Tab = 'general' | 'inspectors' | 'line' | 'checklists';

export default function SettingsPage() {
  const { company, companyName, isAdmin } = useCompany();
  const { toast, setToast } = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<InspCompanySettingsRow | null>(null);
  const [inspectors, setInspectors] = useState<InspInspectorRow[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [lineUsers, setLineUsers] = useState<InspLineUserRow[] | null>(null);

  const load = useCallback(async () => {
    setSettings(null); setInspectors(null); setCatalog(null); setLineUsers(null);
    try {
      const [s, i, c, l] = await Promise.all([
        getJson<{ data: InspCompanySettingsRow }>(`/api/inspect/settings?company=${encodeURIComponent(company)}`),
        getJson<{ data: InspInspectorRow[] }>(`/api/inspect/inspectors?company=${encodeURIComponent(company)}`),
        getJson<{ data: Catalog }>(`/api/inspect/categories?company=${encodeURIComponent(company)}&all=1`),
        getJson<{ data: InspLineUserRow[] }>(`/api/inspect/line-users?company=${encodeURIComponent(company)}`),
      ]);
      setSettings(s.data); setInspectors(i.data); setCatalog(c.data); setLineUsers(l.data);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'โหลดตั้งค่าไม่สำเร็จ') }); }
  }, [company, setToast]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  const TABS: { id: Tab; label: string }[] = [{ id: 'general', label: 'โหมดผู้ตรวจ & รูปภาพ' }, { id: 'inspectors', label: `ทะเบียนผู้ตรวจ${inspectors ? ` (${inspectors.filter(i => i.is_active).length})` : ''}` }, { id: 'line', label: `ผู้ใช้ LINE${lineUsers ? ` (${lineUsers.length})` : ''}` }, { id: 'checklists', label: 'หมวด & รายการตรวจ' }];

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">ตั้งค่า</h1><p className="text-sm text-gray-500 mt-1">{companyName}</p></div>
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${tab === t.id ? 'border-[#4E79A7] text-[#4E79A7]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{t.label}</button>)}
      </div>

      {tab === 'general' && (settings ? <GeneralTab company={company} settings={settings} onSaved={s => { setSettings(s); setToast({ type: 'success', msg: 'บันทึกแล้ว' }); }} onError={m => setToast({ type: 'error', msg: m })} /> : <Skeleton className="h-64" />)}
      {tab === 'line' && (lineUsers ? <LineUsersTab rows={lineUsers} reload={load} setToast={setToast} /> : <Skeleton className="h-64" />)}
      {tab === 'inspectors' && (inspectors ? <InspectorsTab company={company} rows={inspectors} mode={settings?.inspection_mode || 'she'} reload={load} setToast={setToast} /> : <Skeleton className="h-64" />)}
      {tab === 'checklists' && (catalog ? <ChecklistsTab company={company} catalog={catalog} isAdmin={isAdmin} reload={load} setToast={setToast} /> : <Skeleton className="h-64" />)}
      <ToastView toast={toast} />
    </div>
  );
}

// ---------------------------------------------------------------- general
function GeneralTab({ company, settings, onSaved, onError }: { company: string; settings: InspCompanySettingsRow; onSaved: (s: InspCompanySettingsRow) => void; onError: (m: string) => void }) {
  const [v, setV] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(settings), [settings]);
  const dirty = JSON.stringify(v) !== JSON.stringify(settings);
  async function save() {
    setBusy(true);
    try { const r = await postJson<{ data: InspCompanySettingsRow }>('/api/inspect/settings', { company_id: company, inspection_mode: v.inspection_mode, photo_retention_days: v.photo_retention_days, max_photos_pass: v.max_photos_pass, max_photos_fail: v.max_photos_fail, require_photo: v.require_photo }, 'PUT'); onSaved(r.data); }
    catch (e) { onError(errMsg(e)); } finally { setBusy(false); }
  }
  const estimate = useMemo(() => Math.round(v.photo_retention_days / 30 * 150) , [v.photo_retention_days]);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className={cardClass}>
        <SectionTitle title="ใครเป็นผู้ตรวจ" hint="กำหนดว่าใครบันทึกผลผ่าน QR ได้" />
        <div className="space-y-2">
          {(['she', 'department'] as InspectionMode[]).map(m => (
            <label key={m} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${v.inspection_mode === m ? 'border-[#4E79A7] bg-[#4E79A7]/5' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="mode" className="mt-1 accent-[#4E79A7]" checked={v.inspection_mode === m} onChange={() => setV({ ...v, inspection_mode: m })} />
              <span><span className="block font-medium text-gray-900">{m === 'she' ? 'ทีม SHE เท่านั้น' : 'พนักงานแผนก'}</span><span className="block text-sm text-gray-500">{MODE_LABEL[m]}</span>{m === 'department' && <span className="block text-xs text-gray-400 mt-1">ผู้ตรวจต้องมีรหัสในแท็บ “ทะเบียนผู้ตรวจ” · ทีม SHE ที่เข้าสู่ระบบยังตรวจได้เสมอ</span>}</span>
            </label>
          ))}
        </div>
      </div>
      <div className={cardClass}>
        <SectionTitle title="รูปภาพ" hint="รูปถูกย่อในเครื่องผู้ตรวจก่อนส่ง (~150 KB/รูป)" />
        <div className="space-y-4">
          <label className="flex items-center gap-3"><input type="checkbox" className="accent-[#4E79A7] h-4 w-4" checked={v.require_photo} onChange={e => setV({ ...v, require_photo: e.target.checked })} /><span className="text-sm text-gray-800">บังคับแนบรูปอย่างน้อย 1 รูปทุกครั้ง</span></label>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelClass} htmlFor="s-pass">รูปเมื่อผ่าน</label><input id="s-pass" type="number" min={0} max={5} className={inputClass} value={v.max_photos_pass} onChange={e => setV({ ...v, max_photos_pass: Number(e.target.value) })} /></div>
            <div><label className={labelClass} htmlFor="s-fail">รูปเมื่อไม่ผ่าน</label><input id="s-fail" type="number" min={1} max={5} className={inputClass} value={v.max_photos_fail} onChange={e => setV({ ...v, max_photos_fail: Number(e.target.value) })} /></div>
            <div><label className={labelClass} htmlFor="s-ret">เก็บรูป (วัน)</label><input id="s-ret" type="number" min={7} max={3660} className={inputClass} value={v.photo_retention_days} onChange={e => setV({ ...v, photo_retention_days: Number(e.target.value) })} /></div>
          </div>
          <p className="text-xs text-gray-500">รูปของการตรวจที่ “ผ่าน” ถูกลบอัตโนมัติหลัง {v.photo_retention_days} วัน · รูปของรายการไม่ผ่านเก็บจนปิดงานแล้วนับต่ออีก {v.photo_retention_days} วัน · รูปอ้างอิงและใบรับรองเก็บถาวร · ผลตรวจไม่ถูกลบ</p>
          <p className="text-xs text-gray-400">ประมาณพื้นที่: อุปกรณ์ 1 ชิ้นที่ตรวจรายเดือน ≈ {estimate} KB คงที่</p>
        </div>
      </div>
      <div className="lg:col-span-2 flex justify-end"><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} disabled={!dirty || busy} onClick={save}><Save size={16} />{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- inspectors
function InspectorsTab({ company, rows, mode, reload, setToast }: { company: string; rows: InspInspectorRow[]; mode: InspectionMode; reload: () => Promise<void>; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [dept, setDept] = useState('');
  const [bulk, setBulk] = useState(''); const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => rows.filter(r => !q || [r.code, r.name, r.department].some(s => s.toLowerCase().includes(q.toLowerCase()))), [rows, q]);
  async function add() {
    setBusy(true);
    try { await postJson('/api/inspect/inspectors', { company_id: company, rows: [{ code: code.trim(), name: name.trim(), department: dept.trim() }] }); setCode(''); setName(''); setDept(''); setToast({ type: 'success', msg: 'เพิ่มผู้ตรวจแล้ว' }); await reload(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setBusy(false); }
  }
  async function addBulk() {
    const parsed = bulk.split(/\r?\n/).map(l => l.split(/\t|,|;/).map(s => s.trim())).filter(p => p[0] && p[1]).map(p => ({ code: p[0], name: p[1], department: p[2] || '' }));
    if (!parsed.length) { setToast({ type: 'error', msg: 'ไม่พบข้อมูล — รูปแบบ: รหัส, ชื่อ, แผนก (บรรทัดละคน)' }); return; }
    setBusy(true);
    try { await postJson('/api/inspect/inspectors', { company_id: company, rows: parsed }); setBulk(''); setBulkOpen(false); setToast({ type: 'success', msg: `เพิ่ม/อัปเดต ${parsed.length} คน` }); await reload(); }
    catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setBusy(false); }
  }
  async function toggle(r: InspInspectorRow) { try { await postJson(`/api/inspect/inspectors/${r.id}`, { is_active: !r.is_active }, 'PATCH'); await reload(); } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } }
  async function remove(r: InspInspectorRow) { try { await getJson(`/api/inspect/inspectors/${r.id}`, { method: 'DELETE' }); await reload(); } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } }
  return (
    <div className="space-y-4">
      {mode === 'she' && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: `${VIZ.primary}10`, color: VIZ.primary }}>บริษัทนี้อยู่ในโหมด “ทีม SHE เท่านั้น” — ทะเบียนนี้จะมีผลเมื่อเปลี่ยนเป็นโหมดพนักงานแผนก</div>}
      <div className={cardClass}>
        <SectionTitle title="เพิ่มผู้ตรวจ" hint="รหัส = รหัสพนักงาน (หรือ 4 ตัวท้าย) ที่ผู้ตรวจกรอกในฟอร์ม QR" right={<button type="button" className={btnGhost} onClick={() => setBulkOpen(o => !o)}><Users size={14} />วางหลายคน</button>} />
        {bulkOpen ? (
          <div className="space-y-2">
            <textarea className={`${inputClass} font-mono text-sm`} rows={6} placeholder={'0058\tเอื้อยทิพย์ นาเอี่ยม\tMMC\n0102\tสมชาย ใจดี\tWarehouse'} value={bulk} onChange={e => setBulk(e.target.value)} />
            <p className="text-xs text-gray-500">บรรทัดละคน คั่นด้วย Tab, จุลภาค หรือ ; — วางจาก Excel ได้โดยตรง · รหัสซ้ำ = อัปเดตชื่อ/แผนก</p>
            <div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={() => setBulkOpen(false)}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} disabled={busy} onClick={addBulk}><UserPlus size={16} />เพิ่มทั้งหมด</button></div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-[140px_1fr_1fr_auto] gap-2">
            <input className={inputClass} placeholder="รหัส" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={20} />
            <input className={inputClass} placeholder="ชื่อ-นามสกุล" value={name} onChange={e => setName(e.target.value)} maxLength={120} />
            <input className={inputClass} placeholder="แผนก" value={dept} onChange={e => setDept(e.target.value)} maxLength={80} />
            <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} disabled={busy || code.trim().length < 3 || !name.trim()} onClick={add}><Plus size={16} />เพิ่ม</button>
          </div>
        )}
      </div>
      <div className={`${cardClass} !p-0 overflow-hidden`}>
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60"><input className={`${inputClass} py-2 max-w-sm`} placeholder="ค้นหาผู้ตรวจ…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {list.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีผู้ตรวจในทะเบียน</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100"><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">แผนก</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {list.map(r => (
                <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{r.code}</td><td className="px-4 py-2.5 text-gray-800">{r.name}</td><td className="px-4 py-2.5 text-gray-600">{r.department || '—'}</td>
                  <td className="px-4 py-2.5"><button type="button" onClick={() => toggle(r)} className="text-xs rounded-full px-2.5 py-0.5 font-medium" style={{ background: r.is_active ? `${VIZ.positive}1A` : '#F3F4F6', color: r.is_active ? VIZ.positive : '#6B7280' }}>{r.is_active ? 'ใช้งาน' : 'ปิด'}</button></td>
                  <td className="px-4 py-2.5 text-right"><ConfirmButton label={<Trash2 size={14} />} confirmLabel="ลบ?" onConfirm={() => remove(r)} className={`${btnGhost} text-xs`} danger /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- LINE users
function LineUsersTab({ rows, reload, setToast }: { rows: InspLineUserRow[]; reload: () => Promise<void>; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  async function unlink(r: InspLineUserRow) { try { await getJson(`/api/inspect/line-users?id=${encodeURIComponent(r.line_user_id)}`, { method: 'DELETE' }); setToast({ type: 'success', msg: 'ยกเลิกการผูกแล้ว' }); await reload(); } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } }
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <SectionTitle title="บันทึกผลตรวจทาง LINE" hint="ผู้ตรวจส่งรูปอุปกรณ์ที่เห็น QR ไปที่ LINE OA “EA SHE Center” (แชท 1:1) ระบบอ่าน QR แล้วบันทึกเป็น “ผ่าน” พร้อมรูปทันที" />
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-gray-700">
          <div className="rounded-lg p-3" style={{ background: VIZ.bg }}>
            <p className="font-medium text-gray-900 mb-1 flex items-center gap-1.5"><MessageCircle size={14} />ครั้งแรก</p>
            <p>ทีม SHE ที่เชื่อมบัญชี LINE ไว้แล้วใช้ได้เลย · พนักงานแผนก พิมพ์ <code className="font-mono bg-white px-1 rounded">รหัส 0058</code> (รหัสจากทะเบียนผู้ตรวจ) ครั้งเดียว</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: VIZ.bg }}>
            <p className="font-medium text-gray-900 mb-1">คำสั่งหลังส่งรูป</p>
            <p><code className="font-mono bg-white px-1 rounded">ไม่ผ่าน เกจต่ำ</code> ภายใน 10 นาที = ไม่ผ่าน · <code className="font-mono bg-white px-1 rounded">วันที่ 31/10</code> ก่อนส่งรูป = ตรวจย้อนหลัง · รูปซ้ำถังเดิมใน 10 นาที = รูปเพิ่ม (สูงสุด 3)</p>
          </div>
        </div>
      </div>
      <div className={`${cardClass} !p-0 overflow-hidden`}>
        {rows.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีผู้ใช้ LINE ที่ลงทะเบียนกับบริษัทนี้</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100"><th className="px-4 py-3">ผู้ตรวจ</th><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">ผูกผ่าน</th><th className="px-4 py-3">ใช้ล่าสุด</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.line_user_id}>
                  <td className="px-4 py-2.5 text-gray-900 font-medium">{r.inspector_name || <span className="text-gray-400">ยังไม่ลงทะเบียน</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700">{r.inspector_code || '—'}</td>
                  <td className="px-4 py-2.5"><span className="text-xs rounded-full px-2.5 py-0.5 font-medium" style={{ background: r.linked_via === 'account' ? `${VIZ.primary}1A` : `${VIZ.secondary}1A`, color: r.linked_via === 'account' ? VIZ.primary : VIZ.secondary }}>{r.linked_via === 'account' ? 'บัญชี SHE' : 'รหัสผู้ตรวจ'}</span></td>
                  <td className="px-4 py-2.5 text-gray-600">{fmt(r.last_at)}</td>
                  <td className="px-4 py-2.5 text-right"><ConfirmButton label={<Trash2 size={14} />} confirmLabel="ยกเลิกผูก?" onConfirm={() => unlink(r)} className={`${btnGhost} text-xs`} danger /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- categories & templates
function ChecklistsTab({ company, catalog, isAdmin, reload, setToast }: { company: string; catalog: Catalog; isAdmin: boolean; reload: () => Promise<void>; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const [openCat, setOpenCat] = useState<string | null>(catalog.categories[0]?.id || null);
  const [editTpl, setEditTpl] = useState<{ tpl: InspTemplateRow | null; category: InspCategoryRow; cloneFrom?: InspTemplateRow } | null>(null);
  const [editCat, setEditCat] = useState<{ cat: InspCategoryRow | null } | null>(null);
  const canEdit = (companyId: string | null) => companyId === company || (companyId === null && isAdmin);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-2xl">หมวดและรายการตรวจมาตรฐาน (<Lock size={12} className="inline" />) ใช้ร่วมกันทุกบริษัท — แก้ได้โดยผู้ดูแลระบบ · บริษัทสร้างหมวด/รายการของตัวเองได้ และ “คัดลอก” รายการมาตรฐานมาปรับได้</p>
        <button type="button" className={btnSecondary} onClick={() => setEditCat({ cat: null })}><Plus size={16} />เพิ่มหมวดของบริษัท</button>
      </div>
      <div className="space-y-3">
        {catalog.categories.map(cat => {
          const tpls = catalog.templates.filter(t => t.category_id === cat.id);
          const open = openCat === cat.id;
          return (
            <div key={cat.id} className={`${cardClass} !p-0 overflow-hidden ${cat.is_active ? '' : 'opacity-60'}`}>
              <button type="button" onClick={() => setOpenCat(open ? null : cat.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50/60">
                <CategoryTile name={cat.icon} color={cat.color} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 flex items-center gap-2">{cat.name}{cat.company_id ? <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-gray-100 text-gray-500">ของบริษัท</span> : <Lock size={12} className="text-gray-400" />}{!cat.is_active && <span className="text-xs text-gray-400">(ปิดใช้งาน)</span>}</p>
                  <p className="text-xs text-gray-500">ตรวจทุก {cat.inspection_interval_days} วัน{cat.service_label ? ` · ${cat.service_label} ทุก ${cat.service_interval_months} เดือน` : ''} · รายการตรวจ {tpls.length} แบบ</p>
                </div>
                {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </button>
              {open && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {cat.service_ref && <span className="text-xs text-gray-500">อ้างอิง: {cat.service_ref}</span>}
                    {cat.attributes.length > 0 && <span className="text-xs text-gray-500">ฟิลด์เฉพาะ: {cat.attributes.map(a => a.label).join(', ')}</span>}
                    <span className="flex-1" />
                    {canEdit(cat.company_id) && <button type="button" className={btnGhost} onClick={() => setEditCat({ cat })}>แก้ไขหมวด</button>}
                    <button type="button" className={btnGhost} onClick={() => setEditTpl({ tpl: null, category: cat })}><Plus size={14} />รายการตรวจใหม่</button>
                  </div>
                  <ul className="grid md:grid-cols-2 gap-3">
                    {tpls.map(t => (
                      <li key={t.id} className={`rounded-xl border p-4 ${t.is_active ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-60'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div><p className="font-medium text-gray-900 flex items-center gap-2">{t.name}{t.is_default && <span className="text-[10px] rounded-full px-1.5 py-0.5" style={{ background: `${cat.color}1A`, color: cat.color }}>ค่าเริ่มต้น</span>}{!t.company_id && <Lock size={12} className="text-gray-400" />}</p><p className="text-xs text-gray-500">{t.items.length} ข้อ · v{t.version}</p></div>
                          <div className="flex gap-1">
                            {canEdit(t.company_id) ? <button type="button" className={btnGhost} onClick={() => setEditTpl({ tpl: t, category: cat })}>แก้ไข</button> : <button type="button" className={btnGhost} onClick={() => setEditTpl({ tpl: null, category: cat, cloneFrom: t })}><Copy size={14} />คัดลอก</button>}
                          </div>
                        </div>
                        <ol className="mt-2 text-xs text-gray-600 space-y-0.5 list-decimal pl-4">{t.items.slice(0, 6).map(i => <li key={i.key}>{i.label}{i.kind === 'number' ? ` (${i.unit || 'ตัวเลข'})` : i.kind === 'pass_fail_na' ? ' (มี N/A)' : ''}</li>)}{t.items.length > 6 && <li className="list-none text-gray-400">… อีก {t.items.length - 6} ข้อ</li>}</ol>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editTpl && <TemplateModal company={company} ctx={editTpl} onClose={() => setEditTpl(null)} onSaved={async () => { setEditTpl(null); await reload(); }} setToast={setToast} />}
      {editCat && <CategoryModal company={company} cat={editCat.cat} onClose={() => setEditCat(null)} onSaved={async () => { setEditCat(null); await reload(); }} setToast={setToast} />}
    </div>
  );
}

function TemplateModal({ company, ctx, onClose, onSaved, setToast }: { company: string; ctx: { tpl: InspTemplateRow | null; category: InspCategoryRow; cloneFrom?: InspTemplateRow }; onClose: () => void; onSaved: () => Promise<void>; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const base = ctx.tpl || ctx.cloneFrom;
  const [name, setName] = useState(ctx.tpl ? ctx.tpl.name : ctx.cloneFrom ? `${ctx.cloneFrom.name} (ของบริษัท)` : '');
  const [items, setItems] = useState<InspItemDef[]>(base ? base.items.map(i => ({ ...i })) : [{ key: 'item_1', label: '', kind: 'pass_fail', required: true }]);
  const [isDefault, setIsDefault] = useState(ctx.tpl?.is_default || false);
  const [isActive, setIsActive] = useState(ctx.tpl?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const update = (i: number, patch: Partial<InspItemDef>) => setItems(prev => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => setItems(prev => { const n = [...prev]; const j = i + d; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; return n; });
  async function save() {
    setBusy(true);
    try {
      const clean = items.map((it, i) => ({ ...it, key: it.key || `item_${i + 1}`, label: it.label.trim() })).filter(it => it.label);
      if (!clean.length) throw new Error('ต้องมีรายการตรวจอย่างน้อย 1 ข้อ');
      if (ctx.tpl) await postJson(`/api/inspect/templates/${ctx.tpl.id}`, { name, items: clean, is_default: isDefault || undefined, is_active: isActive }, 'PATCH');
      else await postJson('/api/inspect/templates', { company_id: company, category_id: ctx.category.id, name, items: clean, is_default: isDefault });
      setToast({ type: 'success', msg: 'บันทึกรายการตรวจแล้ว' }); await onSaved();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={ctx.tpl ? `แก้ไขรายการตรวจ — ${ctx.tpl.name}` : `รายการตรวจใหม่ — ${ctx.category.name}`} size="lg"
      footer={<div className="flex items-center justify-between gap-3"><label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="accent-[#4E79A7]" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />ใช้เป็นค่าเริ่มต้นของหมวดนี้</label><div className="flex gap-2">{ctx.tpl && <label className="inline-flex items-center gap-2 text-sm text-gray-700 mr-2"><input type="checkbox" className="accent-[#4E79A7]" checked={isActive} onChange={e => setIsActive(e.target.checked)} />ใช้งาน</label>}<button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={save} disabled={busy || !name.trim()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div></div>}>
      <div className="space-y-4">
        <div><label className={labelClass} htmlFor="t-name">ชื่อรายการตรวจ</label><input id="t-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="เช่น CO2 (ชั่งน้ำหนัก)" maxLength={80} /></div>
        {ctx.tpl && ctx.tpl.items.length > 0 && <p className="text-xs text-gray-500">การแก้ข้อจะเพิ่มเวอร์ชัน (v{ctx.tpl.version} → v{ctx.tpl.version + 1}) ผลตรวจเดิมยังอ้างอิงเวอร์ชันเก่า</p>}
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-0.5 pt-1 text-gray-400"><button type="button" onClick={() => move(i, -1)} className="hover:text-gray-700" aria-label="ขึ้น"><ChevronUp size={14} /></button><GripVertical size={14} /><button type="button" onClick={() => move(i, 1)} className="hover:text-gray-700" aria-label="ลง"><ChevronDown size={14} /></button></div>
                <div className="flex-1 grid sm:grid-cols-[1fr_170px] gap-2">
                  <input className={`${inputClass} py-2`} placeholder={`ข้อ ${i + 1}: ข้อความที่ผู้ตรวจเห็น`} value={it.label} onChange={e => update(i, { label: e.target.value })} maxLength={160} />
                  <select className={`${selectClass} py-2`} value={it.kind} onChange={e => update(i, { kind: e.target.value as InspItemKind })}>{(Object.keys(ITEM_KIND_LABEL) as InspItemKind[]).map(k => <option key={k} value={k}>{ITEM_KIND_LABEL[k]}</option>)}</select>
                  <input className={`${inputClass} py-1.5 text-sm`} placeholder="คำอธิบายสั้น ๆ (ไม่บังคับ)" value={it.hint || ''} onChange={e => update(i, { hint: e.target.value })} maxLength={200} />
                  <div className="flex items-center gap-3 text-sm">
                    {it.kind === 'number' && <input className={`${inputClass} py-1.5 text-sm w-20`} placeholder="หน่วย" value={it.unit || ''} onChange={e => update(i, { unit: e.target.value })} maxLength={20} />}
                    <label className="inline-flex items-center gap-1.5 text-gray-700"><input type="checkbox" className="accent-[#4E79A7]" checked={!!it.required} onChange={e => update(i, { required: e.target.checked })} />บังคับ</label>
                  </div>
                </div>
                <button type="button" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="ลบข้อ"><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className={btnSecondary} onClick={() => setItems(prev => [...prev, { key: `item_${Date.now().toString(36)}`, label: '', kind: 'pass_fail', required: true }])}><Plus size={16} />เพิ่มข้อ</button>
      </div>
    </Modal>
  );
}

function CategoryModal({ company, cat, onClose, onSaved, setToast }: { company: string; cat: InspCategoryRow | null; onClose: () => void; onSaved: () => Promise<void>; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const [v, setV] = useState({ name: cat?.name || '', icon: cat?.icon || 'shield', color: cat?.color || '#4E79A7', inspection_interval_days: cat?.inspection_interval_days || 30, service_label: cat?.service_label || '', service_interval_months: cat?.service_interval_months ?? ('' as number | ''), service_ref: cat?.service_ref || '', is_active: cat?.is_active ?? true });
  const [attrs, setAttrs] = useState<InspAttributeDef[]>(cat?.attributes.map(a => ({ ...a })) || []);
  const [busy, setBusy] = useState(false);
  const COLORS = ['#E15759', '#F28E2B', '#4E79A7', '#59A14F', '#B07AA1', '#76B7B2', '#9C755F', '#EDC948', '#FF9DA7', '#BAB0AC'];
  async function save() {
    setBusy(true);
    try {
      const body = { ...v, service_interval_months: v.service_interval_months === '' ? null : Number(v.service_interval_months), attributes: attrs.map(a => ({ ...a, options: a.type === 'select' ? (a.options || []).filter(Boolean) : undefined })) };
      if (cat) await postJson(`/api/inspect/categories/${cat.id}`, body, 'PATCH');
      else await postJson('/api/inspect/categories', { ...body, company_id: company, key: v.name });
      setToast({ type: 'success', msg: 'บันทึกหมวดแล้ว' }); await onSaved();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={cat ? `แก้ไขหมวด — ${cat.name}` : 'เพิ่มหมวดของบริษัท'} size="lg" footer={<div className="flex justify-between gap-2">{cat && <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="accent-[#4E79A7]" checked={v.is_active} onChange={e => setV({ ...v, is_active: e.target.checked })} />ใช้งานหมวดนี้</label>}<span className="flex-1" /><button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={save} disabled={busy || !v.name.trim()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <div><label className={labelClass} htmlFor="c-name">ชื่อหมวด</label><input id="c-name" className={inputClass} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} maxLength={80} placeholder="เช่น ปั๊มดับเพลิง" /></div>
          <div><span className={labelClass}>สี</span><div className="flex gap-1.5 flex-wrap max-w-[220px]">{COLORS.map(c => <button key={c} type="button" aria-label={c} onClick={() => setV({ ...v, color: c })} className={`h-7 w-7 rounded-full border-2 ${v.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ background: c }} />)}</div></div>
        </div>
        <div><span className={labelClass}>ไอคอน</span><div className="flex flex-wrap gap-1.5">{CATEGORY_ICONS.map(ic => <button key={ic} type="button" aria-label={ic} onClick={() => setV({ ...v, icon: ic })} className={`h-9 w-9 rounded-lg border inline-flex items-center justify-center ${v.icon === ic ? 'border-transparent' : 'border-gray-200 text-gray-500'}`} style={v.icon === ic ? { background: `${v.color}1F`, color: v.color } : undefined}><CategoryIcon name={ic} size={18} /></button>)}</div></div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className={labelClass} htmlFor="c-int">ตรวจประจำทุก (วัน)</label><input id="c-int" type="number" min={1} max={3660} className={inputClass} value={v.inspection_interval_days} onChange={e => setV({ ...v, inspection_interval_days: Number(e.target.value) })} /><p className="text-[11px] text-gray-400 mt-1">7 = รายสัปดาห์, 30 = รายเดือน, 90 = รายไตรมาส, 365 = รายปี</p></div>
          <div><label className={labelClass} htmlFor="c-sl">ชื่อการทดสอบตามกฎหมาย</label><input id="c-sl" className={inputClass} value={v.service_label} onChange={e => setV({ ...v, service_label: e.target.value })} maxLength={80} placeholder="เช่น Hydrostatic test" /></div>
          <div><label className={labelClass} htmlFor="c-sm">รอบทดสอบ (เดือน)</label><input id="c-sm" type="number" min={1} max={600} className={inputClass} value={v.service_interval_months} onChange={e => setV({ ...v, service_interval_months: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="ว่าง = ไม่มี" /></div>
        </div>
        <div><label className={labelClass} htmlFor="c-ref">อ้างอิงกฎหมาย / มาตรฐาน</label><input id="c-ref" className={inputClass} value={v.service_ref} onChange={e => setV({ ...v, service_ref: e.target.value })} maxLength={200} placeholder="เช่น กฎกระทรวง พ.ศ. 2555 ข้อ 14" /></div>
        <div>
          <div className="flex items-center justify-between mb-2"><span className={labelClass}>ฟิลด์เฉพาะหมวด (แสดงในทะเบียนอุปกรณ์)</span><button type="button" className={btnGhost} onClick={() => setAttrs(prev => [...prev, { key: `f_${Date.now().toString(36)}`, label: '', type: 'text' }])}><Plus size={14} />เพิ่มฟิลด์</button></div>
          <ul className="space-y-2">
            {attrs.map((a, i) => (
              <li key={i} className="grid sm:grid-cols-[1fr_130px_1fr_auto] gap-2 items-start">
                <input className={`${inputClass} py-2`} placeholder="ชื่อฟิลด์ เช่น ขนาด" value={a.label} onChange={e => setAttrs(prev => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={80} />
                <select className={`${selectClass} py-2`} value={a.type} onChange={e => setAttrs(prev => prev.map((x, j) => (j === i ? { ...x, type: e.target.value as InspAttributeDef['type'] } : x)))}><option value="text">ข้อความ</option><option value="number">ตัวเลข</option><option value="select">ตัวเลือก</option><option value="month">เดือน/ปี</option></select>
                {a.type === 'select' ? <input className={`${inputClass} py-2`} placeholder="ตัวเลือก คั่นด้วย , " value={(a.options || []).join(', ')} onChange={e => setAttrs(prev => prev.map((x, j) => (j === i ? { ...x, options: e.target.value.split(',').map(s => s.trim()) } : x)))} /> : <input className={`${inputClass} py-2`} placeholder="คำอธิบาย/หน่วย (ไม่บังคับ)" value={a.hint || ''} onChange={e => setAttrs(prev => prev.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)))} />}
                <button type="button" onClick={() => setAttrs(prev => prev.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-500" aria-label="ลบฟิลด์"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
          {attrs.length === 0 && <p className="text-xs text-gray-400">ไม่มีฟิลด์เฉพาะ — ใช้ชื่อ/ตำแหน่ง/หมายเหตุพอ</p>}
        </div>
      </div>
    </Modal>
  );
}

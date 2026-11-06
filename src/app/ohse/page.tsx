'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Edit3, ExternalLink, Eye, EyeOff, FileText, FolderOpen, History, KeyRound, Link2, Paperclip, Plus, Search, Upload } from 'lucide-react';
import {
  ConfirmButton, Drawer, EmptyState, Modal, Spinner, ToastView, VIZ, btnGhost, btnPrimary, btnSecondary, cardClass, errMsg,
  formatBytes, getJson, inputClass, labelClass, postJson, thaiDate, useCompany, useToast,
} from '@/app/inspect/_components/ui';
import { OHSE_KIND_LABEL } from '@/lib/ohse/constants';
import type { OhseCompanySettingsView, OhseDocumentRow, OhseSectionKind, OhseSectionView } from '@/lib/types';

type DocForm = {
  id?: string; replaces_id?: string; section_id: string; doc_no: string; title: string; revision: string; doc_date: string;
  signed_by: string; agency: string; expires_on: string; result: '' | 'pass' | 'not_pass'; note: string; link_url: string;
  employee_visible: 'inherit' | 'yes' | 'no';
  file_path: string | null; file_name: string | null; file_size: number | null; mime_type: string | null;
};

const emptyForm = (section_id: string): DocForm => ({
  section_id, doc_no: '', title: '', revision: '', doc_date: '', signed_by: '', agency: '', expires_on: '', result: '', note: '', link_url: '',
  employee_visible: 'inherit', file_path: null, file_name: null, file_size: null, mime_type: null,
});

const bangkokToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
function daysLeft(ymd: string | null) {
  if (!ymd) return null;
  return Math.round((new Date(ymd + 'T00:00:00Z').getTime() - new Date(bangkokToday() + 'T00:00:00Z').getTime()) / 86400000);
}

export default function OhsePage() {
  const { company } = useCompany();
  const { toast, setToast } = useToast();
  const [sections, setSections] = useState<OhseSectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [docs, setDocs] = useState<OhseDocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [history, setHistory] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<DocForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sectionEdit, setSectionEdit] = useState<OhseSectionView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);
  const children = useMemo(() => {
    const m = new Map<string | null, OhseSectionView[]>();
    for (const s of sections) { const k = s.parent_id; m.set(k, [...(m.get(k) || []), s]); }
    return m;
  }, [sections]);
  const section = selected ? byId.get(selected) || null : null;
  const pathOf = useCallback((id: string) => { const out: OhseSectionView[] = []; let s = byId.get(id); while (s) { out.unshift(s); s = s.parent_id ? byId.get(s.parent_id) : undefined; } return out; }, [byId]);
  const totalDocs = (id: string): number => (byId.get(id)?.doc_count || 0) + (children.get(id) || []).reduce((n, c) => n + totalDocs(c.id), 0);

  const loadSections = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getJson<{ data: OhseSectionView[] }>(`/api/ohse/sections?company=${company}`);
      setSections(r.data);
      setSelected(cur => (cur && r.data.some(s => s.id === cur) ? cur : r.data.find(s => !s.parent_id && s.kind !== 'folder')?.id || r.data[0]?.id || null));
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setLoading(false); }
  }, [company, setToast]);
  useEffect(() => { loadSections(); }, [loadSections]);

  const searching = query.trim().length >= 2;
  const loadDocs = useCallback(async () => {
    if (!searching && !selected) { setDocs([]); return; }
    setDocsLoading(true);
    try {
      const p = new URLSearchParams({ company });
      if (searching) p.set('q', query.trim()); else p.set('section', selected!);
      if (history) p.set('history', '1');
      const r = await getJson<{ data: OhseDocumentRow[] }>(`/api/ohse/documents?${p}`);
      setDocs(r.data);
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setDocsLoading(false); }
  }, [company, selected, history, searching, query, setToast]);
  useEffect(() => { const t = setTimeout(loadDocs, searching ? 300 : 0); return () => clearTimeout(t); }, [loadDocs, searching]);

  const openFile = async (d: OhseDocumentRow) => {
    try {
      const r = await getJson<{ data: { url: string } }>(`/api/ohse/files/url?company=${company}&id=${d.id}`);
      window.open(r.data.url, '_blank', 'noopener');
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  };

  const upload = async (file: File) => {
    if (!form) return;
    setUploading(true);
    try {
      const r = await postJson<{ data: { path: string; signedUrl: string; mime: string } }>('/api/ohse/files/sign', { company_id: company, file_name: file.name });
      const put = await fetch(r.data.signedUrl, { method: 'PUT', headers: { 'content-type': r.data.mime, 'x-upsert': 'false' }, body: file });
      if (!put.ok) throw new Error('อัปโหลดไม่สำเร็จ กรุณาลองใหม่');
      setForm(f => f && ({ ...f, file_path: r.data.path, file_name: file.name, file_size: file.size, mime_type: r.data.mime, title: f.title || file.name.replace(/\.[^.]+$/, '') }));
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setUploading(false); }
  };

  const editDoc = (d: OhseDocumentRow, asNewRevision = false) => setForm({
    id: asNewRevision ? undefined : d.id, replaces_id: asNewRevision ? d.id : undefined, section_id: d.section_id,
    doc_no: d.doc_no || '', title: d.title, revision: asNewRevision ? '' : d.revision || '', doc_date: asNewRevision ? '' : d.doc_date || '',
    signed_by: d.signed_by || '', agency: d.agency || '', expires_on: asNewRevision ? '' : d.expires_on || '', result: asNewRevision ? '' : d.result || '',
    note: asNewRevision ? '' : d.note || '', link_url: asNewRevision ? '' : d.link_url || '',
    employee_visible: d.employee_visible === null ? 'inherit' : d.employee_visible ? 'yes' : 'no',
    file_path: asNewRevision ? null : d.file_path, file_name: asNewRevision ? null : d.file_name, file_size: asNewRevision ? null : d.file_size, mime_type: asNewRevision ? null : d.mime_type,
  });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        company_id: company, section_id: form.section_id, doc_no: form.doc_no, title: form.title, revision: form.revision, doc_date: form.doc_date || null,
        signed_by: form.signed_by, agency: form.agency, expires_on: form.expires_on || null, result: form.result || null, note: form.note, link_url: form.link_url || null,
        employee_visible: form.employee_visible === 'inherit' ? null : form.employee_visible === 'yes',
        file_path: form.file_path, file_name: form.file_name, file_size: form.file_size, mime_type: form.mime_type,
        ...(form.replaces_id ? { replaces_id: form.replaces_id } : {}),
      };
      if (form.id) await postJson(`/api/ohse/documents/${form.id}`, body, 'PATCH');
      else await postJson('/api/ohse/documents', body);
      setToast({ type: 'success', msg: form.replaces_id ? 'บันทึก Rev. ใหม่แล้ว ฉบับเดิมย้ายไปประวัติ' : 'บันทึกแล้ว' });
      setForm(null);
      loadDocs(); loadSections();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setSaving(false); }
  };

  const remove = async (d: OhseDocumentRow) => {
    try {
      await getJson(`/api/ohse/documents/${d.id}?company=${company}`, { method: 'DELETE' });
      setToast({ type: 'success', msg: 'ลบแล้ว' }); setForm(null); loadDocs(); loadSections();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  };

  const toggleVisible = async (s: OhseSectionView) => {
    try {
      await postJson(`/api/ohse/sections/${s.id}`, { company_id: company, employee_visible: !s.employee_visible }, 'PATCH');
      setSections(prev => prev.map(x => (x.id === s.id ? { ...x, employee_visible: !s.employee_visible } : x)));
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  };

  if (loading) return <Spinner />;
  if (!sections.length) return <div className={cardClass}><EmptyState icon={<FolderOpen size={40} />} title="ยังไม่มีหมวดของบริษัทนี้" hint="ติดต่อผู้ดูแลระบบเพื่อตั้งค่าโครงสร้างหมวดเริ่มต้น" /></div>;

  const kind: OhseSectionKind | null = section?.kind || null;
  const listKind: OhseSectionKind = searching ? 'documents' : kind || 'documents';

  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <ul className={depth ? 'ml-3 border-l border-gray-100 pl-2' : ''}>
      {(children.get(parent) || []).map(s => {
        const kids = children.get(s.id) || [];
        const isOpen = open[s.id] ?? (selected ? pathOf(selected).some(p => p.id === s.id) : false);
        const active = !searching && selected === s.id;
        return (
          <li key={s.id}>
            <div className={`group flex items-center gap-1 rounded-lg pr-1 ${active ? 'bg-[#4E79A7]/10' : 'hover:bg-gray-50'}`}>
              <button type="button" aria-label={isOpen ? 'ย่อ' : 'ขยาย'} onClick={() => setOpen(o => ({ ...o, [s.id]: !isOpen }))} className={`p-1 text-gray-400 ${kids.length ? '' : 'invisible'}`}>
                <ChevronRight size={14} className={`transition ${isOpen ? 'rotate-90' : ''}`} />
              </button>
              <button type="button" onClick={() => { setSelected(s.id); setQuery(''); if (kids.length) setOpen(o => ({ ...o, [s.id]: true })); }} className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left text-sm">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-400 w-8">{s.code}</span>
                <span className={`truncate ${active ? 'font-semibold text-[#4E79A7]' : 'text-gray-700'}`}>{s.title}</span>
              </button>
              {s.kind === 'link' ? <Link2 size={13} className="shrink-0 text-gray-300" /> : <span className="shrink-0 text-xs text-gray-400 tabular-nums">{totalDocs(s.id) || ''}</span>}
              {s.employee_visible ? <Eye size={13} className="shrink-0" style={{ color: VIZ.positive }} aria-label="พนักงานเห็น" /> : <EyeOff size={13} className="shrink-0 text-gray-300" aria-label="เฉพาะทีม SHE" />}
            </div>
            {kids.length > 0 && isOpen && <Tree parent={s.id} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <ToastView toast={toast} />
      <aside className={`${cardClass} !p-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาเลขที่ / ชื่อเอกสาร ทุกหมวด" className={`${inputClass} !pl-9 !py-2 text-sm`} />
        </div>
        <Tree parent={null} depth={0} />
        <div className="mt-3 border-t border-gray-100 pt-3 flex flex-col gap-1">
          <button type="button" onClick={() => setSettingsOpen(true)} className={`${btnGhost} justify-start`}><KeyRound size={15} />รหัสเข้าดูสำหรับพนักงาน (LINE)</button>
          <p className="px-3 text-xs text-gray-400 flex items-center gap-1"><Eye size={12} style={{ color: VIZ.positive }} />พนักงานเห็นใน LINE <EyeOff size={12} className="ml-2" />เฉพาะทีม SHE</p>
        </div>
      </aside>

      <section className="min-w-0">
        <div className={cardClass}>
          {searching ? (
            <div className="mb-4"><h1 className="text-lg font-semibold text-gray-900">ผลการค้นหา “{query.trim()}”</h1><p className="text-sm text-gray-500">ค้นทุกหมวดของบริษัทนี้</p></div>
          ) : section && (
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-400">{pathOf(section.id).slice(0, -1).map(p => `${p.code} ${p.title}`).join(' › ') || OHSE_KIND_LABEL[section.kind]}</p>
                <h1 className="text-lg font-semibold text-gray-900"><span className="text-gray-400 mr-2 tabular-nums">{section.code}</span>{section.title}</h1>
                {section.description && <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{section.description}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => toggleVisible(section)} className={btnSecondary} title="กำหนดว่าพนักงานเห็นหมวดนี้ใน LINE หรือไม่">
                  {section.employee_visible ? <><Eye size={15} style={{ color: VIZ.positive }} />พนักงานเห็น</> : <><EyeOff size={15} />เฉพาะทีม SHE</>}
                </button>
                <button type="button" onClick={() => setSectionEdit(section)} className={btnSecondary}><Edit3 size={15} />แก้หมวด</button>
                {kind !== 'folder' && kind !== 'link' && <button type="button" onClick={() => setForm(emptyForm(section.id))} className={btnPrimary} style={{ background: VIZ.primary }}><Plus size={15} />เพิ่มรายการ</button>}
              </div>
            </div>
          )}

          {!searching && kind === 'link' && section && (
            section.link_url
              ? <a href={section.link_url} target="_blank" rel="noopener noreferrer" className={btnPrimary} style={{ background: VIZ.primary }}><ExternalLink size={15} />เปิด {section.link_url.replace(/^https:\/\//, '').slice(0, 60)}</a>
              : <EmptyState icon={<Link2 size={36} />} title="ยังไม่ได้ใส่ลิงก์" hint="กด แก้หมวด เพื่อใส่ลิงก์ไประบบที่ใช้งานจริง" />
          )}

          {!searching && kind === 'folder' && section && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(children.get(section.id) || []).map(c => (
                <button key={c.id} type="button" onClick={() => setSelected(c.id)} className="text-left rounded-xl border border-gray-100 p-4 hover:border-[#4E79A7]/40 hover:bg-[#4E79A7]/5">
                  <p className="text-xs text-gray-400">{c.code} · {OHSE_KIND_LABEL[c.kind]}</p>
                  <p className="font-medium text-gray-800">{c.title}</p>
                  <p className="text-sm text-gray-500 mt-1">{c.kind === 'link' ? 'ลิงก์' : `${totalDocs(c.id)} รายการ`}</p>
                </button>
              ))}
            </div>
          )}

          {(searching || (kind && kind !== 'folder' && kind !== 'link')) && (
            <>
              {!searching && (
                <div className="mb-3 flex justify-end">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} />แสดงฉบับเก่า (ประวัติ Rev.)</label>
                </div>
              )}
              {docsLoading ? <Spinner /> : docs.length === 0 ? (
                <EmptyState icon={<FileText size={36} />} title={searching ? 'ไม่พบเอกสาร' : 'ยังไม่มีรายการ'} hint={searching ? 'ลองค้นด้วยเลขที่เอกสารหรือคำสั้นลง' : 'กด เพิ่มรายการ เพื่ออัปโหลดเอกสาร'} />
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      {searching && <th className="px-2 py-2 font-medium">หมวด</th>}
                      {listKind === 'monitoring' ? <><th className="px-2 py-2 font-medium">วันที่ตรวจ</th><th className="px-2 py-2 font-medium">รายการ</th><th className="px-2 py-2 font-medium">ผล</th><th className="px-2 py-2 font-medium">หมายเหตุ</th></>
                        : listKind === 'licenses' ? <><th className="px-2 py-2 font-medium">ใบอนุญาต</th><th className="px-2 py-2 font-medium">หน่วยงาน</th><th className="px-2 py-2 font-medium">หมดอายุ</th></>
                        : <><th className="px-2 py-2 font-medium">เลขที่</th><th className="px-2 py-2 font-medium">ชื่อเอกสาร</th><th className="px-2 py-2 font-medium">Rev.</th><th className="px-2 py-2 font-medium">วันที่</th></>}
                      <th className="px-2 py-2 font-medium">ไฟล์</th><th className="px-2 py-2" />
                    </tr></thead>
                    <tbody>
                      {docs.map(d => {
                        const left = daysLeft(d.expires_on);
                        return (
                          <tr key={d.id} className={`border-b border-gray-50 align-top ${d.status === 'superseded' ? 'opacity-50' : ''}`}>
                            {searching && <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap">{byId.get(d.section_id)?.code} {byId.get(d.section_id)?.title.slice(0, 24)}</td>}
                            {listKind === 'monitoring' ? (
                              <>
                                <td className="px-2 py-2.5 whitespace-nowrap tabular-nums">{thaiDate(d.doc_date) || '–'}</td>
                                <td className="px-2 py-2.5 text-gray-800">{d.title}</td>
                                <td className="px-2 py-2.5">{d.result && <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: d.result === 'pass' ? VIZ.positive : VIZ.accent }}>{d.result === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน'}</span>}</td>
                                <td className="px-2 py-2.5 text-gray-500">{d.note}</td>
                              </>
                            ) : listKind === 'licenses' ? (
                              <>
                                <td className="px-2 py-2.5 text-gray-800">{d.title}{d.doc_no && <span className="block text-xs text-gray-400">{d.doc_no}</span>}</td>
                                <td className="px-2 py-2.5 text-gray-600">{d.agency}</td>
                                <td className="px-2 py-2.5 whitespace-nowrap">{d.expires_on ? <span style={{ color: left !== null && left < 0 ? VIZ.accent : left !== null && left <= 90 ? VIZ.secondary : VIZ.text }}>{thaiDate(d.expires_on)}{left !== null && left <= 90 && <span className="block text-xs">{left < 0 ? `หมดอายุแล้ว ${-left} วัน` : `อีก ${left} วัน`}</span>}</span> : <span className="text-xs text-gray-400">ไม่ระบุ</span>}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-2 py-2.5 whitespace-nowrap text-gray-500 tabular-nums">{d.doc_no}</td>
                                <td className="px-2 py-2.5 text-gray-800">{d.title}{d.status === 'superseded' && <span className="ml-2 text-xs text-gray-400">(ฉบับเก่า)</span>}{d.signed_by && <span className="block text-xs text-gray-400">ลงนาม {d.signed_by}</span>}</td>
                                <td className="px-2 py-2.5 text-gray-600">{d.revision}</td>
                                <td className="px-2 py-2.5 whitespace-nowrap tabular-nums text-gray-600">{thaiDate(d.doc_date)}</td>
                              </>
                            )}
                            <td className="px-2 py-2.5">
                              {d.file_path && d.file_size ? <button type="button" onClick={() => openFile(d)} className="inline-flex items-center gap-1 text-[#4E79A7] hover:underline"><Paperclip size={14} />เปิด</button>
                                : d.link_url ? <a href={d.link_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#4E79A7] hover:underline"><ExternalLink size={14} />ลิงก์</a>
                                : d.file_name ? <span className="text-xs" style={{ color: VIZ.secondary }}>รอย้ายไฟล์</span> : <span className="text-xs text-gray-300">–</span>}
                            </td>
                            <td className="px-2 py-2.5 text-right whitespace-nowrap">
                              {d.employee_visible === false && <EyeOff size={13} className="inline mr-2 text-gray-300" aria-label="ซ่อนจากพนักงาน" />}
                              <button type="button" onClick={() => editDoc(d)} className={btnGhost} aria-label="แก้ไข"><Edit3 size={14} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Document drawer */}
      <Drawer open={!!form} onClose={() => setForm(null)} title={form?.replaces_id ? 'ออก Rev. ใหม่' : form?.id ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}
        subtitle={form ? `${byId.get(form.section_id)?.code} ${byId.get(form.section_id)?.title}` : ''}
        footer={form && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {form.id && <ConfirmButton label="ลบ" confirmLabel="ยืนยันลบ?" danger onConfirm={() => { const d = docs.find(x => x.id === form.id); if (d) remove(d); }} />}
              {form.id && <button type="button" className={btnSecondary} onClick={() => { const d = docs.find(x => x.id === form.id); if (d) editDoc(d, true); }}><History size={15} />ออก Rev. ใหม่</button>}
            </div>
            <button type="button" disabled={saving || uploading || !form.title.trim()} onClick={save} className={btnPrimary} style={{ background: VIZ.primary }}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        )}>
        {form && (() => {
          const fk = byId.get(form.section_id)?.kind || 'documents';
          const set = (patch: Partial<DocForm>) => setForm(f => f && ({ ...f, ...patch }));
          return (
            <div className="space-y-4">
              {form.replaces_id && <p className="rounded-lg bg-[#F28E2B]/10 px-3 py-2 text-sm text-gray-700">ฉบับปัจจุบันจะย้ายไปอยู่ในประวัติ พนักงานจะเห็นเฉพาะฉบับใหม่</p>}
              <div>
                <span className={labelClass}>ไฟล์</span>
                {form.file_name ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <span className="truncate"><Paperclip size={14} className="inline mr-1" />{form.file_name}{form.file_size ? <span className="text-gray-400 ml-2">{formatBytes(form.file_size)}</span> : null}</span>
                    <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>เปลี่ยน</button>
                  </div>
                ) : (
                  <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className={`${btnSecondary} w-full`}><Upload size={15} />{uploading ? 'กำลังอัปโหลด…' : 'เลือกไฟล์ (PDF, รูป, Word, Excel)'}</button>
                )}
                <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              </div>
              {fk === 'monitoring' ? (
                <>
                  <div><label className={labelClass}>รายการตรวจ *</label><input className={inputClass} value={form.title} onChange={e => set({ title: e.target.value })} placeholder="เช่น Ozone_Front" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>วันที่ตรวจ</label><input type="date" className={inputClass} value={form.doc_date} onChange={e => set({ doc_date: e.target.value })} /></div>
                    <div><label className={labelClass}>ผล</label>
                      <div className="flex gap-2">{(['pass', 'not_pass'] as const).map(r => <button key={r} type="button" onClick={() => set({ result: form.result === r ? '' : r })} className={btnSecondary} style={form.result === r ? { background: r === 'pass' ? VIZ.positive : VIZ.accent, color: '#fff', borderColor: 'transparent' } : undefined}>{r === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน'}</button>)}</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div><label className={labelClass}>{fk === 'licenses' ? 'ชื่อใบอนุญาต *' : 'ชื่อเอกสาร *'}</label><input className={inputClass} value={form.title} onChange={e => set({ title: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>{fk === 'licenses' ? 'เลขที่ใบอนุญาต' : 'เลขที่เอกสาร'}</label><input className={inputClass} value={form.doc_no} onChange={e => set({ doc_no: e.target.value })} placeholder={fk === 'licenses' ? '' : 'เช่น ALP-HSE-001'} /></div>
                    <div><label className={labelClass}>Rev.</label><input className={inputClass} value={form.revision} onChange={e => set({ revision: e.target.value })} placeholder="เช่น C" /></div>
                    <div><label className={labelClass}>{fk === 'licenses' ? 'วันที่ออก' : 'วันที่มีผล / ลงนาม'}</label><input type="date" className={inputClass} value={form.doc_date} onChange={e => set({ doc_date: e.target.value })} /></div>
                    {fk === 'licenses'
                      ? <div><label className={labelClass}>วันหมดอายุ</label><input type="date" className={inputClass} value={form.expires_on} onChange={e => set({ expires_on: e.target.value })} /></div>
                      : <div><label className={labelClass}>ผู้ลงนาม</label><input className={inputClass} value={form.signed_by} onChange={e => set({ signed_by: e.target.value })} /></div>}
                  </div>
                  {fk === 'licenses' && <div><label className={labelClass}>หน่วยงานที่ออก</label><input className={inputClass} value={form.agency} onChange={e => set({ agency: e.target.value })} placeholder="เช่น กรมโรงงานอุตสาหกรรม" /></div>}
                </>
              )}
              <div><label className={labelClass}>ลิงก์ (ถ้าไม่มีไฟล์)</label><input className={inputClass} value={form.link_url} onChange={e => set({ link_url: e.target.value })} placeholder="https://" /></div>
              <div><label className={labelClass}>หมายเหตุ</label><textarea className={inputClass} rows={2} value={form.note} onChange={e => set({ note: e.target.value })} /></div>
              <div><label className={labelClass}>พนักงานเห็นรายการนี้ใน LINE</label>
                <div className="flex flex-wrap gap-2">{([['inherit', `ตามหมวด (${byId.get(form.section_id)?.employee_visible ? 'เห็น' : 'ไม่เห็น'})`], ['yes', 'เห็น'], ['no', 'ซ่อน']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set({ employee_visible: v })} className={btnSecondary} style={form.employee_visible === v ? { background: VIZ.primary, color: '#fff', borderColor: 'transparent' } : undefined}>{l}</button>
                ))}</div>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {sectionEdit && <SectionModal section={sectionEdit} company={company} onClose={() => setSectionEdit(null)} onSaved={() => { setSectionEdit(null); loadSections(); }} onError={m => setToast({ type: 'error', msg: m })} />}
      {settingsOpen && <AccessCodeModal company={company} onClose={() => setSettingsOpen(false)} onSaved={m => { setSettingsOpen(false); setToast({ type: 'success', msg: m }); }} onError={m => setToast({ type: 'error', msg: m })} />}
    </div>
  );
}

function SectionModal({ section, company, onClose, onSaved, onError }: { section: OhseSectionView; company: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description || '');
  const [link, setLink] = useState(section.link_url || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await postJson(`/api/ohse/sections/${section.id}`, { company_id: company, title, description: description || null, link_url: link || null }, 'PATCH');
      onSaved();
    } catch (e) { onError(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`แก้หมวด ${section.code}`} size="sm"
      footer={<div className="flex justify-end"><button type="button" disabled={saving || !title.trim()} onClick={save} className={btnPrimary} style={{ background: VIZ.primary }}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>}>
      <div className="space-y-4">
        <div><label className={labelClass}>ชื่อหมวด</label><input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><label className={labelClass}>คำอธิบาย (แสดงให้พนักงานเห็น)</label><textarea className={inputClass} rows={3} value={description} onChange={e => setDescription(e.target.value)} /></div>
        {section.kind === 'link' && <div><label className={labelClass}>ลิงก์ไประบบ</label><input className={inputClass} value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></div>}
        <p className="text-xs text-gray-500">ประเภท: {OHSE_KIND_LABEL[section.kind]}</p>
      </div>
    </Modal>
  );
}

function AccessCodeModal({ company, onClose, onSaved, onError }: { company: string; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [state, setState] = useState<OhseCompanySettingsView | null>(null);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { getJson<{ data: OhseCompanySettingsView }>(`/api/ohse/settings?company=${company}`).then(r => setState(r.data)).catch(e => onError(errMsg(e))); }, [company, onError]);
  const save = async (value: string) => {
    setSaving(true);
    try { await postJson('/api/ohse/settings', { company_id: company, access_code: value }, 'PUT'); onSaved(value ? 'ตั้งรหัสแล้ว แจ้งพนักงานได้เลย' : 'ปิดการเข้าดูของพนักงานแล้ว'); }
    catch (e) { onError(errMsg(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="รหัสเข้าดูสำหรับพนักงาน" size="sm"
      footer={<div className="flex justify-between gap-2">
        {state?.has_access_code ? <ConfirmButton label="ปิดการเข้าดู" confirmLabel="ยืนยันปิด?" danger onConfirm={() => save('')} /> : <span />}
        <button type="button" disabled={saving || code.trim().length < 6} onClick={() => save(code.trim())} className={btnPrimary} style={{ background: VIZ.primary }}>{state?.has_access_code ? 'เปลี่ยนรหัส' : 'ตั้งรหัส'}</button>
      </div>}>
      <div className="space-y-3 text-sm text-gray-600">
        <p>พนักงานเปิดเมนู <b>เอกสาร SHE</b> ใน LINE OA &quot;EA SHE&quot; แล้วใส่รหัสนี้ครั้งเดียว จะเห็นเฉพาะหมวดและรายการที่ตั้งว่า <Eye size={13} className="inline" style={{ color: VIZ.positive }} /> พนักงานเห็น</p>
        <p>สถานะ: {state === null ? '…' : state.has_access_code ? <b style={{ color: VIZ.positive }}>เปิดให้พนักงานแล้ว</b> : <b style={{ color: VIZ.secondary }}>ยังไม่เปิด</b>}{state?.updated_by && <span className="text-xs text-gray-400"> · แก้ล่าสุดโดย {state.updated_by}</span>}</p>
        <div><label className={labelClass}>{state?.has_access_code ? 'รหัสใหม่' : 'รหัส'} (ตัวอักษรอังกฤษ/ตัวเลข 6–20 ตัว)</label><input className={inputClass} value={code} onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} placeholder="เช่น AMT2026" /></div>
        <p className="text-xs text-gray-400">ระบบเก็บเฉพาะค่าที่เข้ารหัส ดูรหัสเดิมย้อนหลังไม่ได้ จดไว้ให้ดี</p>
      </div>
    </Modal>
  );
}

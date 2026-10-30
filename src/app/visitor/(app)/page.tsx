'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, MessageCircleQuestion, Ban, RefreshCw, Search, X, Phone, MapPin, ClipboardList, History } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { HAS_PERMIT_LABEL, VISITOR_STATUS_LABEL } from '@/lib/visitor/constants';
import type { DecisionAction, VisitorEventRow, VisitorRequestDetail, VisitorRequestWithPersons, VisitorStatus } from '@/lib/visitor/types';
import { FetchError, STATUS_COLOR, StatusBadge, ToastView, VIZ, cardClass, getJson, hhmm, inputClass, labelClass, postJson, thaiDate, thaiDateTime, useToast } from '../_components/ui';

type Company = { company_id: string; company_name: string };
type View = 'pending' | 'approved' | 'closed' | 'all';
const VIEW_STATUS: Record<View, VisitorStatus[]> = { pending: ['submitted', 'need_info'], approved: ['approved'], closed: ['rejected', 'cancelled'], all: [] };
const VIEW_LABEL: Record<View, string> = { pending: 'รอคัดกรอง', approved: 'อนุมัติแล้ว', closed: 'ปิดแล้ว', all: 'ทั้งหมด' };
const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export default function VisitorQueuePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState(isAdmin ? 'all' : (user?.companyId || ''));
  const [view, setView] = useState<View>('pending');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<VisitorRequestWithPersons[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { toast, setToast } = useToast();

  useEffect(() => { if (isAdmin) getJson<Company[]>('/api/companies').then(d => setCompanies(Array.isArray(d) ? d : [])).catch(() => setCompanies([])); }, [isAdmin]);
  useEffect(() => { if (user && !isAdmin) setCompany(user.companyId); }, [user, isAdmin]);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ company });
      if (VIEW_STATUS[view].length) p.set('status', VIEW_STATUS[view].join(','));
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (q.trim()) p.set('q', q.trim());
      const r = await getJson<{ data: VisitorRequestWithPersons[] }>(`/api/visitor/requests?${p}`);
      setRows(r.data); setError('');
    } catch (e) { setError(e instanceof FetchError ? e.message : 'โหลดข้อมูลไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, [company, view, from, to, q]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const sorted = useMemo(() => [...rows].sort((a, b) => (view === 'pending' ? a.created_at.localeCompare(b.created_at) : b.arrival_date.localeCompare(a.arrival_date) || b.created_at.localeCompare(a.created_at))), [rows, view]);
  const kpi = useMemo(() => ({
    pending: rows.filter(r => r.status === 'submitted').length,
    needInfo: rows.filter(r => r.status === 'need_info').length,
    todayApproved: rows.filter(r => r.status === 'approved' && r.arrival_date === today()).length,
    overdue: rows.filter(r => r.status === 'submitted' && r.arrival_date < today()).length,
  }), [rows]);
  const companyName = (id: string) => companies.find(c => c.company_id === id)?.company_name || id.toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div><h1 className="text-2xl font-semibold" style={{ color: VIZ.text }}>คิวคัดกรอง-อนุมัติ</h1><p className="text-sm text-gray-500">คำขอจากพนักงานผ่านลิงก์ลับ · อัปเดตอัตโนมัติทุก 1 นาที</p></div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />รีเฟรช</button>
      </div>

      {view === 'pending' && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Kpi label="รออนุมัติ" value={kpi.pending} color={VIZ.secondary} />
          <Kpi label="ขอข้อมูลเพิ่ม (รอผู้แจ้ง)" value={kpi.needInfo} color={VIZ.primary} />
          <Kpi label="เลยวันเข้าแล้วยังไม่ตัดสิน" value={kpi.overdue} color={VIZ.accent} />
          <Kpi label="อนุมัติเข้าวันนี้" value={kpi.todayApproved} color={VIZ.positive} hint="ดูในแท็บ อนุมัติแล้ว" />
        </div>
      )}

      <div className={`${cardClass} !p-4 flex flex-wrap gap-3 items-center`}>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(Object.keys(VIEW_LABEL) as View[]).map(v => <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-2 text-sm ${view === v ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`} style={view === v ? { background: VIZ.primary } : undefined}>{VIEW_LABEL[v]}</button>)}
        </div>
        {isAdmin && (
          <select className={`${inputClass} !w-56`} value={company} onChange={e => setCompany(e.target.value)}>
            <option value="all">ทุกบริษัท</option>
            {companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}
          </select>
        )}
        <input type="date" className={`${inputClass} !w-40`} value={from} onChange={e => setFrom(e.target.value)} aria-label="วันที่เข้า จาก" />
        <span className="text-gray-400">–</span>
        <input type="date" className={`${inputClass} !w-40`} value={to} onChange={e => setTo(e.target.value)} aria-label="ถึง" />
        <div className="relative flex-1 min-w-48"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className={`${inputClass} !pl-9`} placeholder="ค้นหาเลขคำขอ บริษัท ผู้แจ้ง รหัสพนักงาน" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>

      {error && <p className="text-sm" style={{ color: VIZ.accent }}>{error}</p>}
      <div className={`${cardClass} !p-0 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="px-4 py-3">เลขคำขอ</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">วันที่เข้า</th><th className="px-4 py-3">บริษัทผู้มาติดต่อ</th><th className="px-4 py-3">วัตถุประสงค์</th><th className="px-4 py-3 text-right">คน</th><th className="px-4 py-3">ผู้แจ้ง</th>{company === 'all' && <th className="px-4 py-3">บริษัท</th>}<th className="px-4 py-3">ส่งเมื่อ</th>
          </tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">{loading ? 'กำลังโหลด…' : 'ไม่มีรายการ'}</td></tr>}
            {sorted.map(r => (
              <tr key={r.id} onClick={() => setSelected(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-mono font-medium" style={{ color: VIZ.primary }}>{r.request_no}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 whitespace-nowrap">{thaiDate(r.arrival_date)} <span className="text-gray-500">{hhmm(r.time_from)}–{hhmm(r.time_to)}</span></td>
                <td className="px-4 py-3 font-medium">{r.visitor_company}</td>
                <td className="px-4 py-3 text-gray-600 max-w-56 truncate">{r.purpose}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.visitor_persons.length}</td>
                <td className="px-4 py-3 text-gray-600">{r.informer_name}<span className="block text-xs text-gray-400">{r.informer_department}</span></td>
                {company === 'all' && <td className="px-4 py-3 text-gray-600">{companyName(r.company_id)}</td>}
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{thaiDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <DetailDrawer id={selected} onClose={() => setSelected(null)} onChanged={() => { void load(); }} notify={setToast} />}
      <ToastView toast={toast} />
    </div>
  );
}

function Kpi({ label, value, color, hint }: { label: string; value: number; color: string; hint?: string }) {
  return <div className={`${cardClass} !p-4`} style={{ borderLeft: `4px solid ${color}` }}><div className="text-3xl font-semibold tabular-nums" style={{ color }}>{value}</div><div className="text-sm text-gray-600">{label}</div>{hint && <div className="text-xs text-gray-400">{hint}</div>}</div>;
}

function DetailDrawer({ id, onClose, onChanged, notify }: { id: string; onClose: () => void; onChanged: () => void; notify: (t: { type: 'success' | 'error'; msg: string }) => void }) {
  const [data, setData] = useState<VisitorRequestDetail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [conditions, setConditions] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<DecisionAction | null>(null);

  useEffect(() => {
    setData(null); setError(''); setConfirm(null);
    getJson<{ data: VisitorRequestDetail }>(`/api/visitor/requests/${id}`).then(r => { setData(r.data); setConditions(r.data.conditions || ''); })
      .catch((e: unknown) => setError(e instanceof FetchError ? e.message : 'โหลดไม่สำเร็จ'));
  }, [id]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);

  async function decide(action: DecisionAction) {
    if (!data || busy) return;
    if ((action === 'reject' || action === 'need_info') && !note.trim()) { notify({ type: 'error', msg: 'กรุณาระบุเหตุผล' }); return; }
    if (action !== 'approve' && confirm !== action) { setConfirm(action); return; }
    setBusy(true);
    try {
      const r = await postJson<{ data: VisitorRequestDetail }>(`/api/visitor/requests/${id}`, { action, note: note.trim(), conditions: conditions.trim() }, 'PATCH');
      setData(r.data); setNote(''); setConfirm(null);
      notify({ type: 'success', msg: `${r.data.request_no}: ${VISITOR_STATUS_LABEL[r.data.status]}` });
      onChanged();
    } catch (e) { notify({ type: 'error', msg: e instanceof FetchError ? e.message : 'บันทึกไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }

  const open = data && !['rejected', 'cancelled'].includes(data.status);
  const trackUrl = data ? `${window.location.origin}/visitor/track/${data.track_code}` : '';
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="รายละเอียดคำขอ">
      <button type="button" aria-label="ปิด" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative w-full max-w-2xl h-full overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">{data && <><span className="font-mono text-xl font-semibold" style={{ color: VIZ.primary }}>{data.request_no}</span><StatusBadge status={data.status} /></>}</div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="ปิด"><X size={22} /></button>
        </div>
        {error && <p className="p-6" style={{ color: VIZ.accent }}>{error}</p>}
        {!data && !error && <p className="p-6 text-gray-500">กำลังโหลด…</p>}
        {data && (
          <div className="p-6 space-y-6">
            <section>
              <h3 className="text-2xl font-semibold">{data.visitor_company}</h3>
              <p className="text-gray-600 mt-1">{data.purpose}{data.purpose_other && ` — ${data.purpose_other}`}</p>
              <p className="mt-2 text-lg">{thaiDate(data.arrival_date, true)} · {hhmm(data.time_from)}–{hhmm(data.time_to)} · {data.visitor_persons.length} คน</p>
              {data.arrival_date < today() && data.status === 'submitted' && <p className="text-sm mt-1" style={{ color: VIZ.accent }}>เลยวันเข้าพื้นที่แล้ว</p>}
            </section>

            <section className="grid gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1"><Phone size={12} />ผู้แจ้ง (พนักงาน)</div>
                <div className="font-medium">{data.informer_name}</div>
                <div className="text-gray-600">รหัส {data.informer_employee_code} · {data.informer_department}</div>
                <a href={`tel:${data.informer_phone}`} className="text-[#4E79A7]">{data.informer_phone}</a>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1"><MapPin size={12} />พื้นที่ปฏิบัติงาน</div>
                <div>{data.work_areas.length ? data.work_areas.join(', ') : <span className="text-gray-400">ไม่ระบุ</span>}</div>
                {data.work_area_detail && <div className="text-gray-600 mt-1">{data.work_area_detail}</div>}
                <div className="mt-2 inline-flex items-center gap-1" style={{ color: data.has_permit === 'yes' ? VIZ.positive : data.has_permit === 'no' ? VIZ.accent : VIZ.lightText }}><ClipboardList size={12} />{HAS_PERMIT_LABEL[data.has_permit]}{data.permit_ref && ` (${data.permit_ref})`}</div>
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">รายชื่อผู้มาติดต่อ</h4>
              <ol className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {data.visitor_persons.map(p => <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm"><span className="w-6 text-gray-400 text-right">{p.seq}.</span><span className="flex-1 font-medium">{p.name}{p.detail && <span className="text-gray-500 font-normal"> — {p.detail}</span>}</span><span className="text-xs text-gray-500">{p.arrived_at && `เข้า ${thaiDateTime(p.arrived_at).slice(-5)}`}{p.left_at && ` · ออก ${thaiDateTime(p.left_at).slice(-5)}`}</span></li>)}
              </ol>
            </section>

            {data.note && <section className="rounded-lg p-4 text-sm" style={{ background: `${VIZ.secondary}14` }}><strong>หมายเหตุจากผู้แจ้ง:</strong> {data.note}</section>}
            {data.decision_note && <section className="rounded-lg p-4 text-sm" style={{ background: `${STATUS_COLOR[data.status]}14` }}><strong>บันทึกการตัดสิน ({data.decided_by}):</strong> {data.decision_note}</section>}

            {open && (
              <section className="rounded-xl border border-gray-200 p-4 space-y-3">
                <h4 className="font-semibold">การตัดสินของทีม SHE</h4>
                {data.status !== 'approved' && <div><label className={labelClass} htmlFor="cond">เงื่อนไขการเข้าพื้นที่ (แสดงบนจอ รปภ และหน้าติดตาม)</label><input id="cond" className={inputClass} value={conditions} onChange={e => setConditions(e.target.value)} placeholder="เช่น สวมหมวกนิรภัย-รองเท้าเซฟตี้ · ต้องมี PTW ก่อนเริ่มงาน · มีพนักงานนำทางตลอด" maxLength={1000} /></div>}
                {data.status === 'approved' && <div><label className={labelClass} htmlFor="cond2">แก้เงื่อนไข (กด &quot;บันทึกเงื่อนไข&quot;)</label><input id="cond2" className={inputClass} value={conditions} onChange={e => setConditions(e.target.value)} maxLength={1000} /></div>}
                <div><label className={labelClass} htmlFor="dnote">เหตุผล / ข้อความถึงผู้แจ้ง {data.status !== 'approved' && <span className="text-gray-400 font-normal">(จำเป็นเมื่อขอข้อมูลเพิ่มหรือไม่อนุมัติ)</span>}</label><textarea id="dnote" className={inputClass} rows={2} value={note} onChange={e => { setNote(e.target.value); setConfirm(null); }} maxLength={1000} /></div>
                <div className="flex flex-wrap gap-2">
                  {data.status !== 'approved' && <Action color={VIZ.positive} busy={busy} onClick={() => void decide('approve')}><CheckCircle2 size={16} />อนุมัติ</Action>}
                  {data.status === 'approved' && <Action color={VIZ.positive} busy={busy} onClick={() => void decide('approve')}><CheckCircle2 size={16} />บันทึกเงื่อนไข</Action>}
                  {data.status !== 'approved' && <Action color={VIZ.primary} busy={busy} outline={confirm !== 'need_info'} onClick={() => void decide('need_info')}><MessageCircleQuestion size={16} />{confirm === 'need_info' ? 'ยืนยันขอข้อมูลเพิ่ม' : 'ขอข้อมูลเพิ่ม'}</Action>}
                  {data.status !== 'approved' && <Action color={VIZ.accent} busy={busy} outline={confirm !== 'reject'} onClick={() => void decide('reject')}><XCircle size={16} />{confirm === 'reject' ? 'ยืนยันไม่อนุมัติ' : 'ไม่อนุมัติ'}</Action>}
                  <Action color={VIZ.neutral} busy={busy} outline={confirm !== 'cancel'} onClick={() => void decide('cancel')}><Ban size={16} />{confirm === 'cancel' ? 'ยืนยันยกเลิก' : 'ยกเลิกคำขอ'}</Action>
                </div>
                {confirm && <p className="text-xs text-gray-500">กดปุ่มเดิมอีกครั้งเพื่อยืนยัน — การไม่อนุมัติ/ยกเลิกย้อนกลับไม่ได้</p>}
              </section>
            )}

            <section className="text-sm">
              <div className="text-xs text-gray-500 mb-1">ลิงก์ติดตามสถานะสำหรับผู้แจ้ง</div>
              <input readOnly value={trackUrl} className={`${inputClass} font-mono text-xs`} onFocus={e => e.currentTarget.select()} />
            </section>

            <section>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 inline-flex items-center gap-1"><History size={14} />ประวัติ</h4>
              <ul className="space-y-1 text-sm">{data.visitor_events.map((e: VisitorEventRow) => <li key={e.id} className="flex gap-3"><span className="text-gray-400 whitespace-nowrap">{thaiDateTime(e.at)}</span><span><span className="font-medium">{EVENT_LABEL[e.action] || e.action}</span> · {e.actor}{e.note && <span className="text-gray-500"> — {e.note}</span>}</span></li>)}</ul>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = { submitted: 'ส่งคำขอ', approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ', need_info: 'ขอข้อมูลเพิ่ม', resubmitted: 'ส่งข้อมูลเพิ่ม', cancelled: 'ยกเลิก', arrived: 'มาถึง', left: 'ออกจากพื้นที่', undo_arrived: 'ยกเลิกมาถึง', undo_left: 'ยกเลิกออก' };

function Action({ children, color, onClick, busy, outline }: { children: React.ReactNode; color: string; onClick: () => void; busy: boolean; outline?: boolean }) {
  return <button type="button" disabled={busy} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50" style={outline ? { border: `1px solid ${color}`, color, background: 'white' } : { background: color, color: 'white' }}>{children}</button>;
}

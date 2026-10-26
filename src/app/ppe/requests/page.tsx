'use client';

export const dynamic = 'force-dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Package, RefreshCw, Search } from 'lucide-react';
import { UNIT_TYPES } from '@/lib/constants';
import type { PPERequest, PPERequestStatus } from '@/lib/types';

type Stock = { product_id: string; name: string; unit: string; current_stock: number; reserved_quantity: number; available_stock: number };
const statuses: Record<PPERequestStatus, string> = { pending: 'รออนุมัติ', approved: 'อนุมัติ / รอจัดจ่าย', ready: 'รอยืนยันรับ', received: 'รับครบแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };
const actions: Record<string, string> = { submit: 'ส่งคำขอ', approve: 'อนุมัติและจอง', dispatch: 'จัดจ่าย', receive: 'ยืนยันรับ', reject: 'ไม่อนุมัติ', cancel: 'ยกเลิกยอดค้าง' };
const input = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const button = 'min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const unitName = (unit: string) => UNIT_TYPES.find(x => x.value === unit)?.label || unit;
const date = (value: string) => new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

export default function PPERequestsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const company = user?.role === 'admin' ? params.get('company_id') || 'all' : user?.companyId;
  const requester = user?.ppeRole === 'requester';
  const [tab, setTab] = useState<'requests' | 'catalog'>('requests');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<PPERequest[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Stock | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const submissionKey = useRef('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [operation, setOperation] = useState<{ row: PPERequest; action: string } | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const scope = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);
  const saving = useRef(false);
  saving.current = busy;
  const dialogOpen = Boolean(selected || operation);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const fields = () => Array.from(dialog?.querySelectorAll<HTMLElement>('input,textarea,button:not(:disabled),[tabindex="0"]') || []);
    (fields()[0] || dialog)?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving.current) { setSelected(null); setOperation(null); setError(''); }
      if (event.key !== 'Tab') return;
      const controls = fields(), first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handle);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handle); if (previous?.isConnected) previous.focus(); };
  }, [dialogOpen]);
  const q = `company_id=${encodeURIComponent(company || '')}`;
  const load = useCallback(async () => {
    if (!company || company === 'all') return;
    const version = ++scope.current;
    setLoading(true);
    try {
      const responses = await Promise.all([fetch(`/api/ppe/requests?company_id=${encodeURIComponent(company)}&status=${status}&page=${page}`, { cache: 'no-store' }), fetch(`/api/ppe/catalog?company_id=${encodeURIComponent(company)}`, { cache: 'no-store' })]);
      const [requests, catalog] = await Promise.all(responses.map(r => r.json()));
      if (!responses[0].ok || !responses[1].ok) throw new Error(requests.error || catalog.error || 'โหลดข้อมูลไม่สำเร็จ');
      if (version !== scope.current) return;
      setRows(requests.data); setTotal(requests.count); setStock(catalog.data);
    } catch (e) { if (version === scope.current) setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'); }
    finally { if (version === scope.current) setLoading(false); }
  }, [company, status, page]);
  useEffect(() => { setRows([]); setStock([]); setOperation(null); setSelected(null); setMessage(''); setError(''); void load(); return () => { scope.current++; }; }, [load]);
  async function send(payload: Record<string, unknown>) {
    const response = await fetch(`/api/ppe/requests?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
  }
  async function exportReservation(row: PPERequest) {
    setExporting(row.id); setError('');
    try {
      const response = await fetch(`/api/ppe/requests?${q}&format=pdf&id=${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'สร้าง PDF ไม่สำเร็จ'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `PPE-Reservation-${row.id}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError(e instanceof Error ? e.message : 'สร้าง PDF ไม่สำเร็จ'); }
    finally { setExporting(null); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await send({ action: 'submit', product_id: selected.product_id, quantity: Number(quantity), note: reason, submission_key: submissionKey.current });
      setSelected(null); setReason(''); setTab('requests'); setMessage('ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งคำขอไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  function openAction(row: PPERequest, action: string) {
    setOperation({ row, action }); setNote(''); setError(''); setMessage('');
    setAmount(String(action === 'receive' ? row.approved_quantity - row.received_quantity : row.quantity));
  }
  async function act(event: React.FormEvent) {
    event.preventDefault(); if (!operation || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { row, action } = operation;
      await send({ action, request_id: row.id, ...(action === 'approve' || action === 'receive' ? { quantity: Number(amount) + (action === 'receive' ? row.received_quantity : 0) } : {}), note });
      setOperation(null); setMessage(action === 'receive' ? 'ยืนยันรับและตัดสต็อกเรียบร้อยแล้ว' : 'บันทึกเรียบร้อยแล้ว'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  if (!company || company === 'all') return <div className="rounded-xl border bg-white p-6 text-slate-900">เลือกบริษัทจากเมนูด้านซ้ายเพื่อจัดการคำขอเบิก PPE</div>;
  const visibleStock = stock.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="min-w-0 space-y-5 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{requester ? 'ขอเบิกและรับอุปกรณ์ PPE' : 'คำขอเบิก PPE'}</h1><p className="mt-1 text-sm text-slate-500">จองเมื่ออนุมัติ · ตัดสต็อกเมื่อผู้ขอเบิกยืนยันรับ</p></div><button type="button" className="flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3 text-sm" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={16} />รีเฟรช</button></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    <div className="flex flex-wrap gap-2"><button className={tab === 'requests' ? button : 'min-h-11 rounded-lg border bg-white px-4 text-sm'} onClick={() => setTab('requests')}>{requester ? 'คำขอของฉัน / ยืนยันรับ' : 'รายการคำขอ'}</button><button className={tab === 'catalog' ? button : 'min-h-11 rounded-lg border bg-white px-4 text-sm'} onClick={() => setTab('catalog')}>{requester ? 'เลือกอุปกรณ์ขอเบิก' : 'สต็อกพร้อมเบิก'}</button></div>
    {loading && <p role="status" className="text-sm text-slate-500">กำลังโหลดข้อมูล…</p>}
    {tab === 'catalog' && <>
      <label className="flex items-center gap-2 rounded-xl border bg-white px-3"><Search size={18} className="text-slate-400" /><input aria-label="ค้นหาอุปกรณ์" placeholder="ค้นหาชื่ออุปกรณ์ / ขนาด" value={search} onChange={e => setSearch(e.target.value)} className="min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleStock.map(s => <article key={s.product_id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><h2 className="flex items-start gap-2 font-semibold"><Package size={18} className="mt-1 shrink-0 text-blue-600" /><span className="break-words">{s.name}</span></h2><dl className="my-4 grid grid-cols-3 gap-2 text-center"><div><dt className="text-xs text-slate-500">คงเหลือ</dt><dd className="mt-1 text-lg font-semibold">{s.current_stock}</dd></div><div><dt className="text-xs text-slate-500">จองแล้ว</dt><dd className="mt-1 text-lg font-semibold text-amber-700">{s.reserved_quantity}</dd></div><div><dt className="text-xs text-slate-500">พร้อมเบิก</dt><dd className="mt-1 text-lg font-semibold text-blue-700">{Math.max(0, s.available_stock)}</dd></div></dl><div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-500">หน่วย: {unitName(s.unit)}</span>{requester && <button className={button} disabled={busy} onClick={() => { setSelected(s); setQuantity('1'); setReason(''); submissionKey.current = crypto.randomUUID(); setError(''); }}>ขอเบิก</button>}</div></article>)}</div>
      {!loading && !visibleStock.length && <p className="py-8 text-center text-slate-500">ไม่พบอุปกรณ์</p>}
    </>}
    {tab === 'requests' && <>
      <label className="block max-w-sm text-sm">สถานะคำขอ<select className={`${input} mt-1`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">ทุกสถานะ</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="space-y-3">{rows.map(row => <article key={row.id} data-testid="ppe-request" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{row.ppe_products.name}</h2><p className="mt-1 text-xs text-slate-500">#{row.id.slice(0, 8)} · {date(row.created_at)}</p></div><span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${row.status === 'ready' ? 'bg-orange-100 text-orange-800' : row.status === 'received' ? 'bg-green-100 text-green-800' : 'bg-blue-50 text-blue-800'}`}>{statuses[row.status]}</span></div>
        {!requester && <p className="mt-3 text-sm">{row.ppe_requesters.display_name} · {row.ppe_requesters.employee_code} {row.ppe_requesters.department && `· ${row.ppe_requesters.department}`}</p>}
        <p className="mt-2 break-words text-sm text-slate-600">เหตุผล: {row.reason}</p>
        <div className="my-3 flex flex-wrap gap-x-6 gap-y-1 text-sm"><span>ขอ <b>{row.quantity}</b></span><span>อนุมัติ <b>{row.approved_quantity}</b></span><span>รับแล้ว <b>{row.received_quantity}</b></span><span>ค้างรับ <b>{['approved','ready'].includes(row.status) ? row.approved_quantity - row.received_quantity : 0}</b> {unitName(row.ppe_products.unit)}</span></div>
        {row.manager_note && <p className="mb-3 text-sm text-slate-600">ผู้ดูแล: {row.manager_note}</p>}
        <div className="flex flex-wrap gap-2">
          {row.approved_at && <button className="min-h-11 rounded-lg border border-[#4E79A7] px-3 text-sm text-[#4E79A7]" disabled={!!exporting || busy} onClick={() => void exportReservation(row)}>{exporting === row.id ? 'กำลังสร้าง PDF…' : 'Export ใบจอง PDF'}</button>}
          {!requester && row.status === 'pending' && <><button className={button} disabled={busy} onClick={() => openAction(row, 'approve')}>อนุมัติและจองสต็อก</button><button className="min-h-11 rounded-lg border px-3 text-sm text-red-700" onClick={() => openAction(row, 'reject')}>ไม่อนุมัติ</button></>}
          {!requester && row.status === 'approved' && <button className={button} disabled={busy} onClick={() => openAction(row, 'dispatch')}>จัดจ่าย / รอผู้ใช้รับ</button>}
          {requester && row.status === 'ready' && <button className={button} disabled={busy} onClick={() => openAction(row, 'receive')}>ยืนยันรับอุปกรณ์</button>}
          {((requester && row.status === 'pending') || (!requester && ['pending','approved','ready'].includes(row.status))) && <button className="min-h-11 rounded-lg border px-3 text-sm text-slate-600" disabled={busy} onClick={() => openAction(row, 'cancel')}>ยกเลิก{row.received_quantity > 0 ? 'ยอดค้าง' : 'คำขอ'}</button>}
        </div>
        <details className="mt-3 border-t pt-3 text-xs text-slate-500"><summary className="cursor-pointer py-1">ประวัติคำขอ</summary><ol className="mt-2 space-y-2">{[...row.ppe_request_events].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(e => <li key={e.id}>{date(e.created_at)} · {e.actor_name} · {actions[e.action] || e.action}{e.quantity != null ? ` ${e.quantity} ${unitName(row.ppe_products.unit)}` : ''}{e.note && ` · ${e.note}`}</li>)}</ol></details>
      </article>)}</div>
      {!loading && !rows.length && <p className="rounded-xl border bg-white p-8 text-center text-slate-500">ยังไม่มีคำขอในสถานะนี้{requester && ' เริ่มได้ที่ “เลือกอุปกรณ์ขอเบิก”'}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"><span>{total} รายการ · หน้า {page}</span><div className="flex gap-2"><button className="min-h-11 rounded-lg border bg-white px-3 disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage(p => p-1)}>ก่อนหน้า</button><button className="min-h-11 rounded-lg border bg-white px-3 disabled:opacity-40" disabled={page*30 >= total || loading} onClick={() => setPage(p => p+1)}>ถัดไป</button></div></div>
    </>}
    {(selected || operation) && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-3"><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ppe-action-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <h2 id="ppe-action-title" className="text-lg font-bold">{selected ? `ขอเบิก ${selected.name}` : `${actions[operation!.action]} · ${operation!.row.ppe_products.name}`}</h2>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={selected ? submit : act} className="mt-4 space-y-4">
        {selected ? <><p className="text-sm text-slate-500">พร้อมเบิกขณะนี้ {Math.max(0, selected.available_stock)} {unitName(selected.unit)} · ผู้ดูแลจะตรวจจำนวนก่อนอนุมัติ</p><label className="block text-sm">จำนวนที่ขอ<input autoFocus type="number" required min={1} max={1000000} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} className={`${input} mt-1`} /></label><label className="block text-sm">เหตุผลการขอเบิก<textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className={`${input} mt-1`} /></label></> : <>
          {['approve','receive'].includes(operation!.action) && <label className="block text-sm">{operation!.action === 'receive' ? 'จำนวนที่ได้รับครั้งนี้' : 'จำนวนที่อนุมัติ'}<input autoFocus type="number" required min={1} step={1} max={operation!.action === 'receive' ? operation!.row.approved_quantity-operation!.row.received_quantity : operation!.row.quantity} value={amount} onChange={e => setAmount(e.target.value)} className={`${input} mt-1`} /></label>}
          {operation!.action === 'receive' && <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">กดยืนยันเมื่อได้รับอุปกรณ์จริง ระบบจะตัดสต็อกตามจำนวนนี้ทันที หากรับไม่ครบ ยอดที่เหลือจะยังจองไว้</p>}
          {operation!.action === 'approve' && <p className="text-sm text-slate-600">เมื่ออนุมัติ ระบบจะกันยอดนี้ออกจากจำนวนพร้อมเบิก</p>}
          {operation!.action === 'dispatch' && <p className="text-sm text-slate-600">ยืนยันจัดจ่ายแล้ว ผู้ขอเบิกจะสามารถกดยืนยันรับด้วยบัญชีตัวเอง</p>}
          {operation!.action === 'cancel' && operation!.row.status === 'ready' && <p className="text-sm text-orange-800">ยกเลิกเฉพาะยอดค้างที่ยังไม่ได้ส่งมอบ หรือได้รับคืนเข้าคลังแล้ว ยอดที่ผู้ใช้ยืนยันรับไปแล้วจะไม่ถูกย้อนกลับ</p>}
          {!requester && operation!.action !== 'dispatch' && <label className="block text-sm">เหตุผล / หมายเหตุ{['cancel','reject'].includes(operation!.action) ? ' (จำเป็น)' : ''}<textarea required={['cancel','reject'].includes(operation!.action)} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} className={`${input} mt-1`} /></label>}
        </>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} className="min-h-11 rounded-lg border px-4 text-sm" onClick={() => { setSelected(null); setOperation(null); setError(''); }}>ปิด</button><button type="submit" disabled={busy} className={button}>{busy ? 'กำลังบันทึก…' : selected ? 'ส่งคำขอ' : 'ยืนยัน'}</button></div>
      </form>
    </section></div>}
  </div>;
}

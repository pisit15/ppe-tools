'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Package, Plus, Search, ShoppingCart, Trash2, X, ZoomIn } from 'lucide-react';
import { UNIT_TYPES } from '@/lib/constants';
import type { PPERequestBatchItem, PPEStockSummary } from '@/lib/types';

export type RequestStock = Pick<PPEStockSummary, 'product_id' | 'name' | 'unit' | 'image_url' | 'current_stock'> & { reserved_quantity: number; available_stock: number };
type CartItem = { stock: RequestStock; quantity: string; key: string };
const unitName = (unit: string) => UNIT_TYPES.find(u => u.value === unit)?.label || unit;
const primary = 'min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-40';

function ProductImage({ stock, large = false, compact = false }: { stock: RequestStock; large?: boolean; compact?: boolean }) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const src = stock.image_url;
  const valid = src && /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp|gif);base64,)/i.test(src) && failedURL !== src;
  if (!valid) return <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400"><Package size={large ? 56 : 32} />{!compact && <span className="text-xs">{src ? 'ไม่สามารถโหลดรูปได้' : 'ยังไม่มีรูปสินค้า'}</span>}</span>;
  // Catalog images use existing product URLs; no remote image optimizer is required.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={stock.name} loading={large ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" className={`h-full w-full object-contain ${large ? 'max-h-[65dvh]' : 'p-3'}`} onError={() => setFailedURL(src)} />;
}

export default function PPERequestCatalog({ stock, requester, loading, busy, onSubmit }: {
  stock: RequestStock[]; requester: boolean; loading: boolean; busy: boolean;
  onSubmit: (items: PPERequestBatchItem[], note: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'cart' | 'image' | null>(null);
  const [image, setImage] = useState<RequestStock | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (mode && !dialog.current?.open) dialog.current?.showModal();
    if (!mode && dialog.current?.open) dialog.current.close();
  }, [mode]);
  const latest = new Map(stock.map(s => [s.product_id, s]));
  const available = stock.filter(s => s.available_stock > 0);
  const visible = available.filter(s => s.name.toLocaleLowerCase('th').includes(search.trim().toLocaleLowerCase('th')));
  const invalid = cart.some(item => {
    const quantity = Number(item.quantity), current = latest.get(item.stock.product_id);
    return !Number.isSafeInteger(quantity) || quantity < 1 || quantity > (current?.available_stock || 0);
  });
  function toggle(s: RequestStock) {
    setError('');
    if (cart.some(i => i.stock.product_id === s.product_id)) setCart(c => c.filter(i => i.stock.product_id !== s.product_id));
    else if (cart.length < 50) setCart(c => [...c, { stock: s, quantity: '1', key: crypto.randomUUID() }]);
    else setError('เลือกได้ครั้งละไม่เกิน 50 รายการ');
  }
  function quantity(id: string, value: string) { setCart(c => c.map(i => i.stock.product_id === id ? { ...i, quantity: value } : i)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!cart.length || invalid || busy || sending.current) return;
    sending.current = true; setError('');
    try {
      await onSubmit(cart.map(i => ({ product_id: i.stock.product_id, quantity: Number(i.quantity), submission_key: i.key })), reason);
      setMode(null); setCart([]); setReason('');
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    finally { sending.current = false; }
  }
  return <div className="space-y-4 pb-4">
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <p className="font-semibold text-slate-900">{requester ? 'เลือกอุปกรณ์ที่ต้องการใช้' : 'อุปกรณ์พร้อมเบิก'}</p>
      <p className="mt-1 text-sm text-slate-600">{requester ? '1. เลือกสินค้าและจำนวน   2. ตรวจตะกร้า   3. ส่งคำขอ' : 'กดที่รูปสินค้าเพื่อดูภาพใหญ่'}</p>
      <p className="mt-2 text-xs text-slate-500">แสดงเฉพาะอุปกรณ์ที่พร้อมเบิกมากกว่า 0 โดยหักยอดจองแล้ว</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={18} className="shrink-0 text-slate-400" /><input aria-label="ค้นหาอุปกรณ์" placeholder="ค้นหาชื่อสินค้า / ขนาด" value={search} onChange={e => setSearch(e.target.value)} className="min-h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <span className="text-sm text-slate-500">{visible.length} รายการพร้อมเบิก</span>
    </div>
    {error && !mode && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(s => {
      const item = cart.find(i => i.stock.product_id === s.product_id);
      return <article key={s.product_id} data-testid="ppe-catalog-item" className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white transition ${item ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'}`}>
        <button type="button" aria-label={`ดูรูป ${s.name}`} disabled={!s.image_url} onClick={() => { setImage(s); setMode('image'); }} className="group relative flex h-40 w-full sm:h-44 items-center justify-center overflow-hidden border-b border-slate-100 bg-slate-50 disabled:cursor-default">
          <ProductImage stock={s} />{s.image_url && <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs text-slate-600 shadow-sm"><ZoomIn size={14} />ดูรูปใหญ่</span>}
          {item && <span className="absolute left-3 top-3 rounded-full bg-blue-700 p-1.5 text-white"><Check size={16} /></span>}
        </button>
        <div className="flex flex-1 flex-col p-4">
          <h2 className="break-words font-semibold leading-6 text-slate-900">{s.name}</h2>
          <div className="mb-1 mt-3 flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-green-50 px-2.5 py-1 text-sm font-semibold text-green-800">พร้อมเบิก {s.available_stock} {unitName(s.unit)}</span></div>
          <p className="mb-4 text-xs text-slate-500">คงเหลือ {s.current_stock} · จองแล้ว {s.reserved_quantity}</p>
          {requester && <div className="mt-auto space-y-3">
            {item && <div className="flex items-center gap-2"><span className="mr-auto text-sm text-slate-600">จำนวน</span><button type="button" aria-label={`ลดจำนวน ${s.name}`} disabled={busy || Number(item.quantity) <= 1} onClick={() => quantity(s.product_id, String(Number(item.quantity) - 1))} className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-30"><Minus size={16} /></button><input aria-label={`จำนวน ${s.name}`} type="number" min={1} max={s.available_stock} step={1} value={item.quantity} disabled={busy} onChange={e => quantity(s.product_id, e.target.value)} className="h-11 w-16 rounded-lg border text-center text-sm" /><button type="button" aria-label={`เพิ่มจำนวน ${s.name}`} disabled={busy || Number(item.quantity) >= s.available_stock} onClick={() => quantity(s.product_id, String(Number(item.quantity) + 1))} className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-30"><Plus size={16} /></button></div>}
            <button type="button" aria-pressed={!!item} disabled={busy} onClick={() => toggle(s)} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ${item ? 'bg-blue-50 text-blue-800' : 'bg-blue-700 text-white hover:bg-blue-800'}`}>{item ? <Check size={17} /> : <Plus size={17} />}{item ? 'เลือกแล้ว' : 'เลือกสินค้า'}</button>
          </div>}
        </div>
      </article>;
    })}</div>
    {!loading && !visible.length && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">{search ? 'ไม่พบอุปกรณ์พร้อมเบิกที่ตรงกับการค้นหา' : 'ขณะนี้ยังไม่มีอุปกรณ์พร้อมเบิก'}</p>}
    {requester && cart.length > 0 && <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm"><div className="flex items-center gap-3"><ShoppingCart className="text-blue-700" size={23} /><div><p className="font-semibold text-slate-900">เลือกแล้ว {cart.length} รายการ</p><p className="text-xs text-slate-500">ตรวจจำนวนและส่งพร้อมกันได้</p></div></div><button type="button" disabled={busy} className={primary} onClick={() => { setError(''); setMode('cart'); }}>ตรวจตะกร้า / ส่งคำขอ</button></div>}
    <dialog ref={dialog} aria-labelledby="ppe-catalog-dialog-title" onCancel={e => { if (busy) e.preventDefault(); else setMode(null); }} className="m-auto max-h-[92dvh] w-[calc(100%_-_24px)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-4"><h2 id="ppe-catalog-dialog-title" className="font-bold">{mode === 'image' ? image?.name : `ตรวจตะกร้าขอเบิก (${cart.length} รายการ)`}</h2><button type="button" aria-label="ปิดหน้าต่าง" disabled={busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border" onClick={() => setMode(null)}><X size={19} /></button></div>
      {mode === 'image' && image && <div className="p-4"><ProductImage stock={image} large /></div>}
      {mode === 'cart' && <form className="space-y-4 p-4" onSubmit={submit}>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="text-sm text-slate-600">ตรวจจำนวนแต่ละรายการก่อนส่ง ผู้ดูแลจะอนุมัติและจองสต็อกให้ภายหลัง</p>
        <div className="space-y-3">{cart.map(item => {
          const current = latest.get(item.stock.product_id), limit = current?.available_stock || 0;
          return <div key={item.stock.product_id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-3"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border"><ProductImage stock={current || item.stock} compact /></div><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{item.stock.name}</h3><p className={`mt-1 text-xs ${limit > 0 ? 'text-slate-500' : 'text-red-700'}`}>พร้อมเบิก {limit} {unitName(item.stock.unit)}</p></div><button type="button" aria-label={`นำออก ${item.stock.name}`} disabled={busy} onClick={() => setCart(c => c.filter(i => i.key !== item.key))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={18} /></button></div><label className="mt-3 flex items-center justify-end gap-3 text-sm">จำนวนที่ขอ<input aria-label={`จำนวนในตะกร้า ${item.stock.name}`} required type="number" min={1} max={limit} step={1} disabled={busy} value={item.quantity} onChange={e => quantity(item.stock.product_id, e.target.value)} className="h-11 w-24 rounded-lg border border-slate-300 px-3 text-right" /><span>{unitName(item.stock.unit)}</span></label></div>;
        })}</div>
        {!cart.length && <p className="py-4 text-center text-slate-500">ยังไม่ได้เลือกสินค้า</p>}
        {invalid && <p role="alert" className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">กรุณาปรับจำนวนให้ไม่เกินยอดพร้อมเบิก หรือนำรายการที่หมดออกจากตะกร้า</p>}
        <label className="block text-sm font-medium">เหตุผลการขอเบิก (ไม่บังคับ)<textarea maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ใช้สำหรับงานซ่อมบำรุงประจำเดือน" className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm" /></label>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white py-3"><button type="button" disabled={busy} className="min-h-11 rounded-xl border px-4 text-sm" onClick={() => setMode(null)}>เลือกสินค้าต่อ</button><button type="submit" disabled={busy || invalid || !cart.length} className={primary}>{busy ? 'กำลังส่งคำขอ…' : `ส่งคำขอ ${cart.length} รายการ`}</button></div>
      </form>}
    </dialog>
  </div>;
}

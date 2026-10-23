'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Package, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import type { PPEOrderSettings, PPEProduct, PPEStockSummary, PPETransaction } from '@/lib/types';
import { PPE_TYPES, TRANSACTION_TYPES, UNIT_TYPES } from '@/lib/constants';
import { calculateOrderRows, leadTimeDays, monthKey, monthLabelTH, orderDateRange, orderMonths, type OrderRow } from '@/lib/ppe-order';

type FeedTransaction = PPETransaction & { ppe_products?: { name: string; type: string } | null };
type DashboardData = {
  key: string;
  products: PPEProduct[];
  stocks: PPEStockSummary[];
  transactions: FeedTransaction[];
  settings: PPEOrderSettings | null;
  fetchedAt: Date;
};
type Filter = 'reorder' | 'alerts' | 'no-reorder' | 'unused' | 'all';
const PAGE_SIZE = 8;
const format = (value: number) => value.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const unitLabel = (unit: string) => UNIT_TYPES.find(item => item.value === unit)?.label || unit;
const typeLabel = (type: string) => PPE_TYPES.find(item => item.value === type)?.label || type;

function StockStatus({ row, unused }: { row: OrderRow; unused: boolean }) {
  if (!row.canReorder) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">ไม่สั่งซื้อเพิ่ม</span>;
  if (unused) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">ยังไม่เคยเคลื่อนไหว</span>;
  if (row.requiresOrder) return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800"><ShoppingCart size={12} aria-hidden="true" />ต้องสั่งซื้อ</span>;
  if (row.isEmpty) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">ไม่มียอดใช้ในช่วงนี้</span>;
  return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">ยังไม่ถึงจุดสั่งซื้อ</span>;
}

export default function PPEDashboard() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const companyId = isAdmin ? searchParams.get('company_id') || 'all' : user?.companyId || '';
  const isAggregate = companyId === 'all' || companyId === 'admin';
  const [endMonth, setEndMonth] = useState(() => {
    const now = new Date();
    return monthKey(now.getFullYear(), now.getMonth());
  });
  const [companyMap, setCompanyMap] = useState<Record<string, string>>({});
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('reorder');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const requestKey = `${companyId}:${endMonth}`;
  const months = useMemo(() => orderMonths(endMonth), [endMonth]);
  const companyName = isAggregate ? 'ทุกบริษัท' : companyMap[companyId] || (user?.companyId === companyId ? user.companyName : '') || companyId.toUpperCase();
  const companyQuery = new URLSearchParams({ company_id: companyId }).toString();
  const orderHref = `/ppe/reports/order?${new URLSearchParams({ company_id: companyId, period: endMonth, only_need: '1' })}`;

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetch('/api/companies', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const payload = await response.json();
      if (!controller.signal.aborted) setCompanyMap(Object.fromEntries((payload.data || []).map((company: { company_id: string; company_name: string }) => [company.company_id, company.company_name])));
    }).catch(() => {});
    return () => controller.abort();
  }, [isAdmin]);

  useEffect(() => {
    if (!companyId || isAggregate) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const { start, end } = orderDateRange(endMonth);
    const query = new URLSearchParams({ company_id: companyId });
    const txQuery = new URLSearchParams({ company_id: companyId, limit: '20000', start_date: start, end_date: end });
    async function read(path: string) {
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      const payload = await response.json();
      if (payload.error || !Object.hasOwn(payload, 'data')) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return payload.data;
    }
    Promise.all([
      read(`/api/ppe/products?${query}`), read(`/api/ppe/stock?${query}`),
      read(`/api/ppe/transactions?${txQuery}`), read(`/api/ppe/order-settings?${query}`),
    ]).then(([products, stocks, transactions, settings]) => {
      if (!Array.isArray(products) || !Array.isArray(stocks) || !Array.isArray(transactions)) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      if (!controller.signal.aborted) setData({ key: requestKey, products, stocks, transactions, settings, fetchedAt: new Date() });
    }).catch(() => {
      if (!controller.signal.aborted) setError({ key: requestKey, message: 'โหลดข้อมูลไม่สำเร็จ' });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [companyId, endMonth, requestKey, refresh, isAggregate]);

  const current = data?.key === requestKey ? data : null;
  const failed = error?.key === requestKey ? error : null;
  const busy = loading || (!current && !failed);
  const rows = useMemo(() => current ? calculateOrderRows({ products: current.products, stocks: current.stocks, transactions: current.transactions, months, leadMonths: leadTimeDays(current.settings) / 30 }) : [], [current, months]);
  const stockMap = useMemo(() => new Map(current?.stocks.map(stock => [stock.product_id, stock])), [current]);
  const unusedIds = useMemo(() => new Set(rows.filter(row => {
    const stock = stockMap.get(row.product.id);
    return row.stockOnHand === 0 && row.usage.every(quantity => quantity === 0) && (stock?.total_in ?? 0) === 0 && (stock?.total_out ?? 0) === 0;
  }).map(row => row.product.id)), [rows, stockMap]);
  // These two stock-health groups are mutually exclusive; a product is counted once.
  const emptyRows = rows.filter(row => row.stockOnHand <= 0);
  const lowRows = rows.filter(row => row.stockOnHand > 0 && row.stockOnHand < row.product.min_stock);
  const alertIds = new Set([...emptyRows, ...lowRows].map(row => row.product.id));
  const reorderCount = rows.filter(row => row.requiresOrder).length;
  const noReorderCount = rows.filter(row => !row.canReorder).length;
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'reorder', label: 'ต้องสั่งซื้อ', count: reorderCount },
    { id: 'alerts', label: 'แจ้งเตือนสต็อก', count: alertIds.size },
    { id: 'no-reorder', label: 'ไม่สั่งซื้อเพิ่ม', count: noReorderCount },
    { id: 'unused', label: 'ยังไม่เคยเคลื่อนไหว', count: unusedIds.size },
    { id: 'all', label: 'ทั้งหมด', count: rows.length },
  ];
  const filtered = rows.filter(row => {
    const matches = filter === 'all' || filter === 'reorder' && row.requiresOrder || filter === 'alerts' && alertIds.has(row.product.id) || filter === 'no-reorder' && !row.canReorder || filter === 'unused' && unusedIds.has(row.product.id);
    const term = search.trim().toLocaleLowerCase();
    return matches && (!term || row.product.name.toLocaleLowerCase().includes(term) || row.product.item_code?.toLocaleLowerCase().includes(term));
  }).sort((a, b) => Number(unusedIds.has(a.product.id)) - Number(unusedIds.has(b.product.id)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach(row => counts.set(row.product.type, (counts.get(row.product.type) || 0) + 1));
    return Array.from(counts, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }, [rows]);
  const recent = useMemo(() => current ? [...current.transactions].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 5) : [], [current]);
  function selectFilter(next: Filter) { setFilter(next); setSearch(''); setPage(1); }
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 18 }, (_, i) => monthKey(now.getFullYear(), now.getMonth() - i));
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 text-slate-800">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ภาพรวม PPE</h1><span className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-800">{companyName}</span></div>
          <p className="mt-1 text-sm text-slate-500">ตรวจสอบสต็อกและวางแผนสั่งซื้อในที่เดียว</p>
        </div>
        {!isAggregate && <div className="flex flex-wrap gap-2">
          <Link href={`/ppe/stock-in?${companyQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50"><ArrowDownToLine size={16} aria-hidden="true" />รับเข้า</Link>
          <Link href={`/ppe/stock-out?${companyQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800"><ArrowUpFromLine size={16} aria-hidden="true" />เบิกออก</Link>
          <Link href={`/ppe/inventory?${companyQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50"><Package size={16} aria-hidden="true" />จัดการสต็อก</Link>
        </div>}
      </header>

      {isAggregate ? <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-bold">เลือกบริษัทเพื่อดูภาพรวม PPE</h2><p className="mt-2 text-sm leading-6 text-slate-500">ยอดแจ้งเตือนและรายการสั่งซื้อจะคำนวณจากสต็อก การใช้งาน และระยะเวลาจัดหาของบริษัทที่เลือก</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{Object.entries(companyMap).map(([id, name]) => <Link key={id} href={`/ppe?company_id=${encodeURIComponent(id)}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-blue-800 hover:border-blue-300 hover:bg-blue-50"><span>{name}</span><ArrowRight size={16} className="shrink-0" aria-hidden="true" /></Link>)}</div><p className="mt-4 text-xs text-slate-500">สามารถเปลี่ยนบริษัทได้จากเมนูหลัก</p></section> : <>
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center">
        <label className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">ช่วงการใช้งาน</span><select aria-label="ช่วงการใช้งาน" value={endMonth} onChange={event => { setEndMonth(event.target.value); setPage(1); }} className="min-h-10 max-w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm focus:outline-blue-600">{monthOptions.map(key => <option key={key} value={key}>{monthLabelTH(orderMonths(key)[0])} – {monthLabelTH(key)}</option>)}</select><span className="text-xs text-slate-500">ยอดคงเหลือปัจจุบัน · การใช้ย้อนหลัง 3 เดือน</span></label>
        <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={13} aria-hidden="true" /><span>{busy ? 'กำลังอัปเดตข้อมูล…' : failed ? 'ยังไม่ได้รับข้อมูลล่าสุด' : `อัปเดต ${current?.fetchedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`}</span><button type="button" aria-label="อัปเดตข้อมูล" disabled={busy} onClick={() => setRefresh(value => value + 1)} className="flex size-10 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"><RefreshCw size={15} className={busy ? 'animate-spin motion-reduce:animate-none' : ''} /></button></div>
      </div>

      {busy ? <div role="status" className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-slate-500"><RefreshCw className="mx-auto mb-3 animate-spin motion-reduce:animate-none" size={24} />กำลังโหลดภาพรวม PPE…</div> : failed ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><AlertTriangle className="mx-auto mb-2 text-red-600" size={24} /><p className="font-semibold">{failed.message}</p><p className="mt-1 text-sm text-slate-600">ไม่สามารถแสดงยอดของบริษัทและช่วงเวลานี้ได้ กรุณาลองอีกครั้ง</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-4 min-h-11 rounded-lg bg-white px-5 text-sm font-semibold text-blue-700 ring-1 ring-slate-200">ลองอีกครั้ง</button></div> : <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { id: 'products', target: 'all' as Filter, label: 'รายการสินค้าที่ใช้งาน', count: rows.length, detail: 'จำนวนรายการสินค้า ไม่รวมรายการปิดใช้งาน', icon: Package, color: 'text-blue-700', bg: 'bg-blue-50' },
            { id: 'reorder', target: 'reorder' as Filter, label: 'ต้องสั่งซื้อ', count: reorderCount, detail: 'ถึงจุดสั่งซื้อ และอนุญาตให้สั่งเพิ่ม', icon: ShoppingCart, color: 'text-orange-700', bg: 'bg-orange-50' },
            { id: 'alerts', target: 'alerts' as Filter, label: 'แจ้งเตือนสต็อก', count: alertIds.size, detail: `หมด ${format(emptyRows.length)} · ต่ำแต่ยังมี ${format(lowRows.length)} รายการ`, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
            { id: 'no-reorder', target: 'no-reorder' as Filter, label: 'ไม่สั่งซื้อเพิ่ม', count: noReorderCount, detail: 'ติดตามคงเหลือและเบิกใช้ได้ตามปกติ', icon: Package, color: 'text-slate-600', bg: 'bg-slate-100' },
          ].map(card => <button key={card.id} type="button" data-testid={`dashboard-kpi-${card.id}`} onClick={() => selectFilter(card.target)} className={`group rounded-2xl border bg-white p-3.5 text-left transition hover:border-blue-300 sm:p-4 ${filter === card.target ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-1"><span className="text-xs font-medium leading-5 text-slate-600 sm:text-sm">{card.label}</span><span className={`rounded-lg p-1.5 ${card.bg} ${card.color}`}><card.icon size={17} aria-hidden="true" /></span></div><div className={`mt-1 text-3xl font-bold tabular-nums ${card.color}`}>{format(card.count)}<span className="ml-1.5 text-xs font-normal text-slate-500">รายการ</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{card.detail}</p></button>)}
        </div>

        <section aria-labelledby="action-heading" data-testid="dashboard-actions" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:px-5"><div><h2 id="action-heading" className="text-lg font-bold">รายการที่ต้องดำเนินการ</h2><p className="mt-1 text-xs leading-5 text-slate-500">ลำดับสั่งซื้อใช้เกณฑ์เดียวกับหน้าคำนวณสั่งซื้อ · ระยะเวลาจัดหา {format(leadTimeDays(current?.settings || null))} วัน</p></div><Link href={orderHref} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">ไปหน้าคำนวณสั่งซื้อ<ArrowRight size={16} aria-hidden="true" /></Link></div>
          <div className="space-y-3 px-4 py-4 sm:px-5"><select aria-label="กลุ่มรายการ" value={filter} onChange={event => selectFilter(event.target.value as Filter)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium sm:hidden">{filters.map(item => <option key={item.id} value={item.id}>{item.label} ({format(item.count)})</option>)}</select><div className="hidden flex-wrap gap-2 sm:flex" aria-label="กลุ่มรายการ">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => selectFilter(item.id)} className={`min-h-10 rounded-lg border px-3 text-xs font-medium transition sm:text-sm ${filter === item.id ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{item.label}<span className={`ml-2 rounded px-1.5 py-0.5 text-xs tabular-nums ${filter === item.id ? 'bg-white/20' : 'bg-slate-100'}`}>{format(item.count)}</span></button>)}</div>
            <div className="relative"><Search size={17} aria-hidden="true" className="absolute left-3 top-3 text-slate-400" /><input aria-label="ค้นหารายการ" placeholder="ค้นหาชื่อสินค้า / Item Code" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm outline-blue-600" /></div>
            <p className="text-xs leading-5 text-slate-500">{filter === 'alerts' ? 'นับสินค้าแต่ละรายการครั้งเดียว: สต็อกหมด หรือคงเหลือมากกว่า 0 แต่ต่ำกว่าขั้นต่ำที่ตั้งไว้ · สถานะสั่งซื้อพิจารณาแยกตามจุดสั่งซื้อ' : filter === 'unused' ? 'ไม่มีสต็อก และไม่เคยมีจำนวนรับเข้าหรือจ่ายออก แสดงไว้ท้ายรายการทั้งหมด' : filter === 'no-reorder' ? 'รายการเหล่านี้ไม่รวมในยอดต้องสั่งซื้อ แม้คงเหลือจะต่ำกว่าจุดสั่งซื้อ' : 'ต้องสั่งซื้อเมื่อคงเหลือ ≤ จุดสั่งซื้อ โดยสั่งเพิ่มได้ และไม่ใช่รายการที่คงเหลือกับการใช้ 3 เดือนเป็น 0 ทั้งหมด'}</p>
          </div>
          {pageRows.length === 0 ? <div className="border-t border-slate-100 px-4 py-10 text-center"><CheckCircle2 size={28} aria-hidden="true" className="mx-auto mb-2 text-emerald-600" /><p className="font-medium">{filter === 'reorder' && !search ? 'ไม่มีรายการต้องสั่งซื้อ' : 'ไม่พบรายการ'}</p><p className="mt-1 text-sm text-slate-500">{search ? 'ลองเปลี่ยนคำค้นหาหรือเลือกกลุ่มรายการอื่น' : 'เลือกกลุ่มอื่นเพื่อดูสถานะและยอดคงเหลือ'}</p></div> : <>
            <div className="hidden overflow-x-auto lg:block"><table className="w-full text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs text-slate-500"><tr><th scope="col" className="px-5 py-3 text-left font-medium">สินค้า</th><th scope="col" className="px-3 py-3 text-right font-medium">คงเหลือ</th><th scope="col" className="px-3 py-3 text-right font-medium">จุดสั่งซื้อ</th><th scope="col" className="px-3 py-3 text-right font-medium">ต้องสั่ง</th><th scope="col" className="px-5 py-3 text-left font-medium">สถานะสั่งซื้อ</th></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.map(row => <tr key={row.product.id} className="hover:bg-slate-50/70"><td className="max-w-sm px-5 py-3"><div className="font-medium">{row.product.name}</div><div className="mt-0.5 text-xs text-slate-500">{row.product.item_code || 'ไม่มี Item Code'} · {typeLabel(row.product.type)}</div></td><td className={`px-3 py-3 text-right tabular-nums ${row.stockOnHand <= 0 ? 'font-semibold text-red-700' : 'text-slate-800'}`}>{format(row.stockOnHand)} <span className="text-xs font-normal text-slate-500">{unitLabel(row.product.unit)}</span>{filter === 'alerts' && <div className="mt-0.5 text-xs font-normal text-slate-500">{row.stockOnHand <= 0 ? 'สต็อกหมด' : `ต่ำกว่าขั้นต่ำ ${format(row.product.min_stock)}`}</div>}</td><td className="px-3 py-3 text-right tabular-nums text-slate-600">{format(row.reorderPoint)}</td><td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.requiresOrder ? 'text-orange-700' : 'text-slate-500'}`}>{row.canReorder ? format(Math.ceil(Math.max(row.needToOrder, 0))) : '—'}</td><td className="px-5 py-3"><StockStatus row={row} unused={unusedIds.has(row.product.id)} /></td></tr>)}</tbody></table></div>
            <div className="divide-y divide-slate-100 border-t border-slate-100 lg:hidden">{pageRows.map(row => <article key={row.product.id} className="space-y-3 p-4"><div className="space-y-1.5"><h3 className="break-words text-sm font-semibold">{row.product.name}</h3><p className="text-xs text-slate-500">{row.product.item_code || 'ไม่มี Item Code'} · {typeLabel(row.product.type)}</p><StockStatus row={row} unused={unusedIds.has(row.product.id)} /></div><dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><div><dt className="text-slate-500">คงเหลือ ({unitLabel(row.product.unit)})</dt><dd className={`mt-1 text-base font-semibold tabular-nums ${row.stockOnHand <= 0 ? 'text-red-700' : ''}`}>{format(row.stockOnHand)}</dd></div><div><dt className="text-slate-500">จุดสั่งซื้อ</dt><dd className="mt-1 text-base tabular-nums">{format(row.reorderPoint)}</dd></div><div><dt className="text-slate-500">ต้องสั่ง</dt><dd className={`mt-1 text-base font-semibold tabular-nums ${row.requiresOrder ? 'text-orange-700' : 'text-slate-600'}`}>{row.canReorder ? format(Math.ceil(Math.max(row.needToOrder, 0))) : '—'}</dd></div></dl>{filter === 'alerts' && <p className="text-xs text-slate-500">{row.stockOnHand <= 0 ? 'สต็อกหมด' : `ต่ำกว่าขั้นต่ำที่ตั้งไว้ ${format(row.product.min_stock)} ${unitLabel(row.product.unit)}`}</p>}</article>)}</div>
          </>}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5"><span>หน้า {safePage} / {totalPages} · {format(filtered.length)} รายการ</span><div className="flex gap-1"><button type="button" aria-label="หน้าก่อนหน้า" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="flex size-10 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={17} /></button><button type="button" aria-label="หน้าถัดไป" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="flex size-10 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={17} /></button></div></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <section aria-labelledby="category-heading" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h2 id="category-heading" className="font-bold">จำนวนรายการสินค้า แยกตามประเภท</h2><p className="mt-1 text-xs text-slate-500">นับรายการสินค้าที่ใช้งาน · หน่วย: รายการ</p><div className="mt-5 space-y-3">{categories.length ? categories.map(item => <div key={item.type} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-xs"><span className="text-slate-600">{typeLabel(item.type)}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-blue-500" style={{ width: `${item.count / Math.max(categories[0].count, 1) * 100}%` }} /></div><span className="text-right font-semibold tabular-nums">{format(item.count)}</span></div>) : <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีรายการสินค้า</p>}</div></section>
          <section aria-labelledby="recent-heading" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 id="recent-heading" className="font-bold">ความเคลื่อนไหวล่าสุด</h2><Link href={`/ppe/history?${companyQuery}`} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-medium text-blue-700">ดูประวัติทั้งหมด<ArrowRight size={14} aria-hidden="true" /></Link></div><p className="mb-2 text-xs text-slate-500">5 รายการล่าสุดในช่วง {monthLabelTH(months[0])} – {monthLabelTH(endMonth)}</p><div className="divide-y divide-slate-100">{recent.length ? recent.map(transaction => <div key={transaction.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{transaction.ppe_products?.name || current?.products.find(product => product.id === transaction.product_id)?.name || 'รายการสินค้า'}</p><p className="mt-1 text-xs text-slate-500">{new Date(`${transaction.transaction_date.slice(0, 10)}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}{transaction.employee_name ? ` · ${transaction.employee_name}` : ''}</p></div><div className="shrink-0 text-right"><p className="text-xs text-slate-600">{TRANSACTION_TYPES.find(type => type.value === transaction.transaction_type)?.label || transaction.transaction_type}</p><p className="mt-1 text-sm font-semibold tabular-nums">{format(transaction.quantity)} <span className="text-xs font-normal text-slate-500">{unitLabel(transaction.unit || '')}</span></p></div></div>) : <p className="py-10 text-center text-sm text-slate-500">ไม่มีความเคลื่อนไหวในช่วงที่เลือก</p>}</div></section>
        </div>
      </>}
      </>}
    </div>
  );
}

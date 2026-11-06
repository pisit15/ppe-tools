'use client';
export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { FaItem } from '@/lib/first-aid/types';
import { Chip, FA_GREEN, ItemImage, Spinner, Stat, ToastView, VIZ, currentPeriod, fmtInt, shiftPeriod, useFa, useToast } from '../../_components/fa';
import { ImageField } from '../../_components/ItemForm';

export default function ImagesPage() {
  const { state, loading, refresh } = useFa();
  const { toast, setToast } = useToast();
  const [filter, setFilter] = useState<'missing' | 'done' | 'all'>('missing');
  const [q, setQ] = useState('');
  const [patch, setPatch] = useState<Record<string, Partial<FaItem>>>({});
  const ranked = useMemo(() => {
    if (!state) return [];
    const from = `${shiftPeriod(currentPeriod(), -3)}-01`; const t = new Map<string, number>();
    for (const e of state.events) if (e.kind === 'issue' && e.date >= from) t.set(e.itemId, (t.get(e.itemId) || 0) + 1);
    return state.items.map(i => ({ ...i, ...patch[i.id] })).map(i => ({ item: i, uses: t.get(i.id) || 0 })).sort((a, b) => b.uses - a.uses || a.item.name.localeCompare(b.item.name, 'th'));
  }, [state, patch]);
  if (loading || !state) return <Spinner />;
  const done = ranked.filter(r => r.item.hasImage).length;
  const list = ranked.filter(r => (filter === 'all' || (filter === 'done') === r.item.hasImage) && (!q.trim() || `${r.item.name} ${r.item.generic}`.toLowerCase().includes(q.trim().toLowerCase())));
  const search = (i: FaItem) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${i.name} ${i.generic ? i.generic.split('/')[0] : ''} ยา`.trim())}`;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Stat label="มีรูปแล้ว" value={<>{fmtInt(done)} <span className="text-base text-gray-400">/ {fmtInt(ranked.length)}</span></>} color={FA_GREEN} sub={`${ranked.length ? Math.round((done / ranked.length) * 100) : 0}%`} />
        <Stat label="ยังไม่มีรูป" value={fmtInt(ranked.length - done)} color={VIZ.secondary} sub="ใช้ไอคอนไปก่อน" />
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 text-xs text-gray-600 leading-relaxed">เรียงตามยาที่จ่ายบ่อย 3 เดือนล่าสุดก่อน · กด <b>ค้นหารูป</b> → คลิกขวารูปที่ตรงยี่ห้อ → “คัดลอกที่อยู่รูปภาพ” → วางในช่องแล้วกด <b>ใช้ลิงก์</b> หรือถ่ายรูปกล่องจริงจากมือถือ · ระบบย่อรูปเหลือ ≈ 600 px และเก็บที่มาไว้</div>
      </section>
      <section className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อยา" aria-label="ค้นหา" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 w-full max-w-xs" />
        <Chip active={filter === 'missing'} onClick={() => setFilter('missing')}>ยังไม่มีรูป {ranked.length - done}</Chip>
        <Chip active={filter === 'done'} onClick={() => setFilter('done')}>มีรูปแล้ว {done}</Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด</Chip>
      </section>
      <section className="space-y-2">
        {list.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">ไม่มีรายการ</p>}
        {list.map(({ item, uses }) => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 grid gap-3 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start">
            <div className="flex items-center gap-3">
              <ItemImage item={item} size={64} rounded={12} />
              <div className="min-w-0"><div className="font-semibold text-gray-900 truncate">{item.name}</div><div className="text-xs text-gray-500 truncate">{item.generic || item.category} · {item.unit}{uses ? ` · จ่าย ${uses} ครั้ง/3 เดือน` : ''}</div>
                <a href={search(item)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs underline" style={{ color: VIZ.primary }}><ExternalLink size={12} />ค้นหารูป</a></div>
            </div>
            <ImageField compact item={item} onChanged={next => { setPatch(p => ({ ...p, [item.id]: { ...p[item.id], ...next } })); if (next.hasImage !== undefined) setToast({ type: 'success', msg: next.hasImage ? `บันทึกรูป ${item.name} แล้ว` : `ลบรูป ${item.name} แล้ว` }); void refresh(); }} />
          </div>
        ))}
      </section>
      <ToastView toast={toast} />
    </div>
  );
}

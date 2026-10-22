'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import type { PricePoint, ProcMeta, SearchResult, VendorPriceStat } from '@/lib/procurement/types';
import { PriceChart } from './_components/PriceChart';
import {
  Card, ErrorBox, Kpi, Loading, MetaLine, PAGE_SIZE, Pager, PrLink, SortHeader, SourceBadge, VIZ, VendorLink,
  baht, inputClass, int, sortRows, thaiDate, type SortState,
  useJson,
} from './_components/ui';
import { median } from '@/lib/procurement/analysis';

type Resp = SearchResult & { meta: ProcMeta };
type VKey = 'vendor' | 'po_count' | 'quote_count' | 'last_po_price' | 'min_price' | 'median_price' | 'last_quote_price' | 'last';
type PKey = 'date' | 'vendor' | 'unit_price' | 'qty' | 'item';
const EXAMPLES = ['อบรม รถยก', 'กำจัด ขยะ', 'ตรวจวัด สภาพแวดล้อม', 'ถังดับเพลิง', 'ถุงมือ', 'อบรม ดับเพลิง'];

export default function PriceSearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') || '';
  const unit = params.get('unit') || '';
  const dup = params.get('dup') === '1';
  const [text, setText] = useState(q);

  const setParams = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v); else sp.delete(k);
    }
    router.replace(`/procurement${sp.size ? `?${sp}` : ''}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== q) setParams({ q: text.trim(), unit: '' }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const url = q ? `/api/procurement/search?${new URLSearchParams({ q, ...(unit ? { unit } : {}), ...(dup ? { dup: '1' } : {}) })}` : null;
  const { data, error, loading } = useJson<Resp>(url);
  const { data: idle } = useJson<{ meta: ProcMeta }>(q ? null : '/api/procurement/search?q=');
  const meta = data?.meta ?? idle?.meta;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xl font-bold" style={{ color: VIZ.text }}>ค้นหาราคาสินค้า / บริการ</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>ดูว่าทีม SHE เคยซื้อหรือได้ใบเสนอราคาจากผู้ขายรายใด ราคาเท่าไร — แยกคำด้วยเว้นวรรค (ต้องเจอทุกคำ)</p>
        <div className="relative mt-3">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: VIZ.neutral }} aria-hidden />
          <input type="search" value={text} onChange={e => setText(e.target.value)} autoFocus aria-label="คำค้น"
            placeholder="เช่น อบรม รถยก, กำจัด ขยะ อันตราย, ชื่อผู้ขาย หรือเลข PR" className={`${inputClass} py-3 pl-10 text-base`} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {!q && EXAMPLES.map(e => (
            <button key={e} onClick={() => setText(e)} className="rounded-full border px-3 py-1 hover:bg-white" style={{ borderColor: VIZ.muted, color: VIZ.lightText }}>{e}</button>
          ))}
          {q && (
            <label className="inline-flex items-center gap-2" style={{ color: VIZ.lightText }}>
              <input type="checkbox" checked={dup} onChange={e => setParams({ dup: e.target.checked ? '1' : '' })} />
              รวมใบเสนอราคาที่แนบซ้ำใน PR อื่น
            </label>
          )}
        </div>
        <div className="mt-2"><MetaLine meta={meta} /></div>
      </section>

      {error && <ErrorBox error={error} />}
      {loading && <Loading text="กำลังค้นหา…" />}
      {data && !data.points.length && <Card><p className="text-sm" style={{ color: VIZ.lightText }}>ไม่พบรายการที่ตรงกับ “{q}” — ลองใช้คำที่สั้นลง หรือแยกคำด้วยเว้นวรรค</p></Card>}
      {data && data.points.length > 0 && <Results key={`${q}|${unit}|${dup}`} data={data} unit={unit} onUnit={u => setParams({ unit: u })} />}
    </div>
  );
}

function Results({ data, unit, onUnit }: { data: Resp; unit: string; onUnit: (u: string) => void }) {
  const po = data.points.filter(p => p.source === 'po');
  const lastPo = po[0];
  const poPrices = po.map(p => p.unit_price);
  const multiUnit = data.units.length > 1;
  return (
    <>
      {data.relaxed && <p className="text-sm" style={{ color: VIZ.secondary }}>ไม่พบคำนี้ตรงตัว จึงแสดงรายการที่มีคำย่อยครบ — ลองเว้นวรรคระหว่างคำเพื่อผลที่แม่นขึ้น</p>}
      {multiUnit && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: VIZ.lightText }}>หน่วย:</span>
          <button onClick={() => onUnit('')} className="rounded-full px-3 py-1" style={!unit ? { background: VIZ.primary, color: 'white' } : { border: `1px solid ${VIZ.muted}` }}>ทั้งหมด</button>
          {data.units.slice(0, 12).map(u => (
            <button key={u.unit} onClick={() => onUnit(u.unit)} className="rounded-full px-3 py-1" style={unit === u.unit ? { background: VIZ.primary, color: 'white' } : { border: `1px solid ${VIZ.muted}` }}>
              {u.unit} <span className="opacity-70">({u.count})</span>
            </button>
          ))}
          {!unit && <span className="text-xs" style={{ color: VIZ.secondary }}>มีหลายหน่วย — เลือกหน่วยเดียวก่อนเทียบราคา</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ราคาจ่ายจริงล่าสุด" value={lastPo ? baht(lastPo.unit_price) : '–'} sub={lastPo ? `${thaiDate(lastPo.date)} · ${lastPo.vendor}` : 'ยังไม่เคยออก PO'} />
        <Kpi label="ราคาจ่ายจริง ต่ำสุด / มัธยฐาน" value={poPrices.length ? `${baht(Math.min(...poPrices))} / ${baht(median(poPrices))}` : '–'} sub={`${int(po.length)} รายการ PO`} color={VIZ.positive} />
        <Kpi label="ใบเสนอราคา" value={int(data.points.length - po.length)} sub="รายการที่ผู้ขายเสนอ" color={VIZ.secondary} />
        <Kpi label="ผู้ขาย" value={int(data.vendors.length)} sub="ที่เกี่ยวข้องกับคำค้นนี้" color={VIZ.text} />
      </div>
      <Card>
        <h3 className="mb-2 font-semibold">ราคาต่อหน่วยตามช่วงเวลา</h3>
        <PriceChart points={data.points} />
        <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>คลิกจุดเพื่อเปิด PR · ราคาอาจต่างกันเพราะขอบเขตงาน จำนวน หรือเงื่อนไข (เช่น รวมอาหาร/ค่าขนส่ง) — ดูรายละเอียดก่อนสรุป</p>
      </Card>
      <VendorTable vendors={data.vendors} />
      <PointTable points={data.points} truncated={data.truncated} />
    </>
  );
}

function VendorTable({ vendors }: { vendors: VendorPriceStat[] }) {
  const [sort, setSort] = useState<SortState<VKey>>({ key: 'po_count', dir: 'desc' });
  const rows = useMemo(() => sortRows(vendors, sort, (v, k) => k === 'last' ? (v.last_po_date || v.last_quote_date) : v[k]), [vendors, sort]);
  const best = Math.min(...vendors.map(v => v.median_price));
  return (
    <Card className="!p-0 overflow-hidden">
      <h3 className="px-4 pt-4 font-semibold md:px-6">เทียบผู้ขาย</h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-sm">
          <thead style={{ background: VIZ.bg }}>
            <tr>
              <SortHeader label="ผู้ขาย" k="vendor" sort={sort} onSort={setSort} />
              <SortHeader label="ครั้งที่ซื้อ" k="po_count" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ราคา PO ล่าสุด" k="last_po_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ครั้งที่เสนอ" k="quote_count" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ราคาเสนอล่าสุด" k="last_quote_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ต่ำสุด" k="min_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="มัธยฐาน" k="median_price" sort={sort} onSort={setSort} align="right" />
              <SortHeader label="ล่าสุด" k="last" sort={sort} onSort={setSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.vendor} className="border-t border-gray-100">
                <td className="px-3 py-2"><VendorLink name={v.vendor} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.po_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(v.last_po_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{int(v.quote_count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(v.last_quote_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(v.min_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium" style={v.median_price === best && vendors.length > 1 ? { color: VIZ.positive } : undefined}>{baht(v.median_price)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{thaiDate(v.last_po_date && v.last_quote_date ? (v.last_po_date > v.last_quote_date ? v.last_po_date : v.last_quote_date) : v.last_po_date || v.last_quote_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-4 pt-2 text-xs md:px-6" style={{ color: VIZ.lightText }}>สีเขียว = มัธยฐานต่ำที่สุดในกลุ่ม · ราคาต่ำสุดไม่ได้แปลว่าดีที่สุด ให้ดูใบอนุญาต/คุณสมบัติผู้ขายประกอบ</p>
    </Card>
  );
}

function PointTable({ points, truncated }: { points: PricePoint[]; truncated: boolean }) {
  const [sort, setSort] = useState<SortState<PKey>>({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(0);
  const rows = useMemo(() => sortRows(points, sort, (p, k) => p[k]), [points, sort]);
  const view = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <Card className="!p-0 overflow-hidden">
      <h3 className="px-4 pt-4 font-semibold md:px-6">รายการทั้งหมด</h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-sm">
          <thead style={{ background: VIZ.bg }}>
            <tr>
              <SortHeader label="วันที่" k="date" sort={sort} onSort={s => { setSort(s); setPage(0); }} />
              <th className="px-3 py-2 text-left font-semibold">ประเภท</th>
              <SortHeader label="รายการ" k="item" sort={sort} onSort={s => { setSort(s); setPage(0); }} />
              <SortHeader label="ผู้ขาย" k="vendor" sort={sort} onSort={s => { setSort(s); setPage(0); }} />
              <SortHeader label="จำนวน" k="qty" sort={sort} onSort={s => { setSort(s); setPage(0); }} align="right" />
              <SortHeader label="ราคา/หน่วย" k="unit_price" sort={sort} onSort={s => { setSort(s); setPage(0); }} align="right" />
              <th className="px-3 py-2 text-left font-semibold">อ้างอิง</th>
            </tr>
          </thead>
          <tbody>
            {view.map(p => (
              <tr key={`${p.source}${p.id}`} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{thaiDate(p.date)}</td>
                <td className="px-3 py-2"><SourceBadge source={p.source} /></td>
                <td className="px-3 py-2 min-w-[16rem]">
                  <p className="line-clamp-3" title={p.item}>{p.item}</p>
                  {p.detail && p.detail !== p.item && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.detail}</p>}
                </td>
                <td className="px-3 py-2 min-w-[10rem]"><VendorLink name={p.vendor} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{p.qty === null ? '–' : int(p.qty)} {p.unit}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{baht(p.unit_price)}</td>
                <td className="px-3 py-2 whitespace-nowrap"><PrLink no={p.pr_no} by={p.requester} />{p.ref && <p className="text-xs" style={{ color: VIZ.lightText }}>{p.ref}</p>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-4 md:px-6">
        <Pager page={page} total={rows.length} onPage={setPage} />
        {truncated && <p className="pt-2 text-xs" style={{ color: VIZ.secondary }}>แสดง 600 รายการล่าสุด — พิมพ์คำค้นให้เจาะจงขึ้นเพื่อดูครบ</p>}
      </div>
    </Card>
  );
}

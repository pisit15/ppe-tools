'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import type { FaIcon, FaLocation } from '@/lib/first-aid/types';
import { FA_GREEN, ItemImage, VIZ, btnPrimary, btnSecondary } from '../../../_components/fa';

type Poster = { loc: FaLocation; url: string; svg: string; company: string; items: { name: string; unit: string; icon: FaIcon; imageUrl: string | null; description: string }[] };

const STEPS = [
  { n: 1, title: 'สแกน QR', text: 'เปิดกล้องมือถือ ส่องที่ QR นี้ ไม่ต้องล็อกอิน', icon: <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="7" y="7" width="4" height="4" /><rect x="13" y="7" width="4" height="4" /><rect x="7" y="13" width="4" height="4" /><path d="M13 13h4v4" /></svg> },
  { n: 2, title: 'แตะ + ที่ของที่หยิบ', text: 'เลือกจากรูป หรือกดอาการ เช่น "แผล" "ปวดหัว"', icon: <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></svg> },
  { n: 3, title: 'กดบันทึก', text: 'ใส่ชื่อหรือไม่ก็ได้ ใช้เวลา 20 วินาที', icon: <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg> },
];
const TIPS = [
  { t: 'แผลถลอก / บาดเล็ก', d: 'ล้างด้วยน้ำสะอาดหรือ NSS → ทา Betadine → ปิดพลาสเตอร์หรือผ้าก๊อซ' },
  { t: 'น้ำร้อนลวก / ไฟไหม้', d: 'ราดน้ำสะอาดไหลผ่าน 10–20 นาที ห้ามเจาะตุ่มพอง ปิดผ้าก๊อซสะอาด' },
  { t: 'ปวดหัว / ไข้ / ปวดเมื่อย', d: 'พักและดื่มน้ำ รับยาที่ห้องพยาบาล บอกพยาบาลถ้ามีโรคประจำตัว/แพ้ยา' },
  { t: 'เลือดไม่หยุด · หมดสติ · หายใจลำบาก', d: 'แจ้งหัวหน้างานและห้องพยาบาลทันที ห้ามเคลื่อนย้ายผู้บาดเจ็บถ้าไม่จำเป็น', danger: true },
];

export default function PosterPage() {
  const [data, setData] = useState<Poster | null | 'missing'>(null);
  useEffect(() => { const t = setTimeout(() => { try { const raw = window.sessionStorage.getItem('fa.poster'); setData(raw ? (JSON.parse(raw) as Poster) : 'missing'); } catch { setData('missing'); } }, 0); return () => clearTimeout(t); }, []);
  if (data === 'missing') return <div className="p-8 text-sm text-gray-600">ไม่พบข้อมูลโปสเตอร์ — กลับไปที่ ตั้งค่า → สร้าง QR → เปิดโปสเตอร์ A4</div>;
  if (!data) return null;
  const { loc, svg, company, items } = data;
  return (
    <div className="min-h-screen bg-gray-200 print:bg-white print:min-h-0">
      <style>{`@page{size:A4 portrait;margin:0}@media print{body{background:#fff}.no-print{display:none!important}}`}</style>
      <div className="no-print flex items-center justify-center gap-3 py-4 text-sm text-gray-600">ตรวจดูแล้วกดพิมพ์ (A4 แนวตั้ง · ปิด header/footer ของเบราว์เซอร์) <button type="button" className={btnPrimary} style={{ background: FA_GREEN }} onClick={() => window.print()}>พิมพ์</button><button type="button" className={btnSecondary} onClick={() => window.close()}>ปิด</button></div>
      <article className="mx-auto bg-white shadow-xl print:shadow-none flex flex-col" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', padding: '12mm 12mm 10mm', fontFamily: "'Noto Sans Thai', Tahoma, sans-serif", color: VIZ.text }}>
        <header className="flex items-end justify-between gap-4 rounded-2xl px-6 py-4 text-white" style={{ background: FA_GREEN }}>
          <div><div className="text-sm opacity-85 tracking-wide">{loc.type.toUpperCase()} · {company}</div><h1 className="text-3xl font-bold leading-tight mt-0.5">{loc.name}</h1>{loc.area && <div className="text-sm opacity-85 mt-0.5">{loc.area}</div>}</div>
          <div className="text-right"><div className="text-xl font-semibold">หยิบของแล้ว สแกนบันทึก</div><div className="text-sm opacity-85">ไม่ต้องล็อกอิน · 20 วินาที</div></div>
        </header>

        <section className="grid gap-5 mt-5" style={{ gridTemplateColumns: '78mm 1fr' }}>
          <div className="rounded-2xl border-4 p-3 flex items-center justify-center [&_svg]:w-full [&_svg]:h-auto" style={{ borderColor: FA_GREEN }} dangerouslySetInnerHTML={{ __html: svg }} />
          <ol className="flex flex-col justify-center gap-3">
            {STEPS.map(s => (
              <li key={s.n} className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white text-xl font-bold" style={{ background: FA_GREEN }}>{s.n}</span>
                <span style={{ color: FA_GREEN }}>{s.icon}</span>
                <span><span className="block text-lg font-semibold leading-tight">{s.title}</span><span className="block text-sm text-gray-600">{s.text}</span></span>
              </li>
            ))}
          </ol>
        </section>

        {items.length > 0 && (
          <section className="mt-5">
            <h2 className="text-base font-semibold mb-2" style={{ color: FA_GREEN }}>ของที่มีในตู้นี้</h2>
            <div className="grid grid-cols-6 gap-2">
              {items.map(i => <div key={i.name} className="rounded-xl border border-gray-200 p-1.5 text-center"><ItemImage item={i} size="100%" rounded={8} /><div className="text-[11px] font-medium leading-tight mt-1 truncate">{i.name}</div>{i.description && <div className="text-[10px] text-gray-500 truncate">{i.description}</div>}</div>)}
            </div>
          </section>
        )}

        <section className="mt-5">
          <h2 className="text-base font-semibold mb-2" style={{ color: FA_GREEN }}>ปฐมพยาบาลเบื้องต้น</h2>
          <div className="grid grid-cols-2 gap-2">
            {TIPS.map(t => <div key={t.t} className="rounded-xl border px-3 py-2" style={{ borderColor: t.danger ? VIZ.accent : '#E5E7EB', background: t.danger ? `${VIZ.accent}0F` : '#fff' }}><div className="text-sm font-semibold" style={{ color: t.danger ? VIZ.accent : VIZ.text }}>{t.t}</div><div className="text-xs text-gray-600 leading-snug mt-0.5">{t.d}</div></div>)}
          </div>
        </section>

        <footer className="mt-auto flex items-center justify-between gap-4 border-t border-gray-200 pt-3 text-xs text-gray-600">
          <div>ของหมด / หมดอายุ / ตู้ชำรุด → ติ๊ก <b>“แจ้ง จป.”</b> ในหน้าสแกน หรือแจ้งทีม SHE · ใช้ของแล้วกรุณาบันทึก เพื่อให้มีของพร้อมใช้เสมอ</div>
          <div className="shrink-0 text-right"><div className="font-semibold" style={{ color: FA_GREEN }}>EA SHE Tools · First Aid</div><div>tools.eashe.org</div></div>
        </footer>
      </article>
    </div>
  );
}

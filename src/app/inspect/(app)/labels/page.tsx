'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import type { InspAssetView } from '@/lib/inspect/types';
import { CategoryIcon } from '../../_components/icons';
import { Skeleton, VIZ, btnPrimary, btnSecondary, errMsg, getJson, selectCompact, useCompany } from '../../_components/ui';

type Size = 'small' | 'medium' | 'large';
const SIZES: Record<Size, { label: string; w: number; h: number; qr: number; cols: number; per: string }> = {
  small: { label: 'เล็ก 40×55 มม. (35 ดวง/A4)', w: 40, h: 55, qr: 28, cols: 5, per: '35' },
  medium: { label: 'กลาง 60×80 มม. (12 ดวง/A4)', w: 60, h: 80, qr: 44, cols: 3, per: '12' },
  large: { label: 'ใหญ่ 90×120 มม. (4 ดวง/A4)', w: 90, h: 120, qr: 68, cols: 2, per: '4' },
};

export default function LabelsPage() {
  return <Suspense fallback={<Skeleton className="h-64 m-6" />}><Inner /></Suspense>;
}

function Inner() {
  const { company, companyName } = useCompany();
  const sp = useSearchParams();
  const ids = useMemo(() => (sp.get('ids') || '').split(',').filter(Boolean), [sp]);
  const [assets, setAssets] = useState<InspAssetView[] | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [size, setSize] = useState<Size>('medium');
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    getJson<{ data: InspAssetView[] }>(`/api/inspect/assets?company=${encodeURIComponent(company)}&all=1`)
      .then(r => { const want = new Set(ids); setAssets(r.data.filter(a => want.has(a.id))); })
      .catch(e => setError(errMsg(e)));
  }, [company, ids]);

  useEffect(() => {
    if (!assets || !origin) return;
    let live = true;
    import('qrcode').then(async q => {
      const out: Record<string, string> = {};
      for (const a of assets) out[a.id] = await q.toDataURL(`${origin}/inspect/i/${a.qr_token}`, { width: 320, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#FFFFFF' } });
      if (live) setQrs(out);
    });
    return () => { live = false; };
  }, [assets, origin]);

  const s = SIZES[size];
  return (
    <div>
      <div className="no-print max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3">
        <div><Link href="/inspect/assets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={16} />ทะเบียนอุปกรณ์</Link><h1 className="text-xl font-semibold text-gray-900 mt-1">พิมพ์ป้าย QR — {assets?.length ?? '…'} ดวง</h1><p className="text-sm text-gray-500">พิมพ์บนสติกเกอร์กันน้ำ หรือกระดาษแล้วเคลือบ · ตั้งค่าเครื่องพิมพ์เป็น A4 ไม่ย่อขนาด (100%)</p></div>
        <div className="flex items-center gap-2">
          <select className={selectCompact} value={size} onChange={e => setSize(e.target.value as Size)} aria-label="ขนาดป้าย">{(Object.keys(SIZES) as Size[]).map(k => <option key={k} value={k}>{SIZES[k].label}</option>)}</select>
          <Link href="/inspect/assets" className={btnSecondary}>กลับ</Link>
          <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={() => window.print()} disabled={!assets || Object.keys(qrs).length < (assets?.length || 0)}><Printer size={16} />พิมพ์</button>
        </div>
      </div>
      {error && <p className="no-print text-center text-sm" style={{ color: VIZ.accent }}>{error}</p>}
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        .label-sheet { display: grid; grid-template-columns: repeat(${s.cols}, ${s.w}mm); gap: 3mm; justify-content: center; }
        .label { width: ${s.w}mm; height: ${s.h}mm; border: 0.3mm dashed #CBD5E1; border-radius: 2mm; padding: 2mm; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: #fff; page-break-inside: avoid; break-inside: avoid; overflow: hidden; font-family: 'Segoe UI','Noto Sans Thai','Sarabun',Tahoma,sans-serif; }
        .label .code { font-weight: 700; color: #111827; line-height: 1.1; text-align: center; word-break: break-all; }
        .label .meta { color: #4B5563; text-align: center; line-height: 1.2; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .label .cat { display: inline-flex; align-items: center; gap: 1mm; font-weight: 600; }
        .label .foot { color: #9CA3AF; }
        @media print { body { background: #fff; } .label-sheet { gap: 0; } .label { border-color: #E5E7EB; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      `}</style>
      <div className="px-4 pb-10">
        {!assets ? <Skeleton className="h-64 max-w-3xl mx-auto" /> : assets.length === 0 ? <p className="text-center text-gray-500 py-10">ไม่พบอุปกรณ์ที่เลือก</p> : (
          <div className="label-sheet mx-auto bg-white sm:p-4 sm:shadow-sm sm:rounded-xl" style={{ maxWidth: '210mm' }}>
            {assets.map(a => (
              <div key={a.id} className="label">
                <div className="cat" style={{ color: a.category.color, fontSize: size === 'small' ? '2.4mm' : size === 'medium' ? '3mm' : '4mm' }}><CategoryIcon name={a.category.icon} size={size === 'small' ? 9 : size === 'medium' ? 12 : 16} />{a.category.name}</div>
                <div className="code" style={{ fontSize: size === 'small' ? '3.6mm' : size === 'medium' ? '5.2mm' : '7.5mm' }}>{a.code}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qrs[a.id] ? <img src={qrs[a.id]} alt="" style={{ width: `${s.qr}mm`, height: `${s.qr}mm` }} /> : <div style={{ width: `${s.qr}mm`, height: `${s.qr}mm`, background: '#F3F4F6' }} />}
                <div className="meta" style={{ fontSize: size === 'small' ? '2.2mm' : size === 'medium' ? '2.8mm' : '3.6mm' }}>{[a.department, a.location].filter(Boolean).join(' · ') || companyName}</div>
                <div className="foot" style={{ fontSize: size === 'small' ? '1.9mm' : '2.4mm' }}>สแกนเพื่อบันทึกผลตรวจ · EA SHE</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer, ScanLine, ShieldCheck, DoorOpen } from 'lucide-react';
import { useQr } from '../../../_components/useQr';
import { FetchError, getJson } from '../../../_components/ui';

type LinkInfo = { company: { id: string; name: string }; label: string };
type ThemeKey = 'blue' | 'green' | 'sunset' | 'night';
type Theme = { name: string; bg: string; accent: string; accent2: string; ink: string; onDark: boolean };

// Poster palettes: EA green plus VIZ blue/orange. Each prints edge-to-edge with print-color-adjust.
const THEMES: Record<ThemeKey, Theme> = {
  blue: { name: 'น้ำเงิน (EA Tools)', bg: 'linear-gradient(160deg,#1F4E79 0%,#4E79A7 55%,#86B3D9 100%)', accent: '#F28E2B', accent2: '#FFFFFF', ink: '#FFFFFF', onDark: true },
  green: { name: 'เขียว (EA)', bg: 'linear-gradient(160deg,#0F3D2E 0%,#176448 50%,#59A14F 100%)', accent: '#F2C94C', accent2: '#FFFFFF', ink: '#FFFFFF', onDark: true },
  sunset: { name: 'ส้มอุ่น', bg: 'linear-gradient(160deg,#B4412E 0%,#F28E2B 60%,#FFD08A 100%)', accent: '#1F2937', accent2: '#FFFFFF', ink: '#FFFFFF', onDark: true },
  night: { name: 'ขาวสะอาด', bg: 'linear-gradient(160deg,#FFFFFF 0%,#EEF3F8 100%)', accent: '#4E79A7', accent2: '#E15759', ink: '#1F2937', onDark: false },
};

export default function PosterPage() {
  const { token } = useParams<{ token: string }>();
  const sp = useSearchParams();
  const initial = (sp.get('theme') as ThemeKey | null) && THEMES[sp.get('theme') as ThemeKey] ? (sp.get('theme') as ThemeKey) : 'blue';
  const [theme, setTheme] = useState<ThemeKey>(initial);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [error, setError] = useState('');
  const [contact, setContact] = useState('');
  const url = typeof window !== 'undefined' ? `${window.location.origin}/visitor/request/${token}` : '';
  const qr = useQr(url, 720);

  useEffect(() => {
    getJson<LinkInfo>(`/api/visitor/public/link/${encodeURIComponent(token)}`).then(setLink)
      .catch((e: unknown) => setError(e instanceof FetchError ? e.message : 'โหลดลิงก์ไม่สำเร็จ'));
  }, [token]);

  const t = THEMES[theme];
  const soft = t.onDark ? 'rgba(255,255,255,0.14)' : 'rgba(78,121,167,0.10)';
  const sub = t.onDark ? 'rgba(255,255,255,0.82)' : '#4B5563';
  const shortUrl = url.replace(/^https?:\/\//, '');

  return (
    <div className="poster-root">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .poster-root { padding: 0 !important; background: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; transform: none !important; width: 210mm !important; height: 297mm !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .sheet { width: 210mm; height: 297mm; position: relative; overflow: hidden; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,.18); border-radius: 6px; font-family: 'Segoe UI', 'Noto Sans Thai', 'Sarabun', Tahoma, sans-serif; }
        .blob { position: absolute; border-radius: 9999px; }
        .stripes { position: absolute; inset: 0; background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.06) 0 14px, transparent 14px 44px); pointer-events: none; }
      `}</style>

      <div className="no-print max-w-4xl mx-auto mb-5 flex flex-wrap items-center gap-3 px-4">
        <Link href="/visitor/settings" className="inline-flex items-center gap-1 text-sm text-gray-600"><ArrowLeft size={14} />กลับ</Link>
        <span className="text-sm text-gray-500">ธีม:</span>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {(Object.keys(THEMES) as ThemeKey[]).map(k => (
            <button key={k} type="button" onClick={() => setTheme(k)} className={`px-3 py-1.5 rounded-md text-sm ${theme === k ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle" style={{ background: THEMES[k].bg }} />{THEMES[k].name}
            </button>
          ))}
        </div>
        <input value={contact} onChange={e => setContact(e.target.value)} placeholder="ติดต่อทีม SHE (เบอร์/ชื่อ) — แสดงท้ายโปสเตอร์" maxLength={80}
          className="flex-1 min-w-60 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white" />
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white text-sm font-medium" style={{ background: '#4E79A7' }}><Printer size={16} />พิมพ์ / บันทึก PDF</button>
      </div>
      {error && <p className="no-print text-center text-sm mb-4" style={{ color: '#E15759' }}>{error}</p>}

      <div className="sheet" style={{ background: t.bg, color: t.ink }}>
        <div className="blob" style={{ width: 520, height: 520, right: -180, top: -200, background: soft }} />
        <div className="blob" style={{ width: 380, height: 380, left: -160, bottom: 120, background: soft }} />
        <div className="blob" style={{ width: 160, height: 160, right: 60, bottom: 230, background: t.accent, opacity: .35 }} />
        {t.onDark && <div className="stripes" />}

        <div style={{ position: 'relative', padding: '16mm 16mm 12mm', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'white', borderRadius: 12, padding: '6px 10px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ea-logo.svg" alt="EA" width={56} height={46} />
              </div>
              <div>
                <div style={{ fontSize: 13, letterSpacing: '.18em', opacity: .85 }}>EA SHE TOOLS · VISITOR ACCESS</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{link?.company.name || '…'}</div>
              </div>
            </div>
            {link?.label && <div style={{ fontSize: 12, padding: '6px 12px', borderRadius: 999, background: soft, border: `1px solid ${t.onDark ? 'rgba(255,255,255,.35)' : '#CBD5E1'}` }}>{link.label}</div>}
          </header>

          <div style={{ marginTop: 26 }}>
            <h1 style={{ fontSize: 40, lineHeight: 1.15, fontWeight: 800, margin: 0 }}>แจ้งขออนุญาต<br />บุคคลภายนอกเข้าพื้นที่</h1>
            <p style={{ fontSize: 16, marginTop: 10, color: sub }}>Contractor · Supplier · Transportation · Visitor<br />สแกนเพื่อกรอกแบบฟอร์มล่วงหน้า — ไม่ต้องเข้าสู่ระบบ</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center', marginTop: 24, flex: 1 }}>
            <div style={{ background: 'white', borderRadius: 24, padding: 18, boxShadow: '0 16px 40px rgba(0,0,0,.18)', textAlign: 'center', color: '#1F2937' }}>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code ลิงก์แบบฟอร์ม" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
              ) : <div style={{ aspectRatio: '1 / 1', background: '#EEE', borderRadius: 12 }} />}
              <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><ScanLine size={20} />สแกนเพื่อกรอกแบบฟอร์ม</div>
              <div style={{ marginTop: 4, fontSize: 11, color: '#6B7280', wordBreak: 'break-all' }}>{shortUrl}</div>
            </div>

            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 16 }}>
              {[
                { icon: ScanLine, title: 'สแกนแล้วกรอกข้อมูล', text: 'ชื่อผู้แจ้ง บริษัทผู้มาติดต่อ รายชื่อรายคน วัน-เวลา และพื้นที่ปฏิบัติงาน แจ้งล่วงหน้าอย่างน้อย 1 วัน' },
                { icon: ShieldCheck, title: 'ทีม SHE คัดกรอง-อนุมัติ', text: 'ติดตามสถานะและเงื่อนไข (PPE / Permit to Work) จากลิงก์ที่ได้รับหลังส่งคำขอ' },
                { icon: DoorOpen, title: 'วันเข้าพื้นที่', text: 'รปภ ตรวจรายชื่อที่อนุมัติแล้วจากจอที่ป้อม และบันทึกเวลาเข้า-ออกรายคน' },
              ].map((s, i) => (
                <li key={s.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ flex: 'none', width: 44, height: 44, borderRadius: 14, background: t.accent, color: t.onDark && theme !== 'sunset' ? '#1F2937' : '#FFFFFF', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><s.icon size={16} />{s.title}</div>
                    <div style={{ fontSize: 13, color: sub, marginTop: 2, lineHeight: 1.5 }}>{s.text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <footer style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${t.onDark ? 'rgba(255,255,255,.35)' : '#CBD5E1'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, fontSize: 12, color: sub }}>
            <div>
              <div style={{ fontWeight: 700, color: t.ink }}>สำหรับพนักงาน {link?.company.name || ''} ที่ได้รับมอบหมายเท่านั้น</div>
              <div>กรุณาอย่าเผยแพร่ QR / ลิงก์นี้ให้บุคคลภายนอก · ลิงก์ยกเลิกได้โดยทีม SHE</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {contact && <div style={{ fontWeight: 700, color: t.ink }}>ติดต่อ SHE: {contact}</div>}
              <div>tools.eashe.org · Safety, Health &amp; Environment</div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

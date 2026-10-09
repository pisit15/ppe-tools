'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, ArrowLeft, FileText } from 'lucide-react';
import type { ChemCompanySettings, ChemSubstance } from '@/lib/types';
import { ghsPictogram, hText, pText } from '@/lib/chemical/ghs';
import { storageClassDef } from '@/lib/chemical/storage-classes';
import { GROUP_COLORS } from '../../components/ui';

/**
 * โปสเตอร์สรุป SDS ขนาด A4 (1 แผ่น/สาร) — พิมพ์หรือบันทึก PDF ด้วย window.print()
 * เหตุผลที่ไม่ใช้ jsPDF: ฟอนต์ไทยใน jsPDF ต้องฝัง TTF หลาย MB และตัดคำไทยไม่ดี
 * การพิมพ์จากเบราว์เซอร์ให้ผลสวยกว่าและใช้ฟอนต์ไทยของเครื่องได้ทันที
 */
export default function SdsPosterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<ChemSubstance | null>(null);
  const [cfg, setCfg] = useState<ChemCompanySettings | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/chemical/substances/${id}`).then(r => r.json()).then(d => { if (d.error) setErr(d.error); else setS(d.data); }).catch(() => setErr('โหลดข้อมูลไม่สำเร็จ'));
  }, [id]);
  // เบอร์ฉุกเฉินรายบริษัท (ตั้งค่าที่ /chemical/settings)
  useEffect(() => {
    if (!s?.company_id) return;
    fetch(`/api/chemical/settings?company_id=${s.company_id}`).then(r => r.json()).then(d => setCfg(d.data || null)).catch(() => setCfg(null));
  }, [s?.company_id]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!s) return <p className="text-sm text-gray-500">กำลังโหลด…</p>;

  const danger = s.signal_word === 'Danger';
  const headerBg = danger ? 'linear-gradient(135deg,#7f1d1d,#dc2626)' : s.signal_word === 'Warning' ? 'linear-gradient(135deg,#9a3412,#f97316)' : 'linear-gradient(135deg,#312e81,#4f46e5)';
  const cls = storageClassDef(s.storage_class);
  const clsCol = cls ? GROUP_COLORS[cls.group] : null;
  const hs = s.h_codes.map(c => ({ code: c, text: hText(c) }));
  const ps = s.p_codes.slice(0, 10).map(c => ({ code: c, text: pText(c) }));
  const printed = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const revision = s.sds_revision_date ? new Date(s.sds_revision_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  // บรรทัดฉุกเฉิน: เบอร์ของบริษัท (ตั้งค่าเอง) → ถ้าไม่มี ใช้เบอร์ผู้ผลิตจาก SDS → ถ้าไม่มีอีก "ตามแผนฉุกเฉินของบริษัท"; ซ่อนทั้งบรรทัดได้จากการตั้งค่า
  const showEmergency = cfg ? cfg.show_emergency : true;
  const companyContacts = (cfg?.emergency_contacts || []).filter(c => c.label || c.phone);
  const emergencyLine = companyContacts.length
    ? companyContacts.map(c => [c.label, c.phone].filter(Boolean).join(' ')).join(' · ')
    : (s.emergency_contact || 'ตามแผนฉุกเฉินของบริษัท');
  const supplierLine = companyContacts.length && s.emergency_contact ? `ผู้ผลิต: ${s.emergency_contact}` : '';

  return (
    <div className="poster-root">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          aside, .no-print { display: none !important; }
          main > div { padding: 0 !important; }
          body { background: #fff; }
          .poster { box-shadow: none !important; margin: 0 !important; width: 194mm !important; min-height: 0 !important; }
        }
        .poster { width: 210mm; min-height: 297mm; background: #fff; margin: 0 auto; box-shadow: 0 10px 40px rgba(0,0,0,.15); color: #111; font-size: 11.5px; line-height: 1.45; display: flex; flex-direction: column; }
        .poster h2 { font-size: 12px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 6px; }
        .poster .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; }
        .poster .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; margin: 2px 4px 2px 0; }
      `}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-purple-700"><ArrowLeft size={16} /> กลับ</button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">พิมพ์แล้วเลือก "Save as PDF" เพื่อบันทึกเป็นไฟล์ · ตั้งค่า A4 แนวตั้ง</span>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700"><Printer size={16} /> พิมพ์ / บันทึก PDF</button>
        </div>
      </div>

      <article className="poster">
        {/* Header */}
        <header style={{ background: headerBg, color: '#fff', padding: '14px 18px', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, opacity: .85, letterSpacing: '.08em' }}>ข้อมูลความปลอดภัยสารเคมี · CHEMICAL SAFETY SUMMARY</div>
              <h1 style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.15, margin: '4px 0 2px' }}>{s.name}</h1>
              <div style={{ fontSize: 12, opacity: .9 }}>
                {[s.chemical_name, s.cas_no && `CAS ${s.cas_no}`, s.un_no && `UN ${s.un_no}`, s.supplier].filter(Boolean).join('  ·  ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {s.signal_word && s.signal_word !== 'None' && (
                <div style={{ background: '#fff', color: danger ? '#b91c1c' : '#b45309', fontWeight: 900, fontSize: 18, padding: '4px 14px', borderRadius: 8, display: 'inline-block' }}>
                  {danger ? 'อันตราย' : 'ระวัง'}<div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em' }}>{s.signal_word.toUpperCase()}</div>
                </div>
              )}
              <div style={{ fontSize: 10, opacity: .85, marginTop: 6 }}>{s.company_id.toUpperCase()}{s.chem_storage_areas?.name ? ` · ${s.chem_storage_areas.name}` : ''}{s.storage_location ? ` · ${s.storage_location}` : ''}</div>
            </div>
          </div>
        </header>

        <div style={{ padding: '12px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {/* Pictograms + storage class */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <div className="box" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {s.ghs_pictograms.length === 0 && <span style={{ color: '#6b7280' }}>ไม่มีสัญลักษณ์ GHS ที่ระบุ</span>}
              {s.ghs_pictograms.map(c => {
                const p = ghsPictogram(c); if (!p) return null;
                return (
                  <div key={c} style={{ textAlign: 'center', width: 78 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.file} alt={p.nameTh} width={64} height={64} style={{ display: 'block', margin: '0 auto' }} />
                    <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{p.nameTh}</div>
                  </div>
                );
              })}
            </div>
            <div className="box" style={{ width: 200, background: clsCol?.bg || '#f9fafb' }}>
              <h2 style={{ borderColor: 'rgba(0,0,0,.1)' }}>ประเภทการจัดเก็บ (กรอ.)</h2>
              {cls ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 900, color: clsCol?.fg }}>{cls.code}</div>
                  <div style={{ fontWeight: 700, color: clsCol?.fg }}>{cls.nameTh}</div>
                  <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2 }}>{cls.nameEn}</div>
                </>
              ) : <div style={{ color: '#6b7280' }}>ยังไม่ระบุ</div>}
              {(s.flash_point_c != null || s.physical_state) && (
                <div style={{ fontSize: 10, marginTop: 6, color: '#374151' }}>
                  {s.physical_state && <div>สถานะ: {{ solid: 'ของแข็ง', liquid: 'ของเหลว', gas: 'ก๊าซ', aerosol: 'กระป๋องสเปรย์' }[s.physical_state]}</div>}
                  {s.flash_point_c != null && <div>จุดวาบไฟ: {s.flash_point_c} °C</div>}
                  {s.boiling_point_c != null && <div>จุดเดือด: {s.boiling_point_c} °C</div>}
                </div>
              )}
            </div>
          </div>

          {/* Two columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="box">
                <h2>ความเป็นอันตราย (Hazard statements)</h2>
                {hs.length === 0 ? <div style={{ color: '#6b7280' }}>—</div> : (
                  <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                    {hs.map(h => <li key={h.code} style={{ display: 'flex', gap: 6, marginBottom: 2 }}><b style={{ color: '#b91c1c', minWidth: 38 }}>{h.code}</b><span>{h.text || '—'}</span></li>)}
                  </ul>
                )}
                {s.hazard_classes.length > 0 && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{s.hazard_classes.join(' · ')}</div>}
              </div>
              <div className="box">
                <h2>ข้อควรระวัง (Precautionary statements)</h2>
                {ps.length === 0 ? <div style={{ color: '#6b7280' }}>—</div> : (
                  <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                    {ps.map(p => <li key={p.code} style={{ display: 'flex', gap: 6, marginBottom: 2 }}><b style={{ color: '#1d4ed8', minWidth: 38 }}>{p.code.split('+')[0]}</b><span>{p.text || p.code}</span></li>)}
                  </ul>
                )}
                {s.p_codes.length > 10 && <div style={{ fontSize: 10, color: '#6b7280' }}>และอีก {s.p_codes.length - 10} รายการ — ดูใน SDS</div>}
              </div>
              <div className="box">
                <h2>การจัดเก็บ</h2>
                <div>{s.storage_conditions || <span style={{ color: '#6b7280' }}>ดูเงื่อนไขการเก็บใน SDS ข้อ 7</span>}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="box" style={{ background: '#f5f3ff' }}>
                <h2>อุปกรณ์ป้องกันส่วนบุคคล (PPE)</h2>
                {s.ppe_required.length === 0 ? <div style={{ color: '#6b7280' }}>—</div> : s.ppe_required.map(p => <span key={p} className="chip" style={{ background: '#ede9fe', color: '#4c1d95' }}>{p}</span>)}
              </div>
              <div className="box" style={{ background: '#f0fdf4' }}>
                <h2>การปฐมพยาบาล</h2>
                {([['inhalation', 'สูดดม'], ['skin', 'ผิวหนัง'], ['eye', 'เข้าตา'], ['ingestion', 'กลืนกิน']] as const).map(([k, l]) => (
                  <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                    <b style={{ minWidth: 48, color: '#166534' }}>{l}</b><span>{s.first_aid?.[k] || '—'}</span>
                  </div>
                ))}
              </div>
              <div className="box" style={{ background: '#fff7ed' }}>
                <h2>กรณีไฟไหม้</h2>
                <div>{s.fire_fighting || '—'}</div>
              </div>
              <div className="box" style={{ background: '#fefce8' }}>
                <h2>กรณีหกรั่วไหล</h2>
                <div>{s.spill_response || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ borderTop: '2px solid #111', margin: '0 16px', padding: '8px 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 10.5 }}>
          <div>
            {showEmergency && <div style={{ fontSize: 13, fontWeight: 900, color: '#b91c1c' }}>☎ ฉุกเฉิน: {emergencyLine}</div>}
            <div style={{ color: '#6b7280' }}>{supplierLine && showEmergency ? `${supplierLine} · ` : ''}อ้างอิง SDS ปรับปรุงล่าสุด {revision}{s.sds_url ? ` · ${s.sds_url}` : s.sds_file_name ? ` · ไฟล์ ${s.sds_file_name}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', color: '#6b7280' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={11} /> EA SHE Tools · tools.eashe.org/chemical</div>
            <div>พิมพ์ {printed}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

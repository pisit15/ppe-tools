'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { TrackPayload } from '@/lib/visitor/types';
import { VEHICLE_DECISION_LABEL } from '@/lib/visitor/constants';
import { FetchError, StatusBadge, VIZ, cardClass, getJson, hhmm, thaiDate, thaiDateTime } from '../../../_components/ui';

export default function TrackPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<TrackPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    const load = () => getJson<{ data: TrackPayload }>(`/api/visitor/public/track/${encodeURIComponent(code)}`)
      .then(r => { if (!stop) setData(r.data); })
      .catch((e: unknown) => { if (!stop) setError(e instanceof FetchError ? e.message : 'โหลดไม่สำเร็จ'); });
    void load();
    const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

  return (
    <div className="min-h-screen" style={{ background: '#F5F6F8', color: VIZ.text }}>
      <main className="max-w-xl mx-auto px-4 py-10">
        {error && <div className={cardClass}><p style={{ color: VIZ.accent }}>{error}</p></div>}
        {!error && !data && <p className="text-gray-500">กำลังโหลด…</p>}
        {data && (
          <div className={cardClass}>
            <p className="text-xs text-gray-500">{data.company_name} · คำขอเข้าพื้นที่</p>
            <div className="mt-1 flex items-center justify-between gap-3 flex-wrap">
              <h1 className="font-mono text-2xl font-semibold" style={{ color: VIZ.primary }}>{data.request_no}</h1>
              <StatusBadge status={data.status} large />
            </div>
            <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-gray-500">บริษัท</dt><dd className="font-medium">{data.visitor_company}</dd>
              <dt className="text-gray-500">วันที่</dt><dd>{thaiDate(data.arrival_date, true)} · {hhmm(data.time_from)}–{hhmm(data.time_to)}</dd>
              <dt className="text-gray-500">วัตถุประสงค์</dt><dd>{data.purpose}</dd>
              <dt className="text-gray-500">รายชื่อ</dt><dd><ol className="list-decimal ml-4">{data.persons.map(p => <li key={p.seq}>{p.name}{p.detail && <span className="text-gray-500"> — {p.detail}</span>}</li>)}</ol></dd>
              {data.vehicles.length > 0 && <><dt className="text-gray-500">รถ</dt><dd><ul>{data.vehicles.map(v => <li key={v.seq}>{v.plate}{v.province && ` ${v.province}`}{v.vehicle_type && ` · ${v.vehicle_type}`} — <span style={{ color: v.decision === 'allowed' ? VIZ.positive : v.decision === 'outside' ? VIZ.lightText : VIZ.secondary }}>{VEHICLE_DECISION_LABEL[v.decision]}</span></li>)}</ul></dd></>}
              <dt className="text-gray-500">ส่งคำขอเมื่อ</dt><dd>{thaiDateTime(data.created_at)}</dd>
              {data.decided_at && <><dt className="text-gray-500">ตัดสินเมื่อ</dt><dd>{thaiDateTime(data.decided_at)}</dd></>}
            </dl>
            {data.status === 'approved' && data.conditions && <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: `${VIZ.positive}1A` }}><strong>เงื่อนไขการเข้าพื้นที่:</strong> {data.conditions}</div>}
            {(data.status === 'need_info' || data.status === 'rejected') && data.decision_note && <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: `${VIZ.secondary}1A` }}><strong>จากทีม SHE:</strong> {data.decision_note}</div>}
            {data.status === 'submitted' && <p className="mt-4 text-sm text-gray-600">รอทีม SHE คัดกรอง หน้านี้อัปเดตอัตโนมัติทุก 1 นาที</p>}
            {data.status === 'need_info' && <p className="mt-2 text-sm text-gray-600">กรุณาติดต่อทีม SHE หรือส่งคำขอใหม่พร้อมข้อมูลที่ครบถ้วน</p>}
          </div>
        )}
      </main>
    </div>
  );
}

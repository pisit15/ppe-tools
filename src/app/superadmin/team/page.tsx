'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react';
import { useSuperAdmin } from '@/components/superadmin/SuperAdminShell';
import {
  Badge,
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  Spinner,
  VIZ,
  saFetch,
} from '@/components/superadmin/ui';

type CompanyStat = {
  company_id: string;
  company_name: string;
  personnel: number;
  she_team: number;
  required_types: number;
  covered_types: number;
};

type WatchItem = {
  id: string;
  kind: 'legal' | 'certificate';
  person: string;
  company_id: string;
  company_name: string;
  title: string;
  expiry_date: string;
  days: number;
};

type TeamOverview = {
  soonDays: number;
  totals: {
    personnel: number;
    sheTeam: number;
    companies: number;
    legalLicenses: number;
    legalHeld: number;
    certificates: number;
    expired: number;
    expiringSoon: number;
    missingExpiryDates: number;
  };
  companies: CompanyStat[];
  watchlist: WatchItem[];
};

function coverageColor(stat: CompanyStat) {
  if (stat.required_types === 0) return VIZ.neutral;
  if (stat.covered_types >= stat.required_types) return VIZ.positive;
  if (stat.covered_types === 0) return VIZ.accent;
  return VIZ.secondary;
}

export default function TeamOverviewPage() {
  const { href } = useSuperAdmin();
  const [data, setData] = useState<TeamOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    saFetch<TeamOverview>('/api/superadmin/team/overview')
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Card>
        <p className="text-sm" style={{ color: VIZ.accent }}>
          {error}
        </p>
      </Card>
    );
  }
  if (!data) return <Spinner />;

  const { totals } = data;

  return (
    <>
      <PageHeader
        title="ภาพรวมทีม SHE"
        description="บุคลากรความปลอดภัยทั้งกลุ่ม ความครบของตำแหน่งตามกฎหมาย และใบอนุญาตที่ใกล้หมดอายุ"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="บุคลากร SHE"
          value={totals.sheTeam}
          hint={`จากบุคลากรทั้งหมด ${totals.personnel} คน ใน ${totals.companies} บริษัท`}
          color={VIZ.primary}
        />
        <KpiCard
          label="ใบอนุญาตที่ถือครอง"
          value={totals.legalHeld}
          hint={`จากรายการที่บันทึกไว้ ${totals.legalLicenses} รายการ`}
          color={VIZ.positive}
        />
        <KpiCard
          label={`ใกล้หมดอายุ (≤${data.soonDays} วัน)`}
          value={totals.expiringSoon}
          color={VIZ.secondary}
        />
        <KpiCard label="หมดอายุแล้ว" value={totals.expired} color={VIZ.accent} />
      </div>

      {totals.missingExpiryDates > 0 && (
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: `${VIZ.secondary}55`, backgroundColor: `${VIZ.secondary}12` }}
        >
          <AlertTriangle size={18} style={{ color: VIZ.secondary }} className="mt-0.5 shrink-0" />
          <div className="text-sm" style={{ color: VIZ.text }}>
            <p className="font-semibold">
              มี {totals.missingExpiryDates} รายการที่ยังไม่ได้ระบุวันหมดอายุ
            </p>
            <p className="mt-1" style={{ color: VIZ.lightText }}>
              รายการเหล่านี้จะไม่ถูกนับในการแจ้งเตือน — เติมวันหมดอายุที่หน้า{' '}
              <Link href={href('/team/licenses')} className="underline">
                ใบอนุญาต / ใบรับรอง
              </Link>{' '}
              หรือติ๊ก &ldquo;ไม่มีวันหมดอายุ&rdquo; ถ้าใบนั้นไม่หมดอายุจริง
            </p>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: VIZ.text }}>
            ความครบของตำแหน่งตามกฎหมาย รายบริษัท
          </h2>
          <Link
            href={href('/team/personnel')}
            className="flex items-center gap-1 text-sm"
            style={{ color: VIZ.primary }}
          >
            ดูบุคลากรทั้งหมด
            <ArrowRight size={14} />
          </Link>
        </div>

        {data.companies.length === 0 ? (
          <EmptyState message="ยังไม่มีข้อมูลบุคลากร" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">บริษัท</th>
                  <th className="px-4 py-3 text-right font-semibold">บุคลากร</th>
                  <th className="px-4 py-3 text-right font-semibold">ทีม SHE</th>
                  <th className="px-4 py-3 text-left font-semibold">ตำแหน่งตามกฎหมาย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.companies.map((stat) => {
                  const color = coverageColor(stat);
                  const pct =
                    stat.required_types === 0
                      ? 0
                      : Math.round((stat.covered_types / stat.required_types) * 100);
                  return (
                    <tr key={stat.company_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium" style={{ color: VIZ.text }}>
                          {stat.company_name}
                        </span>
                        <span className="ml-2 font-mono text-xs" style={{ color: VIZ.lightText }}>
                          {stat.company_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: VIZ.text }}>
                        {stat.personnel}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: VIZ.text }}>
                        {stat.she_team}
                      </td>
                      <td className="px-4 py-3">
                        {stat.required_types === 0 ? (
                          <span className="text-xs" style={{ color: VIZ.lightText }}>
                            ยังไม่ได้กำหนด
                          </span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div
                              className="h-2 w-28 overflow-hidden rounded-full"
                              style={{ backgroundColor: VIZ.bg }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                            <span className="text-xs" style={{ color }}>
                              {stat.covered_types}/{stat.required_types} ตำแหน่ง
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock size={17} style={{ color: VIZ.secondary }} />
          <h2 className="text-base font-semibold" style={{ color: VIZ.text }}>
            ใบอนุญาตที่หมดอายุแล้วและใกล้หมดอายุ
          </h2>
        </div>

        {data.watchlist.length === 0 ? (
          <EmptyState message={`ไม่มีรายการที่หมดอายุภายใน ${data.soonDays} วัน`} />
        ) : (
          <div className="divide-y divide-gray-100">
            {data.watchlist.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium" style={{ color: VIZ.text }}>
                    {item.person}
                    <span className="ml-2 font-normal" style={{ color: VIZ.lightText }}>
                      {item.title}
                    </span>
                  </p>
                  <p className="truncate text-xs" style={{ color: VIZ.lightText }}>
                    {item.company_name} · {item.kind === 'legal' ? 'ใบอนุญาตตามกฎหมาย' : 'ใบรับรอง'}{' '}
                    · หมดอายุ {item.expiry_date}
                  </p>
                </div>
                <Badge color={item.days < 0 ? VIZ.accent : VIZ.secondary}>
                  {item.days < 0 ? `เกิน ${Math.abs(item.days)} วัน` : `อีก ${item.days} วัน`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

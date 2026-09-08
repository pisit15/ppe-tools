'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  Spinner,
  VIZ,
  formatDateTime,
  saFetch,
} from '@/components/superadmin/ui';

type SystemStat = { key: string; label: string; group: string; count: number };

type Overview = {
  totals: {
    companies: number;
    companyUsers: number;
    toolsUsers: number;
    companyCredentials: number;
    admins: number;
    loginsLast30: number;
  };
  systems: SystemStat[];
  recentLogins: {
    id: number;
    username: string;
    display_name: string | null;
    company_id: string | null;
    role: string | null;
    created_at: string;
  }[];
  recentAudit: {
    id: number;
    company_id: string | null;
    plan_type: string | null;
    action: string | null;
    activity_no: string | null;
    performed_by: string | null;
    created_at: string;
  }[];
  warnings: { plaintextCompanyUsers: number };
};

const GROUP_COLORS: Record<string, string> = {
  safety: VIZ.accent,
  training: VIZ.primary,
  environment: VIZ.positive,
  budget: VIZ.secondary,
  ppe: VIZ.primary,
  audit: VIZ.secondary,
  workforce: VIZ.positive,
};

const GROUP_LABELS: Record<string, string> = {
  safety: 'ความปลอดภัย',
  training: 'ฝึกอบรม',
  environment: 'สิ่งแวดล้อม',
  budget: 'งบประมาณ',
  ppe: 'PPE',
  audit: 'ตรวจประเมิน',
  workforce: 'บุคลากร',
};

export default function SystemConsoleOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    saFetch<Overview>('/api/superadmin/overview')
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

  const totalUsers =
    data.totals.companyUsers + data.totals.toolsUsers + data.totals.companyCredentials;

  const groups = Array.from(new Set(data.systems.map((s) => s.group)));

  return (
    <>
      <PageHeader
        title="ภาพรวมแพลตฟอร์ม"
        description="สรุปผู้ใช้ บริษัท และปริมาณข้อมูลของทุกระบบที่ใช้ฐานข้อมูลเดียวกัน"
      />

      {data.warnings.plaintextCompanyUsers > 0 && (
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border p-4"
          style={{ borderColor: `${VIZ.secondary}55`, backgroundColor: `${VIZ.secondary}12` }}
        >
          <AlertTriangle size={18} style={{ color: VIZ.secondary }} className="mt-0.5 shrink-0" />
          <div className="text-sm" style={{ color: VIZ.text }}>
            <p className="font-semibold">
              ยังมีรหัสผ่านแบบ plaintext {data.warnings.plaintextCompanyUsers} บัญชีในตาราง company_users
            </p>
            <p className="mt-1" style={{ color: VIZ.lightText }}>
              ยังไม่แฮชให้อัตโนมัติ เพราะตารางนี้ถูกอ่านโดยแอป safety-env-dashboard (eashe.org)
              ต้องยืนยันก่อนว่าแอปนั้นรองรับ bcrypt แล้วจึงค่อยแฮช
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="บริษัททั้งหมด" value={data.totals.companies} color={VIZ.primary} />
        <KpiCard
          label="ผู้ใช้ทั้งหมด"
          value={totalUsers}
          hint={`company_users ${data.totals.companyUsers} · tools_users ${data.totals.toolsUsers} · credentials ${data.totals.companyCredentials}`}
          color={VIZ.positive}
        />
        <KpiCard label="ผู้ดูแลระบบ" value={data.totals.admins} color={VIZ.secondary} />
        <KpiCard
          label="การเข้าสู่ระบบ 30 วัน"
          value={data.totals.loginsLast30}
          color={VIZ.accent}
        />
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 text-base font-semibold" style={{ color: VIZ.text }}>
          ปริมาณข้อมูลรายระบบ
        </h2>
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: VIZ.lightText }}>
                {GROUP_LABELS[group] || group}
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {data.systems
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <div
                      key={s.key}
                      className="rounded-lg border border-gray-100 px-4 py-3"
                      style={{ backgroundColor: VIZ.bg }}
                    >
                      <p className="text-xs" style={{ color: VIZ.lightText }}>
                        {s.label}
                      </p>
                      <p
                        className="text-xl font-bold"
                        style={{ color: GROUP_COLORS[s.group] || VIZ.primary }}
                      >
                        {s.count.toLocaleString('th-TH')}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold" style={{ color: VIZ.text }}>
            เข้าสู่ระบบล่าสุด
          </h2>
          {data.recentLogins.length === 0 ? (
            <EmptyState message="ยังไม่มีบันทึกการเข้าสู่ระบบ" />
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recentLogins.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium" style={{ color: VIZ.text }}>
                      {row.display_name || row.username}
                    </p>
                    <p className="truncate text-xs" style={{ color: VIZ.lightText }}>
                      {row.username} · {row.company_id || '-'} · {row.role || 'user'}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs" style={{ color: VIZ.lightText }}>
                    {formatDateTime(row.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold" style={{ color: VIZ.text }}>
            การแก้ไขข้อมูลล่าสุด
          </h2>
          {data.recentAudit.length === 0 ? (
            <EmptyState message="ยังไม่มีบันทึกการแก้ไข" />
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recentAudit.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium" style={{ color: VIZ.text }}>
                      {row.action || '-'} {row.activity_no ? `· ${row.activity_no}` : ''}
                    </p>
                    <p className="truncate text-xs" style={{ color: VIZ.lightText }}>
                      {row.company_id || '-'} · {row.plan_type || '-'} · {row.performed_by || '-'}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs" style={{ color: VIZ.lightText }}>
                    {formatDateTime(row.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Spinner,
  Toast,
  VIZ,
  formatDateTime,
  inputClass,
  saFetch,
  useToast,
} from '@/components/superadmin/ui';

type LoginRow = {
  id: number;
  username: string;
  display_name: string | null;
  company_id: string | null;
  role: string | null;
  user_agent: string | null;
  created_at: string;
};

type AuditRow = {
  id: number;
  company_id: string | null;
  plan_type: string | null;
  action: string | null;
  activity_no: string | null;
  month: string | null;
  old_value: string | null;
  new_value: string | null;
  performed_by: string | null;
  created_at: string;
};

const PAGE_SIZE = 30;
const DAY_OPTIONS = [7, 30, 90, 365];

export default function SuperAdminActivityPage() {
  const { toast, setToast, error } = useToast();
  const [type, setType] = useState<'login' | 'audit'>('login');
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type, days: String(days), limit: '1000' });
      const data = await saFetch<{ type: string; data: LoginRow[] | AuditRow[] }>(
        `/api/superadmin/activity?${params}`
      );
      if (type === 'login') setLogins(data.data as LoginRow[]);
      else setAudits(data.data as AuditRow[]);
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days, error, type]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset paging from the handler rather than an effect, so no setState runs
  // synchronously during render.
  const changeType = (next: 'login' | 'audit') => {
    setType(next);
    setPage(1);
    setLoading(true);
  };

  const changeDays = (next: number) => {
    setDays(next);
    setPage(1);
    setLoading(true);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows: (LoginRow | AuditRow)[] = type === 'login' ? logins : audits;
    if (!needle) return rows;
    return rows.filter((row) =>
      Object.values(row)
        .filter((value) => typeof value === 'string')
        .some((value) => (value as string).toLowerCase().includes(needle))
    );
  }, [audits, logins, search, type]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="ประวัติการใช้งาน"
        description="บันทึกการเข้าสู่ระบบและการแก้ไขข้อมูลของทุกบริษัท"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: 'login', label: 'การเข้าสู่ระบบ' },
            { key: 'audit', label: 'การแก้ไขข้อมูล' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => changeType(tab.key)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={
              type === tab.key
                ? { backgroundColor: VIZ.primary, color: '#fff' }
                : { backgroundColor: '#fff', color: VIZ.lightText, border: `1px solid ${VIZ.muted}` }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <SearchInput value={search} onChange={changeSearch} placeholder="ค้นหาผู้ใช้ / บริษัท / การกระทำ" />
          </div>
          <select
            className={inputClass}
            value={days}
            onChange={(e) => changeDays(Number(e.target.value))}
          >
            {DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                ย้อนหลัง {option} วัน
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState message="ไม่พบบันทึกในช่วงเวลาที่เลือก" />
        ) : (
          <>
            <div className="overflow-x-auto">
              {type === 'login' ? (
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">เวลา</th>
                      <th className="px-4 py-3 text-left font-semibold">ผู้ใช้</th>
                      <th className="px-4 py-3 text-left font-semibold">บริษัท</th>
                      <th className="px-4 py-3 text-left font-semibold">สิทธิ์</th>
                      <th className="px-4 py-3 text-left font-semibold">อุปกรณ์</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(paged as LoginRow[]).map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.text }}>
                          <span className="font-medium">{row.display_name || row.username}</span>
                          <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>
                            {row.username}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                          {row.company_id || '-'}
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                          {row.role || '-'}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                          {row.user_agent || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: VIZ.bg, color: VIZ.text }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">เวลา</th>
                      <th className="px-4 py-3 text-left font-semibold">บริษัท</th>
                      <th className="px-4 py-3 text-left font-semibold">การกระทำ</th>
                      <th className="px-4 py-3 text-left font-semibold">รายการ</th>
                      <th className="px-4 py-3 text-left font-semibold">เปลี่ยนเป็น</th>
                      <th className="px-4 py-3 text-left font-semibold">โดย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(paged as AuditRow[]).map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: VIZ.lightText }}>
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                          {row.company_id || '-'}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: VIZ.text }}>
                          {row.action || '-'}
                          {row.plan_type && (
                            <span className="ml-2 text-xs font-normal" style={{ color: VIZ.lightText }}>
                              {row.plan_type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                          {row.activity_no || '-'}
                          {row.month ? ` · ${row.month}` : ''}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3" style={{ color: VIZ.text }}>
                          {row.new_value || '-'}
                        </td>
                        <td className="px-4 py-3" style={{ color: VIZ.lightText }}>
                          {row.performed_by || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm" style={{ color: VIZ.lightText }}>
              <span>
                {filtered.length.toLocaleString('th-TH')} รายการ · หน้า {page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

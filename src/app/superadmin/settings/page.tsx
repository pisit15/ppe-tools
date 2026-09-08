'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Plus, Unlock } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Toast,
  VIZ,
  formatDateTime,
  inputClass,
  saFetch,
  useToast,
} from '@/components/superadmin/ui';

type AppSetting = { key: string; value: string; updated_at: string | null };
type PlanYear = { year: number; label: string | null; is_active: boolean };
type EditDeadline = { id: number; month: string; deadline_day: number; is_active: boolean };
type LockRow = {
  id: number;
  company_id: string;
  year: number;
  locked_by: string | null;
  note: string | null;
  created_at: string;
};
type Recipient = {
  id: string;
  company_id: string;
  responsible_name: string | null;
  email: string;
  is_active: boolean;
  last_sent_at: string | null;
};

type SettingsResponse = {
  appSettings: AppSetting[];
  planYears: PlanYear[];
  editDeadlines: EditDeadline[];
  budgetLocks: LockRow[];
  trainingPlanLocks: LockRow[];
  notificationRecipients: Recipient[];
};

type LockResource = 'budget_locks' | 'training_plan_locks';

const LOCK_LABELS: Record<LockResource, string> = {
  budget_locks: 'ล็อกงบประมาณ',
  training_plan_locks: 'ล็อกแผนอบรม',
};

function isBooleanish(value: string) {
  return value === 'true' || value === 'false';
}

export default function SuperAdminSettingsPage() {
  const { toast, setToast, success, error } = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLock, setNewLock] = useState<{ resource: LockResource; company_id: string; year: string; note: string } | null>(null);
  const [pendingUnlock, setPendingUnlock] = useState<{ resource: LockResource; row: LockRow } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await saFetch<SettingsResponse>('/api/superadmin/settings'));
    } catch (err) {
      error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    void load();
  }, [load]);

  const put = async (resource: string, body: Record<string, unknown>, message: string) => {
    try {
      await saFetch(`/api/superadmin/settings?resource=${resource}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      success(message);
      load();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const addLock = async () => {
    if (!newLock) return;
    try {
      await saFetch(`/api/superadmin/settings?resource=${newLock.resource}`, {
        method: 'POST',
        body: JSON.stringify({
          company_id: newLock.company_id.trim(),
          year: Number(newLock.year),
          note: newLock.note,
        }),
      });
      success('ล็อกเรียบร้อย');
      setNewLock(null);
      load();
    } catch (err) {
      error((err as Error).message);
    }
  };

  const removeLock = async () => {
    if (!pendingUnlock) return;
    try {
      await saFetch(
        `/api/superadmin/settings?resource=${pendingUnlock.resource}&id=${pendingUnlock.row.id}`,
        { method: 'DELETE' }
      );
      success('ปลดล็อกแล้ว');
      load();
    } catch (err) {
      error((err as Error).message);
    } finally {
      setPendingUnlock(null);
    }
  };

  if (loading || !data) {
    return (
      <>
        <PageHeader title="ตั้งค่าส่วนกลาง" />
        <Spinner />
      </>
    );
  }

  const lockTable = (resource: LockResource, rows: LockRow[]) => (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: VIZ.text }}>
          {LOCK_LABELS[resource]}
        </h2>
        <Button
          variant="secondary"
          onClick={() =>
            setNewLock({ resource, company_id: '', year: String(new Date().getFullYear()), note: '' })
          }
        >
          <Plus size={14} className="mr-1 inline" />
          เพิ่ม
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState message="ยังไม่มีการล็อก — ทุกบริษัทแก้ไขข้อมูลได้" />
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium" style={{ color: VIZ.text }}>
                  <Lock size={13} className="mr-1.5 inline" style={{ color: VIZ.accent }} />
                  {row.company_id} · ปี {row.year}
                </p>
                <p className="truncate text-xs" style={{ color: VIZ.lightText }}>
                  โดย {row.locked_by || '-'} · {formatDateTime(row.created_at)}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>
              <button
                onClick={() => setPendingUnlock({ resource, row })}
                className="ml-3 shrink-0 rounded-md p-1.5 hover:bg-gray-100"
                title="ปลดล็อก"
              >
                <Unlock size={15} style={{ color: VIZ.primary }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title="ตั้งค่าส่วนกลาง"
        description="สวิตช์ที่ทุกระบบบนฐานข้อมูลนี้ใช้ร่วมกัน — เปลี่ยนแล้วมีผลทันทีกับทุกบริษัท"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-base font-semibold" style={{ color: VIZ.text }}>
            สวิตช์ระบบ (app_settings)
          </h2>
          {data.appSettings.length === 0 ? (
            <EmptyState message="ยังไม่มีการตั้งค่า" />
          ) : (
            <div className="divide-y divide-gray-100">
              {data.appSettings.map((setting) => (
                <div key={setting.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm" style={{ color: VIZ.text }}>
                      {setting.key}
                    </p>
                    <p className="text-xs" style={{ color: VIZ.lightText }}>
                      แก้ไขล่าสุด {formatDateTime(setting.updated_at)}
                    </p>
                  </div>
                  {isBooleanish(setting.value) ? (
                    <button
                      onClick={() =>
                        put(
                          'app_settings',
                          { key: setting.key, value: setting.value === 'true' ? 'false' : 'true' },
                          'บันทึกการตั้งค่าแล้ว'
                        )
                      }
                    >
                      <Badge color={setting.value === 'true' ? VIZ.positive : VIZ.neutral}>
                        {setting.value === 'true' ? 'เปิด' : 'ปิด'}
                      </Badge>
                    </button>
                  ) : (
                    <input
                      defaultValue={setting.value}
                      onBlur={(e) => {
                        if (e.target.value !== setting.value) {
                          put(
                            'app_settings',
                            { key: setting.key, value: e.target.value },
                            'บันทึกการตั้งค่าแล้ว'
                          );
                        }
                      }}
                      className={`${inputClass} max-w-[180px]`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold" style={{ color: VIZ.text }}>
            ปีที่เปิดให้วางแผน
          </h2>
          {data.planYears.length === 0 ? (
            <EmptyState message="ยังไม่มีข้อมูลปี" />
          ) : (
            <div className="divide-y divide-gray-100">
              {data.planYears.map((row) => (
                <div key={row.year} className="flex items-center justify-between py-3 text-sm">
                  <span style={{ color: VIZ.text }}>
                    {row.label || row.year}
                  </span>
                  <button
                    onClick={() =>
                      put('plan_years', { year: row.year, is_active: !row.is_active }, 'อัปเดตปีแล้ว')
                    }
                  >
                    <Badge color={row.is_active ? VIZ.positive : VIZ.neutral}>
                      {row.is_active ? 'เปิด' : 'ปิด'}
                    </Badge>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-base font-semibold" style={{ color: VIZ.text }}>
            กำหนดวันปิดแก้ไขรายเดือน
          </h2>
          <p className="mb-4 text-xs" style={{ color: VIZ.lightText }}>
            มีผลเมื่อสวิตช์ deadline_enabled เปิดอยู่เท่านั้น
          </p>
          {data.editDeadlines.length === 0 ? (
            <EmptyState message="ยังไม่มีการกำหนด" />
          ) : (
            <div className="divide-y divide-gray-100">
              {data.editDeadlines.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span style={{ color: VIZ.text }}>{row.month}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      defaultValue={row.deadline_day}
                      onBlur={(e) => {
                        const day = Number(e.target.value);
                        if (day !== row.deadline_day) {
                          put('edit_deadlines', { id: row.id, deadline_day: day }, 'บันทึกแล้ว');
                        }
                      }}
                      className={`${inputClass} w-20`}
                    />
                    <button
                      onClick={() =>
                        put('edit_deadlines', { id: row.id, is_active: !row.is_active }, 'บันทึกแล้ว')
                      }
                    >
                      <Badge color={row.is_active ? VIZ.positive : VIZ.neutral}>
                        {row.is_active ? 'ใช้' : 'ไม่ใช้'}
                      </Badge>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold" style={{ color: VIZ.text }}>
            ผู้รับอีเมลแจ้งเตือน
          </h2>
          {data.notificationRecipients.length === 0 ? (
            <EmptyState message="ยังไม่มีผู้รับ" />
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {data.notificationRecipients.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium" style={{ color: VIZ.text }}>
                      {row.responsible_name || row.email}
                    </p>
                    <p className="truncate text-xs" style={{ color: VIZ.lightText }}>
                      {row.company_id} · {row.email}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      put(
                        'notification_recipients',
                        { id: row.id, is_active: !row.is_active },
                        'อัปเดตผู้รับแล้ว'
                      )
                    }
                  >
                    <Badge color={row.is_active ? VIZ.positive : VIZ.neutral}>
                      {row.is_active ? 'ส่ง' : 'ไม่ส่ง'}
                    </Badge>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {lockTable('budget_locks', data.budgetLocks)}
        {lockTable('training_plan_locks', data.trainingPlanLocks)}
      </div>

      <Modal
        open={newLock !== null}
        title={newLock ? LOCK_LABELS[newLock.resource] : ''}
        onClose={() => setNewLock(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewLock(null)}>
              ยกเลิก
            </Button>
            <Button onClick={addLock}>ล็อก</Button>
          </>
        }
      >
        {newLock && (
          <div className="space-y-4">
            <Field label="รหัสบริษัท (company_id)">
              <input
                className={inputClass}
                value={newLock.company_id}
                onChange={(e) => setNewLock({ ...newLock, company_id: e.target.value })}
              />
            </Field>
            <Field label="ปี">
              <input
                type="number"
                className={inputClass}
                value={newLock.year}
                onChange={(e) => setNewLock({ ...newLock, year: e.target.value })}
              />
            </Field>
            <Field label="หมายเหตุ">
              <input
                className={inputClass}
                value={newLock.note}
                onChange={(e) => setNewLock({ ...newLock, note: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingUnlock !== null}
        title="ยืนยันการปลดล็อก"
        message={`ปลดล็อก ${pendingUnlock?.row.company_id} ปี ${pendingUnlock?.row.year} ใช่หรือไม่ ผู้ใช้จะกลับมาแก้ไขข้อมูลได้ทันที`}
        confirmLabel="ปลดล็อก"
        onConfirm={removeLock}
        onCancel={() => setPendingUnlock(null)}
      />
    </>
  );
}

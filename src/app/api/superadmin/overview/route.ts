import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

type Db = ReturnType<typeof saDb>;

async function countRows(db: Db, table: string): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count ?? 0;
}

// One card per system on the console home. Keep the labels Thai-first.
const SYSTEMS: { key: string; label: string; table: string; group: string }[] = [
  { key: 'incidents', label: 'อุบัติการณ์', table: 'incidents', group: 'safety' },
  { key: 'near_miss', label: 'Near Miss', table: 'near_miss_reports', group: 'safety' },
  { key: 'corrective_actions', label: 'การแก้ไข (CA)', table: 'corrective_actions', group: 'safety' },
  { key: 'risk_tasks', label: 'งานประเมินความเสี่ยง', table: 'risk_tasks', group: 'safety' },
  { key: 'training_sessions', label: 'รอบอบรม', table: 'training_sessions', group: 'training' },
  { key: 'training_plans', label: 'แผนอบรม', table: 'training_plans', group: 'training' },
  { key: 'training_attendees', label: 'ผู้เข้าอบรม', table: 'training_attendees', group: 'training' },
  { key: 'waste_records', label: 'บันทึกของเสีย', table: 'waste_records', group: 'environment' },
  { key: 'budget_items', label: 'รายการงบประมาณ', table: 'budget_items', group: 'budget' },
  { key: 'ppe_products', label: 'สินค้า PPE', table: 'ppe_products', group: 'ppe' },
  { key: 'ppe_transactions', label: 'ธุรกรรม PPE', table: 'ppe_transactions', group: 'ppe' },
  { key: 'ppe_employees', label: 'พนักงาน PPE', table: 'ppe_employees', group: 'ppe' },
  { key: 'site_visit', label: 'Site Visit', table: 'site_visit_assessments', group: 'audit' },
  { key: 'she_personnel', label: 'บุคลากร SHE', table: 'she_personnel', group: 'workforce' },
];

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const db = saDb();

    const [companies, companyUsers, toolsUsers, companyCredentials, admins] = await Promise.all([
      countRows(db, 'company_settings'),
      countRows(db, 'company_users'),
      countRows(db, 'tools_users'),
      countRows(db, 'company_credentials'),
      countRows(db, 'admin_accounts'),
    ]);

    const systems = await Promise.all(
      SYSTEMS.map(async (s) => ({ ...s, count: await countRows(db, s.table) }))
    );

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: loginsLast30 } = await db
      .from('login_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);

    const { data: recentLogins } = await db
      .from('login_events')
      .select('id, username, display_name, company_id, role, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: recentAudit } = await db
      .from('audit_log')
      .select('id, company_id, plan_type, action, activity_no, month, performed_by, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    // Plaintext passwords still in the DB — surfaced so they don't stay invisible.
    const { data: pwRows } = await db.from('company_users').select('password');
    const plaintextCompanyUsers = (pwRows || []).filter(
      (r) => typeof r.password === 'string' && !/^\$2[aby]\$/.test(r.password)
    ).length;

    return NextResponse.json({
      totals: {
        companies,
        companyUsers,
        toolsUsers,
        companyCredentials,
        admins,
        loginsLast30: loginsLast30 ?? 0,
      },
      systems,
      recentLogins: recentLogins || [],
      recentAudit: recentAudit || [],
      warnings: { plaintextCompanyUsers },
    });
  } catch (err) {
    return saError(err, 'โหลดภาพรวมไม่สำเร็จ');
  }
}

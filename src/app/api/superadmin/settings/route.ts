import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

// Central switches shared by every app on the platform.
//   app_settings            key/value flags (e.g. deadline_enabled)
//   plan_years              which planning years are open
//   edit_deadlines          per-month cut-off day for plan edits
//   budget_locks            per company+year lock on the budget module
//   training_plan_locks     per company+year lock on the training plan
//   notification_recipients who receives the automated emails
type Resource =
  | 'app_settings'
  | 'plan_years'
  | 'edit_deadlines'
  | 'budget_locks'
  | 'training_plan_locks'
  | 'notification_recipients';

const RESOURCES: Resource[] = [
  'app_settings',
  'plan_years',
  'edit_deadlines',
  'budget_locks',
  'training_plan_locks',
  'notification_recipients',
];

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function resourceOf(request: NextRequest): Resource | null {
  const value = request.nextUrl.searchParams.get('resource') as Resource | null;
  if (!value) return null;
  return RESOURCES.includes(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const db = saDb();
    const [appSettings, planYears, editDeadlines, budgetLocks, trainingLocks, recipients] =
      await Promise.all([
        db.from('app_settings').select('key, value, updated_at').order('key'),
        db.from('plan_years').select('year, label, is_active').order('year', { ascending: false }),
        db.from('edit_deadlines').select('id, month, deadline_day, is_active').order('month'),
        db
          .from('budget_locks')
          .select('id, company_id, year, locked_by, note, created_at')
          .order('year', { ascending: false }),
        db
          .from('training_plan_locks')
          .select('id, company_id, year, locked_by, note, created_at')
          .order('year', { ascending: false }),
        db
          .from('notification_recipients')
          .select('id, company_id, responsible_name, email, is_active, last_sent_at')
          .order('company_id'),
      ]);

    return NextResponse.json({
      appSettings: appSettings.data || [],
      planYears: planYears.data || [],
      editDeadlines: editDeadlines.data || [],
      budgetLocks: budgetLocks.data || [],
      trainingPlanLocks: trainingLocks.data || [],
      notificationRecipients: recipients.data || [],
    });
  } catch (err) {
    return saError(err, 'โหลดการตั้งค่าไม่สำเร็จ');
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const resource = resourceOf(request);
  if (!resource) return badRequest('ไม่รู้จักการตั้งค่านี้');

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const db = saDb();
    const now = new Date().toISOString();

    if (resource === 'app_settings') {
      const key = String(body.key || '').trim();
      if (!key) return badRequest('ไม่พบ key ของการตั้งค่า');
      const { data, error } = await db
        .from('app_settings')
        .upsert({ key, value: String(body.value ?? ''), updated_at: now }, { onConflict: 'key' })
        .select('key, value, updated_at')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (resource === 'plan_years') {
      const year = Number(body.year);
      if (!Number.isFinite(year)) return badRequest('ปีไม่ถูกต้อง');
      const patch: Record<string, unknown> = {};
      if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
      if (body.label !== undefined) patch.label = String(body.label).trim();
      if (Object.keys(patch).length === 0) return badRequest('ไม่มีข้อมูลที่จะแก้ไข');
      const { data, error } = await db
        .from('plan_years')
        .update(patch)
        .eq('year', year)
        .select('year, label, is_active')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (resource === 'edit_deadlines') {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return badRequest('ไม่พบ id');
      const patch: Record<string, unknown> = { updated_at: now };
      if (body.deadline_day !== undefined) {
        const day = Number(body.deadline_day);
        if (!Number.isFinite(day) || day < 1 || day > 31) return badRequest('วันที่ต้องอยู่ระหว่าง 1-31');
        patch.deadline_day = day;
      }
      if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
      const { data, error } = await db
        .from('edit_deadlines')
        .update(patch)
        .eq('id', id)
        .select('id, month, deadline_day, is_active')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (resource === 'notification_recipients') {
      const id = String(body.id || '');
      if (!id) return badRequest('ไม่พบ id');
      const patch: Record<string, unknown> = { updated_at: now };
      if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
      if (body.email !== undefined) patch.email = String(body.email).trim();
      if (body.responsible_name !== undefined) {
        patch.responsible_name = String(body.responsible_name).trim();
      }
      const { data, error } = await db
        .from('notification_recipients')
        .update(patch)
        .eq('id', id)
        .select('id, company_id, responsible_name, email, is_active, last_sent_at')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    return badRequest('การตั้งค่านี้แก้ไขด้วย PUT ไม่ได้');
  } catch (err) {
    return saError(err, 'บันทึกการตั้งค่าไม่สำเร็จ');
  }
}

// Locks are add/remove rather than edit: POST locks a company+year, DELETE unlocks.
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const resource = resourceOf(request);
  if (resource !== 'budget_locks' && resource !== 'training_plan_locks') {
    return badRequest('เพิ่มได้เฉพาะการล็อกงบประมาณและแผนอบรม');
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = String(body.company_id || '').trim();
    const year = Number(body.year);
    if (!companyId || !Number.isFinite(year)) return badRequest('กรุณาเลือกบริษัทและปี');

    const db = saDb();
    const { data: existing } = await db
      .from(resource)
      .select('id')
      .eq('company_id', companyId)
      .eq('year', year);
    if ((existing || []).length > 0) return badRequest('ล็อกไว้อยู่แล้ว', 409);

    const { data, error } = await db
      .from(resource)
      .insert({
        company_id: companyId,
        year,
        locked_by: guard.session.username,
        note: String(body.note || '').trim() || null,
      })
      .select('id, company_id, year, locked_by, note, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'ล็อกไม่สำเร็จ');
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const resource = resourceOf(request);
  if (resource !== 'budget_locks' && resource !== 'training_plan_locks') {
    return badRequest('ลบได้เฉพาะการล็อกงบประมาณและแผนอบรม');
  }

  try {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id)) return badRequest('ไม่พบ id');
    const { error } = await saDb().from(resource).delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return saError(err, 'ปลดล็อกไม่สำเร็จ');
  }
}

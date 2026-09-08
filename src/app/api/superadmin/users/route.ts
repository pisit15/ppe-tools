import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireSuperAdmin, saDb, saError } from '@/lib/superAdminGuard';

export const runtime = 'nodejs';

// The platform keeps users in three tables, each owned by a different app.
// `hashPasswords` is false where another deployed app still compares the
// password as plaintext — flip it to true once that app accepts bcrypt.
type SourceKey = 'company_users' | 'tools_users' | 'company_credentials';

// uniqueScope mirrors the real DB constraint on each table, so a clash is
// reported in Thai instead of surfacing as a raw Postgres 23505.
type SourceConfig = {
  table: SourceKey;
  label: string;
  columns: string;
  editable: string[];
  idIsNumeric: boolean;
  hashPasswords: boolean;
  uniqueScope: 'company_and_username' | 'username' | 'one_per_company';
};

const SOURCES: Record<SourceKey, SourceConfig> = {
  company_users: {
    table: 'company_users',
    label: 'ผู้ใช้รายบริษัท (eashe.org)',
    columns: 'id, company_id, username, display_name, is_active, created_at, updated_at',
    editable: ['company_id', 'username', 'display_name', 'is_active'],
    idIsNumeric: true,
    hashPasswords: false,
    uniqueScope: 'company_and_username',
  },
  tools_users: {
    table: 'tools_users',
    label: 'ผู้ใช้ tools.eashe.org',
    columns:
      'id, company_id, company_name, username, display_name, nickname, position, email, phone, role, is_active, created_at, updated_at',
    editable: [
      'company_id',
      'company_name',
      'username',
      'display_name',
      'nickname',
      'position',
      'email',
      'phone',
      'role',
      'is_active',
    ],
    idIsNumeric: false,
    hashPasswords: true,
    uniqueScope: 'username',
  },
  company_credentials: {
    table: 'company_credentials',
    label: 'รหัสเข้าระบบระดับบริษัท',
    columns: 'id, company_id, username, is_active, created_at, updated_at',
    editable: ['company_id', 'username', 'is_active'],
    idIsNumeric: true,
    hashPasswords: false,
    uniqueScope: 'one_per_company',
  },
};

function resolveSource(request: NextRequest): SourceConfig | null {
  const key = (request.nextUrl.searchParams.get('source') || 'company_users') as SourceKey;
  return SOURCES[key] || null;
}

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function encodePassword(raw: string, cfg: SourceConfig): string {
  return cfg.hashPasswords ? bcrypt.hashSync(raw, 10) : raw;
}

function pickEditable(body: Record<string, unknown>, cfg: SourceConfig) {
  const patch: Record<string, unknown> = {};
  for (const field of cfg.editable) {
    if (body[field] === undefined) continue;
    patch[field] = typeof body[field] === 'string' ? (body[field] as string).trim() : body[field];
  }
  return patch;
}

// Returns a Thai error message when the row would violate the table's own
// uniqueness rule, or null when it is safe to write.
async function uniquenessConflict(
  cfg: SourceConfig,
  companyId: string,
  username: string,
  excludeId?: string
): Promise<string | null> {
  let query = saDb().from(cfg.table).select('id');

  if (cfg.uniqueScope === 'username') {
    query = query.ilike('username', username);
  } else if (cfg.uniqueScope === 'one_per_company') {
    query = query.eq('company_id', companyId);
  } else {
    query = query.eq('company_id', companyId).ilike('username', username);
  }

  if (excludeId !== undefined) {
    query = query.neq('id', cfg.idIsNumeric ? Number(excludeId) : excludeId);
  }

  const { data } = await query;
  if ((data || []).length === 0) return null;

  if (cfg.uniqueScope === 'username') {
    return `ชื่อผู้ใช้ "${username}" ถูกใช้แล้ว (ตารางนี้ห้ามซ้ำทั้งระบบ)`;
  }
  if (cfg.uniqueScope === 'one_per_company') {
    return `บริษัท "${companyId}" มีรหัสเข้าระบบอยู่แล้ว (1 บริษัทมีได้ 1 รายการ)`;
  }
  return `ชื่อผู้ใช้ "${username}" มีอยู่แล้วในบริษัทนี้`;
}

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const cfg = resolveSource(request);
  if (!cfg) return badRequest('ไม่รู้จักแหล่งข้อมูลผู้ใช้');

  try {
    const params = request.nextUrl.searchParams;
    const companyId = params.get('company_id');
    const search = (params.get('q') || '').trim();

    let query = saDb().from(cfg.table).select(cfg.columns);
    if (companyId && companyId !== 'all') query = query.eq('company_id', companyId);
    if (search) query = query.or(`username.ilike.%${search}%,company_id.ilike.%${search}%`);

    const { data, error } = await query.order('company_id').order('username');
    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      source: { key: cfg.table, label: cfg.label, hashPasswords: cfg.hashPasswords },
      sources: Object.values(SOURCES).map((s) => ({ key: s.table, label: s.label })),
    });
  } catch (err) {
    return saError(err, 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const cfg = resolveSource(request);
  if (!cfg) return badRequest('ไม่รู้จักแหล่งข้อมูลผู้ใช้');

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyId = String(body.company_id || '').trim();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!companyId || !username || !password) {
      return badRequest('กรุณากรอกบริษัท ชื่อผู้ใช้ และรหัสผ่าน');
    }
    if (password.length < 6) return badRequest('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
    const conflict = await uniquenessConflict(cfg, companyId, username);
    if (conflict) return badRequest(conflict, 409);

    const row: Record<string, unknown> = {
      ...pickEditable(body, cfg),
      company_id: companyId,
      username,
      password: encodePassword(password, cfg),
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    };

    // tools_users.company_name is NOT NULL — fall back to the company name in
    // company_settings, then to the id itself, so the insert can never fail on it.
    if (cfg.table === 'tools_users' && !row.company_name) {
      const { data: company } = await saDb()
        .from('company_settings')
        .select('company_name')
        .eq('company_id', companyId)
        .maybeSingle();
      row.company_name = company?.company_name || companyId;
    }

    const { data, error } = await saDb().from(cfg.table).insert(row).select(cfg.columns).single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'สร้างผู้ใช้ไม่สำเร็จ');
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const cfg = resolveSource(request);
  if (!cfg) return badRequest('ไม่รู้จักแหล่งข้อมูลผู้ใช้');

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = body.id === undefined ? '' : String(body.id);
    if (!id) return badRequest('ไม่พบ id ของผู้ใช้');

    const patch = pickEditable(body, cfg);
    const password = String(body.password || '');
    if (password) {
      if (password.length < 6) return badRequest('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
      patch.password = encodePassword(password, cfg);
    }
    if (Object.keys(patch).length === 0) return badRequest('ไม่มีข้อมูลที่จะแก้ไข');

    if (patch.company_id !== undefined || patch.username !== undefined) {
      const { data: current } = await saDb()
        .from(cfg.table)
        .select('company_id, username')
        .eq('id', cfg.idIsNumeric ? Number(id) : id)
        .maybeSingle();
      const nextCompany = String(patch.company_id ?? current?.company_id ?? '').trim();
      const nextUsername = String(patch.username ?? current?.username ?? '').trim();
      if (nextCompany && nextUsername) {
        const conflict = await uniquenessConflict(cfg, nextCompany, nextUsername, id);
        if (conflict) return badRequest(conflict, 409);
      }
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await saDb()
      .from(cfg.table)
      .update(patch)
      .eq('id', cfg.idIsNumeric ? Number(id) : id)
      .select(cfg.columns)
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return saError(err, 'แก้ไขผู้ใช้ไม่สำเร็จ');
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const cfg = resolveSource(request);
  if (!cfg) return badRequest('ไม่รู้จักแหล่งข้อมูลผู้ใช้');

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return badRequest('ไม่พบ id ของผู้ใช้');

    const { error } = await saDb()
      .from(cfg.table)
      .delete()
      .eq('id', cfg.idIsNumeric ? Number(id) : id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return saError(err, 'ลบผู้ใช้ไม่สำเร็จ');
  }
}

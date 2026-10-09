import type { ChemSubstance, CreateChemSubstanceInput } from '@/lib/types';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, assertCompany, type ToolsActor } from '@/lib/toolsSession';
import { sanitizeSubstance } from './sanitize';
import { sdsImporter, sdsSourceKey } from './sds-provenance';

export async function assertExistingCompany(companyId: string) {
  const { data, error } = await getSupabaseServer().from('company_settings').select('company_id').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบบริษัทที่เลือก', 400);
}
export async function prepareSubstance(body: Record<string, unknown>, actor: ToolsActor, existing?: ChemSubstance) {
  const companyId = existing?.company_id || body.company_id;
  assertCompany(actor, companyId, true);
  if (existing && body.company_id !== undefined && body.company_id !== companyId) throw new AccessError('ไม่สามารถย้ายสารเคมีข้ามบริษัท', 409);
  const db = getSupabaseServer();
  await assertExistingCompany(companyId);
  const clean = sanitizeSubstance(body as Partial<CreateChemSubstanceInput>);
  if ((!existing || clean.name !== undefined) && !clean.name?.trim()) throw new AccessError('กรุณาระบุชื่อสารเคมี', 400);
  const areaId = clean.storage_area_id === undefined ? existing?.storage_area_id : clean.storage_area_id;
  if (areaId) {
    const { data, error } = await db.from('chem_storage_areas').select('id').eq('id', areaId).eq('company_id', companyId).eq('is_active', true).maybeSingle();
    if (error) throw error;
    if (!data) throw new AccessError('พื้นที่จัดเก็บไม่อยู่ในบริษัทนี้หรือถูกปิดใช้งาน', 400);
  }
  if (clean.sds_file_path) assertSdsPath(clean.sds_file_path, companyId);
  if (clean.sds_url) {
    try { const u = new URL(clean.sds_url); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error(); }
    catch { throw new AccessError('ลิงก์ SDS ต้องเป็น HTTP หรือ HTTPS ที่ถูกต้อง', 400); }
  }
  const sdsSource = {
    sds_file_path: clean.sds_file_path === undefined ? existing?.sds_file_path || null : clean.sds_file_path,
    sds_url: clean.sds_url === undefined ? existing?.sds_url || null : clean.sds_url,
  };
  const sourceKey = sdsSourceKey(sdsSource);
  let sdsImport = existing?.sds_import || null;
  if (!sourceKey) sdsImport = null;
  else if (!existing || sourceKey !== sdsSourceKey(existing)) {
    if (sdsSource.sds_file_path) {
      const { data, error } = await db.from('chem_sds_uploads').select('importer')
        .eq('path', sdsSource.sds_file_path).eq('company_id', companyId).maybeSingle();
      if (error) throw error;
      if (!data) throw new AccessError('ไม่พบประวัติการอัปโหลดไฟล์ SDS นี้ กรุณาอัปโหลดไฟล์อีกครั้ง', 400);
      sdsImport = data.importer;
    } else {
      sdsImport = sdsImporter(actor, 'link');
    }
  }
  if (clean.quantity != null && (!Number.isFinite(clean.quantity) || clean.quantity < 0)) throw new AccessError('ปริมาณต้องเป็นศูนย์หรือมากกว่า', 400);
  if (clean.sds_revision_date && (!/^\d{4}-\d{2}-\d{2}$/.test(clean.sds_revision_date) || !Number.isFinite(Date.parse(clean.sds_revision_date)) || new Date(clean.sds_revision_date).toISOString().slice(0,10) !== clean.sds_revision_date)) throw new AccessError('วันที่ SDS ไม่ถูกต้อง', 400);
  const aiFields = [...new Set([...(existing?.ai_filled_fields || []), ...(Array.isArray(body.ai_filled_fields) ? body.ai_filled_fields.filter((v): v is string => typeof v === 'string' && v in clean) : [])])];
  const changed = !existing || Object.entries(clean).some(([k,v]) => !['company_id','created_by','is_active','storage_class_suggested'].includes(k) && JSON.stringify(existing[k as keyof ChemSubstance]) !== JSON.stringify(v));
  const provenanceChanged = aiFields.some(k => !existing?.ai_filled_fields?.includes(k));
  const confirmed = body.review_confirmed === true;
  return { ...clean, company_id: companyId, sds_import: sdsImport, ai_filled_fields: aiFields,
    review_status: confirmed ? 'reviewed' : (changed || provenanceChanged) ? 'unreviewed' : existing?.review_status || 'unreviewed',
    reviewed_by: confirmed ? actor.username : (changed || provenanceChanged) ? null : existing?.reviewed_by || null,
    reviewed_at: confirmed ? new Date().toISOString() : (changed || provenanceChanged) ? null : existing?.reviewed_at || null,
    ...(!existing ? { created_by: actor.username, is_active: true, is_demo: false } : {}),
  };
}
export function assertSdsPath(path: string, companyId?: string) {
  const parts = path.split('/');
  if (parts.length !== 2 || !/^[a-zA-Z0-9_-]+$/.test(parts[0]) || !/^[a-zA-Z0-9._-]+$/.test(parts[1]) || parts.some(p => p === '.' || p === '..') || (companyId && parts[0] !== companyId)) throw new AccessError('ไฟล์ SDS ไม่อยู่ในบริษัทที่เลือก', 400);
  return parts[0];
}

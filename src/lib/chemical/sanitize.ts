import type { CreateChemSubstanceInput } from '@/lib/types';

export const SUBSTANCE_SELECT = '*, chem_storage_areas!chem_substances_area_company_fk(id, name)';

/** ล้างค่าว่างจากฟอร์มให้เป็น null / array / object ที่ DB รับได้ (ใช้ร่วมกันใน POST และ PUT) */
export function sanitizeSubstance(body: Partial<CreateChemSubstanceInput>): Partial<CreateChemSubstanceInput> {
  const allowed = ['name','chemical_name','cas_no','un_no','supplier','physical_state','ghs_pictograms','signal_word','hazard_classes','h_codes','p_codes','flash_point_c','boiling_point_c','storage_class','storage_class_suggested','storage_area_id','storage_location','storage_conditions','quantity','unit','container','ppe_required','first_aid','fire_fighting','spill_response','emergency_contact','sds_url','sds_file_path','sds_file_name','sds_revision_date','sds_language','usage_purpose','notes'];
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  ['flash_point_c', 'boiling_point_c', 'quantity'].forEach(k => {
    if (!(k in out)) return;
    const v = out[k];
    if (v === '' || v === undefined) out[k] = null;
    else if (v !== null && typeof v !== 'number') { const n = Number(v); out[k] = Number.isFinite(n) ? n : null; }
  });
  if (out.sds_revision_date === '') out.sds_revision_date = null;
  ['ghs_pictograms', 'hazard_classes', 'h_codes', 'p_codes', 'ppe_required'].forEach(k => {
    if (k in out) out[k] = Array.isArray(out[k]) ? (out[k] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  });
  if ('first_aid' in out && (out.first_aid === null || typeof out.first_aid !== 'object' || Array.isArray(out.first_aid))) out.first_aid = {};
  ['storage_area_id', 'storage_class', 'storage_class_suggested', 'signal_word', 'physical_state'].forEach(k => {
    if (out[k] === '') out[k] = null;
  });
  // ฟิลด์ที่ join มา / ฟิลด์ระบบ — ห้ามเขียนทับ
  delete out.chem_storage_areas;
  delete out.id;
  delete out.created_at;
  delete out.updated_at;
  return out as Partial<CreateChemSubstanceInput>;
}

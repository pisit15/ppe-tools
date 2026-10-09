import type { CreateChemSubstanceInput } from '@/lib/types';

export const SUBSTANCE_SELECT = '*, chem_storage_areas(id, name)';

/** ล้างค่าว่างจากฟอร์มให้เป็น null / array / object ที่ DB รับได้ (ใช้ร่วมกันใน POST และ PUT) */
export function sanitizeSubstance(body: Partial<CreateChemSubstanceInput>): Partial<CreateChemSubstanceInput> {
  const out: Record<string, unknown> = { ...body };
  ['flash_point_c', 'boiling_point_c', 'quantity'].forEach(k => {
    const v = out[k];
    if (v === '' || v === undefined) out[k] = null;
    else if (v !== null && typeof v !== 'number') { const n = Number(v); out[k] = Number.isFinite(n) ? n : null; }
  });
  if (out.sds_revision_date === '' || out.sds_revision_date === undefined) out.sds_revision_date = null;
  ['ghs_pictograms', 'hazard_classes', 'h_codes', 'p_codes', 'ppe_required'].forEach(k => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  if (out.first_aid === undefined || out.first_aid === null || typeof out.first_aid !== 'object') out.first_aid = {};
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

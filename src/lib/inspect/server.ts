import { randomBytes } from 'node:crypto';
import { AccessError } from '@/lib/toolsSession';
import { INSPECT_BUCKET, INSPECT_LIMITS } from './constants';
import { db } from './access';
import { bangkokToday, evaluateResults, periodOf, validateAttributes } from './validation';
import type {
  CreateInspectionInput, InspAssetRow, InspAssetStatusRow, InspAssetView, InspCategoryRow, InspCompanySettingsRow, InspDashboard,
  InspInspectionRow, InspInspectionSource, InspInspectionView, InspPhotoRow, InspPublicAssetInfo, InspTemplateRow, InspectionMode,
} from './types';

export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url');

const CATEGORY_SELECT = 'id, key, name, icon, color, inspection_interval_days, service_label';
const ASSET_SELECT = `*, insp_categories!insp_assets_category_id_fkey(${CATEGORY_SELECT}), insp_templates!insp_assets_template_id_fkey(id, name)`;

type AssetJoined = InspAssetRow & { insp_categories: InspAssetView['category']; insp_templates: InspAssetView['template'] };

export async function companyName(companyId: string) {
  const { data, error } = await db().from('company_settings').select('company_id, company_name').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบบริษัท', 404);
  return String(data.company_name || data.company_id);
}

export async function companySettings(companyId: string): Promise<InspCompanySettingsRow> {
  const { data, error } = await db().from('insp_company_settings').select('*').eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  return (data as InspCompanySettingsRow | null) ?? {
    company_id: companyId, inspection_mode: 'she' as InspectionMode, photo_retention_days: 90, max_photos_pass: 1, max_photos_fail: 3, require_photo: true, updated_at: '', updated_by: null,
  };
}

/** Shared defaults (company_id null) + the company's own categories, active only unless `all`. */
export async function loadCategories(companyId: string, all = false): Promise<{ categories: InspCategoryRow[]; templates: InspTemplateRow[] }> {
  const client = db();
  let cq = client.from('insp_categories').select('*').or(`company_id.is.null,company_id.eq.${companyId}`).order('sort_order').order('name');
  if (!all) cq = cq.eq('is_active', true);
  const { data: cats, error } = await cq;
  if (error) throw error;
  const ids = (cats || []).map(c => c.id);
  let tq = client.from('insp_templates').select('*').in('category_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).or(`company_id.is.null,company_id.eq.${companyId}`).order('is_default', { ascending: false }).order('name');
  if (!all) tq = tq.eq('is_active', true);
  const { data: tpls, error: tErr } = await tq;
  if (tErr) throw tErr;
  return { categories: (cats || []) as InspCategoryRow[], templates: (tpls || []) as InspTemplateRow[] };
}

export function defaultTemplateFor(templates: InspTemplateRow[], categoryId: string, companyId: string): InspTemplateRow | null {
  const mine = templates.filter(t => t.category_id === categoryId && t.is_active);
  return mine.find(t => t.company_id === companyId && t.is_default) || mine.find(t => t.is_default) || mine[0] || null;
}

function toView(row: AssetJoined, status: Map<string, InspAssetStatusRow>): InspAssetView {
  const { insp_categories, insp_templates, ...asset } = row;
  const s = status.get(asset.id);
  return {
    ...asset,
    category: insp_categories,
    template: insp_templates,
    status_info: s
      ? { inspection_interval_days: s.inspection_interval_days, last_inspected_on: s.last_inspected_on, last_overall: s.last_overall, last_inspector_name: s.last_inspector_name, next_due_on: s.next_due_on, due_state: s.due_state, effective_service_interval_months: s.effective_service_interval_months, next_service_due_on: s.next_service_due_on, open_failures: Number(s.open_failures || 0) }
      : { inspection_interval_days: insp_categories.inspection_interval_days, last_inspected_on: null, last_overall: null, last_inspector_name: null, next_due_on: null, due_state: asset.status === 'active' ? 'never' : 'inactive', effective_service_interval_months: null, next_service_due_on: null, open_failures: 0 },
  };
}

export async function listAssets(companyId: string, opts: { includeInactive?: boolean } = {}): Promise<InspAssetView[]> {
  const client = db();
  let q = client.from('insp_assets').select(ASSET_SELECT).eq('company_id', companyId).order('code');
  if (!opts.includeInactive) q = q.eq('status', 'active');
  const [{ data, error }, { data: st, error: sErr }] = await Promise.all([q, client.from('insp_asset_status').select('*').eq('company_id', companyId)]);
  if (error) throw error;
  if (sErr) throw sErr;
  const status = new Map((st as InspAssetStatusRow[] | null || []).map(s => [s.asset_id, s]));
  return ((data || []) as unknown as AssetJoined[]).map(r => toView(r, status));
}

export async function getAsset(id: string): Promise<InspAssetView> {
  const client = db();
  const { data, error } = await client.from('insp_assets').select(ASSET_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบอุปกรณ์', 404);
  const { data: st, error: sErr } = await client.from('insp_asset_status').select('*').eq('asset_id', id).maybeSingle();
  if (sErr) throw sErr;
  const status = new Map<string, InspAssetStatusRow>();
  if (st) status.set(id, st as InspAssetStatusRow);
  return toView(data as unknown as AssetJoined, status);
}

export async function assetByToken(token: string) {
  const { data, error } = await db().from('insp_assets').select('*').eq('qr_token', token).maybeSingle();
  if (error) throw error;
  const asset = data as InspAssetRow | null;
  if (!asset) throw new AccessError('ไม่พบอุปกรณ์จาก QR นี้ — อาจถูกพิมพ์ใหม่แล้ว กรุณาติดต่อทีม SHE', 404);
  return asset;
}

export async function publicAssetInfo(token: string, actorName: string | null): Promise<InspPublicAssetInfo> {
  const asset = await assetByToken(token);
  const client = db();
  const [name, settings, { categories, templates }, { data: st, error: sErr }, { data: last, error: lErr }] = await Promise.all([
    companyName(asset.company_id), companySettings(asset.company_id), loadCategories(asset.company_id, true),
    client.from('insp_asset_status').select('*').eq('asset_id', asset.id).maybeSingle(),
    client.from('insp_inspections').select('inspected_on, inspector_name, overall, fail_items, period').eq('asset_id', asset.id).order('inspected_on', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (sErr) throw sErr;
  if (lErr) throw lErr;
  const category = categories.find(c => c.id === asset.category_id);
  if (!category) throw new AccessError('หมวดอุปกรณ์นี้ถูกปิดใช้งาน', 404);
  const template = (asset.template_id && templates.find(t => t.id === asset.template_id)) || defaultTemplateFor(templates, category.id, asset.company_id);
  if (!template) throw new AccessError('หมวดนี้ยังไม่มีรายการตรวจ กรุณาติดต่อทีม SHE', 404);
  const status = st as InspAssetStatusRow | null;
  const lastRow = last as (Pick<InspInspectionRow, 'inspected_on' | 'inspector_name' | 'overall' | 'fail_items' | 'period'>) | null;
  const today = bangkokToday();
  const inspectedThisPeriod = !!lastRow && (category.inspection_interval_days >= 28
    ? lastRow.period === periodOf(today)
    : (Date.parse(today) - Date.parse(lastRow.inspected_on)) / 86400000 < category.inspection_interval_days);
  return {
    company: { id: asset.company_id, name },
    mode: settings.inspection_mode,
    settings: { require_photo: settings.require_photo, max_photos_pass: settings.max_photos_pass, max_photos_fail: settings.max_photos_fail },
    asset: { id: asset.id, code: asset.code, name: asset.name, department: asset.department, building: asset.building, floor: asset.floor, location: asset.location, attributes: asset.attributes, mfg_year: asset.mfg_year, mfg_month: asset.mfg_month, status: asset.status },
    category: { key: category.key, name: category.name, icon: category.icon, color: category.color, inspection_interval_days: category.inspection_interval_days, service_label: category.service_label, attributes: category.attributes },
    template: { id: template.id, name: template.name, version: template.version, items: template.items },
    status: {
      last_inspected_on: status?.last_inspected_on ?? null, last_overall: status?.last_overall ?? null, next_due_on: status?.next_due_on ?? null,
      due_state: status?.due_state ?? 'never', next_service_due_on: status?.next_service_due_on ?? null, open_failures: Number(status?.open_failures || 0),
    },
    last_inspection: lastRow ? { inspected_on: lastRow.inspected_on, inspector_name: lastRow.inspector_name, overall: lastRow.overall, fail_items: lastRow.fail_items } : null,
    inspected_this_period: inspectedThisPeriod,
    actor: actorName ? { name: actorName } : null,
  };
}

/** Resolve the inspector identity for a submission according to the company mode. */
export async function resolveInspector(companyId: string, mode: InspectionMode, actorName: string | null, code: string, name: string): Promise<{ inspector_code: string; inspector_name: string }> {
  if (actorName) return { inspector_code: code || 'SHE', inspector_name: actorName };
  if (mode !== 'department') throw new AccessError('บริษัทนี้ให้ทีม SHE เป็นผู้ตรวจ กรุณาเข้าสู่ระบบก่อนบันทึกผล', 401);
  if (!code) throw new AccessError('กรุณากรอกรหัสผู้ตรวจ', 400);
  const { data, error } = await db().from('insp_inspectors').select('code, name, department').eq('company_id', companyId).eq('is_active', true).ilike('code', code).maybeSingle();
  if (error) throw error;
  if (!data) throw new AccessError('ไม่พบรหัสผู้ตรวจนี้ในทะเบียน กรุณาติดต่อทีม SHE', 403);
  void name;
  return { inspector_code: String(data.code), inspector_name: String(data.name) };
}

/** Insert an inspection + photo rows. Photo paths must already exist in the bucket under <company>/<asset>/. */
export async function createInspection(asset: InspAssetRow, template: InspTemplateRow, input: CreateInspectionInput, who: { inspector_code: string; inspector_name: string }, source: InspInspectionSource, settings: InspCompanySettingsRow): Promise<InspInspectionRow> {
  if (asset.status !== 'active') throw new AccessError('อุปกรณ์นี้ถูกปิดใช้งานแล้ว', 400);
  const client = db();
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count, error: cErr } = await client.from('insp_inspections').select('id', { count: 'exact', head: true }).eq('asset_id', asset.id).gte('created_at', since);
  if (cErr) throw cErr;
  if ((count || 0) >= INSPECT_LIMITS.maxInspectionsPerAssetPerHour) throw new AccessError('บันทึกผลอุปกรณ์นี้ถี่เกินไป กรุณาลองใหม่ภายหลัง', 429);

  const { results, fail_items, overall } = evaluateResults(template.items, input.results);
  const paths = (input.photo_paths || []).filter(p => p.startsWith(`${asset.company_id}/${asset.id}/`));
  const maxPhotos = overall === 'fail' ? settings.max_photos_fail : settings.max_photos_pass;
  if (paths.length > maxPhotos) throw new AccessError(`แนบรูปได้ไม่เกิน ${maxPhotos} รูป`, 400);
  if (settings.require_photo && paths.length === 0 && settings.max_photos_pass > 0) throw new AccessError('กรุณาแนบรูปอุปกรณ์อย่างน้อย 1 รูป', 400);

  const inspected_on = input.inspected_on || bangkokToday();
  const { data, error } = await client.from('insp_inspections').insert([{
    company_id: asset.company_id, asset_id: asset.id, template_id: template.id, template_version: template.version,
    inspected_on, period: periodOf(inspected_on), inspector_code: who.inspector_code, inspector_name: who.inspector_name,
    results, overall, fail_items, note: input.note || '', source,
  }]).select('*').single();
  if (error) throw error;
  const row = data as InspInspectionRow;
  if (paths.length) {
    const { error: pErr } = await client.from('insp_photos').update({ inspection_id: row.id }).in('storage_path', paths).eq('asset_id', asset.id).is('inspection_id', null);
    if (pErr) throw pErr;
  }
  return row;
}

/** Signed upload: reserve a path + photo row, return the URL the browser PUTs the file to. */
export async function signPhotoUpload(companyId: string, assetId: string, ext: 'jpg' | 'webp' | 'png' | 'pdf') {
  const path = `${companyId}/${assetId}/${newToken(12)}.${ext}`;
  const { data, error } = await db().storage.from(INSPECT_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** After the browser uploaded: verify the object exists + size, record the row. */
export async function confirmPhoto(companyId: string, assetId: string, path: string, meta: { width: number; height: number }): Promise<InspPhotoRow> {
  if (!path.startsWith(`${companyId}/${assetId}/`)) throw new AccessError('รูปภาพไม่ถูกต้อง', 400);
  const client = db();
  const folder = path.slice(0, path.lastIndexOf('/'));
  const file = path.slice(path.lastIndexOf('/') + 1);
  const { data: objs, error } = await client.storage.from(INSPECT_BUCKET).list(folder, { search: file, limit: 5 });
  if (error) throw error;
  const obj = (objs || []).find(o => o.name === file);
  if (!obj) throw new AccessError('ยังอัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่', 400);
  const bytes = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
  if (bytes > INSPECT_LIMITS.maxPhotoBytes * 2) {
    await client.storage.from(INSPECT_BUCKET).remove([path]);
    throw new AccessError('รูปใหญ่เกินกำหนด กรุณาถ่ายใหม่', 413);
  }
  const { data, error: iErr } = await client.from('insp_photos').insert([{ company_id: companyId, asset_id: assetId, storage_path: path, bytes, width: meta.width, height: meta.height }]).select('*').single();
  if (iErr) throw iErr;
  return data as InspPhotoRow;
}

export async function signedPhotoUrl(path: string, seconds = 1800, transform?: { width: number; height: number }) {
  const { data, error } = await db().storage.from(INSPECT_BUCKET).createSignedUrl(path, seconds, transform ? { transform: { width: transform.width, height: transform.height, resize: 'cover' } } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

const INSPECTION_SELECT = '*, insp_photos(id, storage_path, deleted_at)';
type InspectionJoined = InspInspectionRow & { insp_photos: Pick<InspPhotoRow, 'id' | 'storage_path' | 'deleted_at'>[] };

export async function listInspections(companyId: string, f: { asset_id?: string; period?: string; from?: string; to?: string; overall?: 'pass' | 'fail'; open?: boolean; limit?: number }): Promise<InspInspectionView[]> {
  let q = db().from('insp_inspections').select(INSPECTION_SELECT).eq('company_id', companyId).order('inspected_on', { ascending: false }).order('created_at', { ascending: false }).limit(f.limit ?? 500);
  if (f.asset_id) q = q.eq('asset_id', f.asset_id);
  if (f.period) q = q.eq('period', f.period);
  if (f.from) q = q.gte('inspected_on', f.from);
  if (f.to) q = q.lte('inspected_on', f.to);
  if (f.overall) q = q.eq('overall', f.overall);
  if (f.open) q = q.eq('overall', 'fail').is('resolved_at', null);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []) as unknown as InspectionJoined[];
  const assetIds = [...new Set(rows.map(r => r.asset_id))];
  const assets = new Map<string, InspInspectionView['asset']>();
  if (assetIds.length) {
    const { data: ar, error: aErr } = await db().from('insp_assets').select(`id, code, name, department, location, insp_categories!insp_assets_category_id_fkey(name, color)`).in('id', assetIds);
    if (aErr) throw aErr;
    for (const a of (ar || []) as unknown as (Pick<InspAssetRow, 'id' | 'code' | 'name' | 'department' | 'location'> & { insp_categories: { name: string; color: string } })[]) {
      assets.set(a.id, { id: a.id, code: a.code, name: a.name, department: a.department, location: a.location, category_name: a.insp_categories?.name || '', category_color: a.insp_categories?.color || '#4E79A7' });
    }
  }
  return rows.map(({ insp_photos, ...r }) => ({ ...r, photos: insp_photos || [], asset: assets.get(r.asset_id) }));
}

export async function dashboard(companyId: string, period: string): Promise<InspDashboard> {
  const client = db();
  const [assets, { categories }, openFailures, { data: monthlyRows, error: mErr }, { data: photoAgg, error: pErr }] = await Promise.all([
    listAssets(companyId), loadCategories(companyId, true), listInspections(companyId, { open: true, limit: 100 }),
    client.from('insp_inspections').select('period, overall').eq('company_id', companyId).gte('period', shiftPeriod(period, -11)).lte('period', period),
    client.from('insp_photos').select('bytes').eq('company_id', companyId).is('deleted_at', null),
  ]);
  if (mErr) throw mErr;
  if (pErr) throw pErr;
  const today = bangkokToday();
  const inPeriod = (a: InspAssetView) => {
    const last = a.status_info.last_inspected_on;
    if (!last) return false;
    return a.category.inspection_interval_days >= 28 ? last.slice(0, 7) === period : a.status_info.due_state === 'ok' || a.status_info.due_state === 'due_soon';
  };
  const due90 = addDaysStr(today, 90);
  const totals = { assets: assets.length, inspected: 0, due_soon: 0, overdue: 0, never: 0, open_failures: 0, service_due_90d: 0, service_overdue: 0 };
  const byCat = new Map<string, InspDashboard['by_category'][number]>();
  const byDept = new Map<string, InspDashboard['by_department'][number]>();
  const serviceDue: InspDashboard['service_due'] = [];
  for (const a of assets) {
    const s = a.status_info;
    const done = inPeriod(a);
    if (done) totals.inspected++;
    if (s.due_state === 'due_soon') totals.due_soon++;
    if (s.due_state === 'overdue') totals.overdue++;
    if (s.due_state === 'never') totals.never++;
    totals.open_failures += s.open_failures;
    const svc = s.next_service_due_on;
    if (svc) {
      if (svc < today) totals.service_overdue++;
      if (svc <= due90) {
        totals.service_due_90d++;
        serviceDue.push({ id: a.id, code: a.code, name: a.name, department: a.department, location: a.location, category_name: a.category.name, category_color: a.category.color, service_label: a.category.service_label, next_service_due_on: svc, last_service_on: a.last_service_on });
      }
    }
    const c = byCat.get(a.category_id) || { category_id: a.category_id, key: a.category.key, name: a.category.name, color: a.category.color, icon: a.category.icon, assets: 0, inspected: 0, overdue: 0, open_failures: 0 };
    c.assets++; if (done) c.inspected++; if (s.due_state === 'overdue') c.overdue++; c.open_failures += s.open_failures; byCat.set(a.category_id, c);
    const dk = a.department || 'ไม่ระบุแผนก';
    const d = byDept.get(dk) || { department: dk, assets: 0, inspected: 0, overdue: 0, open_failures: 0 };
    d.assets++; if (done) d.inspected++; if (s.due_state === 'overdue') d.overdue++; d.open_failures += s.open_failures; byDept.set(dk, d);
  }
  const monthly: InspDashboard['monthly'] = [];
  for (let i = 11; i >= 0; i--) {
    const p = shiftPeriod(period, -i);
    const rows = ((monthlyRows || []) as { period: string; overall: string }[]).filter(r => r.period === p);
    monthly.push({ period: p, inspections: rows.length, fails: rows.filter(r => r.overall === 'fail').length });
  }
  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  serviceDue.sort((x, y) => x.next_service_due_on.localeCompare(y.next_service_due_on));
  const photos = (photoAgg || []) as { bytes: number }[];
  return {
    company_id: companyId, period, totals,
    by_category: [...byCat.values()].sort((x, y) => (catOrder.get(x.category_id) ?? 99) - (catOrder.get(y.category_id) ?? 99)),
    by_department: [...byDept.values()].sort((x, y) => y.assets - x.assets),
    monthly, open_failures: openFailures, service_due: serviceDue.slice(0, 50),
    storage: { photos: photos.length, bytes: photos.reduce((s, p) => s + Number(p.bytes || 0), 0) },
  };
}

export function shiftPeriod(period: string, months: number) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}
function addDaysStr(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Retention: delete photo objects older than each company's photo_retention_days.
 * Photos of unresolved failures are kept; photos of resolved failures count from the resolution date.
 * Runs in bounded batches so a Vercel function never times out.
 */
export async function runRetention(batch = 300): Promise<{ scanned: number; deleted: number; kept_open_failures: number }> {
  const client = db();
  const { data: settings, error: sErr } = await client.from('insp_company_settings').select('company_id, photo_retention_days');
  if (sErr) throw sErr;
  const retention = new Map((settings || []).map(s => [String(s.company_id), Number(s.photo_retention_days)]));
  const defaultDays = 90;
  const maxDays = Math.max(defaultDays, ...retention.values());
  const horizon = new Date(Date.now() - (Math.min(...[defaultDays, ...retention.values()])) * 86400000).toISOString();
  void maxDays;
  const { data: photos, error } = await client.from('insp_photos').select('id, company_id, storage_path, created_at, inspection_id').is('deleted_at', null).lt('created_at', horizon).order('created_at').limit(batch);
  if (error) throw error;
  const rows = (photos || []) as Pick<InspPhotoRow, 'id' | 'company_id' | 'storage_path' | 'created_at' | 'inspection_id'>[];
  if (!rows.length) return { scanned: 0, deleted: 0, kept_open_failures: 0 };
  const inspIds = [...new Set(rows.map(r => r.inspection_id).filter((x): x is string => !!x))];
  const { data: insps, error: iErr } = await client.from('insp_inspections').select('id, overall, resolved_at').in('id', inspIds.length ? inspIds : ['00000000-0000-0000-0000-000000000000']);
  if (iErr) throw iErr;
  const inspMap = new Map((insps || []).map(i => [String(i.id), i as { overall: string; resolved_at: string | null }]));
  const toDelete: typeof rows = [];
  let kept = 0;
  for (const p of rows) {
    const days = retention.get(p.company_id) ?? defaultDays;
    const insp = p.inspection_id ? inspMap.get(p.inspection_id) : undefined;
    let anchor = Date.parse(p.created_at);
    if (insp?.overall === 'fail') {
      if (!insp.resolved_at) { kept++; continue; }
      anchor = Math.max(anchor, Date.parse(insp.resolved_at));
    }
    if (Date.now() - anchor > days * 86400000) toDelete.push(p);
  }
  if (!toDelete.length) return { scanned: rows.length, deleted: 0, kept_open_failures: kept };
  const { error: rmErr } = await client.storage.from(INSPECT_BUCKET).remove(toDelete.map(p => p.storage_path));
  if (rmErr) throw rmErr;
  const { error: uErr } = await client.from('insp_photos').update({ deleted_at: new Date().toISOString(), deleted_reason: 'retention' }).in('id', toDelete.map(p => p.id));
  if (uErr) throw uErr;
  return { scanned: rows.length, deleted: toDelete.length, kept_open_failures: kept };
}

export { validateAttributes };

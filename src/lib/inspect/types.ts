// Equipment Inspection module types. Mirrors supabase/migrations/20261101080000_equipment_inspection.sql.

export type InspAttributeType = 'text' | 'number' | 'select' | 'month';
export type InspAttributeDef = { key: string; label: string; type: InspAttributeType; options?: string[]; unit?: string; hint?: string };

export type InspItemKind = 'pass_fail' | 'pass_fail_na' | 'number';
export type InspItemDef = { key: string; label: string; kind: InspItemKind; unit?: string; required?: boolean; hint?: string };

export type InspCategoryRow = {
  id: string;
  company_id: string | null;
  key: string;
  name: string;
  icon: string;
  color: string;
  inspection_interval_days: number;
  service_label: string;
  service_interval_months: number | null;
  service_ref: string;
  attributes: InspAttributeDef[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InspTemplateRow = {
  id: string;
  category_id: string;
  company_id: string | null;
  key: string;
  name: string;
  version: number;
  items: InspItemDef[];
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InspectionMode = 'she' | 'department';
export type InspCompanySettingsRow = {
  company_id: string;
  inspection_mode: InspectionMode;
  photo_retention_days: number;
  max_photos_pass: number;
  max_photos_fail: number;
  require_photo: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type InspInspectorRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  department: string;
  is_active: boolean;
  created_at: string;
};

export type InspAssetStatus = 'active' | 'inactive' | 'disposed';
export type InspAssetRow = {
  id: string;
  company_id: string;
  category_id: string;
  template_id: string | null;
  code: string;
  name: string;
  department: string;
  building: string;
  floor: string;
  location: string;
  attributes: Record<string, string | number | null>;
  mfg_year: number | null;
  mfg_month: number | null;
  last_service_on: string | null;
  service_interval_months: number | null;
  reference_photo_path: string | null;
  floorplan_id: string | null;
  pos_x: number | null;
  pos_y: number | null;
  qr_token: string;
  status: InspAssetStatus;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InspDueState = 'ok' | 'due_soon' | 'overdue' | 'never' | 'inactive';
export type InspAssetStatusRow = {
  asset_id: string;
  company_id: string;
  category_id: string;
  status: InspAssetStatus;
  inspection_interval_days: number;
  last_inspected_on: string | null;
  last_overall: InspOverall | null;
  last_inspector_name: string | null;
  next_due_on: string | null;
  due_state: InspDueState;
  effective_service_interval_months: number | null;
  next_service_due_on: string | null;
  open_failures: number;
};

/** Registry row as the SHE pages receive it (asset + status + names). */
export type InspAssetView = InspAssetRow & {
  category: Pick<InspCategoryRow, 'id' | 'key' | 'name' | 'icon' | 'color' | 'inspection_interval_days' | 'service_label'>;
  template: Pick<InspTemplateRow, 'id' | 'name'> | null;
  status_info: Omit<InspAssetStatusRow, 'asset_id' | 'company_id' | 'category_id' | 'status'>;
};

export type InspOverall = 'pass' | 'fail';
export type InspResultValue = 'pass' | 'fail' | 'na' | number | null;
export type InspInspectionSource = 'qr' | 'app' | 'import' | 'line';
export type InspInspectionRow = {
  id: string;
  company_id: string;
  asset_id: string;
  template_id: string | null;
  template_version: number;
  inspected_on: string;
  period: string; // YYYY-MM
  inspector_code: string;
  inspector_name: string;
  results: Record<string, InspResultValue>;
  overall: InspOverall;
  fail_items: string[];
  note: string;
  source: InspInspectionSource;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_note: string;
  created_at: string;
};

export type InspPhotoRow = {
  id: string;
  company_id: string;
  asset_id: string;
  inspection_id: string | null;
  storage_path: string;
  bytes: number;
  width: number;
  height: number;
  created_at: string;
  deleted_at: string | null;
  deleted_reason: string;
  line_message_id: string | null;
};

export type InspFloorplanRow = {
  id: string;
  company_id: string;
  name: string;
  building: string;
  floor: string;
  image_path: string;
  width: number;
  height: number;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type InspFloorplanView = InspFloorplanRow & { image_url: string; placed: number };

export type InspLineUserRow = {
  line_user_id: string;
  company_id: string | null;
  inspector_code: string;
  inspector_name: string;
  linked_via: 'code' | 'account';
  last_inspection_id: string | null;
  last_asset_id: string | null;
  last_at: string | null;
  inspected_on_override: string | null;
  override_set_at: string | null;
  pending_asset_id: string | null;
  pending_message_id: string | null;
  pending_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InspServiceKind = 'legal_test' | 'refill' | 'maintenance' | 'replace' | 'dispose' | 'other';
export type InspServiceEventRow = {
  id: string;
  company_id: string;
  asset_id: string;
  kind: InspServiceKind;
  done_on: string;
  provider: string;
  certificate_no: string;
  file_path: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
};

/** Inspection as listed in history/log (with photos and asset summary). */
export type InspInspectionView = InspInspectionRow & {
  photos: Pick<InspPhotoRow, 'id' | 'storage_path' | 'deleted_at'>[];
  asset?: Pick<InspAssetRow, 'id' | 'code' | 'name' | 'department' | 'location'> & { category_name: string; category_color: string };
};

/** What the public QR form receives for an asset token. */
export type InspPublicAssetInfo = {
  company: { id: string; name: string };
  mode: InspectionMode;
  settings: Pick<InspCompanySettingsRow, 'require_photo' | 'max_photos_pass' | 'max_photos_fail'>;
  asset: Pick<InspAssetRow, 'id' | 'code' | 'name' | 'department' | 'building' | 'floor' | 'location' | 'attributes' | 'mfg_year' | 'mfg_month' | 'status'>;
  category: Pick<InspCategoryRow, 'key' | 'name' | 'icon' | 'color' | 'inspection_interval_days' | 'service_label' | 'attributes'>;
  template: Pick<InspTemplateRow, 'id' | 'name' | 'version' | 'items'>;
  status: Pick<InspAssetStatusRow, 'last_inspected_on' | 'last_overall' | 'next_due_on' | 'due_state' | 'next_service_due_on' | 'open_failures'>;
  last_inspection: Pick<InspInspectionRow, 'inspected_on' | 'inspector_name' | 'overall' | 'fail_items'> | null;
  inspected_this_period: boolean;
  /** Logged-in SHE actor (when the viewer has a tools session) */
  actor: { name: string } | null;
};

export type CreateInspectionInput = {
  asset_id: string;
  inspected_on?: string;
  inspector_code?: string;
  inspector_name?: string;
  results: Record<string, InspResultValue>;
  note?: string;
  photo_paths?: string[];
};

export type PublicCreateInspectionInput = Omit<CreateInspectionInput, 'asset_id'> & { token: string };

export type InspAssetInput = {
  company_id: string;
  category_id: string;
  template_id?: string | null;
  code: string;
  name?: string;
  department?: string;
  building?: string;
  floor?: string;
  location?: string;
  attributes?: Record<string, string | number | null>;
  mfg_year?: number | null;
  mfg_month?: number | null;
  last_service_on?: string | null;
  service_interval_months?: number | null;
  status?: InspAssetStatus;
  note?: string;
};

export type InspDashboard = {
  company_id: string;
  period: string;
  totals: { assets: number; inspected: number; due_soon: number; overdue: number; never: number; open_failures: number; service_due_90d: number; service_overdue: number };
  by_category: { category_id: string; key: string; name: string; color: string; icon: string; assets: number; inspected: number; overdue: number; open_failures: number }[];
  by_department: { department: string; assets: number; inspected: number; overdue: number; open_failures: number }[];
  monthly: { period: string; inspections: number; fails: number }[];
  open_failures: InspInspectionView[];
  service_due: (Pick<InspAssetRow, 'id' | 'code' | 'name' | 'department' | 'location'> & { category_name: string; category_color: string; service_label: string; next_service_due_on: string; last_service_on: string | null })[];
  storage: { photos: number; bytes: number };
};

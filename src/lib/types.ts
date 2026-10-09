export type PPEProduct = {
  id: string;
  company_id: string;
  name: string;
  type: string;
  unit: string;
  image_url: string | null;
  min_stock: number;
  item_code?: string | null;
  unit_price?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PPEStockSummary = {
  product_id: string;
  company_id: string;
  name: string;
  type: string;
  unit: string;
  image_url: string | null;
  min_stock: number;
  total_in: number;
  total_out: number;
  current_stock: number;
};

export type TransactionType = 'stock_in' | 'return' | 'stock_out' | 'borrow';

export type PPETransaction = {
  id: string;
  company_id: string;
  product_id: string;
  transaction_type: TransactionType;
  quantity: number;
  unit: string;
  transaction_date: string;
  po_number: string | null;
  employee_code: string | null;
  employee_name: string | null;
  department: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type PPEEmployee = {
  id: string;
  company_id: string;
  employee_code: string;
  name: string;
  position: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
};

export type PPEOrderSettings = {
  company_id: string;
  quotation_days: number;
  pr_days: number;
  wams_open_days: number;
  wams_process_days: number;
  delivery_days: number;
  updated_at?: string;
};

export type PPEOrderRemark = {
  id: number;
  company_id: string;
  product_id: string;
  period: string; // end month of the 3-month window, e.g. '2026-08'
  remark: string;
  actual_order_qty: number | null;
  updated_at: string;
};

export type PPEDepartment = {
  id: number;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateProductInput = Omit<PPEProduct, 'id' | 'created_at' | 'updated_at'>;
export type UpdateProductInput = Partial<CreateProductInput>;

export type CreateTransactionInput = Omit<PPETransaction, 'id' | 'created_at'>;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export type CreateEmployeeInput = Omit<PPEEmployee, 'id' | 'created_at'>;
export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export type DashboardStats = {
  total_products: number;
  total_transactions: number;
  low_stock_count: number;
  total_stock_in: number;
  total_stock_out: number;
};

// LINE chatbot (supabase/migrations/20261007120000_line_chatbot.sql) — server-only tables
export type LineLink = {
  line_user_id: string;
  account_source: 'admin_accounts' | 'company_users' | 'tools_users';
  account_id: string;
  username: string;
  company_id: string;
  linked_at: string;
  last_seen_at: string | null;
};

export type LineLinkCode = {
  code: string;
  line_user_id: string;
  expires_at: string;
  attempts: number;
  used_at: string | null;
  created_at: string;
};

// ═══════════════════════════════════════════════════════════
// Chemical Management (tables: chem_substances, chem_storage_areas)
// ═══════════════════════════════════════════════════════════

export type GhsPictogramCode = 'GHS01' | 'GHS02' | 'GHS03' | 'GHS04' | 'GHS05' | 'GHS06' | 'GHS07' | 'GHS08' | 'GHS09';
export type SignalWord = 'Danger' | 'Warning' | 'None';
export type PhysicalState = 'solid' | 'liquid' | 'gas' | 'aerosol';

/** ประเภทการจัดเก็บตามคู่มือการเก็บรักษาวัตถุอันตราย กรมโรงงานอุตสาหกรรม (23 รหัส) */
export type StorageClassCode =
  | '1' | '2A' | '2B' | '3A' | '3B' | '4.1A' | '4.1B' | '4.2' | '4.3'
  | '5.1A' | '5.1B' | '5.1C' | '5.2' | '6.1A' | '6.1B' | '6.2' | '7'
  | '8A' | '8B' | '10' | '11' | '12' | '13';

export type FirstAid = {
  inhalation?: string;
  skin?: string;
  eye?: string;
  ingestion?: string;
};

export type ChemStorageArea = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ChemSubstance = {
  id: string;
  company_id: string;
  name: string;
  chemical_name: string | null;
  cas_no: string | null;
  un_no: string | null;
  supplier: string | null;
  physical_state: PhysicalState | null;
  ghs_pictograms: GhsPictogramCode[];
  signal_word: SignalWord | null;
  hazard_classes: string[];
  h_codes: string[];
  p_codes: string[];
  flash_point_c: number | null;
  boiling_point_c: number | null;
  storage_class: StorageClassCode | null;
  storage_class_suggested: StorageClassCode | null;
  storage_area_id: string | null;
  storage_location: string | null;
  storage_conditions: string | null;
  quantity: number | null;
  unit: string | null;
  container: string | null;
  ppe_required: string[];
  first_aid: FirstAid;
  fire_fighting: string | null;
  spill_response: string | null;
  emergency_contact: string | null;
  sds_url: string | null;
  sds_file_path: string | null;
  sds_file_name: string | null;
  sds_revision_date: string | null;
  sds_language: string | null;
  usage_purpose: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** joined */
  chem_storage_areas?: Pick<ChemStorageArea, 'id' | 'name'> | null;
};

/** เบอร์ฉุกเฉินที่แต่ละบริษัทกำหนดเอง — แสดงท้ายโปสเตอร์ SDS ทุกใบของบริษัทนั้น */
export type ChemEmergencyContact = { label: string; phone: string };

export type ChemCompanySettings = {
  company_id: string;
  emergency_contacts: ChemEmergencyContact[];
  show_emergency: boolean;
  updated_at?: string;
};

export type CreateChemSubstanceInput = Omit<ChemSubstance, 'id' | 'created_at' | 'updated_at' | 'chem_storage_areas'>;
export type UpdateChemSubstanceInput = Partial<CreateChemSubstanceInput>;

/** ผลสกัดจาก SDS ด้วย AI — ทุกช่องเป็น optional เพราะ SDS แต่ละฉบับไม่ครบเท่ากัน */
export type SdsExtraction = Partial<Pick<ChemSubstance,
  'name' | 'chemical_name' | 'cas_no' | 'un_no' | 'supplier' | 'physical_state'
  | 'ghs_pictograms' | 'signal_word' | 'hazard_classes' | 'h_codes' | 'p_codes'
  | 'flash_point_c' | 'boiling_point_c' | 'storage_conditions' | 'ppe_required'
  | 'first_aid' | 'fire_fighting' | 'spill_response' | 'emergency_contact'
  | 'sds_revision_date' | 'sds_language'>> & {
  /** ข้อสังเกตจาก AI เช่น หน้าที่อ่านไม่ออก หรือค่าที่ไม่แน่ใจ */
  extraction_notes?: string;
};

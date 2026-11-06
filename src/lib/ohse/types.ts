// SHE Data Center (tables ohse_*). Replaces the Superhuman "OHSE DATA CENTER" doc.

export type OhseSectionKind = 'folder' | 'documents' | 'monitoring' | 'licenses' | 'link';
export type OhseDocStatus = 'current' | 'superseded';
export type OhseResult = 'pass' | 'not_pass';

export interface OhseSectionRow {
  id: string;
  company_id: string;
  parent_id: string | null;
  code: string;
  title: string;
  kind: OhseSectionKind;
  employee_visible: boolean;
  link_url: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Section + number of current documents directly inside it. */
export interface OhseSectionView extends OhseSectionRow {
  doc_count: number;
}

export interface OhseDocumentRow {
  id: string;
  company_id: string;
  section_id: string;
  doc_no: string | null;
  title: string;
  revision: string | null;
  doc_date: string | null;
  signed_by: string | null;
  agency: string | null;
  expires_on: string | null;
  result: OhseResult | null;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  link_url: string | null;
  status: OhseDocStatus;
  superseded_by: string | null;
  employee_visible: boolean | null;
  source: 'manual' | 'superhuman';
  source_ref: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Editable fields of a document (API input). */
export type OhseDocumentInput = Partial<Pick<OhseDocumentRow,
  'section_id' | 'doc_no' | 'title' | 'revision' | 'doc_date' | 'signed_by' | 'agency' | 'expires_on'
  | 'result' | 'note' | 'file_path' | 'file_name' | 'file_size' | 'mime_type' | 'link_url'
  | 'employee_visible' | 'sort_order'>>;

export type OhseSectionInput = Partial<Pick<OhseSectionRow,
  'parent_id' | 'code' | 'title' | 'kind' | 'employee_visible' | 'link_url' | 'description' | 'sort_order'>>;

export interface OhseCompanySettingsView {
  company_id: string;
  has_access_code: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

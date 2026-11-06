import type { OhseSectionKind } from './types';

export const OHSE_MODULE_ID = 'ohse';
export const OHSE_BUCKET = 'ohse-docs';
export const OHSE_MAX_FILE_BYTES = 50 * 1024 * 1024;

export const OHSE_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
};

export const OHSE_KIND_LABEL: Record<OhseSectionKind, string> = {
  folder: 'หมวดย่อย',
  documents: 'ทะเบียนเอกสาร',
  monitoring: 'ผลตรวจวัด',
  licenses: 'ใบอนุญาต',
  link: 'ลิงก์ไประบบอื่น',
};

/** Origin allowed to call the one-off Superhuman import endpoints (browser-side copy of attachments). */
export const OHSE_IMPORT_ORIGIN = 'https://docs.superhuman.com';

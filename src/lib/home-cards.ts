import { PROJECTS, type Project } from './companies';

export type HomeCardRow = {
  id: string;
  name: string;
  description: string;
  is_visible: boolean;
  revision: number;
  updated_at: string;
};
export type HomeCard = Project & Omit<HomeCardRow, 'id' | 'name' | 'description'>;

// Routes, availability and styling remain controlled by the application.
export function homeCards(rows: HomeCardRow[]): HomeCard[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  return PROJECTS.flatMap(project => {
    const row = byId.get(project.id);
    return row ? [{ ...project, name: row.name, description: row.description, is_visible: row.is_visible, revision: row.revision, updated_at: row.updated_at }] : [];
  });
}

export function validateHomeCardPatch(body: unknown): { id: string; name: string; description: string; is_visible: boolean; revision: number } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('ข้อมูลการ์ดไม่ถูกต้อง');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['id', 'name', 'description', 'is_visible', 'revision'].includes(key))) throw new Error('แก้ไขได้เฉพาะชื่อ คำอธิบาย และการแสดงการ์ด');
  if (typeof input.id !== 'string' || !PROJECTS.some(p => p.id === input.id)) throw new Error('ไม่พบการ์ดที่เลือก');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) throw new Error('ชื่อการ์ดต้องมี 1–80 ตัวอักษร');
  if (typeof input.description !== 'string' || !input.description.trim() || input.description.trim().length > 500) throw new Error('คำอธิบายต้องมี 1–500 ตัวอักษร');
  if (typeof input.is_visible !== 'boolean') throw new Error('สถานะการแสดงการ์ดไม่ถูกต้อง');
  if (typeof input.revision !== 'number' || !Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision >= 2147483647) throw new Error('รุ่นข้อมูลไม่ถูกต้อง กรุณาโหลดใหม่');
  return { id: input.id, name: input.name.trim(), description: input.description.trim(), is_visible: input.is_visible, revision: input.revision };
}

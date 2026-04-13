// Company configuration for multi-tenant tools platform
export type Company = {
  id: string;
  name: string;
  nameEn: string;
  password: string; // simple auth per company
  logo?: string;
};

export const COMPANIES: Company[] = [
  { id: 'default', name: 'บริษัท เริ่มต้น', nameEn: 'Default Company', password: '1234' },
  { id: 'eashe', name: 'EASHE Corp', nameEn: 'EASHE Corporation', password: 'eashe2024' },
  { id: 'subsidiary', name: 'Subsidiary Co', nameEn: 'Subsidiary Company', password: 'sub2024' },
];

export const ADMIN_PASSWORD = 'admin@eashe';

export function getCompany(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}

export function validateCompanyPassword(companyId: string, password: string): boolean {
  if (password === ADMIN_PASSWORD) return true;
  const company = getCompany(companyId);
  return company?.password === password;
}

// Available projects/tools on the platform
export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or lucide icon name
  color: string; // tailwind gradient
  href: (companyId: string) => string;
  ready: boolean;
};

export const PROJECTS: Project[] = [
  {
    id: 'ppe',
    name: 'PPE Inventory',
    description: 'จัดการสต็อกอุปกรณ์ป้องกันส่วนบุคคล (PPE) รับเข้า เบิกออก ดูรายงาน',
    icon: 'shield',
    color: 'from-blue-600 to-blue-800',
    href: (companyId) => `/${companyId}/ppe`,
    ready: true,
  },
  {
    id: 'chemical',
    name: 'Chemical Management',
    description: 'จัดการสารเคมี SDS/MSDS ติดตามการใช้งานและการจัดเก็บ',
    icon: 'flask',
    color: 'from-purple-600 to-purple-800',
    href: (companyId) => `/${companyId}/chemical`,
    ready: false,
  },
  {
    id: 'permit',
    name: 'Work Permit',
    description: 'ระบบใบอนุญาตทำงาน Hot Work, Confined Space, Working at Height',
    icon: 'clipboard',
    color: 'from-orange-500 to-red-600',
    href: (companyId) => `/${companyId}/permit`,
    ready: false,
  },
  {
    id: 'inspection',
    name: 'Safety Inspection',
    description: 'ตรวจสอบความปลอดภัย Checklist ภาพถ่าย และติดตามการแก้ไข',
    icon: 'search',
    color: 'from-green-600 to-emerald-700',
    href: (companyId) => `/${companyId}/inspection`,
    ready: false,
  },
];

// Project/tool configuration for tools.eashe.org platform

export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // tailwind gradient
  href: string;
  ready: boolean;
};

export const PROJECTS: Project[] = [
  {
    id: 'ppe',
    name: 'PPE Inventory',
    description: 'จัดการสต็อกอุปกรณ์ป้องกันส่วนบุคคล (PPE) รับเข้า เบิกออก ดูรายงาน',
    icon: 'shield',
    color: 'from-blue-600 to-blue-800',
    href: '/ppe',
    ready: true,
  },
  {
    id: 'chemical',
    name: 'Chemical Management',
    description: 'จัดการสารเคมี SDS/MSDS ติดตามการใช้งานและการจัดเก็บ',
    icon: 'flask',
    color: 'from-purple-600 to-purple-800',
    href: '/chemical',
    ready: false,
  },
  {
    id: 'permit',
    name: 'Work Permit',
    description: 'ระบบใบอนุญาตทำงาน Hot Work, Confined Space, Working at Height',
    icon: 'clipboard',
    color: 'from-orange-500 to-red-600',
    href: '/permit',
    ready: false,
  },
  {
    id: 'inspection',
    name: 'Safety Inspection',
    description: 'ตรวจสอบความปลอดภัย Checklist ภาพถ่าย และติดตามการแก้ไข',
    icon: 'search',
    color: 'from-green-600 to-emerald-700',
    href: '/inspection',
    ready: false,
  },
];

// User type returned from auth
export type AuthUser = {
  id: string;
  username: string;
  companyId: string;
  companyName: string;
  displayName: string;
  nickname: string;
  position: string;
  role: 'admin' | 'user';
};

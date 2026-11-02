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
    id: 'first-aid',
    name: 'First Aid & Medicine Control',
    description: 'ดูแลจุดปฐมพยาบาล สต็อกยาและเวชภัณฑ์ วันหมดอายุ และการเบิกใช้ ทั้งเจ้าหน้าที่จ่ายให้และผู้เบิกบันทึกเอง',
    icon: 'heart',
    color: 'from-emerald-700 to-teal-800',
    href: '/first-aid',
    ready: true,
  },
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
    description: 'ทะเบียนสารเคมี แนบ SDS โปสเตอร์สรุปความปลอดภัย และตารางเก็บร่วม/แยกตามคู่มือ กรอ.',
    icon: 'flask',
    color: 'from-purple-600 to-purple-800',
    href: '/chemical',
    ready: true,
  },
  {
    id: 'permit',
    name: 'Work Permit',
    description: 'ระบบใบอนุญาตทำงาน Hot Work, Confined Space, Working at Height',
    icon: 'clipboard',
    color: 'from-orange-500 to-red-600',
    href: '/permit',
    ready: true,
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
  {
    id: 'she-workforce',
    name: 'SHE Workforce',
    description: 'บริหารบุคลากรด้านความปลอดภัย อาชีวอนามัย สิ่งแวดล้อม ใบอนุญาต และวิเคราะห์ภาระงาน',
    icon: 'briefcase',
    color: 'from-teal-600 to-cyan-700',
    href: '/she-workforce',
    ready: true,
  },
  {
    id: 'procurement',
    name: 'PR & Supplier Price',
    description: 'ค้นหาราคาสินค้า/บริการที่ทีม SHE เคยซื้อและเคยได้ใบเสนอราคา เทียบผู้ขาย และดู PR ย้อนหลัง',
    icon: 'cart',
    color: 'from-sky-600 to-indigo-700',
    href: '/procurement',
    ready: true,
  },
  {
    id: 'inspect',
    name: 'Equipment Inspection',
    description: 'ตรวจอุปกรณ์ความปลอดภัยประจำรอบ — ถังดับเพลิง อ่างล้างตา สายฉีดน้ำ ชุดดับเพลิง ฯลฯ สแกน QR ที่อุปกรณ์ แนบรูป ติดตามรอบทดสอบตามกฎหมาย',
    icon: 'scan',
    color: 'from-rose-600 to-red-700',
    href: '/inspect',
    ready: true,
  },
  {
    id: 'visitor',
    name: 'Visitor Access',
    description: 'ขออนุญาตบุคคลภายนอกเข้าพื้นที่ คัดกรอง-อนุมัติโดยทีม SHE และจอรายชื่อสำหรับป้อม รปภ',
    icon: 'users',
    color: 'from-amber-500 to-orange-600',
    href: '/visitor',
    ready: true,
  },
];

// Module-level access control
export type ModuleId = 'ppe' | 'she' | 'chemical' | 'first-aid';
export const MODULE_LABELS: Record<ModuleId, string> = {
  'first-aid': 'First Aid & Medicine Control',
  ppe: 'PPE Inventory',
  she: 'SHE Workforce',
  chemical: 'Chemical Management',
};

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
  ppeRole?: 'manager' | 'requester';
  token?: string; // admin API token, present only for admin logins
  // null/undefined = ทุกระบบ (default เดิม); ['ppe'] = เข้าได้เฉพาะ PPE Inventory
  allowedModules?: string[] | null;
};

export function canAccessModule(user: AuthUser | null, moduleId: ModuleId): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.allowedModules || user.allowedModules.length === 0) return true;
  return user.allowedModules.includes(moduleId);
}

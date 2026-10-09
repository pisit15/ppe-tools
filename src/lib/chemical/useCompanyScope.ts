'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

/**
 * บริษัทที่หน้ากำลังทำงานด้วย — ใช้กติกาเดียวกับ Sidebar:
 * admin ใช้ ?company_id= ใน URL (ค่าเริ่มต้น 'all'), user ทั่วไปใช้บริษัทของตัวเอง
 * canWrite = false เมื่อ admin ดู "ทุกบริษัท" (ต้องเลือกบริษัทก่อนเพิ่ม/แก้)
 */
export function useCompanyScope() {
  const { user } = useAuth();
  const sp = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const urlCompany = sp.get('company_id');
  const companyId = isAdmin ? (urlCompany || 'all') : (user?.companyId || 'default');
  return {
    user,
    isAdmin,
    companyId,
    companyName: companyId === user?.companyId ? user.companyName : companyId.toUpperCase(),
    isAll: companyId === 'all',
    canWrite: !!user && companyId !== 'all',
    /** query string สำหรับลิงก์ภายในโมดูล */
    q: `?company_id=${encodeURIComponent(companyId)}`,
  };
}

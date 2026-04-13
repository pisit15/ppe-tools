'use client';

import Link from 'next/link';
import { Package, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700">
      {/* Navigation Bar */}
      <nav className="bg-blue-950 text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PPE Inventory System</h1>
            <p className="text-blue-300 text-sm">tools.eashe.org</p>
          </div>
          <div className="text-right">
            <p className="text-blue-300">Powered by Supabase & Next.js 14</p>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-4">
            PPE Inventory Management
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Efficiently manage your Personal Protective Equipment inventory across your organization
          </p>
          <Link
            href="/ppe?company_id=default"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            เริ่มต้นใช้งาน
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <div className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-center h-12 w-12 bg-blue-600 rounded-lg mb-4">
              <Package className="text-white" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              จัดการสต็อก
            </h3>
            <p className="text-gray-600">
              ติดตามสินค้า PPE ของคุณแบบแบ่งรายละเอียด พร้อมตัวเลือกเรียงตามประเภท
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-center h-12 w-12 bg-green-600 rounded-lg mb-4">
              <TrendingUp className="text-white" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              รับเข้า/รับคืน
            </h3>
            <p className="text-gray-600">
              บันทึกสต็อกเข้าแบบเรียบง่ายพร้อมการสนับสนุน PO และการติดตามผู้บันทึก
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-center h-12 w-12 bg-red-600 rounded-lg mb-4">
              <TrendingDown className="text-white" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              เบิก/ยืม
            </h3>
            <p className="text-gray-600">
              ติดตามการเบิก สต็อกสำหรับพนักงาน โดยมีการวิเคราะห์ตามแผนกและสถานะ
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-center h-12 w-12 bg-purple-600 rounded-lg mb-4">
              <BarChart3 className="text-white" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ดูรายงาน
            </h3>
            <p className="text-gray-600">
              สร้างรายงานที่ละเอียดพร้อมแนวโน้มสต็อก ประวัติการเบิก และสถิติการใช้
            </p>
          </div>
        </div>

        {/* Multi-Company Support */}
        <div className="bg-white rounded-lg p-8 shadow-lg">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            การสนับสนุนหลายบริษัท
          </h3>
          <p className="text-gray-600 mb-4">
            ระบบนี้รองรับการจัดการ PPE สำหรับหลายบริษัท โดยแต่ละบริษัทมีข้อมูลแยกต่างหาก
            ตัวเลือกเลือกบริษัทมีให้ในแถบด้านข้างสำหรับการเปลี่ยนอย่างราบรื่น
          </p>
          <p className="text-blue-600 font-semibold">
            กำลังเลือก: บริษัท เริ่มต้น
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-blue-950 text-blue-300 p-6 mt-16">
        <div className="max-w-7xl mx-auto text-center text-sm">
          <p>PPE Inventory System v1.0 | Deployed to tools.eashe.org</p>
          <p className="mt-2">Shared database with eashe.org safety dashboard</p>
        </div>
      </footer>
    </div>
  );
}

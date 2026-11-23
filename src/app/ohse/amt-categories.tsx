'use client';

import Image from 'next/image';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ChevronRight, FolderOpen } from 'lucide-react';
import { btnPrimary, btnSecondary, errMsg, inputClass, labelClass, Modal, postJson } from '@/app/inspect/_components/ui';
import { OHSE_KIND_LABEL } from '@/lib/ohse/constants';
import type { OhseSectionKind, OhseSectionView } from '@/lib/ohse/types';

const amtCoverTitles: Readonly<Record<string, string>> = {
  '1': 'ประกาศ (Announcement)',
  '2': 'การแต่งตั้งบุคลากร (Appointment of personnel)',
  '3': 'วัตถุประสงค์และเป้าหมาย (KPI)',
  '4': 'กฎหมายและข้อบังคับ (Law and regulation)',
  '5': 'ผลการตรวจวัดและเฝ้าระวัง (Measuring and monitoring results)',
  '6': 'ISO14001:2015 vs ISO45001:2018',
  '7': 'เอกสาร (Document)',
  '8': 'ใบอนุญาต (License)',
  '9': 'กิจกรรมด้าน OHSE และพลังงาน (Activity)',
  '10': 'การจัดการของเสีย (Waste Management)',
  '11': 'SDS เอกสารข้อมูลความปลอดภัยสารเคมี',
  '12': 'เหตุฉุกเฉิน (Emergency)',
  '13': 'ขออนุญาตบุคคลภายนอกเข้าพื้นที่',
  '14': 'ผู้รับเหมา (Contractor)',
  '15': 'ขออนุญาตจอดรถในโรงงาน',
  '16': 'ตรวจถังดับเพลิง',
  '17': 'ระบบการจัดการพลังงาน (Energy Management System)',
};

export function AmtCategories({ sections, onOpen }: {
  sections: OhseSectionView[];
  onOpen: (id: string) => void;
}) {
  return (
    <section aria-labelledby="ohse-amt-heading">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-[#4E79A7]">AMT · SHE DATA CENTER</p>
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl" id="ohse-amt-heading">หมวดหมู่เอกสาร</h1>
          <p className="mt-1 text-sm text-gray-600">เลือกหมวดเพื่อเปิดทะเบียนเอกสาร</p>
        </div>
      </div>
      {sections.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-gray-600">ยังไม่มีหมวดเอกสาร กด “เพิ่มหมวด” เพื่อสร้างหมวดแรก</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {sections.map(section => {
            const cover = section.company_id === 'amt' && section.title.trim() === amtCoverTitles[section.code]
              ? `/api/ohse/covers/${section.code}` : null;
            if (section.code === 'H') return (
              <button key={section.id} type="button" onClick={() => onOpen(section.id)}
                className="col-span-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left font-medium text-gray-900 hover:border-[#4E79A7]">
                <FolderOpen size={20} className="shrink-0 text-[#4E79A7]" aria-hidden="true" />{section.title}
              </button>
            );
            return (
              <button key={section.id} type="button" onClick={() => onOpen(section.id)}
                className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-[#4E79A7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4E79A7]">
                <div className="relative flex aspect-[975/292] items-center justify-center overflow-hidden bg-[#eaf0f6]">
                  {cover ? <Image src={cover} alt="" fill sizes="(min-width: 768px) 500px, 100vw" className="object-cover" unoptimized /> : <FolderOpen size={36} className="text-[#4E79A7]" aria-hidden="true" />}
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-xs text-gray-500">{section.code} · {OHSE_KIND_LABEL[section.kind]}</p>
                    <p className="mt-1 font-semibold text-gray-900">{section.title}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-[#4E79A7]" aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AddAmtSectionModal({ sections, initialParent, onClose, onSaved }: {
  sections: OhseSectionView[];
  initialParent: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parent, setParent] = useState(initialParent || '');
  const [kind, setKind] = useState<OhseSectionKind>('documents');

  const close = () => { if (!savingRef.current) onClose(); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') || '').trim();
    const title = String(form.get('title') || '').trim();
    if (!/^[A-Za-z0-9.\-]{1,20}$/.test(code) || !title) {
      setError('กรุณาระบุรหัสและชื่อหมวด รหัสใช้ได้เฉพาะตัวเลข ตัวอักษรอังกฤษ จุด และขีด');
      return;
    }
    if (parent && !sections.some(section => section.id === parent)) {
      setError('ไม่พบหมวดหลักที่เลือก กรุณาเลือกหมวดหลักอีกครั้ง');
      return;
    }
    setError('');
    savingRef.current = true;
    setSaving(true);
    try {
      const siblings = sections.filter(section => section.parent_id === (parent || null));
      await postJson('/api/ohse/sections', {
        company_id: 'amt', parent_id: parent || null, code, title, kind,
        description: String(form.get('description') || '').trim() || null,
        link_url: kind === 'link' ? String(form.get('link') || '').trim() || null : null,
        employee_visible: false,
        sort_order: Math.max(0, ...siblings.map(section => section.sort_order)) + 10,
      });
      onSaved();
    } catch (error) {
      setError(errMsg(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={close} title={initialParent ? 'เพิ่มหมวดย่อย' : 'เพิ่มหมวด'}
      footer={<><button type="button" className={btnSecondary} onClick={close} disabled={saving}>ยกเลิก</button><button type="submit" form={formId} className={btnPrimary} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกหมวด'}</button></>}>
      <form id={formId} onSubmit={save} className="space-y-3">
        <label className="block"><span className={labelClass}>อยู่ใต้หมวด</span><select className={inputClass} value={parent} onChange={event => setParent(event.target.value)}><option value="">หมวดหลัก</option>{sections.map(section => <option key={section.id} value={section.id}>{section.code} {section.title}</option>)}</select></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="block"><span className={labelClass}>รหัสหมวด</span><input className={inputClass} name="code" required maxLength={20} autoComplete="off" /></label>
          <label className="block"><span className={labelClass}>ชื่อหมวด</span><input className={inputClass} name="title" required maxLength={200} autoComplete="off" /></label>
        </div>
        <label className="block"><span className={labelClass}>ประเภทหมวด</span><select className={inputClass} value={kind} onChange={event => setKind(event.target.value as OhseSectionKind)}>{Object.entries(OHSE_KIND_LABEL).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
        {kind === 'link' && <label className="block"><span className={labelClass}>ลิงก์ระบบ (https://)</span><input className={inputClass} name="link" type="url" inputMode="url" placeholder="https://" maxLength={1000} /></label>}
        <label className="block"><span className={labelClass}>คำอธิบาย</span><textarea className={inputClass} name="description" maxLength={2000} rows={2} /></label>
        <p className="text-xs text-gray-500">หมวดใหม่จะแสดงเฉพาะทีม SHE จนกว่าจะเปิดให้พนักงานเห็น</p>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

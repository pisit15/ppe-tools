import type { SdsImport } from '@/lib/types';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
});

export function SdsImportInfo({ value, compact = false }: { value?: SdsImport | null; compact?: boolean }) {
  if (!value) return <p className="mt-1 text-xs text-gray-600">ไม่พบประวัติผู้นำเข้า SDS</p>;
  const validDate = Number.isFinite(Date.parse(value.imported_at));
  return (
    <div className={`mt-2 space-y-1 text-gray-600 ${compact ? 'max-w-56 text-xs' : 'rounded-lg bg-gray-50 px-3 py-2 text-sm'}`}>
      <p>{value.method === 'file' ? 'อัปโหลดไฟล์โดย' : 'เพิ่มลิงก์โดย'} <span className="font-medium text-gray-800 break-words">{value.display_name || value.username}</span></p>
      {!compact && value.display_name !== value.username && <p>บัญชี: {value.username}</p>}
      {validDate && <p><time dateTime={value.imported_at}>{dateFormat.format(new Date(value.imported_at))} น.</time>{!compact && ' (เวลาไทย)'}</p>}
    </div>
  );
}

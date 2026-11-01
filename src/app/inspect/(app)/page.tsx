'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Database, ImageIcon, ListPlus, QrCode, ShieldAlert } from 'lucide-react';
import type { InspDashboard } from '@/lib/inspect/types';
import { CategoryTile } from '../_components/icons';
import { BarList, MonthlyBars, Ring } from '../_components/charts';
import { OverallBadge, SectionTitle, Skeleton, VIZ, bangkokToday, btnPrimary, btnSecondary, cardClass, currentPeriod, errMsg, formatBytes, getJson, pct, relativeDays, shiftPeriod, thaiDate, thaiPeriod, useCompany } from '../_components/ui';

export default function InspectDashboardPage() {
  const { company, companyName } = useCompany();
  const [period, setPeriod] = useState(currentPeriod);
  const [today] = useState(bangkokToday);
  const [data, setData] = useState<InspDashboard | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError(''); setData(null);
    try { setData((await getJson<{ data: InspDashboard }>(`/api/inspect/dashboard?company=${encodeURIComponent(company)}&period=${period}`)).data); }
    catch (e) { setError(errMsg(e, 'โหลดข้อมูลไม่สำเร็จ')); }
  }, [company, period]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  const t = data?.totals;
  const isCurrent = period === currentPeriod();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">ภาพรวมการตรวจอุปกรณ์</h1>
          <p className="text-sm text-gray-500 mt-1">{companyName} · รอบ {thaiPeriod(period, true)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
            <button type="button" onClick={() => setPeriod(p => shiftPeriod(p, -1))} className="p-2 text-gray-500 hover:bg-gray-50 rounded-l-lg" aria-label="เดือนก่อน"><ChevronLeft size={16} /></button>
            <span className="px-3 text-sm font-medium min-w-[110px] text-center">{thaiPeriod(period)}</span>
            <button type="button" disabled={isCurrent} onClick={() => setPeriod(p => shiftPeriod(p, 1))} className="p-2 text-gray-500 hover:bg-gray-50 rounded-r-lg disabled:opacity-30" aria-label="เดือนถัดไป"><ChevronRight size={16} /></button>
          </div>
          <Link href="/inspect/batch" className={btnSecondary}><ListPlus size={16} />บันทึกผลหลายรายการ</Link>
          <Link href="/inspect/assets" className={btnPrimary} style={{ background: VIZ.primary }}><QrCode size={16} />ทะเบียนอุปกรณ์</Link>
        </div>
      </div>

      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: `${VIZ.accent}14`, color: VIZ.accent }}>{error}</div>}

      {!data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : t && t.assets === 0 ? (
        <div className={`${cardClass} text-center py-14`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-4" style={{ background: `${VIZ.primary}14`, color: VIZ.primary }}><QrCode size={28} /></span>
          <h2 className="text-lg font-semibold text-gray-900">ยังไม่มีอุปกรณ์ในทะเบียนของ {companyName}</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">เริ่มจากเพิ่มอุปกรณ์ทีละชิ้นหรือนำเข้าจาก Excel แล้วพิมพ์ QR ไปติดที่อุปกรณ์ — ผู้ตรวจสแกนเพื่อบันทึกผลได้ทันที</p>
          <div className="mt-5 flex justify-center gap-2"><Link href="/inspect/assets" className={btnPrimary} style={{ background: VIZ.primary }}>เพิ่มอุปกรณ์</Link><Link href="/inspect/settings" className={btnSecondary}>ตั้งค่าโหมดผู้ตรวจ</Link></div>
        </div>
      ) : t && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`${cardClass} flex items-center gap-4`} style={{ borderLeft: `4px solid ${VIZ.positive}` }}>
              <Ring value={t.inspected} total={t.assets} size={88} stroke={9} sub="ตรวจแล้ว" />
              <div><p className="text-xs text-gray-500">ความครบถ้วนรอบนี้</p><p className="text-2xl font-semibold tabular-nums">{t.inspected}<span className="text-base text-gray-400 font-normal">/{t.assets}</span></p><p className="text-xs text-gray-500">อุปกรณ์ที่ใช้งาน</p></div>
            </div>
            <Kpi color={VIZ.accent} icon={<AlertTriangle size={20} />} label="เกินกำหนดตรวจ" value={t.overdue} hint={t.due_soon ? `ใกล้ถึงรอบอีก ${t.due_soon}` : t.never ? `ยังไม่เคยตรวจ ${t.never}` : 'ไม่มีค้าง'} href="/inspect/assets?due=overdue" />
            <Kpi color={VIZ.secondary} icon={<ShieldAlert size={20} />} label="ไม่ผ่าน รอแก้ไข" value={t.open_failures} hint={t.open_failures ? 'กดเพื่อดูรายการ' : 'ไม่มีรายการค้าง'} href="/inspect/inspections?open=1" />
            <Kpi color={VIZ.primary} icon={<CalendarClock size={20} />} label="ครบรอบทดสอบใน 90 วัน" value={t.service_due_90d} hint={t.service_overdue ? `เลยกำหนดแล้ว ${t.service_overdue}` : 'เช่น hydrostatic test'} href="/inspect/assets?service=due" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* by category */}
            <div className={`${cardClass} lg:col-span-1`}>
              <SectionTitle title="ตามหมวดอุปกรณ์" hint="ตรวจแล้ว / ทั้งหมด ในรอบนี้" />
              <ul className="divide-y divide-gray-100">
                {data.by_category.map(c => (
                  <li key={c.category_id}>
                    <Link href={`/inspect/assets?category=${c.category_id}`} className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition">
                      <CategoryTile name={c.icon} color={c.color} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-800 truncate">{c.name}</span><span className="text-sm tabular-nums text-gray-600">{c.inspected}/{c.assets}</span></div>
                        <div className="mt-1.5 h-1.5 rounded-full" style={{ background: VIZ.grid }}><div className="h-1.5 rounded-full" style={{ width: `${pct(c.inspected, c.assets)}%`, background: c.color }} /></div>
                        {(c.overdue > 0 || c.open_failures > 0) && <p className="text-xs mt-1 text-gray-500">{c.overdue > 0 && <span style={{ color: VIZ.accent }}>เกินกำหนด {c.overdue}</span>}{c.overdue > 0 && c.open_failures > 0 && ' · '}{c.open_failures > 0 && <span style={{ color: VIZ.secondary }}>ไม่ผ่าน {c.open_failures}</span>}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* by department */}
            <div className={`${cardClass} lg:col-span-1`}>
              <SectionTitle title="ตามแผนก / พื้นที่" hint="แถบ = จำนวนอุปกรณ์, สีเขียว = ตรวจแล้ว" />
              {data.by_department.length ? <BarList rows={data.by_department.slice(0, 12).map(d => ({ label: d.department, value: d.inspected, total: d.assets, danger: d.overdue }))} /> : <p className="text-sm text-gray-400">ยังไม่ได้ระบุแผนกในทะเบียน</p>}
              {data.by_department.length > 12 && <p className="text-xs text-gray-400 mt-3">แสดง 12 แผนกแรกจาก {data.by_department.length}</p>}
            </div>
            {/* monthly */}
            <div className={`${cardClass} lg:col-span-1`}>
              <SectionTitle title="การตรวจ 12 เดือนล่าสุด" hint={<span>จำนวนครั้งที่บันทึก · <span style={{ color: VIZ.accent }}>■</span> ไม่ผ่าน</span>} />
              <MonthlyBars data={data.monthly} labelOf={p => thaiPeriod(p).split(' ')[0]} />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* open failures */}
            <div className={cardClass}>
              <SectionTitle title="ไม่ผ่าน — รอการแก้ไข" hint="เรียงจากล่าสุด" right={<Link href="/inspect/inspections?open=1" className="text-sm font-medium inline-flex items-center gap-1" style={{ color: VIZ.primary }}>ทั้งหมด <ArrowRight size={14} /></Link>} />
              {data.open_failures.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl px-4 py-5" style={{ background: `${VIZ.positive}12` }}><CheckCircle2 size={22} color={VIZ.positive} /><p className="text-sm text-gray-700">ไม่มีรายการไม่ผ่านค้างแก้ไข</p></div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.open_failures.slice(0, 6).map(f => (
                    <li key={f.id} className="py-3">
                      <Link href={`/inspect/assets/${f.asset_id}`} className="flex items-start gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-gray-50">
                        <span className="mt-1 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: f.asset?.category_color || VIZ.accent }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><span className="font-medium text-gray-900">{f.asset?.code}</span><span className="text-xs text-gray-500 truncate">{f.asset?.category_name}{f.asset?.department ? ` · ${f.asset.department}` : ''}</span></div>
                          <p className="text-sm text-gray-600 truncate">{f.fail_items.length} ข้อไม่ผ่าน{f.note ? ` — ${f.note}` : ''}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{thaiDate(f.inspected_on)} · {f.inspector_name}</p>
                        </div>
                        <OverallBadge overall="fail" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* service due */}
            <div className={cardClass}>
              <SectionTitle title="ครบรอบทดสอบตามกฎหมาย / มาตรฐาน" hint="ภายใน 90 วัน หรือเลยกำหนดแล้ว" right={<Link href="/inspect/assets?service=due" className="text-sm font-medium inline-flex items-center gap-1" style={{ color: VIZ.primary }}>ทั้งหมด <ArrowRight size={14} /></Link>} />
              {data.service_due.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl px-4 py-5" style={{ background: `${VIZ.positive}12` }}><CheckCircle2 size={22} color={VIZ.positive} /><p className="text-sm text-gray-700">ไม่มีอุปกรณ์ถึงรอบทดสอบใน 90 วัน</p></div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.service_due.slice(0, 6).map(s => {
                    const overdue = s.next_service_due_on < today;
                    return (
                      <li key={s.id} className="py-3">
                        <Link href={`/inspect/assets/${s.id}`} className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-gray-50">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.category_color }} />
                          <div className="flex-1 min-w-0"><p className="font-medium text-gray-900">{s.code} <span className="text-xs font-normal text-gray-500">{s.category_name}{s.department ? ` · ${s.department}` : ''}</span></p><p className="text-sm text-gray-600 truncate">{s.service_label || 'ทดสอบตามรอบ'}</p></div>
                          <div className="text-right shrink-0"><p className="text-sm font-medium" style={{ color: overdue ? VIZ.accent : VIZ.secondary }}>{thaiDate(s.next_service_due_on)}</p><p className="text-xs text-gray-400">{relativeDays(s.next_service_due_on)}</p></div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-400 px-1">
            <span className="inline-flex items-center gap-1.5"><ImageIcon size={13} />รูปที่เก็บอยู่ {data.storage.photos.toLocaleString()} รูป · {formatBytes(data.storage.bytes)}</span>
            <span className="inline-flex items-center gap-1.5"><Database size={13} />รูปถูกลบอัตโนมัติตามระยะเวลาเก็บในตั้งค่า (ค่าเริ่มต้น 90 วัน) — ผลตรวจเก็บถาวร</span>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ color, icon, label, value, hint, href }: { color: string; icon: React.ReactNode; label: string; value: number; hint?: string; href: string }) {
  return (
    <Link href={href} className={`${cardClass} block hover:shadow-md transition`} style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center justify-between"><p className="text-xs text-gray-500">{label}</p><span style={{ color }}>{icon}</span></div>
      <p className="text-3xl font-semibold tabular-nums mt-2" style={{ color: value > 0 ? color : VIZ.text }}>{value.toLocaleString()}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </Link>
  );
}

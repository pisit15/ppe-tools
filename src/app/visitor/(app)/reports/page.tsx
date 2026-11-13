'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import type { StatBucket, VisitorStats } from '@/lib/visitor/types';
import { VISITOR_STATUS_LABEL } from '@/lib/visitor/constants';
import { FetchError, STATUS_COLOR, ToastView, VIZ, cardClass, getJson, inputClass, useToast } from '../../_components/ui';

type Company = { company_id: string; company_name: string };
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const fmt = (n: number) => n.toLocaleString('th-TH');
const thisYearBk = () => new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear();
const PALETTE = ['#4E79A7', '#F28E2B', '#59A14F', '#E15759', '#76B7B2', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'];

export default function VisitorReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [adminCompany, setAdminCompany] = useState('all');
  const company = isAdmin ? adminCompany : (user?.companyId || '');
  const [year, setYear] = useState(() => thisYearBk());
  const [month, setMonth] = useState<number | ''>('');
  const [metric, setMetric] = useState<'requests' | 'persons'>('requests');
  const [data, setData] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, setToast } = useToast();

  useEffect(() => { if (isAdmin) getJson<Company[]>('/api/companies').then(d => setCompanies(Array.isArray(d) ? d : [])).catch(() => setCompanies([])); }, [isAdmin]);

  const load = useCallback(() => { // fetch only; state updates happen in the promise callbacks
    if (!company) return;
    const p = new URLSearchParams({ company, year: String(year) });
    if (month) p.set('month', String(month));
    getJson<{ data: VisitorStats }>(`/api/visitor/stats?${p}`).then(r => setData(r.data))
      .catch((e: unknown) => setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'โหลดรายงานไม่สำเร็จ' }))
      .finally(() => setLoading(false));
  }, [company, year, month, setToast]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const years = useMemo(() => { const y = thisYearBk(); return [y + 1, y, y - 1, y - 2]; }, []);
  const periodLabel = month ? `${TH_MONTHS[Number(month) - 1]} ${year + 543}` : `ปี ${year + 543}`;
  const approvedRate = data && data.totals.requests ? Math.round((data.by_status.approved / data.totals.requests) * 100) : 0;
  const noShowRate = data && data.totals.persons ? Math.round((data.totals.no_show / data.totals.persons) * 100) : 0;

  function exportCsv() {
    if (!data) return;
    const lines: string[] = ['section,label,requests,persons'];
    const add = (sec: string, rows: StatBucket[]) => rows.forEach(r => lines.push([sec, `"${r.label.replace(/"/g, '""')}"`, r.requests, r.persons].join(',')));
    data.by_month.forEach(m => lines.push(['month', TH_MONTHS[m.month - 1], m.requests, m.persons].join(',')));
    add('group', data.by_group); add('purpose', data.by_purpose); add('company', data.by_company); add('visitor_company', data.by_visitor_company);
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `visitor-stats-${company}-${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: VIZ.text }}><BarChart3 size={24} style={{ color: VIZ.primary }} />รายงานผู้มาติดต่อ</h1>
          <p className="text-sm text-gray-500">นับตามวันที่เข้าพื้นที่ · คำขอหลายวันนับเป็น 1 คำขอต่อวัน · {periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <select className={`${inputClass} !w-48`} value={adminCompany} onChange={e => setAdminCompany(e.target.value)}><option value="all">ทุกบริษัท</option>{companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name}</option>)}</select>}
          <select className={`${inputClass} !w-28`} value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y + 543}</option>)}</select>
          <select className={`${inputClass} !w-32`} value={month} onChange={e => setMonth(e.target.value ? Number(e.target.value) : '')}><option value="">ทั้งปี</option>{TH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            {(['requests', 'persons'] as const).map(k => <button key={k} type="button" onClick={() => setMetric(k)} className="px-3 py-2 text-sm" style={metric === k ? { background: VIZ.primary, color: '#fff' } : { background: '#fff', color: VIZ.text }}>{k === 'requests' ? 'นับคำขอ' : 'นับคน'}</button>)}
          </div>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />รีเฟรช</button>
          <button type="button" onClick={exportCsv} disabled={!data} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"><Download size={16} />CSV</button>
        </div>
      </div>

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
            <Kpi label="คำขอ (ใบ/วัน)" value={data.totals.requests} color={VIZ.primary} hint={data.totals.batches ? `รวมชุดหลายวัน ${data.totals.batches} ชุด` : undefined} />
            <Kpi label="ผู้มาติดต่อ (คน)" value={data.totals.persons} color={VIZ.primary} hint={`เฉลี่ย ${data.totals.requests ? (data.totals.persons / data.totals.requests).toFixed(1) : 0} คน/คำขอ`} />
            <Kpi label="อนุมัติ" value={data.by_status.approved} color={VIZ.positive} hint={`${approvedRate}% ของคำขอ`} />
            <Kpi label="ไม่อนุมัติ / ยกเลิก" value={data.by_status.rejected + data.by_status.cancelled} color={VIZ.accent} hint={`รอ ${data.by_status.submitted + data.by_status.need_info}`} />
            <Kpi label="มาถึงจริง (คน)" value={data.totals.arrived} color={VIZ.positive} hint={`ไม่มา ${data.totals.no_show} (${noShowRate}%) · เพิ่มหน้างาน ${data.totals.walk_ins}`} />
            <Kpi label="รถขอเข้า (คัน)" value={data.totals.vehicles} color={VIZ.secondary} hint={`เข้าภายใน ${data.totals.vehicles_inside}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className={`${cardClass} lg:col-span-2`}>
              <h2 className="font-semibold mb-1" style={{ color: VIZ.text }}>{month ? 'รายวัน' : 'รายเดือน'} — {metric === 'requests' ? 'จำนวนคำขอ' : 'จำนวนคน'}</h2>
              <p className="text-xs text-gray-500 mb-3">{month ? 'แต่ละแท่ง = 1 วัน' : 'แต่ละแท่ง = 1 เดือน · สีเข้ม = อนุมัติแล้ว'}</p>
              {month
                ? <BarChart data={daysOf(year, Number(month)).map(d => { const r = data.by_day.find(x => x.date === d); return { label: String(Number(d.slice(8, 10))), value: r ? (metric === 'requests' ? r.requests : r.persons) : 0 }; })} color={VIZ.primary} height={220} />
                : <BarChart data={data.by_month.map(m => ({ label: TH_MONTHS[m.month - 1], value: metric === 'requests' ? m.requests : m.persons, sub: metric === 'requests' ? m.approved : undefined }))} color={VIZ.primary} subColor="#2E5A86" height={220} />}
            </section>
            <section className={cardClass}>
              <h2 className="font-semibold mb-3" style={{ color: VIZ.text }}>สถานะคำขอ</h2>
              <StackBar parts={(Object.keys(VISITOR_STATUS_LABEL) as (keyof typeof VISITOR_STATUS_LABEL)[]).map(k => ({ label: VISITOR_STATUS_LABEL[k], value: data.by_status[k], color: STATUS_COLOR[k] }))} />
              <h2 className="font-semibold mt-5 mb-2" style={{ color: VIZ.text }}>วันในสัปดาห์</h2>
              <BarChart data={data.by_dow.map((v, i) => ({ label: TH_DOW[i], value: v }))} color={VIZ.neutral} height={120} />
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={cardClass}>
              <h2 className="font-semibold mb-1" style={{ color: VIZ.text }}>กลุ่มผู้มาติดต่อ</h2>
              <p className="text-xs text-gray-500 mb-3">จัดกลุ่มตามตาราง &quot;ตรวจที่ทางเข้า&quot; ของแต่ละบริษัท (ผู้รับเหมา / ขนส่ง / ผู้มาติดต่อ …)</p>
              <HBars rows={data.by_group} metric={metric} />
            </section>
            <section className={cardClass}>
              <h2 className="font-semibold mb-1" style={{ color: VIZ.text }}>วัตถุประสงค์</h2>
              <p className="text-xs text-gray-500 mb-3">ตามที่ผู้แจ้งเลือกในฟอร์ม</p>
              <HBars rows={data.by_purpose} metric={metric} />
            </section>
            {company === 'all' && <section className={cardClass}>
              <h2 className="font-semibold mb-3" style={{ color: VIZ.text }}>แยกตามบริษัท (โรงงาน)</h2>
              <HBars rows={data.by_company} metric={metric} />
            </section>}
            <section className={cardClass}>
              <h2 className="font-semibold mb-1" style={{ color: VIZ.text }}>บริษัทผู้มาติดต่อที่มาบ่อย (15 อันดับ)</h2>
              <p className="text-xs text-gray-500 mb-3">ตามชื่อที่พิมพ์ในฟอร์ม — สะกดต่างกันจะนับแยก</p>
              <HBars rows={data.by_visitor_company} metric={metric} />
            </section>
          </div>
        </>
      )}
      {!data && !loading && <p className="text-gray-500">ไม่มีข้อมูล</p>}
      <ToastView toast={toast} />
    </div>
  );
}

function daysOf(year: number, month: number) { const n = new Date(Date.UTC(year, month, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`); }

function Kpi({ label, value, color, hint }: { label: string; value: number; color: string; hint?: string }) {
  return <div className={`${cardClass} !p-4`} style={{ borderLeft: `4px solid ${color}` }}><div className="text-2xl font-semibold tabular-nums" style={{ color }}>{fmt(value)}</div><div className="text-sm text-gray-600">{label}</div>{hint && <div className="text-xs text-gray-400">{hint}</div>}</div>;
}

/** Vertical bars (SVG). `sub` draws a darker inner bar (e.g. approved within requests). */
function BarChart({ data, color, subColor, height = 200 }: { data: { label: string; value: number; sub?: number }[]; color: string; subColor?: string; height?: number }) {
  const W = 720, padL = 36, padB = 26, padT = 14;
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length; const slot = (W - padL) / n; const bw = Math.min(40, slot * 0.68);
  const y = (v: number) => padT + (height - padT - padB) * (1 - v / max);
  const ticks = [0, 0.5, 1].map(t => Math.round(max * t));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="กราฟแท่ง">
      {ticks.map(t => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={VIZ.grid} /><text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill={VIZ.lightText}>{fmt(t)}</text></g>)}
      {data.map((d, i) => {
        const x = padL + i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={y(d.value)} width={bw} height={Math.max(0, y(0) - y(d.value))} rx={3} fill={color} opacity={d.value ? 1 : 0.25}><title>{d.label}: {fmt(d.value)}</title></rect>
            {d.sub !== undefined && d.sub > 0 && <rect x={x} y={y(d.sub)} width={bw} height={Math.max(0, y(0) - y(d.sub))} rx={3} fill={subColor || color}><title>อนุมัติ {fmt(d.sub)}</title></rect>}
            {d.value > 0 && <text x={x + bw / 2} y={y(d.value) - 3} fontSize="10" textAnchor="middle" fill={VIZ.text}>{fmt(d.value)}</text>}
            {(n <= 16 || i % Math.ceil(n / 16) === 0) && <text x={x + bw / 2} y={height - 8} fontSize="10" textAnchor="middle" fill={VIZ.lightText}>{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal ranked bars with value + share. */
function HBars({ rows, metric }: { rows: StatBucket[]; metric: 'requests' | 'persons' }) {
  const total = rows.reduce((s, r) => s + r[metric], 0);
  const max = Math.max(1, ...rows.map(r => r[metric]));
  if (!rows.length) return <p className="text-sm text-gray-400">ไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <ul className="space-y-2">
      {rows.slice(0, 12).map((r, i) => (
        <li key={r.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-2"><span className="truncate" title={r.label}>{r.label}</span><span className="tabular-nums shrink-0" style={{ color: VIZ.lightText }}><strong style={{ color: VIZ.text }}>{fmt(r[metric])}</strong> · {total ? Math.round((r[metric] / total) * 100) : 0}%{metric === 'requests' && <span className="text-gray-400"> · {fmt(r.persons)} คน</span>}</span></div>
          <div className="h-2 rounded-full mt-1" style={{ background: VIZ.grid }}><div className="h-2 rounded-full" style={{ width: `${(r[metric] / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></div>
        </li>
      ))}
      {rows.length > 12 && <li className="text-xs text-gray-400">และอีก {rows.length - 12} รายการ (ดูใน CSV)</li>}
    </ul>
  );
}

/** One stacked bar + legend. */
function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-lg" style={{ background: VIZ.grid }}>
        {parts.filter(p => p.value > 0).map(p => <div key={p.label} title={`${p.label} ${fmt(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {parts.map(p => <li key={p.label} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} /><span className="text-gray-600 flex-1">{p.label}</span><span className="tabular-nums">{fmt(p.value)} <span className="text-gray-400">({Math.round((p.value / total) * 100)}%)</span></span></li>)}
      </ul>
    </div>
  );
}

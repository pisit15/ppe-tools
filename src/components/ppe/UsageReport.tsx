'use client';

import { useMemo, useState } from 'react';
import { Building2, ChevronDown, Download, Package, Search, Users } from 'lucide-react';
import { usageGroups, usageTotals, type UsageGroup, type UsageRow, type UsageView } from '@/lib/ppe-usage';

const fmt = (n: number) => n.toLocaleString('th-TH',{maximumFractionDigits:2});
const tabs = [
  {key:'dept' as const,label:'แผนก',icon:Building2},
  {key:'product' as const,label:'สินค้า',icon:Package},
  {key:'emp' as const,label:'พนักงาน',icon:Users},
];

export default function UsageReport({rows,from,to,rangeLabel,company}:{rows:UsageRow[];from:string;to:string;rangeLabel:string;company:string}) {
  const [view,setView] = useState<UsageView>('dept');
  const [search,setSearch] = useState('');
  const [expanded,setExpanded] = useState<string|null>(null);
  const [exporting,setExporting] = useState(false);
  const [error,setError] = useState('');
  const groups = useMemo(() => usageGroups(rows,view,search),[rows,view,search]);
  const counts = useMemo(() => Object.fromEntries(tabs.map(tab => [tab.key,usageGroups(rows,tab.key).length])),[rows]);
  const totals = useMemo(() => usageTotals(groups.flatMap(g=>g.rows)),[groups]);
  async function download(selected: UsageGroup[], group?: UsageGroup) {
    setExporting(true); setError('');
    try {
      const {usageWorkbook} = await import('@/lib/ppe-usage-export');
      const filter = [`บริษัท ${company === 'all' ? 'ทุกบริษัท' : company.toUpperCase()}`,group ? `${tabs.find(t=>t.key===view)?.label}: ${group.name} (${group.company.toUpperCase()})` : '',search.trim() ? `ค้นหา: ${search.trim()}` : ''].filter(Boolean).join(' · ');
      const buffer = await usageWorkbook(selected,view,from,to,filter);
      const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a = document.createElement('a'); a.href=url;
      a.download=`PPE_${view}_${company}_${from}_${to}${group ? `_${group.name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,60)}` : ''}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch { setError('Export ไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    finally { setExporting(false); }
  }
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white" aria-labelledby="usage-report-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 sm:px-5">
        <div><h2 id="usage-report-heading" className="font-semibold text-gray-900">วิเคราะห์การเบิก</h2><p className="mt-1 text-xs text-gray-500">{rangeLabel} · แยกยอดเบิกออกและยืม</p></div>
        <button type="button" onClick={()=>download(groups)} disabled={exporting || !groups.length} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"><Download size={16}/>{exporting ? 'กำลังสร้าง Excel…' : 'Export Excel ตามตัวกรอง'}</button>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" aria-label="มุมมองรายงาน">
          {tabs.map(tab => <button key={tab.key} type="button" aria-pressed={view===tab.key} onClick={()=>{setView(tab.key);setExpanded(null);}} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view===tab.key ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-gray-50'}`}><tab.icon size={16}/>{tab.label}<span className="rounded bg-white px-1.5 text-xs text-gray-500">{counts[tab.key]}</span></button>)}
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-gray-400"><Search size={18}/><input aria-label="ค้นหาในรายงานการเบิก" value={search} onChange={e=>setSearch(e.target.value)} placeholder={view==='emp' ? 'ค้นหาพนักงาน แผนก หรือสินค้า' : 'ค้นหาชื่อแผนกหรือสินค้า'} className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none"/>{search && <button type="button" aria-label="ล้างคำค้นหา" onClick={()=>setSearch('')} className="text-xs text-blue-700">ล้าง</button>}</label>
        <p className="text-xs leading-5 text-gray-500">แสดงครบทุกแผนกและสินค้าที่มีการเบิกออกหรือยืมในช่วงที่เลือก · ยอดยืมคือจำนวนที่ทำรายการยืมในช่วงนี้ ไม่ใช่ยอดค้างคืน · Excel ใช้รายการตามตัวกรองเดียวกับหน้าจอ</p>
        <div className="flex flex-wrap gap-2" aria-label="ยอดรวมแยกหน่วยนับ">
          {totals.map(total => <div key={total.unit} className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600"><strong className="mr-2 text-gray-900">{total.unit}</strong>เบิกออก <span className="font-semibold text-blue-700">{fmt(total.issued)}</span> · ยืม <span className="font-semibold text-orange-700">{fmt(total.borrowed)}</span></div>)}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-gray-500">พบ {groups.length.toLocaleString('th-TH')} {view==='dept' ? 'แผนก' : view==='product' ? 'สินค้า' : 'พนักงาน'} · กดชื่อเพื่อดูทุกรายการ</p>
        {groups.length === 0 && <p className="py-8 text-center text-sm text-gray-500">ไม่พบรายการเบิกออกหรือยืมตามช่วงเวลาและคำค้นหาที่เลือก</p>}
        <div className="space-y-2">
          {groups.map((group,index) => {
            const open = expanded===group.key;
            return <div key={group.key} className="min-w-0 rounded-xl border border-gray-200">
              <div className="flex items-start gap-2 p-3 sm:p-4">
                <button type="button" aria-expanded={open} aria-controls={`usage-detail-${index}`} onClick={()=>setExpanded(open ? null : group.key)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                  <ChevronDown size={16} className={`mt-1 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
                  <span className="min-w-0"><span className="block whitespace-normal break-words text-sm font-semibold leading-6 text-gray-900">{group.name}</span><span className="block text-xs leading-5 text-gray-500">{group.company.toUpperCase()}{group.subtitle ? ` · ${group.subtitle}` : ''} · {group.rows.length} รายการ</span></span>
                </button>
                <button type="button" aria-label={`Export Excel ${group.name}`} title={`Export Excel ${group.name}`} onClick={()=>download([group],group)} disabled={exporting} className="shrink-0 rounded-lg border border-gray-200 p-2 text-green-700 hover:bg-green-50 disabled:opacity-50"><Download size={18}/></button>
              </div>
              {open && <div id={`usage-detail-${index}`} className="border-t border-gray-100 p-3 sm:px-5">
                <table className="w-full table-fixed text-left text-xs sm:text-sm">
                  <colgroup><col className="w-[52%]"/><col className="w-[17%]"/><col className="w-[17%]"/><col className="w-[14%]"/></colgroup>
                  <thead><tr className="border-b border-gray-100 text-gray-500"><th scope="col" className="py-3 pr-2 font-medium">{view==='product' ? 'แผนกที่เบิก / ยืม' : 'สินค้า'}</th><th scope="col" className="py-3 text-right font-medium">เบิกออก</th><th scope="col" className="py-3 text-right font-medium">ยืม</th><th scope="col" className="py-3 pl-2 text-right font-medium">หน่วยนับ</th></tr></thead>
                  <tbody>{group.rows.map((r,i)=><tr key={i} className="border-b border-gray-100 last:border-0"><td className="whitespace-normal break-words py-3 pr-2 leading-6 text-gray-900">{view==='product' ? r.department : r.product}</td><td className="py-3 text-right align-top font-medium tabular-nums text-blue-700">{fmt(r.issued)}</td><td className="py-3 text-right align-top font-medium tabular-nums text-orange-700">{fmt(r.borrowed)}</td><td className="break-words py-3 pl-2 text-right align-top text-gray-500">{r.unit}</td></tr>)}</tbody>
                </table>
              </div>}
            </div>;
          })}
        </div>
      </div>
    </section>
  );
}
